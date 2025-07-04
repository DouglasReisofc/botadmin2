const { BotApi } = require('../botApi');

module.exports = async function handleSessionPairCode({ instance, data }) {
    try {
        await BotApi.updateOne(
            { instance },
            {
                sessionStatus: 'aguardando_pareamento',
                pairingCode: data?.code || null,
                lastSeen: new Date()
            }
        );
    } catch (err) {
        console.error('[session_pair_code] erro ao atualizar:', err.message);
    }
};

