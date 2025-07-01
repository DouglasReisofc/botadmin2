const { BotConfig } = require('../botConfig');

function normalizeParticipantsUpdate(data) {
    if (!data || typeof data !== 'object') return {};
    if (data.id && data.action) return data;
    const id = data.id || data.chatId || data.jid || null;
    const action = data.action || data.type || null;
    const participants = data.participants || data.recipients || [];
    return { ...data, id, action, participants };
}

module.exports = async function handleGroupParticipantsUpdate({ data }) {
    data = normalizeParticipantsUpdate(data);
    const groupId = data?.id;
    const action = data?.action; // promote ou demote
    const participants = data?.participants;

    if (!groupId || !participants?.length || !action) return;

    const bot = await BotConfig.findOne({ groupId });
    if (!bot) return;

    let modificou = false;

    for (const jid of participants) {
        const isSuperadmin = bot.ownerGrupo === jid;
        const index = bot.participantes.findIndex(p => p.id === jid);

        if (action === 'promote') {
            if (index === -1) {
                bot.participantes.push({ id: jid, admin: isSuperadmin ? 'superadmin' : 'admin' });
                modificou = true;
            } else {
                const novoNivel = isSuperadmin ? 'superadmin' : 'admin';
                if (bot.participantes[index].admin !== novoNivel) {
                    bot.participantes[index].admin = novoNivel;
                    modificou = true;
                }
            }
        }

        if (action === 'demote') {
            if (index === -1) {
                bot.participantes.push({ id: jid, admin: 'user' });
                modificou = true;
            } else if (bot.participantes[index].admin !== 'user') {
                bot.participantes[index].admin = 'user';
                modificou = true;
            }
        }
    }

    if (modificou) {
        await bot.save();
        console.log(`✅ Participantes atualizados (${action}):`, participants);
    } else {
        console.log(`ℹ️ Nenhuma modificação necessária (${action})`);
    }
};
