const { BotConfig } = require('../botConfig');
const { findGroupInfos, sendText, sendMedia, sendStickerFromUrl, updateGroupParticipants } = require('../waActions');
const moment = require('moment-timezone');
const fs = require('fs/promises');
const path = require('path');
const { tmpdir } = require('os');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');

moment.locale('pt-br');

function isAllowedDdi(numero, allowedDDIs = []) {
    return allowedDDIs.some(ddi => numero.startsWith(ddi));
}

function mapParticipantes(lista = []) {
    return lista.map(p => ({
        id: p.id,
        admin: ['superadmin', 'admin'].includes(p.admin) ? p.admin : 'member'
    }));
}

function normalizeJoinEvent(data) {
    if (!data || typeof data !== 'object') return {};
    const chatId = data.chatId || data.id?.remote || data.id?.remoteJid || null;
    const participant = data.id?.participant || data.recipientIds?.[0] || data.key?.participant || null;
    const type = data.type || data.subtype || null;
    return { ...data, chatId, key: { participant }, type };
}

module.exports = async function handleGroupJoin({ event, data, server_url, apikey, instance }) {
    try {
        console.log('[group_join] ínicio', { data, instance });

        data = normalizeJoinEvent(data);

        const groupId = data?.chatId || data?.key?.remoteJid;
        const participante = data?.key?.participant;
        const isInvite = data?.type === 'invite';
        if (!groupId || !participante) return;

        const botJid = `${instance}@c.us`;
        const botEntrou = participante === botJid;

        const bot = await BotConfig.findOne({ groupId }).populate('botApi');
        if (!bot || !bot.status || !bot.botApi?.instance) {
            console.warn('[group_join] BotConfig inválido ou inativo');
            return;
        }

        if (isInvite && botEntrou) {
            try {
                const info = await findGroupInfos(server_url, bot.botApi.instance, groupId, apikey);
                bot.nomeGrupo = info.subject;
                bot.imagemGrupo = info.pictureUrl;
                bot.descricaoGrupo = info.desc;
                bot.ownerGrupo = info.owner;
                bot.participantes = mapParticipantes(info.participants);
                bot.botAdmin = info.participants.some(p =>
                    p.id === botJid && ['admin', 'superadmin'].includes(p.admin)
                );
                bot.markModified('participantes');
                await bot.save();
                console.log('[group_join][invite] Grupo sincronizado com sucesso');
            } catch (err) {
                console.error('[group_join][invite] Erro ao sincronizar:', err);
            }
            return;
        }

        const numero = participante.replace('@c.us', '');

        if (bot.comandos?.bangringos && !isAllowedDdi(numero, bot.ddiPermitidos)) {
            try {
                await new Promise(resolve => setTimeout(resolve, 1500));
                const info = await findGroupInfos(server_url, bot.botApi.instance, groupId, apikey);
                const exists = info.participants.some(p => p.id === participante);

                if (exists) {
                    await updateGroupParticipants(
                        server_url,
                        apikey,
                        instance,
                        groupId,
                        [participante],
                        'remove'
                    );
                    console.log(`[group_join] 🛑 Usuário banido (DDI não permitido): ${numero}`);

                    const listaDDIs = bot.ddiPermitidos.join(', ');
                    const aviso =
                        `🚫 Só são permitidos números dos seguintes países neste grupo:\n` +
                        `${listaDDIs.replace(/, ([^,]*)$/, ' e $1')}`;

                    await sendText(server_url, apikey, bot.botApi.instance, groupId, aviso);
                    console.log('[group_join] Feedback de DDIs enviados ao grupo');
                } else {
                    console.warn(`[group_join] Participante ${participante} ainda não visível no grupo. Remoção ignorada.`);
                }
            } catch (err) {
                console.error(`[group_join] Erro ao banir/enviar feedback para ${numero}:`, err.message);
            }
            return;
        }

        if (bot.comandos?.bemvindo && bot.bemvindo?.caption) {
            console.log('[group_join] Enviando boas-vindas');

            const hora = moment().tz('America/Sao_Paulo').format('HH:mm');
            const dataAtual = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY');
            const pushName = data?.pushName || numero;

            let caption = bot.bemvindo.caption
                .replace(/{{pushName}}/g, pushName)
                .replace(/{{nomeGrupo}}/g, bot.nomeGrupo || '')
                .replace(/{{numero}}/g, numero)
                .replace(/{{data}}/g, dataAtual)
                .replace(/{{hora}}/g, hora)
                .replace(/{{prefixo}}/g, bot.prefixo || '!');

            let mediaSrc = null;
            let mime = bot.bemvindo.mimetype || 'image/webp';

            if (bot.bemvindo.filePath) {
                const buffer = await fs.readFile(bot.bemvindo.filePath).catch(() => null);
                if (buffer) mediaSrc = `data:${mime};base64,${buffer.toString('base64')}`;
            } else if (bot.bemvindo.externalUrl) {
                mediaSrc = bot.bemvindo.externalUrl;
            }

            if (bot.bemvindo.hasMedia && mediaSrc) {
                if (bot.bemvindo.asSticker) {
                    try {
                        const ext = path.extname(bot.bemvindo.fileName || '.jpg').replace('.', '');
                        const tempIn = path.join(tmpdir(), `input_${Date.now()}.${ext}`);
                        const tempOut = path.join(tmpdir(), `output_${Date.now()}.webp`);

                        if (/^https?:\/\//.test(mediaSrc)) {
                            const response = await axios.get(mediaSrc, { responseType: 'arraybuffer' });
                            await fs.writeFile(tempIn, Buffer.from(response.data, 'binary'));
                        } else if (mediaSrc.startsWith('data:')) {
                            const base64Data = mediaSrc.split(';base64,').pop();
                            await fs.writeFile(tempIn, Buffer.from(base64Data, 'base64'));
                        } else {
                            throw new Error('Fonte de mídia inválida para sticker');
                        }

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

                        await sendStickerFromUrl(server_url, apikey, bot.botApi.instance, groupId, webpBase64);

                        if (caption) {
                            await sendText(server_url, apikey, bot.botApi.instance, groupId, caption);
                        }

                        console.log('[group_join] Sticker convertido e enviado com sucesso');
                    } catch (err) {
                        console.error('[group_join] Erro ao processar sticker:', err.message);
                    }
                } else {
                    await sendMedia(
                        server_url,
                        apikey,
                        bot.botApi.instance,
                        groupId,
                        'image',
                        mime,
                        caption,
                        mediaSrc,
                        bot.bemvindo.fileName || 'bemvindo'
                    );
                }
            } else {
                await sendText(server_url, apikey, bot.botApi.instance, groupId, caption);
            }

            console.log('[group_join] Boas-vindas enviadas');
        } else {
            console.log('[group_join] Boas-vindas desativadas ou sem caption');
        }

    } catch (err) {
        console.error('[group_join] Erro geral:', err);
    }
};
