const { BotConfig } = require('../botConfig');
const { findGroupInfos } = require('../waActions');
const { normalizeJid } = require('../../utils/phone');

function normalizeUpdate(data) {
    if (!data || typeof data !== 'object') return {};
    if (data.chatId) return data;
    const chatId = data.id?.remote || data.id || null;
    return { ...data, chatId };
}

module.exports = async function handleGroupUpdate({ data, server_url, apikey, instance }) {
    data = normalizeUpdate(data);
    const { chatId } = data;
    if (!chatId) return;

    // Obtém as informações atualizadas do grupo diretamente pela API
    let groupInfo;
    try {
        groupInfo = await findGroupInfos(server_url, instance, chatId, apikey);
    } catch (err) {
        console.error('❌ Falha ao obter informações atualizadas do grupo:', err.message);
        return;
    }

    // Localiza o bot no banco
    const bot = await BotConfig.findOne({ groupId: chatId });
    if (!bot) {
        console.warn(`⚠️ Bot não encontrado no banco para o grupo ${chatId}`);
        return;
    }

    // Aplica as atualizações no documento
    let modificou = false;

    if (groupInfo.subject && groupInfo.subject !== bot.nomeGrupo) {
        bot.nomeGrupo = groupInfo.subject;
        modificou = true;
    }

    if (groupInfo.description && groupInfo.description !== bot.descricaoGrupo) {
        bot.descricaoGrupo = groupInfo.description;
        modificou = true;
    }


    if (groupInfo.pictureUrl && groupInfo.pictureUrl !== bot.imagemGrupo) {
        bot.imagemGrupo = groupInfo.pictureUrl;
        modificou = true;
    }

    // Atualiza sempre o dono do grupo pelo superadmin (ou pelo owner se vier explícito)
    let novoOwner = groupInfo.owner || null;
    if (!novoOwner && Array.isArray(groupInfo.participants)) {
        const superadmin = groupInfo.participants.find(p => p.admin === 'superadmin');
        if (superadmin) novoOwner = superadmin.id;
    }
    if (novoOwner && novoOwner !== bot.ownerGrupo) {
        bot.ownerGrupo = novoOwner;
        modificou = true;
    }

    // Atualiza lista completa de participantes
    const novaLista = (groupInfo.participants || []).map(p => ({
        id: p.id,
        admin: ['superadmin', 'admin'].includes(p.admin) ? p.admin : 'member'
    }));
    const botJid = `${instance}@c.us`;
    const botJidNorm = normalizeJid(botJid);
    const botAdmin = groupInfo.participants?.some(p =>
        normalizeJid(p.id) === botJidNorm && ['admin', 'superadmin'].includes(p.admin)
    ) || false;
    const listaAtual = JSON.stringify(bot.participantes || []);
    const listaNova = JSON.stringify(novaLista);

    if (listaAtual !== listaNova) {
        bot.participantes = novaLista;
        modificou = true;
    }
    if (bot.botAdmin !== botAdmin) {
        bot.botAdmin = botAdmin;
        modificou = true;
    }

    if (typeof groupInfo.announce === 'boolean') {
        const status = groupInfo.announce ? 'fechado' : 'aberto';
        if (bot.horarioGrupo.statusAtual !== status) {
            bot.horarioGrupo.statusAtual = status;
            modificou = true;
        }
    }

    if (modificou) {
        await bot.save();
        console.log(`✅ BotConfig atualizado com sucesso para o grupo ${chatId}`);
    } else {
        console.log(`ℹ️ Nenhuma alteração necessária no grupo ${chatId}`);
    }
};
