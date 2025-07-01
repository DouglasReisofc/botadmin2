const fs = require('fs');
const ytdl = require('ytdl-core');

const url = process.argv[2];
const output = `video_${Date.now()}.mp4`;

if (!url || !ytdl.validateURL(url)) {
    console.error('❌ URL inválida do YouTube.');
    process.exit(1);
}

console.log('🎬 Baixando vídeo...');
ytdl(url, { quality: 'highestvideo' })
    .pipe(fs.createWriteStream(output))
    .on('finish', () => console.log(`✅ Download concluído: ${output}`));
