const path = require('path');
const fs = require('fs');
const { BotConfig } = require('./botConfig');
const { usuario } = require('./model');
const { findGroupInfos } = require('./waActions');
const moment = require('moment-timezone');
moment.locale('pt-br');

// 🧩 Caixa de log formatada
async function printCaixaEventoDetalhado({ evento, data, instance, server_url, apikey }) {
    const now = moment().tz('America/Sao_Paulo');
    const grupoId =
        data?.chatId ||
        data?.id?.remote ||
        data?.id?.remoteJid ||
        data?.key?.remoteJid ||
        data?.groupId ||
        '-';
    const participante = data?.author || data?.key?.participant || '-';
    const nome = data?.pushName || '-';
    const isGroup = grupoId.endsWith('@g.us');
    const isStatus = grupoId.includes('@broadcast');
    const tipo = isGroup ? 'Grupo' : isStatus ? 'Status' : 'PV';

    let conteudo = data?.message?.conversation || data?.body || '';
    if (!conteudo) {
        const type = data?.type || data?._data?.type;
        if (type === 'sticker') conteudo = '[sticker]';
        else if (type === 'image') conteudo = '[imagem]';
        else conteudo = '-';
    }
    if (typeof conteudo !== 'string') conteudo = JSON.stringify(conteudo);
    if (conteudo.length > 120) conteudo = conteudo.slice(0, 117) + '...';

    let nomeGrupo = '-';
    let statusGrupo = isGroup ? '❌ Grupo não cadastrado' : tipo === 'PV' ? '❌ Usuário não cadastrado' : '─';
    let plano = '-';

    try {
        if (isGroup) {
            const bot = await BotConfig.findOne({ groupId: grupoId }).populate('user', 'planoContratado');
            if (bot) {
                nomeGrupo = bot.nomeGrupo || '-';
                statusGrupo = '✅ Grupo cadastrado';
                plano = bot.user?.planoContratado?.nome || '-';

                if ((nomeGrupo === '-' || !nomeGrupo) && server_url && apikey) {
                    try {
                        const info = await findGroupInfos(server_url, instance, grupoId, apikey);
                        if (info?.subject) {
                            nomeGrupo = info.subject;
                            await BotConfig.updateOne({ groupId: grupoId }, { nomeGrupo: info.subject });
                        }
                    } catch (e) {
                        console.warn('⚠️ Erro ao buscar nome do grupo:', e.message);
                    }
                }
            }
        } else if (tipo === 'PV') {
            const numero = grupoId.split('@')[0];
            const user = await usuario.findOne({ whatsapp: numero });
            if (user) {
                statusGrupo = '✅ Usuário cadastrado';
                plano = user.planoContratado?.nome || '-';
            }
        }
    } catch (err) {
        nomeGrupo = '-';
        statusGrupo = '⚠️ Erro ao verificar';
    }

    const linhas = [
        { label: 'Evento', value: evento },
        { label: 'Instância', value: instance || '❌ Não definida' },
        { label: 'Tipo', value: tipo },
        { label: 'Chat', value: grupoId },
        { label: 'Nome do Grupo', value: isGroup ? `👥 ${nomeGrupo}` : '-' },
        { label: 'Situação', value: statusGrupo },
        { label: 'Plano', value: plano },
        { label: 'Usuário', value: participante },
        { label: 'Nome', value: nome },
        { label: 'Data/Hora', value: now.format('DD/MM/YYYY  HH:mm:ss') },
        { label: 'Conteúdo', value: conteudo }
    ];

    const titulo = '📩 EVENTO RECEBIDO';
    const maxWidth = 60;
    const largura = Math.min(
        maxWidth,
        Math.max(titulo.length, ...linhas.map(l => `${l.label}: ${l.value}`.length)) + 4
    );
    const borda = '─'.repeat(largura);

    console.log(`\x1b[36m╭${borda}╮`);
    const espTitulo = largura - titulo.length;
    console.log(`│${titulo}${' '.repeat(espTitulo)}│`);
    for (const linha of linhas) {
        let texto = `${linha.label}: ${linha.value}`;
        if (texto.length > largura) texto = texto.slice(0, largura - 1);
        const espaco = largura - texto.length;
        console.log(`│${texto}${' '.repeat(espaco)}│`);
    }
    console.log(`╰${borda}╯\x1b[0m`);
}

// ✅ Função principal do webhook
module.exports = async function webhookHandler({ event, data, server_url, apikey, instance }) {
    try {
        console.log('\n🔔 Webhook Recebido → Evento:', event);

        // Log detalhado apenas para eventos importantes
        if (['message.upsert', 'connection.update', 'call'].includes(event)) {
            console.dir(data, { depth: 2 });
        } else {
            console.log(`[${event}] Dados básicos:`, {
                chatId: data?.chatId || data?.key?.remoteJid || data?.id?.remoteJid,
                type: data?.type || 'unknown',
                length: Array.isArray(data) ? data.length : 'single'
            });
        }

        if (!instance) {
            console.warn(`⚠️ [${event}] Instance não foi fornecida no webhook. Verifique a chamada do dispatchWebhook.`);
            return;
        }

        // Tratamento específico para eventos do Baileys
        const baileyEventMappings = {
            'message.upsert': 'message_upsert',
            'messages.upsert': 'message_upsert',
            'messages.update': 'messages_update',
            'messages.delete': 'messages_delete',
            'chats.upsert': 'chats_upsert',
            'chats.update': 'chats_update',
            'contacts.upsert': 'contacts_upsert',
            'presence.update': 'presence_update',
            'connection.update': 'connection_update',
            'call': 'call'
        };

        // Mapear evento do Baileys para nome de arquivo
        const eventFileName = baileyEventMappings[event] || event.replace(/\./g, '_');

        await printCaixaEventoDetalhado({
            evento: event,
            data,
            instance,
            server_url,
            apikey
        });

        // Determina idioma do grupo se aplicável
        let lang = 'ptbr';
        try {
            const gid = data?.chatId || data?.id?.remoteJid || data?.id?.remote || data?.key?.remoteJid || data?.groupId;
            if (gid && gid.endsWith('@g.us')) {
                const botCfg = await BotConfig.findOne({ groupId: gid });
                if (botCfg?.language) lang = botCfg.language;
            }
        } catch (err) {
            console.warn('⚠️ Falha ao obter idioma do grupo:', err.message);
        }

        // Tentar handler específico do idioma primeiro
        const langPath = path.join(__dirname, 'whatsapp_lang', lang, `${eventFileName}.js`);
        const handlerPath = path.join(__dirname, 'whatsapp', `${eventFileName}.js`);

        let handlerFound = false;

        // Tentar handler específico do idioma
        if (fs.existsSync(langPath)) {
            try {
                const handler = require(langPath);
                if (typeof handler === 'function') {
                    console.log(`🌐 Usando handler de idioma: ${lang}/${eventFileName}.js`);
                    await handler({ event, data, server_url, apikey, instance });
                    handlerFound = true;
                }
            } catch (err) {
                console.error(`❌ Erro no handler de idioma ${lang}/${eventFileName}.js:`, err.message);
            }
        }

        // Tentar handler padrão se não encontrou o específico do idioma
        if (!handlerFound && fs.existsSync(handlerPath)) {
            try {
                const handler = require(handlerPath);
                if (typeof handler === 'function') {
                    console.log(`📁 Usando handler padrão: ${eventFileName}.js`);
                    await handler({ event, data, server_url, apikey, instance });
                    handlerFound = true;
                }
            } catch (err) {
                console.error(`❌ Erro no handler padrão ${eventFileName}.js:`, err.message);
            }
        }

        // 🛑 Fallback especial para eventos de mensagem do Baileys
        if (!handlerFound && (event === 'message.upsert' || event === 'messages.upsert' || (data?.key && data?.message))) {
            console.log(`↩️ Tentando fallback para message.upsert...`);

            const langFallback = path.join(__dirname, 'whatsapp_lang', lang, 'message_upsert.js');
            const defaultFallback = path.join(__dirname, 'whatsapp', 'message_upsert.js');

            if (fs.existsSync(langFallback)) {
                try {
                    const fallbackHandler = require(langFallback);
                    if (typeof fallbackHandler === 'function') {
                        console.log(`🌐 Usando fallback de idioma: ${lang}/message_upsert.js`);
                        await fallbackHandler({ event: 'message.upsert', data, server_url, apikey, instance });
                        handlerFound = true;
                    }
                } catch (err) {
                    console.error(`❌ Erro no fallback de idioma:`, err.message);
                }
            }

            if (!handlerFound && fs.existsSync(defaultFallback)) {
                try {
                    const fallbackHandler = require(defaultFallback);
                    if (typeof fallbackHandler === 'function') {
                        console.log(`📁 Usando fallback padrão: message_upsert.js`);
                        await fallbackHandler({ event: 'message.upsert', data, server_url, apikey, instance });
                        handlerFound = true;
                    }
                } catch (err) {
                    console.error(`❌ Erro no fallback padrão:`, err.message);
                }
            }
        }

        if (!handlerFound) {
            console.log(`⚠️ Nenhum handler encontrado para o evento: ${event} (mapeado para: ${eventFileName})`);

            // Log dos handlers disponíveis para debug
            try {
                const availableHandlers = fs.readdirSync(path.join(__dirname, 'whatsapp')).filter(f => f.endsWith('.js'));
                console.log(`📂 Handlers disponíveis: ${availableHandlers.join(', ')}`);
            } catch (err) {
                console.warn('⚠️ Erro ao listar handlers disponíveis:', err.message);
            }
        }

    } catch (err) {
        console.error(`❌ Erro no webhookHandler (${event}):\n`, err);
    }
};
