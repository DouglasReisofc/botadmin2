const { BotApi } = require('../botApi');

module.exports = async function handleSessionQrUpdated({ instance, data }) {
    try {
        await BotApi.updateOne({ instance }, {
            sessionStatus: 'aguardando_qr',
            pairingCode: null,
            qrCode: data?.qr || null,
            lastSeen: new Date()
        });
    } catch (err) {
        console.error('[session_qr_updated] erro ao atualizar:', err.message);
    }
};

