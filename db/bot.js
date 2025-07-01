// ==================== CONTROLLER bot.js ====================
const { BotConfig } = require('./botConfig');
const { BotApi } = require('./botApi');
const { Server } = require('./server');
const { usuario } = require('./model');
const {
    findGroupInfos,
    acceptGroupInvite,
    getGroupInviteInfo,
    sendText
} = require('./waActions');
const { normalizeJid } = require('../utils/phone');

function mapParticipantes(lista = []) {
    return lista.map(p => ({
        id: p.id,
        admin: ['superadmin', 'admin'].includes(p.admin) ? p.admin : 'member'
    }));
}

async function checarLimites(user, botApiId) {
    if (!user.planoContratado) {
        throw new Error('Você não possui um plano contratado. Acesse a página de planos.');
    }

    if (!user.planoContratado.isFree) {
        if (!user.planoVencimento) {
            throw new Error('Você não possui um plano contratado. Acesse a página de planos.');
        }
        const hoje = new Date();
        if (user.planoVencimento < hoje) {
            throw new Error('Seu plano está vencido. Acesse a página de planos para renová-lo.');
        }
    }

    const botApi = await BotApi.findById(botApiId);
    if (!botApi) throw new Error('BotApi inválida');

    const qtdGrupos = await BotConfig.countDocuments({ user: user._id });
    const limiteGrupos = user.planoContratado.limiteGrupos;

    if (qtdGrupos >= limiteGrupos) {
        throw new Error(`Seu plano permite no máximo ${limiteGrupos} grupo(s). Faça upgrade ou compre limite adicional.`);
    }
}



// ==================== CONTROLLER / helpers ====================

async function resolverGrupoPorConvite({ linkOuJid, instance, serverUrl, apiKey }) {
    let groupJid;

    // 1️⃣ Se já for um JID (@g.us), usa direto
    if (linkOuJid.endsWith('@g.us')) {
        groupJid = linkOuJid;
    } else {
        // 2️⃣ Tenta entrar pelo invite link
        try {
            const convite = await acceptGroupInvite(serverUrl, instance, linkOuJid, apiKey);
            groupJid = convite.groupJid;
        } catch {
            // 3️⃣ Se precisar de approval, pega o info e corrige o ID
            const inviteCode = linkOuJid.split('/').pop();
            const info = await getGroupInviteInfo(serverUrl, instance, inviteCode, apiKey);
            // >>> normaliza para string, extraindo _serialized se for objeto
            groupJid = typeof info.id === 'string'
                ? info.id
                : info.id?._serialized;
        }
    }

    // ⚡ Agora sempre temos groupJid como string
    const data = await findGroupInfos(serverUrl, instance, groupJid, apiKey);

    // monta o owner (segue sua lógica original)
    let owner = data.owner || null;
    if (!owner && data.participants?.length) {
        const sa = data.participants.find(p => p.admin === 'superadmin');
        owner = sa?.id || null;
    }
    data.owner = owner;

    return { groupId: data.id, aguardandoAprovacao: false, groupData: data };
}


async function criarBot(userId, botApiRef, groupInviteLink, botName = null, configs = {}) {
    const user = await usuario.findById(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    const botApi = await BotApi.findOne({
        $or: [{ _id: botApiRef }, { instance: botApiRef }]
    });
    if (!botApi) throw new Error('Bot API não encontrada.');

    await checarLimites(user, botApi._id);
    await verificarLimiteGruposApi(botApi._id);

    const { instance, baseUrl: serverUrl, apikey: apiKey } = botApi;
    const { groupId, groupData } = await resolverGrupoPorConvite({
        linkOuJid: groupInviteLink,
        instance,
        serverUrl,
        apiKey
    });

    if (await BotConfig.findOne({ groupId })) {
        throw new Error('Este grupo já está cadastrado no sistema.');
    }

    const botConfig = new BotConfig({
        user: userId,
        botApi: botApi._id,
        instance: botName || instance,
        groupId,
        linkGrupo: groupInviteLink,
        status: true,
        nomeGrupo: groupData.subject,
        imagemGrupo: groupData.pictureUrl,
        descricaoGrupo: groupData.description,
        ownerGrupo: groupData.owner,
        participantes: mapParticipantes(groupData.participants),
        ...configs // comandos, prefixo, etc
    });

    await botConfig.save();

    user.bots.push(botConfig._id);
    await user.save();

    try {
        const prefix = String(botConfig.prefixo || '!').split(/[,\s]+/)[0] || '!';
        const msg = [
            '✅ Bot cadastrado e funcionando!',
            `Prefixo usado: ${prefix}`,
            `Envie ${prefix}menu para ver os comandos`
        ].join('\n');
        await sendText(serverUrl, apiKey, instance, groupId, msg);
    } catch (e) {
        console.error('Erro ao enviar mensagem de cadastro:', e.message);
    }

    return botConfig;
}


async function editarGrupoBot(botId, novoLinkOuJid) {
    const bot = await BotConfig.findById(botId).populate('botApi');
    if (!bot) throw new Error('Bot não encontrado.');
    const { instance, baseUrl, apikey } = bot.botApi;

    const { groupData } = await resolverGrupoPorConvite({
        linkOuJid: novoLinkOuJid,
        instance,
        serverUrl: baseUrl,
        apiKey: apikey
    });

    bot.groupId = groupData.id;
    bot.linkGrupo = novoLinkOuJid;
    bot.nomeGrupo = groupData.subject;
    bot.imagemGrupo = groupData.pictureUrl;
    bot.descriptionricaoGrupo = groupData.description;
    bot.ownerGrupo = groupData.owner;
    bot.participantes = mapParticipantes(groupData.participants);

    bot.markModified('participantes');
    await bot.save();
    return bot;
}

async function excluirBot(botId) {
    const botConfig = await BotConfig.findByIdAndDelete(botId);
    if (!botConfig) throw new Error('Bot não encontrado.');
    const user = await usuario.findById(botConfig.user);
    if (user) {
        user.bots = user.bots.filter(bot => bot.toString() !== botId);
        await user.save();
    }
    return botConfig;
}

async function garantirPlanoAtivoMiddleware(req, res, next) {
    try {
        const user = await usuario.findById(req.user._id);

        if (!user?.planoContratado) {
            req.flash('error_msg', 'Você precisa ter um plano pra continuar');
            return res.redirect('/planos');
        }

        if (!user.planoContratado.isFree) {
            if (!user.planoVencimento) {
                req.flash('error_msg', 'Você precisa ter um plano pra continuar');
                return res.redirect('/planos');
            }
            if (new Date(user.planoVencimento) < new Date()) {
                req.flash('error_msg', 'Seu plano está vencido. Renove para continuar.');
                return res.redirect('/planos');
            }
        }

        next();
    } catch (err) {
        console.error('[garantirPlanoAtivoMiddleware]', err);
        res.redirect('/');
    }
}

async function garantirGrupoCadastradoMiddleware(req, res, next) {
    try {
        const qtd = await BotConfig.countDocuments({ user: req.user._id });
        if (qtd === 0) {
            req.flash('error_msg', 'Cadastre ao menos um grupo antes de continuar.');
            return res.redirect('/grupos');
        }
        next();
    } catch (err) {
        console.error('[garantirGrupoCadastradoMiddleware]', err);
        res.redirect('/');
    }
}

// Checa se o usuário ainda tem “vagas” de instâncias
async function verificarLimiteInstancias(user) {
    if (!user?.planoContratado)
        throw new Error('Plano inexistente.');

    if (!user.planoContratado.isFree) {
        if (!user.planoVencimento)
            throw new Error('Plano inexistente.');

        if (new Date(user.planoVencimento) < new Date())
            throw new Error('Plano vencido.');
    }

    const limite = user.planoContratado.limiteInstancias;   // 0 = sem instância dedicada
    const usadas = await BotApi.countDocuments({ user: user._id });

    if (limite === 0) {
        throw new Error('Plano sem instâncias próprias.');
    }

    if (usadas >= limite) {
        throw new Error(`Limite de instâncias atingido (${usadas}/${limite}).`);
    }
}

// Checa se o servidor possui vagas disponíveis
async function verificarCapacidadeServidor(serverId) {
    const server = await Server.findById(serverId);
    if (!server) throw new Error('Servidor não encontrado.');

    if (server.sessionLimit > 0) {
        const usadas = await BotApi.countDocuments({ server: serverId });
        if (usadas >= server.sessionLimit) {
            throw new Error(`Servidor sem vagas (${usadas}/${server.sessionLimit}).`);
        }
    }
    return server;
}

// Checa se a instância já atingiu o limite de grupos
async function verificarLimiteGruposApi(apiId) {
    const api = await BotApi.findById(apiId);
    if (!api) throw new Error('Bot API não encontrada.');
    if (api.gruposlimite > 0) {
        const usados = await BotConfig.countDocuments({ botApi: apiId });
        if (usados >= api.gruposlimite) {
            throw new Error(`API sem vagas de grupos (${usados}/${api.gruposlimite}).`);
        }
    }
    return api;
}

// Sincroniza o status de administrador do bot para todos os grupos do usuário
async function sincronizarStatusAdminMiddleware(req, res, next) {
    try {
        const bots = await BotConfig.find({ user: req.user._id }).populate('botApi');
        for (const bot of bots) {
            const api = bot.botApi;
            if (!api) continue;
            try {
                const info = await findGroupInfos(api.baseUrl, api.instance, bot.groupId, api.apikey);
                if (info && Array.isArray(info.participants)) {
                    const botJid = `${api.instance}@c.us`;
                    const botJidNorm = normalizeJid(botJid);
                    const isAdmin = info.participants.some(p =>
                        normalizeJid(p.id) === botJidNorm && ['admin', 'superadmin'].includes(p.admin)
                    );
                    const lista = info.participants.map(p => ({
                        id: p.id,
                        admin: ['superadmin', 'admin'].includes(p.admin) ? p.admin : 'member'
                    }));

                    let changed = false;
                    if (bot.botAdmin !== isAdmin) {
                        bot.botAdmin = isAdmin;
                        changed = true;
                    }
                    if (JSON.stringify(bot.participantes) !== JSON.stringify(lista)) {
                        bot.participantes = lista;
                        bot.markModified('participantes');
                        changed = true;
                    }
                    if (changed) {
                        await bot.save();
                    }
                }
            } catch (err) {
                console.warn('[sincronizarStatusAdminMiddleware] erro ao consultar grupo:', err.message);
            }
        }
        next();
    } catch (err) {
        console.error('[sincronizarStatusAdminMiddleware]', err.message);
        next();
    }
}


module.exports = {
    criarBot,
    editarGrupoBot,
    excluirBot,
    checarLimites,
    garantirPlanoAtivoMiddleware,
    garantirGrupoCadastradoMiddleware,
    verificarLimiteInstancias,
    verificarCapacidadeServidor,
    verificarLimiteGruposApi,
    sincronizarStatusAdminMiddleware
};
