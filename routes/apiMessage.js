const express = require('express');
const router = express.Router();
const { BotApi } = require('../db/botApi');
const webhookHandler = require('../db/webhook');

const MASTER_APIKEY = process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU';

function checkKey(req, res, next) {
    const key = req.headers['apikey'] || req.query.apikey;
    if (key !== MASTER_APIKEY) return res.status(401).json({ error: 'invalid apikey' });
    next();
}

router.post('/send-message', checkKey, async (req, res) => {
    try {
        const { instance, number, message, quotedId } = req.body;
        if (!instance || !number || !message) {
            return res.status(400).json({ error: 'missing required fields' });
        }

        // Aqui você pode implementar a lógica para processar a mensagem recebida,
        // usando os arquivos em db/whatsapp_lang para interpretar comandos, respostas, etc.

        // Exemplo: chamar webhookHandler para processar o evento
        await webhookHandler({
            event: 'message.received',
            data: { instance, number, message, quotedId },
            instance,
            apikey: MASTER_APIKEY
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
