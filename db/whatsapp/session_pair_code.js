const { BotApi } = require('../botApi');

module.exports = async function handleSessionPairCode({ instance, data }) {
    try {
        await BotApi.updateOne({ instance }, {
            pairingCode: data?.code || null,
            lastSeen: new Date()
        });
    } catch (err) {
        console.error('[session_pair_code] erro ao atualizar:', err.message);
    }
};

