const fs = require('fs/promises');
const path = require('path');
const { tmpdir } = require('os');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Converte uma imagem/vídeo (base64 ou URL) em um sticker WebP (formato base64).
 * @param {string} inputSrc URL ou data URI base64
 * @param {string} fileName Nome base sugerido para o arquivo (opcional)
 * @returns {Promise<string>} base64 no formato data:image/webp;base64,...
 */
async function converterSticker(inputSrc, fileName = 'input') {
    const ext = path.extname(fileName || '.jpg').replace('.', '') || 'jpg';
    const tempIn = path.join(tmpdir(), `in_${Date.now()}.${ext}`);
    const tempOut = path.join(tmpdir(), `out_${Date.now()}.webp`);

    // Salva input temporário
    if (/^https?:\/\//.test(inputSrc)) {
        const response = await axios.get(inputSrc, { responseType: 'arraybuffer' });
        await fs.writeFile(tempIn, Buffer.from(response.data, 'binary'));
    } else if (inputSrc.startsWith('data:')) {
        const base64Data = inputSrc.split(';base64,').pop();
        await fs.writeFile(tempIn, Buffer.from(base64Data, 'base64'));
    } else {
        throw new Error('Formato inválido para input (deve ser URL ou base64)');
    }

    // Converte com ffmpeg
    await new Promise((resolve, reject) => {
        ffmpeg(tempIn)
            .addOutputOptions([
                '-vcodec', 'libwebp',
                '-vf',
                "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease," +
                "fps=15,pad=320:320:-1:-1:color=white@0.0," +
                "split[a][b];[a]palettegen=reserve_transparent=on[p];[b][p]paletteuse",
                '-loop', '0', '-ss', '00:00:00', '-t', '00:00:05',
                '-preset', 'default', '-an', '-vsync', '0'
            ])
            .on('end', resolve)
            .on('error', reject)
            .save(tempOut);
    });

    const webpBuffer = await fs.readFile(tempOut);
    const webpBase64 = `data:image/webp;base64,${webpBuffer.toString('base64')}`;

    // (Opcional) Remover arquivos temporários
    try {
        await fs.unlink(tempIn);
        await fs.unlink(tempOut);
    } catch { }

    return webpBase64;
}

module.exports = { converterSticker };
