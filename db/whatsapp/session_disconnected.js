const { BotApi } = require('../botApi');

module.exports = async function handleSessionDisconnected({ instance }) {
    try {
        await BotApi.updateOne({ instance }, {
            sessionStatus: 'desconectado',
            lastSeen: new Date()
        });
    } catch (err) {
        console.error('[session_disconnected] erro ao atualizar:', err.message);
    }
};

