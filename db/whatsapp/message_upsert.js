const fs = require('fs');
const path = require('path');
const { BotApi } = require('../botApi');
const { BotConfig } = require('../botConfig');

module.exports = async function handleMessageUpsert({ event, data, server_url, apikey, instance }) {
    try {
        await BotApi.updateOne({ instance }, { lastSeen: new Date() });
    } catch (err) {
        console.error('[message_upsert] erro ao atualizar:', err.message);
    }

    // Descobre o idioma configurado do grupo, se aplicável
    let lang = 'ptbr';
    try {
        const gid = data?.key?.remoteJid || data?.id?.remoteJid || data?.chatId || data?.groupId;
        if (gid && gid.endsWith('@g.us')) {
            const cfg = await BotConfig.findOne({ groupId: gid });
            if (cfg?.language) lang = cfg.language;
        }
    } catch (err) {
        console.warn('[message_upsert] erro ao obter idioma:', err.message);
    }

    const langHandlerPath = path.join(__dirname, '..', 'whatsapp_lang', lang, 'message_upsert.js');
    let handler;
    try {
        handler = fs.existsSync(langHandlerPath) ? require(langHandlerPath) : null;
    } catch {
        handler = null;
    }

    if (typeof handler === 'function') {
        await handler({ data, server_url, apikey, instance, event });
    } else {
        console.warn('[message_upsert] nenhum handler encontrado para idioma:', lang);
    }
};
