const { BotApi } = require('../botApi');

module.exports = async function handleSessionConnected({ instance }) {
    try {
        await BotApi.updateOne({ instance }, {
            sessionStatus: 'conectado',
            pairingCode: null,
            qrCode: null,
            lastSeen: new Date()
        });
    } catch (err) {
        console.error('[session_connected] erro ao atualizar:', err.message);
    }
};

