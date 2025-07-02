const { BotApi } = require('../botApi');

module.exports = async function handleMessageUpsert({ instance }) {
    try {
        await BotApi.updateOne({ instance }, { lastSeen: new Date() });
    } catch (err) {
        console.error('[message_upsert] erro ao atualizar:', err.message);
    }
};
