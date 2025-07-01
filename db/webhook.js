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
        console.dir(data, { depth: null });

        if (!instance) {
            console.warn(`⚠️ [${event}] Instance não foi fornecida no webhook. Verifique a chamada do dispatchWebhook.`);
            return;
        }

        await printCaixaEventoDetalhado({
            evento: event,
            data,
            instance,
            server_url,
            apikey
        });

        const eventFileName = event.replace(/\./g, '_');
        // Determina idioma do grupo se aplicável
        let lang = 'ptbr';
        try {
            const gid = data?.chatId || data?.id?.remoteJid || data?.id?.remote || data?.key?.remoteJid || data?.groupId;
            if (gid) {
                const botCfg = await BotConfig.findOne({ groupId: gid });
                if (botCfg?.language) lang = botCfg.language;
            }
        } catch (err) {
            console.warn('⚠️ Falha ao obter idioma do grupo:', err.message);
        }

        const langPath = path.join(__dirname, 'whatsapp_lang', lang, `${eventFileName}.js`);
        const handlerPath = fs.existsSync(langPath) ? langPath : path.join(__dirname, 'whatsapp', `${eventFileName}.js`);

        if (fs.existsSync(handlerPath)) {
            const handler = require(handlerPath);
            if (typeof handler === 'function') {
                await handler({ event, data, server_url, apikey, instance });
                return;
            } else {
                console.warn(`⚠️ Handler encontrado (${eventFileName}.js) não é uma função válida.`);
            }
        }

        // 🛑 Fallback para message.upsert
        if (event === 'message.upsert' || (data?.key && data?.message)) {
            const langFallback = path.join(__dirname, 'whatsapp_lang', lang, 'message_upsert.js');
            const defaultFallback = path.join(__dirname, 'whatsapp', 'message_upsert.js');
            const fallbackPath = fs.existsSync(langFallback) ? langFallback : defaultFallback;
            if (fs.existsSync(fallbackPath)) {
                const fallbackHandler = require(fallbackPath);
                if (typeof fallbackHandler === 'function') {
                    console.log(`↩️ Usando fallback handler: ${path.basename(fallbackPath)}`);
                    await fallbackHandler({ event, data, server_url, apikey, instance });
                    return;
                }
            }
        }

        console.log(`⚠️ Nenhum handler encontrado para o evento: ${event}`);

    } catch (err) {
        console.error(`❌ Erro no webhookHandler (${event}):\n`, err);
    }
};
