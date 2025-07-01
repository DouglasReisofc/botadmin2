const { sendText } = require('../waActions');

module.exports = async function handleGroupsUpsert(data, server_url, apikey, instance) {
    if (!Array.isArray(data)) return;

    for (const group of data) {
        if (!group.id) continue;

        const mensagem =
            `👋 Olá, grupo!\n\n` +
            `🤖 *Bot ativado com sucesso!*\n` +
            `📌 Para ver a lista de comandos disponíveis, digite:\n` +
            `👉 *!menu*\n\n` +
            `🆔 ID do Grupo: ${group.id}`;

        await sendText(server_url, apikey, instance, group.id, mensagem);
        console.log(`Mensagem de ativação enviada ao grupo ${group.id}`);
    }
};
