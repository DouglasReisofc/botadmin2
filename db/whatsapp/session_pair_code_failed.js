const { BotApi } = require('../botApi');

module.exports = async function handlePairCodeFailed({ instance }) {
    try {
        await BotApi.updateOne({ instance }, {
            sessionStatus: 'falha_auth',
            pairingCode: null,
            lastSeen: new Date()
        });
    } catch (err) {
        console.error('[session_pair_code_failed] erro ao atualizar:', err.message);
    }
};
