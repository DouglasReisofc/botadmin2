const {
    sendText,
    sendMedia,
    sendReaction,
    sendPoll,
    markMessageAsRead,
    deleteMessageForEveryone,
    editText,
    updateGroupParticipants,
    getGroqReply,
    acceptGroupInvite,
    getGroupInviteInfo,
    findGroupInfos,
    convertQuotedToSticker,
    forwardWithMentionAll,
    downloadMedia,
    fixarMensagem,
    desfixarMensagem,
    transcribeAudioGroq,
    describeImageGroq,
    synthesizeGroqSpeech,
    synthesizegesseritTTS,
    synthesizeGeminiTTS,
    synthesizeElevenTTS,
    openGroupWindow,
    sendStickerFromUrl
} = require('../../waActions');
const moment = require('moment-timezone');
moment.locale('pt-br');
const { LINKS_SUPORTADOS, processarAutoDownloader } = require('../../../utils/autodownloader');
const { converterSticker } = require('../../../utils/converterSticker');
const { basesiteUrl } = require('../../../configuracao');
const SUPPORTED_DOMAINS = Object.values(LINKS_SUPORTADOS);
const { criarPagamentoPix, criarPagamentoCartao } = require('../../pagamento');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}
const { normalizeJid } = require('../../../utils/phone');
const { randomGroqKey } = require('../../../utils/groq');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs/promises');
const { execSync } = require('child_process');
const fsSync = require('fs');

// Instrução básica usada para analisar imagens recebidas
const IMAGE_PROMPT =
    'Descreva a imagem de forma breve em português, considerando também a legenda como contexto.';

const userMemory = new Map();
const { BotConfig } = require('../../botConfig');
const { BotApi } = require('../../botApi');
const { IAGroupMemory } = require('../../iagroupmemory');
const { usuario } = require('../../model');
const { Plano } = require('../../planos'); // ou caminho equivalente

const Sorteio = require('../../Sorteio');
const frasesBrincadeiras = require('../../brincadeirasFrases');
const frasesPercent = require('../../brincadeirasPercent');

// Traduções básicas para comandos
const allTranslations = {
    enus: require('../../../idiomas/enus.json'),
    es: require('../../../idiomas/es.json'),
    ptbr: require('../../../idiomas/ptbr.json')
};


const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAX_MEM = 50;
const now = new Date();

// --- Lista de comandos para sugestão ---
let KNOWN_COMMANDS = [];
try {
    const content = fsSync.readFileSync(__filename, 'utf8');
    const regex = /case\s+'([^']+)'/g;
    let m;
    while ((m = regex.exec(content))) {
        KNOWN_COMMANDS.push(m[1]);
    }
    KNOWN_COMMANDS = Array.from(new Set(KNOWN_COMMANDS));
} catch (err) {
    console.error('Erro ao montar lista de comandos:', err.message);
}

function levenshtein(a, b) {
    if (a === b) return 0;
    const alen = a.length;
    const blen = b.length;
    if (alen === 0) return blen;
    if (blen === 0) return alen;
    const matrix = Array.from({ length: alen + 1 }, () => new Array(blen + 1).fill(0));
    for (let i = 0; i <= alen; i++) matrix[i][0] = i;
    for (let j = 0; j <= blen; j++) matrix[0][j] = j;
    for (let i = 1; i <= alen; i++) {
        for (let j = 1; j <= blen; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[alen][blen];
}

function getSimilarCommand(cmd) {
    let best = null;
    let min = Infinity;
    for (const c of KNOWN_COMMANDS) {
        const d = levenshtein(cmd, c);
        if (d < min) {
            min = d;
            best = c;
        }
    }
    return best && best !== cmd ? best : null;
}
async function salvarMidiaDoGrupo(groupId, base64, ext = 'bin') {
    const pastaGrupo = path.join('arquivos', groupId);
    await fs.mkdir(pastaGrupo, { recursive: true });

    const fileName = `all_${Date.now()}.${ext}`;
    const filePath = path.join(pastaGrupo, fileName);

    await fs.writeFile(filePath, Buffer.from(base64, 'base64'));

    return { filePath, fileName };
}

async function salvarStickerComoPng(groupId, base64Webp) {
    const pastaGrupo = path.join('arquivos', groupId);
    await fs.mkdir(pastaGrupo, { recursive: true });

    const baseName = `sticker_${Date.now()}`;
    const pngPath = path.join(pastaGrupo, `${baseName}.png`);

    await sharp(Buffer.from(base64Webp, 'base64'), { pages: 1 })
        .png()
        .toFile(pngPath);

    return { filePath: pngPath, fileName: `${baseName}.png` };
}

async function salvarGifComoPng(groupId, base64Video) {
    const pastaGrupo = path.join('arquivos', groupId);
    await fs.mkdir(pastaGrupo, { recursive: true });

    const baseName = `gif_${Date.now()}`;
    const videoPath = path.join(pastaGrupo, `${baseName}.mp4`);
    const pngPath = path.join(pastaGrupo, `${baseName}.png`);

    await fs.writeFile(videoPath, Buffer.from(base64Video, 'base64'));

    await new Promise((res, rej) => {
        ffmpeg(videoPath)
            .outputOptions(['-f', 'image2', '-frames:v', '1'])
            .on('end', res)
            .on('error', rej)
            .save(pngPath);
    });

    await fs.unlink(videoPath).catch(() => {});
    return { filePath: pngPath, fileName: `${baseName}.png` };
}


function normalizeEvent(data) {
    if (data?.key && data?.message) return data;
    if (data && data.id && data._data) {
        const key = {
            remoteJid: data.from || data.id.remote,
            id: data.id.id,
            fromMe: data.id.fromMe,
            participant: data.author || data.id.participant,
            _serialized: data.id._serialized
        };
        const message = {
            conversation: data.body,
            hasMedia: data.hasMedia || false,
            mimetype: data._data?.mimetype || null,
            caption: data._data?.caption || '',
            type: data.type || null,
            ctwaContext: data._data?.ctwaContext || null,
            mentionedIds:
                (Array.isArray(data.mentionedIds) && data.mentionedIds.length
                    ? data.mentionedIds
                    : data.mentionedJidList || data._data?.mentionedJidList) || []
        };
        return {
            key,
            message,
            hasMedia: data.hasMedia || false,
            type: data.type || null,
            pushName: data._data?.notifyName || '',
            contextInfo: data.hasQuotedMsg ? {
                quotedMessage: true,
                stanzaId: data._data?.quotedStanzaID,
                quotedMessageId: data._data?.quotedStanzaID,
                participant: data._data?.quotedParticipant,
                mentionedJid:
                    (Array.isArray(data.mentionedIds) && data.mentionedIds.length
                        ? data.mentionedIds
                        : data.mentionedJidList || data._data?.mentionedJidList) || [],
                quotedFromMe: data._data?.quotedMsg?.id?.fromMe
            } : undefined,
            msgOriginal: data
        };
    }
    return data;
}

function collectMentions({ message, contextInfo, data, msgOriginal, argsStr }) {
    const ids = new Set();
    const add = (arr) => {
        if (Array.isArray(arr)) {
            for (const id of arr) {
                if (typeof id === 'string') {
                    ids.add(id.includes('@') ? id : `${id}@c.us`);
                }
            }
        }
    };
    add(message?.mentionedIds);
    add(contextInfo?.mentionedJid);
    add(data?.mentionedIds);
    add(data?.mentionedJidList);
    add(msgOriginal?.mentionedIds);
    add(msgOriginal?.mentionedJidList);
    add(msgOriginal?._data?.mentionedJidList);
    add(msgOriginal?._data?.contextInfo?.mentionedJid);

    if (argsStr) {
        const regex = /@(\d{6,15})/g;
        let m;
        while ((m = regex.exec(argsStr)) !== null) {
            ids.add(`${m[1]}@c.us`);
        }
    }
    return Array.from(ids);
}

module.exports = async function handleMessageUpsert({ data, msgOriginal, server_url, apikey, instance }) {
    data = normalizeEvent(data);
    msgOriginal = msgOriginal || data.msgOriginal || data;
    /* ───────────── DADOS BÁSICOS ────────────────────────────────────── */
    const { key, message, type, hasMedia, contextInfo } = data;
    const { remoteJid, id, participant } = key;

    // Marca a mensagem como lida independentemente do processamento
    try {
        await markMessageAsRead(server_url, apikey, instance, remoteJid);
    } catch (err) {
        console.warn('markMessageAsRead falhou:', err.message);
    }

    const isGroup = remoteJid?.endsWith('@g.us');   // grupo
    const isPv = !isGroup;                      // qualquer chat 1-a-1 (@c.us)

    if (isPv) {
        await sendText(
            server_url,
            apikey,
            instance,
            remoteJid,
            `Olá! Eu funciono apenas em grupos. Cadastre seu grupo no painel: ${basesiteUrl}`,
            id
        );
        return;
    }

    const quotedId = id;
    const messageId = id;
    const quoted = contextInfo || {};
    const quotedMessageId = quoted.stanzaId;
    const replyObj = quotedMessageId
        ? { key: { id: quotedMessageId } }
        : { key: { id: messageId } };
    const quotedParticipant = quoted.participant;

    const messageType = type || message?.type || null;
    const messageHasMedia = hasMedia || message?.hasMedia || false;
    const rawData = msgOriginal?._data || {};
    const isGif = rawData.isGif === true;
    const quotedData = rawData.quotedMsg || {};
    const isQuotedGif = quotedData.isGif === true;
    const quotedType = quotedData.type;
    const senderId = participant?.split('@')[0];
    const text =
        message?.conversation ||
        message?.caption ||
        message?.ctwaContext?.description ||
        message?.text ||
        msgOriginal?._data?.paymentNoteMsg?.body || '';


    const fromMe = key?.fromMe || false;


    /* ───────────── CONFIGURAÇÃO DO BOT ──────────────────────────────── */
    let bot;
    let botRegistrado = true;


    if (isGroup) {
        bot = await BotConfig.findOne({ groupId: remoteJid });
        if (!bot || !bot.status) {
            botRegistrado = false;
            bot = {
                prefixo: '!,#,.,-,/',
                status: true,
                participantes: [],
                comandos: { autoresposta: true }
            };
        }
    } else {
        // Configuração-default para o PV
        bot = {
            prefixo: '!,#,.,-,/',
            status: true,
            participantes: [],
            comandos: {
                autoresposta: true,
                botinterage: false,
                soadm: false,
                autosticker: false,
                autodownloader: false,
                brincadeiras: false,
                antilink: false,
                // adicione outros que queira habilitar no PV
            }
        };
    }

    // Idioma selecionado para o grupo ou PV
    const lang = bot.language || null;
    const t = key => (allTranslations[lang || 'ptbr'] && allTranslations[lang || 'ptbr'][key]) || key;

    /* ───────────── CHECK DE VENCIMENTO (apenas grupo) ───────────────── */
    let dono = null;
    let planoVencimento = null;
    let planoAtivo = true;

    if (isGroup && botRegistrado) {
        const userId = bot.user?._id || bot.user;
        dono = await require('../../model').usuario.findById(userId);
        planoVencimento = dono?.planoVencimento || null;
        planoAtivo = planoVencimento && new Date(planoVencimento) > Date.now();

        if (!planoAtivo) {
            await sendText(
                server_url,
                apikey,
                instance,
                remoteJid,
                t('plano_expirado'),
                replyObj
            );
            return;
        }
    }

    // Comandos permitidos conforme plano contratado
    let allowedCommands = {};
    if (isGroup && botRegistrado && dono) {
        allowedCommands = dono.planoContratado?.allowedCommands || {};
        if (dono.planoContratado?.isFree) {
            const freeDoc = await Plano.findOne({ isFree: true });
            if (freeDoc) allowedCommands = freeDoc.allowedCommands || {};
        }
    }

    function buildMenu() {
        return [
            '╭─🎲─ *MENU PRINCIPAL* ────',
            `│ • \`${mainPrefix}play <pesquisa>\` - busca música/vídeo`,
            `│ • \`${mainPrefix}sticker\` - cria figurinha`,
            `│ • \`${mainPrefix}sfundo\` - figurinha sem fundo`,
            `│ • \`${mainPrefix}tomp3\` - converte para MP3`,
            `│ • \`${mainPrefix}ytmp4 <link>\` - baixa vídeo do YouTube`,
            `│ • \`${mainPrefix}tiktok <link>\` - baixa vídeo do TikTok`,
            `│ • \`${mainPrefix}instagram <link>\` - baixa mídia do Instagram`,
            `│ • \`${mainPrefix}facebook <link>\` - baixa vídeo do Facebook`,
            `│ • \`${mainPrefix}kwai <link>\` - baixa vídeo do Kwai`,
            `│ • \`${mainPrefix}id\` - mostra o ID do chat/grupo`,
            `│ • \`${mainPrefix}piada [tema]\` - conta uma piada`,
            `│ • \`${mainPrefix}brincadeiras\` - lista brincadeiras`,
            `│ • \`${mainPrefix}figurinhas\` - envia figurinhas`,
            `│ • \`${mainPrefix}tabela\` - mostra a tabela`,
            `│ • \`${mainPrefix}sorteio\` - cria sorteio`,
            `│ • \`${mainPrefix}sorteio2\` - sorteio simples`,
            `│ • \`${mainPrefix}enquete\` - cria enquete`,
            '│',
            '│ 🔒 *Comandos de Admin*',
            `│ • \`${mainPrefix}menuadm\` - opções administrativas`,
            '╰──────────────────────'
        ].join('\n');
    }

    async function sendMenu(menuText, qid) {
        try {
            const customPath = path.join('arquivos', remoteJid, 'menu.jpeg');
            const defaultPath = path.join('arquivos', 'menu.jpeg');
            let buffer = await fs.readFile(customPath).catch(() => null);
            if (!buffer) buffer = await fs.readFile(defaultPath).catch(() => null);

            if (buffer) {
                const base64 = buffer.toString('base64');
                await sendMedia(
                    server_url,
                    apikey,
                    instance,
                    remoteJid,
                    'image',
                    'image/jpeg',
                    menuText,
                    `data:image/jpeg;base64,${base64}`,
                    'menu.jpeg',
                    qid
                );
            } else {
                await sendText(server_url, apikey, instance, remoteJid, menuText, qid);
            }

            await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
        } catch (err) {
            console.error('❌ Erro ao enviar menu com imagem:', err.message);
            await sendText(server_url, apikey, instance, remoteJid, menuText, qid);
        }
    }


    /* ───────────── PERMISSÕES ───────────────────────────────────────── */
    // Por padrão, em PV qualquer um é admin
    let isAdmin = !isGroup;
    let isBotAdmin = !isGroup;
    let botNumberSelf = instance;
    if (msgOriginal?.to) botNumberSelf = msgOriginal.to.split('@')[0];
    else if (data?.to) botNumberSelf = data.to.split('@')[0];
    else if (msgOriginal?._data?.to) botNumberSelf = msgOriginal._data.to.split('@')[0];
    const botJid = `${botNumberSelf}@c.us`;
    const senderNorm = normalizeJid(`${senderId}@c.us`);
    const botNorm = normalizeJid(botJid);

    if (isGroup) {
        try {
            // 1) Consulta a API via findGroupInfos
            const info = await findGroupInfos(server_url, instance, remoteJid, apikey);
            if (!info || !Array.isArray(info.participants)) {
                throw new Error('invalid group info');
            }
            const participantesAtuais = info.participants;

            // 2) Atualiza a lista no banco para casos posteriores
            bot.participantes = participantesAtuais;
            if (botRegistrado && typeof bot.save === 'function') {
                await bot.save();
            }

            // 3) Verifica se quem enviou é admin ou superadmin
            isAdmin = participantesAtuais.some(p =>
                normalizeJid(p.id) === senderNorm && ['admin', 'superadmin'].includes(p.admin)
            );
            // 4) Checa se o próprio bot é admin
            isBotAdmin = participantesAtuais.some(p =>
                normalizeJid(p.id) === botNorm && ['admin', 'superadmin'].includes(p.admin)
            );
        } catch (err) {
            console.warn('⚠️ isAdmin: erro ao consultar grupo via API, fallback no banco →', err.message);

            // Fallback: usa o que está salvo no banco
            isAdmin = bot.participantes.some(p =>
                normalizeJid(p.id) === senderNorm && ['admin', 'superadmin'].includes(p.admin)
            );
            isBotAdmin = bot.participantes.some(p =>
                normalizeJid(p.id) === botNorm && ['admin', 'superadmin'].includes(p.admin)
            );
        }

        if (bot.botAdmin !== isBotAdmin) {
            bot.botAdmin = isBotAdmin;
            if (botRegistrado && typeof bot.save === 'function') {
                await bot.save();
            }
        }
    }

    function isNSFW(botConfig) {
        return !!botConfig?.comandos?.proibirnsfw;
    }


    /* ───────────── PARSERS ÚTEIS ────────────────────────────────────── */
    const prefixList = String(bot.prefixo || '!').split(/[,\s]+/).filter(Boolean);
    const mainPrefix = prefixList[0] || '!';
    const [rawCmd = '', ...args] = text.trim().split(/\s+/);
    const prefixUsed = prefixList.find(p => rawCmd.startsWith(p));
    const isCommand = !!prefixUsed;
    const cleanCommand = isCommand ? rawCmd.slice(prefixUsed.length).toLowerCase() : '';
    const argsStr = text.trim().slice(rawCmd.length).trimStart();

    if (isGroup && !botRegistrado && isCommand) {
        const permitidos = ['menu', 'm', 'menuadm', 'menuadmin', 'pt', 'en', 'es'];
        if (cleanCommand && !permitidos.includes(cleanCommand)) {
            await sendText(
                server_url,
                apikey,
                instance,
                remoteJid,
                `Para que o Bot funcione acesse ${basesiteUrl} e cadastre no painel.`,
                id
            );
            return;
        }
    }


    // mensagem de introdução removida a pedido dos usuários
    // ─── Tratamento especial para imagens e figurinhas (sem botinterage) ───
    if ((['image', 'sticker'].includes(messageType) || isGif) &&
        messageHasMedia &&
        bot.comandos?.lerimagem &&
        !bot.comandos?.botinterage) {
        try {
            const media = await downloadMedia(server_url, apikey, instance, remoteJid, id);
            let filePath;
            if (messageType === 'sticker') {
                ({ filePath } = await salvarStickerComoPng(remoteJid, media.base64));
            } else if (isGif) {
                ({ filePath } = await salvarGifComoPng(remoteJid, media.base64));
            } else {
                ({ filePath } = await salvarMidiaDoGrupo(remoteJid, media.base64, 'jpg'));
            }
            const userName = data.pushName || participant.split('@')[0];
            const imgPrompt = `${bot.botinteragePrompt || ''} ${IMAGE_PROMPT}`.trim();
            const desc = await describeImageGroq(filePath, imgPrompt, userName, randomGroqKey(bot.groqKey));
            if (desc) {
                await sendText(server_url, apikey, instance, remoteJid, desc, replyObj);
                await IAGroupMemory.updateOne(
                    { groupId: remoteJid },
                    {
                        $push: {
                            messages: {
                                $each: [
                                    { role: 'user', author: userName, authorNumber: senderId, content: text || (messageType==='sticker'?'[sticker]':'[imagem]'), timestamp: new Date() },
                                    { role: 'assistant', author: 'BOT', authorNumber: '', content: desc.trim(), timestamp: new Date() }
                                ],
                                $slice: -MAX_MEM
                            }
                        }
                    },
                    { upsert: true }
                );
            }
        } catch (e) {
            console.error('Erro ao descrever imagem:', e);
        }
        return; // interrompe o restante do fluxo quando não há botinterage
    }

    if (isGroup) {
        // 🔨 Banimento extremo com links
        // 0️⃣ Monta a whitelist dinâmica (domínios ou links completos cadastrados em bot.linksPermitidos)
        const normalize = valor => {
            try {
                const url = new URL(valor.includes('://') ? valor : `https://${valor}`);
                return url.hostname.toLowerCase().replace(/^www\./, '');
            } catch {
                return valor.toLowerCase().trim();
            }
        };

        const permitted = Array.isArray(bot.linksPermitidos)
            ? bot.linksPermitidos.map(normalize)
            : [];

        const isWhitelisted = (link, hostname) => {
            const full = link.toLowerCase().trim();
            const host = normalize(hostname);
            return permitted.some(item => {
                const normalized = normalize(item);
                return (
                    full === normalized ||                         // link completo igual
                    full.includes(normalized) ||                   // link contém valor permitido
                    host === normalized ||                         // hostname igual
                    host.endsWith(`.${normalized}`)                // subdomínios como www.bet.com
                );
            });
        };

        // coloca no topo, antes do handler
        function isAllowedDdi(numero, allowedDDIs = []) {
            return allowedDDIs.some(ddi => numero.startsWith(ddi));
        }


        // 1️⃣ BANEXTREMO (maior prioridade)
        if (bot.comandos?.banextremo && isBotAdmin && /(https?:\/\/[^\s]+)/i.test(text)) {
            const link = text.match(/(https?:\/\/[^\s]+)/i)[1];
            let hostname = '';
            try { hostname = new URL(link).hostname.toLowerCase(); } catch { }

            if (!isAdmin && !isWhitelisted(link, hostname)) {
                console.log(`⛔ BANEXTREMO: Link não permitido! link="${link}" hostname="${hostname}"`);
                await markMessageAsRead(server_url, apikey, instance, remoteJid, id);
                await deleteMessageForEveryone(server_url, apikey, instance, id, remoteJid, senderId, false);
                const jidFormatado = senderId.includes('@') ? senderId : `${senderId}@c.us`;
                if (jidFormatado.endsWith('@c.us')) {
                    await updateGroupParticipants(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        [jidFormatado],
                        'remove'
                    );
                }
                return;
            }
            console.log(`🔶 banextremo SKIP: link ou domínio permitido → ${link}`);
        }

        // 2️⃣ ANTILINK GERAL
        if (bot.comandos?.antilink && isBotAdmin && /(https?:\/\/[^\s]+)/i.test(text)) {
            const link = text.match(/(https?:\/\/[^\s]+)/i)[1];
            let hostname = '';
            try { hostname = new URL(link).hostname.toLowerCase(); } catch { }

            if (!isAdmin && !isWhitelisted(link, hostname) && (!isCommand || cleanCommand !== 'play')) {
                await markMessageAsRead(server_url, apikey, instance, remoteJid, id);
                await deleteMessageForEveryone(server_url, apikey, instance, id, remoteJid, senderId, false);
                return;
            }
            console.log(`🔶 antilink SKIP: link ou domínio permitido → ${link}`);
        }

        // 3️⃣ ANTILINKGP (convites de grupo)
        if (bot.comandos?.antilinkgp && isBotAdmin && /(chat\.whatsapp\.com|wa\.me|whatsapp\.com)/i.test(text)) {
            const link = text.match(/(https?:\/\/[^\s]+)/i)?.[1] || '';
            let hostname = '';
            try { hostname = new URL(link).hostname.toLowerCase(); } catch { }

            if (!isAdmin && !isWhitelisted(link, hostname)) {
                await markMessageAsRead(server_url, apikey, instance, remoteJid, id);
                await deleteMessageForEveryone(server_url, apikey, instance, id, remoteJid, senderId, false);
                return;
            }
            console.log(`🔶 antilinkgp SKIP: link ou domínio permitido → ${link}`);
        }


        // 🖼️ AutoSticker
        if (bot.comandos?.autosticker && messageHasMedia && (['image', 'video'].includes(messageType) || isGif)) {
            console.log('🚀 AutoSticker ativado para mídia:', { messageType, id });
            try {
                await convertQuotedToSticker(server_url, apikey, instance, remoteJid, { messageId: id });
            } catch (error) {
                console.error('Erro no AutoSticker:', error.message);
            }
        }

        // 📥 AutoDownloader
        if (bot.comandos?.autodownloader && text && /(https?:\/\/[^\s]+)/i.test(text)) {
            const link = text.match(/(https?:\/\/[^\s]+)/i)[1];

            console.log('⚙️ Disparando autodownloader para:', link);

            try {
                const resultado = await processarAutoDownloader(link, remoteJid, server_url, apikey, instance);
                if (!resultado) {
                    console.warn('⚠️ Nada baixado automaticamente:', resultado);
                }
            } catch (err) {
                console.error('❌ Erro no autodownloader:', err.message);
            }
        }

        // 🚷 BAN GRINGOS (qualquer mensagem ou citação)
        if (isGroup && bot.comandos?.bangringos && isBotAdmin && !isAdmin) {
            const alvos = new Set([participant]);
            if (quotedParticipant) alvos.add(quotedParticipant);

            let removedAny = false;

            for (const raw of alvos) {
                const jid = raw.includes('@') ? raw : `${raw}@c.us`;
                const numero = jid.replace('@c.us', '');

                // debug: veja quem está sendo checado
                console.log(`[BanGringos] Checando DDI ${numero} para ${jid}`);

                if (!isAllowedDdi(numero, bot.ddiPermitidos)) {
                    try {
                        // qual mensagem apagar?
                        const msgId = (raw === quotedParticipant && quotedMessageId)
                            ? quotedMessageId
                            : id;
                        console.log(`[BanGringos] Apagando mensagem ${msgId} de ${jid}`);
                        await deleteMessageForEveryone(
                            server_url,
                            apikey,
                            instance,
                            msgId,
                            remoteJid,
                            jid,
                            false
                        );

                        // buscar participação atual
                        const info = await findGroupInfos(server_url, instance, remoteJid, apikey);
                        const stillInGroup = info.participants.some(p => p.id === jid);
                        console.log(`[BanGringos] Ainda no grupo? ${stillInGroup}`);

                        if (stillInGroup) {
                            console.log(`[BanGringos] Removendo ${jid} do grupo ${remoteJid}`);
                            await updateGroupParticipants(
                                server_url,
                                apikey,
                                instance,
                                remoteJid,
                                [jid],
                                'remove'
                            );
                        }

                        removedAny = true;
                    } catch (err) {
                        console.warn('⚠️ Erro ao banir gringo:', err.message);
                    }
                }
            }

            if (removedAny) {
                const list = bot.ddiPermitidos;
                const formatted = list.length > 1
                    ? list.slice(0, -1).join(', ') + ' e ' + list[list.length - 1]
                    : list[0];
                const aviso = `🚫 Só são permitidos números dos seguintes países neste grupo:\n${formatted}`;
                await sendText(server_url, apikey, instance, remoteJid, aviso);
                return;
            }
        }


    }

    // ───────────────────────────────────────────────────────────────────
    // HELPERS COMUNS
    // ───────────────────────────────────────────────────────────────────

    const montarSystem = () => {
        const nomeGrp = bot.nomeGrupo || '—';
        const donoGrp = bot.ownerGrupo?.replace('@c.us', '') || '—';
        const agoraSP = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm');
        const totMems = Array.isArray(bot.participantes) ? bot.participantes.length : 0;
        const cmdsOnOff = Object.entries(bot.comandos || {})
            .map(([k, v]) => `• ${k}: ${v ? 'on' : 'off'}`)
            .join('\n');
        const planoTxt = bot.planoAtual
            ? `${bot.planoAtual.nome} – R$${bot.planoAtual.preco} – ${bot.planoAtual.duracao}d`
            : 'Nenhum plano';
        return [
            bot.botinteragePrompt || 'Fale de forma direta e natural em português do Brasil.',
            '',
            `Grupo: ${nomeGrp}`,
            `Dono:  ${donoGrp}`,
            `Membros: ${totMems}`,
            `Hora (SP): ${agoraSP}`,
            '',
            `Regras:\n${bot.descricaoGrupo?.trim() || 'Sem regras definidas.'}`,
            '',
            `Plano:\n${planoTxt}`,
            '',
            `Comandos ativos:\n${cmdsOnOff}`,
            '',
            `Tabela:\n${bot.tabela?.trim() || '—'}`
        ].join('\n');
    };

    const pushUser = (author, nr, txt) => ({
        role: 'user', author, authorNumber: nr, content: txt, timestamp: new Date()
    });
    const pushBot = (txt, label = 'BOT') => ({
        role: 'assistant', author: label, authorNumber: '', content: txt, timestamp: new Date()
    });

    const enviarAudio = async texto => {
        const dono = await usuario.findOne({ whatsapp: bot.ownerGrupo?.replace('@c.us', '') });
        if (!dono?.apikey) {
            await sendText(server_url, apikey, instance, remoteJid, texto, replyObj);
            return;
        }

        const url = `${basesiteUrl}/api/geraraudio2?texto=${encodeURIComponent(texto)}&apikey=${dono.apikey}`;

        try {
            const res = await axios.get(url, { responseType: 'arraybuffer' });
            const tipo = res.headers['content-type'] || '';

            if (tipo.includes('application/json')) {
                const obj = JSON.parse(Buffer.from(res.data).toString('utf8'));
                if (obj.status === false && obj.mensagem?.includes('Erro ao gerar ou converter áudio.')) {
                    await sendText(server_url, apikey, instance, remoteJid, texto, replyObj);
                    return;
                }
            }

            const b64 = Buffer.from(res.data, 'binary').toString('base64');
            const dataUri = `data:${tipo || 'audio/ogg'};base64,${b64}`;

            await sendMedia(
                server_url,
                apikey,
                instance,
                remoteJid,
                'audio',
                'audio/ogg; codecs=opus',
                '',
                dataUri,
                `tts_${Date.now()}.ogg`,
                replyObj
            );

            await sendReaction(
                server_url,
                apikey,
                instance,
                { remoteJid, id },
                '🔊'
            );
        } catch (err) {
            console.error('erro enviarAudio:', err.message);
            await sendText(server_url, apikey, instance, remoteJid, texto, replyObj);
        }
    };

    const extraiJSON = raw => {
        if (typeof raw !== 'string') {
            return { violacao: false, motivo: '', reply: '' };
        }
        const clean = raw.replace(/```[\s\S]*?```/g, '');
        const m = clean.match(/\{[\s\S]*\}/);
        try {
            return m ? JSON.parse(m[0]) : { violacao: false, motivo: '', reply: clean.trim() };
        } catch {
            return { violacao: false, motivo: '', reply: clean.trim() };
        }
    };

    // ───────────────────────────────────────────────────────────────────
    // BLOCO 1 ── BOTINTERAGE **SEM** MODERAÇÃO (ou ADM bypass)
    // ───────────────────────────────────────────────────────────────────
    if (
        isGroup &&
        bot.comandos?.botinterage &&
        (isAdmin || !bot.comandos?.moderacaocomia) &&
        !prefixList.some(p => text.startsWith(p)) &&
        !/(https?:\/\/[^\s]+)/i.test(text)
    ) {
        try {
            const userName = data.pushName || participant.split('@')[0];
            const userNumber = participant.split('@')[0];
            let entrada = text;

            // Descrição de imagem ou figurinha
            if ((['image','sticker'].includes(messageType) || isGif) && messageHasMedia && bot.comandos?.lerimagem) {
                try {
                    const media = await downloadMedia(server_url, apikey, instance, remoteJid, id);
                    if (media?.base64) {
                        let filePath;
                        if (messageType === 'sticker') {
                            ({ filePath } = await salvarStickerComoPng(remoteJid, media.base64));
                        } else if (isGif) {
                            ({ filePath } = await salvarGifComoPng(remoteJid, media.base64));
                        } else {
                            ({ filePath } = await salvarMidiaDoGrupo(remoteJid, media.base64, 'jpg'));
                        }
                        const imgPrompt = `${bot.botinteragePrompt || ''} ${IMAGE_PROMPT}`.trim();
                        const desc = await describeImageGroq(filePath, imgPrompt, userName, randomGroqKey(bot.groqKey));
                        if (desc) {
                            await IAGroupMemory.updateOne(
                                { groupId: remoteJid },
                                {
                                    $push: {
                                        messages: {
                                            $each: [
                                                pushUser(userName, userNumber, text || (messageType==='sticker'?'[sticker]':'[imagem]')),
                                                pushBot(desc.trim())
                                            ],
                                            $slice: -MAX_MEM
                                        }
                                    }
                                },
                                { upsert: true }
                            );
                            entrada = desc.trim();
                        }
                    }
                } catch (e) {
                    console.error('❌ Erro ao analisar imagem:', e.message);
                }
            }

            // Transcrição de áudio
            if ((messageType === 'ptt' || messageType === 'audio') && messageHasMedia) {
                try {
                    const media = await downloadMedia(server_url, apikey, instance, remoteJid, id);
                    if (media?.base64 && media?.mimetype) {
                        const ext = media.mimetype.split('/')[1].split(';')[0] || 'ogg';
                        const { filePath } = await salvarMidiaDoGrupo(remoteJid, media.base64, ext);
                        entrada = await transcribeAudioGroq(filePath, randomGroqKey(bot.groqKey));
                        console.log('📝 Transcrição de áudio:', entrada);
                    }
                } catch (e) {
                    console.error('❌ Erro ao transcrever áudio:', e.message);
                    return;
                }
            }
            if (!entrada || entrada.length < 2) return;

            // Monta contexto
            const memDoc = await IAGroupMemory.findOne({ groupId: remoteJid }).lean();
            const ult = (memDoc?.messages || []).slice(-12);
            const systemPrompt = montarSystem();
            const ctx = [
                ...ult.map(m => ({
                    role: m.role,
                    content: m.role === 'user'
                        ? `[${m.author}-${m.authorNumber}]: ${m.content}`
                        : m.content
                })),
                { role: 'user', content: entrada }
            ];

            // Chama IA
            let resp = await getGroqReply(ctx, systemPrompt, randomGroqKey(bot.groqKey));
            if (Array.isArray(resp)) resp = resp[0];
            if (typeof resp !== 'string') {
                console.error('botinterage-normal: resposta inválida da IA');
                return;
            }
            resp = resp.trim();
            if (!resp) return;

            // Envia
            if (bot.comandos?.vozbotinterage) await enviarAudio(resp);
            else await sendText(server_url, apikey, instance, remoteJid, resp, replyObj);

            // Grava na memória (mantém só MAX_MEM)
            await IAGroupMemory.updateOne(
                { groupId: remoteJid },
                {
                    $push: {
                        messages: {
                            $each: [pushUser(userName, userNumber, entrada), pushBot(resp)],
                            $slice: -MAX_MEM
                        }
                    }
                },
                { upsert: true }
            );

        } catch (e) {
            console.error('botinterage-normal:', e.message);
        }
    }

    // ───────────────────────────────────────────────────────────────────
    // BLOCO 2 ── BOTINTERAGE **COM** MODERAÇÃO (p/ NÃO-ADM quando ativado)
    // ───────────────────────────────────────────────────────────────────
    if (
        isGroup &&
        !isAdmin &&
        bot.comandos?.moderacaocomia &&
        !prefixList.some(p => text.startsWith(p)) &&
        !/(https?:\/\/[^\s]+)/i.test(text)
    ) {
        try {
            const userName = data.pushName || participant.split('@')[0];
            const userNumber = participant.split('@')[0];
            let entrada = text;

            // Descrição de imagem ou figurinha
            if ((['image','sticker'].includes(messageType) || isGif) && messageHasMedia && bot.comandos?.lerimagem) {
                try {
                    const media = await downloadMedia(server_url, apikey, instance, remoteJid, id);
                    if (media?.base64) {
                        let filePath;
                        if (messageType === 'sticker') {
                            ({ filePath } = await salvarStickerComoPng(remoteJid, media.base64));
                        } else if (isGif) {
                            ({ filePath } = await salvarGifComoPng(remoteJid, media.base64));
                        } else {
                            ({ filePath } = await salvarMidiaDoGrupo(remoteJid, media.base64, 'jpg'));
                        }
                        const imgPrompt = `${bot.botinteragePrompt || ''} ${IMAGE_PROMPT}`.trim();
                        const desc = await describeImageGroq(filePath, imgPrompt, userName, randomGroqKey(bot.groqKey));
                        if (desc) {
                            await IAGroupMemory.updateOne(
                                { groupId: remoteJid },
                                {
                                    $push: {
                                        messages: {
                                            $each: [
                                                pushUser(userName, userNumber, text || (messageType==='sticker'?'[sticker]':'[imagem]')),
                                                pushBot(desc.trim())
                                            ],
                                            $slice: -MAX_MEM
                                        }
                                    }
                                },
                                { upsert: true }
                            );
                            entrada = desc.trim();
                        }
                    }
                } catch (e) {
                    console.error('❌ Erro ao analisar imagem:', e.message);
                }
            }

            // Transcrição de áudio
            if ((messageType === 'ptt' || messageType === 'audio') && messageHasMedia) {
                try {
                    const media = await downloadMedia(server_url, apikey, instance, remoteJid, id);
                    if (media?.base64 && media?.mimetype) {
                        const ext = media.mimetype.split('/')[1].split(';')[0] || 'ogg';
                        const { filePath } = await salvarMidiaDoGrupo(remoteJid, media.base64, ext);
                        entrada = await transcribeAudioGroq(filePath, randomGroqKey(bot.groqKey));
                        console.log('📝 Transcrição de áudio:', entrada);
                    }
                } catch (e) {
                    console.error('❌ Erro ao transcrever áudio:', e.message);
                    return;
                }
            }
            if (!entrada || entrada.length < 2) return;

            // Prompt de moderação
            const promptMod = montarSystem() + `

Retorne APENAS um JSON NESSE FORMATO EXATO:
{"violacao":true|false,"motivo":"<motivo>","reply":"<até 250 chars>"}

só analise com cuidado cada resposta`;

            const memDoc = await IAGroupMemory.findOne({ groupId: remoteJid }).lean();
            const ult = (memDoc?.messages || []).slice(-12);
            const ctx = [
                ...ult.map(m => ({
                    role: m.role,
                    content: m.role === 'user'
                        ? `[${m.author}-${m.authorNumber}]: ${m.content}`
                        : m.content
                })),
                { role: 'user', content: entrada }
            ];

            // Chama IA
            let raw = await getGroqReply(ctx, promptMod, randomGroqKey(bot.groqKey));
            if (Array.isArray(raw)) raw = raw[0];
            const obj = extraiJSON(raw);
            console.log('🔍 IA OBJ (moderação) ===>', obj);

            // Violação → apaga e avisa, sem gravar
            if (obj.violacao) {
                const aviso = obj.reply || `❌ @${userNumber} – mensagem removida. Motivo: ${obj.motivo}.`;
                await deleteMessageForEveryone(server_url, apikey, instance, id, remoteJid, participant, fromMe);
                await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🛑');
                if (bot.comandos?.vozbotinterage) await enviarAudio(aviso);
                else await sendText(server_url, apikey, instance, remoteJid, aviso, id, true);
                return;
            }

            // Sem violação → responde e grava
            const replyTxt = (obj.reply || '').trim();
            if (replyTxt && bot.comandos?.botinterage) {
                if (bot.comandos?.vozbotinterage) await enviarAudio(replyTxt);
                else await sendText(server_url, apikey, instance, remoteJid, replyTxt, replyObj);
            }

            await IAGroupMemory.updateOne(
                { groupId: remoteJid },
                {
                    $push: {
                        messages: {
                            $each: [
                                pushUser(userName, userNumber, entrada),
                                ...(replyTxt && bot.comandos?.botinterage ? [pushBot(replyTxt)] : [])
                            ],
                            $slice: -MAX_MEM
                        }
                    }
                },
                { upsert: true }
            );

        } catch (e) {
            console.error('botinterage-moderação:', e.message);
        }
    }





    // === Autorespostas personalizadas ===
    if (bot.comandos?.autoresposta && Array.isArray(bot.autoResponses)) {
        const msgLower = text.toLowerCase();

        for (const r of bot.autoResponses) {
            const triggers = Array.isArray(r.triggers) ? r.triggers : [];
            const found = triggers.find(t => {
                const trg = t.toLowerCase();
                return r.contains ? msgLower.includes(trg) : msgLower === trg;
            });
            if (!found) continue;

            const temMidia = r.hasMedia && r.filePath;
            let mediaSrc = '';

            if (temMidia) {
                try {
                    const b = await fs.readFile(r.filePath);
                    mediaSrc = `data:${r.mimetype};base64,${b.toString('base64')}`;
                } catch (err) {
                    console.warn('Erro ao carregar mídia da resposta:', err.message);
                }
            }

            if (mediaSrc && r.asSticker) {
                // Envia o sticker
                await sendStickerFromUrl(server_url, apikey, instance, remoteJid, mediaSrc, replyObj);

                // Envia o texto separado, se existir
                if (r.responseText) {
                    await sendText(server_url, apikey, instance, remoteJid, r.responseText, replyObj);
                }

            } else if (mediaSrc) {
                // Mídia comum com legenda
                await sendMedia(
                    server_url,
                    apikey,
                    instance,
                    remoteJid,
                    r.mimetype.split('/')[0],
                    r.mimetype,
                    r.responseText || '',
                    mediaSrc,
                    r.fileName || 'file',
                    replyObj
                );

        } else if (r.responseText) {
            // Apenas texto (sem mídia)
            await sendText(server_url, apikey, instance, remoteJid, r.responseText, replyObj);
        }

        break; // Aciona apenas uma resposta
    }
}

    // Resposta rápida para consultar prefixos
    const queryLower = text.trim().toLowerCase();
    if (queryLower === 'prefix' || queryLower === 'prefixo') {
        const prefixInfo = prefixList.join(' ');
        await sendText(
            server_url,
            apikey,
            instance,
            remoteJid,
            `Meus prefixos são: ${prefixInfo}`,
            id
        );
        return;
    }

    // Saudação ou resposta grosseira quando mencionam o bot
    if (isGroup && !isCommand) {
        const insult = /(niak\w*|botadmin|bot)\s+corno/i.test(queryLower);
        const called = /(\bniak\w*\b|\bbotadmin\b|\bbot\b)/i.test(queryLower);
        if (insult) {
            await sendText(server_url, apikey, instance, remoteJid, 'corno é teu pai filha da puta', id);
            return;
        }
        if (called) {
            const prefixInfo = prefixList.join(' ');
            const name = data.pushName || senderId;
            const msg = [
                `Olá ${name}!`,
                'Para usar meus comandos, utilize os prefixos abaixo:',
                `${prefixInfo}`
            ].join('\n');
            await sendText(server_url, apikey, instance, remoteJid, msg, id);
            return;
        }
    }



    // === Comandos principais ===
    if (isCommand) {
        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '⏳');

        const langCmds = ['portugues', 'pt', 'ptbr', 'english', 'en', 'espanol', 'es'];
        if (botRegistrado && !lang && !langCmds.includes(cleanCommand)) {
            const chooseMsg = [
                '⚠️ *ATENÇÃO*',
                '* *Select a language*',
                '* *Selecciona un idioma*',
                '* *Selecione um idioma*',
                '',
                '*Comandos* 🛡️',
                `👉 \`${mainPrefix}pt\` - Português 🇧🇷`,
                `👉 \`${mainPrefix}en\` - English 🇺🇸`,
                `👉 \`${mainPrefix}es\` - Español 🇪🇸`
            ].join('\n');
            await sendText(server_url, apikey, instance, remoteJid, chooseMsg, id);
            return;
        }

        if (bot.comandos?.soadm && !isAdmin) return;

        switch (cleanCommand) {

            case 'portugues':
            case 'pt':
            case 'ptbr':
                if (!isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid, t('apenas_admins'), quotedId);
                    break;
                }
                await BotConfig.updateOne({ groupId: remoteJid }, { language: 'ptbr' });
                await sendMenu(buildMenu(), quotedId);
                break;

            case 'english':
            case 'en':
                if (!isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid, t('apenas_admins'), quotedId);
                    break;
                }
                await BotConfig.updateOne({ groupId: remoteJid }, { language: 'enus' });
                await sendMenu(buildMenu(), quotedId);
                break;

            case 'espanol':
            case 'es':
                if (!isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid, t('apenas_admins'), quotedId);
                    break;
                }
                await BotConfig.updateOne({ groupId: remoteJid }, { language: 'es' });
                await sendMenu(buildMenu(), quotedId);
                break;


            case 'menu':
            case 'm':
                const comandosUsuario = [
                    '╭─🎲─ *MENU PRINCIPAL* ────',
                    `│ • \`${mainPrefix}play <pesquisa>\` - busca música/vídeo`,
                    `│ • \`${mainPrefix}sticker\` - cria figurinha`,
                    `│ • \`${mainPrefix}sfundo\` - figurinha sem fundo`,
                    `│ • \`${mainPrefix}tomp3\` - converte para MP3`,
                    `│ • \`${mainPrefix}ytmp4 <link>\` - baixa vídeo do YouTube`,
                    `│ • \`${mainPrefix}tiktok <link>\` - baixa vídeo do TikTok`,
                    `│ • \`${mainPrefix}instagram <link>\` - baixa mídia do Instagram`,
                    `│ • \`${mainPrefix}facebook <link>\` - baixa vídeo do Facebook`,
                    `│ • \`${mainPrefix}kwai <link>\` - baixa vídeo do Kwai`,
                    `│ • \`${mainPrefix}id\` - mostra o ID do chat/grupo`,
                    `│ • \`${mainPrefix}piada [tema]\` - conta uma piada`,
                    `│ • \`${mainPrefix}brincadeiras\` - lista brincadeiras`,
                    `│ • \`${mainPrefix}figurinhas\` - envia figurinhas`,
                    `│ • \`${mainPrefix}tabela\` - mostra a tabela`,
                    `│ • \`${mainPrefix}sorteio\` - cria sorteio`,
                    `│ • \`${mainPrefix}sorteio2\` - sorteio simples`,
                    `│ • \`${mainPrefix}enquete\` - cria enquete`,
                    '│',
                    '│ 🔒 *Comandos de Admin*',
                    `│ • \`${mainPrefix}menuadm\` - opções administrativas`,
                    '╰──────────────────────'
                ].join('\n');

                await sendMenu(comandosUsuario, quotedId);
                break;


            case 'menuadm':
            case 'menuadmin':
                if (!isAdmin) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        t('apenas_admins'),
                        quotedId
                    );
                    break;
                }

                // ── MENU ADMINISTRATIVO ──
                const comandosAdmin = [
                    '╭──────────────',
                    '┇ *乂 M E N U   A D M I N 乂*',
                    '╰──────────────\n',
                    '🛠️ *GERÊNCIA DO GRUPO*',
                    `\`${mainPrefix}ban @usuário\` – Remove membro marcado`,
                    `\`${mainPrefix}apagar\` – Apaga mensagem marcada`,
                    `\`${mainPrefix}permitirlink <link>\` – Adiciona link/domínio à whitelist`,
                    `\`${mainPrefix}removerlink <link>\` – Remove link/domínio da whitelist`,
                    '⚙️ *CONFIGURAÇÕES DO BOT*',
                    `\`${mainPrefix}botinterage\` – Ativa IA que responde no grupo`,
                    `\`${mainPrefix}antilink\` – Apaga links não permitidos`,
                    `\`${mainPrefix}banextremo\` – Bane quem enviar links proibidos`,
                    `\`${mainPrefix}antilinkgp\` – Apaga convites de outros grupos`,
                    `\`${mainPrefix}bangringos\` – Remove quem não for do Brasil`,
                    `\`${mainPrefix}soadm\` – Somente admins usam comandos`,
                    `\`${mainPrefix}autosticker\` – Converte imagem/vídeo em figurinha`,
                    `\`${mainPrefix}autodownloader\` – Baixa mídias automaticamente`,
                    `\`${mainPrefix}modobrincadeira\` – Ativa/desativa comandos de brincadeiras`,
                    '🖼️ *PERSONALIZAÇÕES*',
                    `\`${mainPrefix}fundomenu\` – Define/remover fundo do menu`,
                    `\`${mainPrefix}fundobemvindo\` – Define/remover imagem de boas-vindas`,
                    `\`${mainPrefix}legendabemvindo <texto>\` – Atualiza legenda de boas-vindas`,
                    // adicione aqui todos os demais comandos administrativos…
                ].join('\n');

                await sendText(
                    server_url,
                    apikey,
                    instance,
                    remoteJid,
                    comandosAdmin,
                    quotedId
                );
                await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                break;




            case 'fundomenu':
                if (!isGroup || !isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Este comando só pode ser usado por administradores em grupos.', quotedId);
                    break;
                }

                const pastaGrupo = path.join('arquivos', remoteJid);
                const menuPath = path.join(pastaGrupo, 'menu.jpeg');

                if (args[0]?.toLowerCase() === 'reset') {
                    try {
                        await fs.unlink(menuPath);
                        await sendText(server_url, apikey, instance, remoteJid,
                            '✅ Fundo do menu removido. Agora será usado o fundo padrão.', quotedId);
                        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '♻️');
                    } catch (err) {
                        if (err.code === 'ENOENT') {
                            await sendText(server_url, apikey, instance, remoteJid,
                                '⚠️ Nenhum fundo personalizado estava definido.', quotedId);
                        } else {
                            console.error('Erro ao remover fundo do menu:', err.message);
                            await sendText(server_url, apikey, instance, remoteJid,
                                '❌ Erro ao tentar remover o fundo do menu.', quotedId);
                        }
                    }
                    break;
                }

                if (!quotedMessageId) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `📌 Envie \`${mainPrefix}fundomenu\` respondendo a uma imagem.\nOu \`${mainPrefix}fundomenu reset\` para remover o fundo personalizado.`, quotedId);
                    break;
                }

                try {
                    const media = await downloadMedia(server_url, apikey, instance, remoteJid, quotedMessageId);

                    if (!media?.base64 || !media.mimetype.startsWith('image/')) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '⚠️ A mensagem respondida não contém uma imagem válida.', quotedId);
                        break;
                    }

                    await fs.mkdir(pastaGrupo, { recursive: true });
                    await fs.writeFile(menuPath, Buffer.from(media.base64, 'base64'));

                    await sendText(server_url, apikey, instance, remoteJid,
                        '✅ Fundo do menu atualizado com sucesso!', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🖼️');

                } catch (err) {
                    console.error('Erro ao salvar novo fundo do menu:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Erro ao tentar salvar a nova imagem de fundo.', quotedId);
                }
                break;


            case 'fundobemvindo':
                if (!isGroup || !isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Este comando só pode ser usado por administradores em grupos.', quotedId);
                    break;
                }

                try {
                    const bot = await BotConfig.findOne({ groupId: remoteJid });
                    if (!bot) {
                        await sendText(server_url, apikey, instance, remoteJid, '❌ Bot não encontrado no banco.', quotedId);
                        break;
                    }

                    const pastaGrupo = path.join('arquivos', remoteJid);
                    const bemvindoPath = path.join(pastaGrupo, 'bemvindo.png');

                    // Reset da imagem
                    if (args[0]?.toLowerCase() === 'reset') {
                        if (bot.bemvindo?.filePath) {
                            await fs.unlink(bot.bemvindo.filePath).catch(() => { });
                        }

                        bot.bemvindo = {
                            caption: '',
                            filePath: '',
                            fileName: '',
                            mimetype: '',
                            hasMedia: false,
                            updatedAt: new Date()
                        };

                        await bot.save();

                        await sendText(server_url, apikey, instance, remoteJid,
                            '♻️ Imagem de boas-vindas removida. Será usado o fundo padrão.', quotedId);
                        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                        break;
                    }

                    // Upload da nova imagem via resposta
                    if (!quotedMessageId) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            `📎 Envie \`${mainPrefix}fundobemvindo\` respondendo a uma imagem.\nOu use \`${mainPrefix}fundobemvindo reset\` para remover.`, quotedId);
                        break;
                    }

                    const media = await downloadMedia(server_url, apikey, instance, remoteJid, quotedMessageId);
                    if (!media?.base64 || !media.mimetype.startsWith('image/')) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '⚠️ A mensagem respondida não contém uma imagem válida.', quotedId);
                        break;
                    }

                    await fs.mkdir(pastaGrupo, { recursive: true });

                    const ext = media.mimetype.split('/')[1] || 'png';
                    const nome = `bemvindo_${Date.now()}.${ext}`;
                    const caminho = path.join(pastaGrupo, nome);

                    // remove imagem antiga se houver
                    if (bot.bemvindo?.filePath) {
                        await fs.unlink(bot.bemvindo.filePath).catch(() => { });
                    }

                    await fs.writeFile(caminho, Buffer.from(media.base64, 'base64'));

                    bot.bemvindo = {
                        caption: '',
                        filePath: caminho.replace(/\\/g, '/'),
                        fileName: nome,
                        mimetype: media.mimetype,
                        hasMedia: true,
                        updatedAt: new Date()
                    };

                    await bot.save();

                    await sendText(server_url, apikey, instance, remoteJid,
                        '✅ Imagem de boas-vindas atualizada com sucesso!', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🖼️');

                } catch (err) {
                    console.error('Erro no fundobemvindo:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Erro ao processar o comando de fundo de boas-vindas.', quotedId);
                }
                break;

            case 'bemvindo':
                if (!isGroup || !isAdmin) {
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Apenas administradores podem ativar ou desativar esta função.', quotedId);
                    break;
                }

                if (!allowedCommands.bemvindo) {
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        '⚠️ Esta função não está disponível no seu plano atual. Acesse o painel e atualize o plano do robô.',
                        quotedId
                    );
                    break;
                }

                try {
                    const bot = await BotConfig.findOne({ groupId: remoteJid });
                    if (!bot) {
                        await sendText(server_url, apikey, instance, remoteJid, '❌ Grupo não encontrado no banco.', quotedId);
                        break;
                    }

                    const statusAtual = bot.bemvindo?.ativo ?? false;
                    const novoStatus = !statusAtual;

                    bot.bemvindo.ativo = novoStatus;
                    bot.bemvindo.updatedAt = new Date();
                    await bot.save();

                    await sendText(server_url, apikey, instance, remoteJid,
                        `✅ Função de boas-vindas ${novoStatus ? '*ativada*' : '*desativada*'} com sucesso.`, quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, novoStatus ? '✅' : '🛑');

                } catch (err) {
                    console.error('Erro ao alternar bemvindo:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Erro ao ativar/desativar a função de boas-vindas.', quotedId);
                }
                break;


            case 'legendabemvindo':
                if (!isGroup || !isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Este comando só pode ser usado por administradores em grupos.', quotedId);
                    break;
                }

                try {
                    const bot = await BotConfig.findOne({ groupId: remoteJid });
                    if (!bot) {
                        await sendText(server_url, apikey, instance, remoteJid, '❌ Bot não encontrado no banco.', quotedId);
                        break;
                    }

                    let novaLegenda = argsStr.trim();

                    // reset da legenda
                    if (args[0]?.toLowerCase() === 'reset') {
                        bot.bemvindo.caption = '';
                        bot.bemvindo.updatedAt = new Date();
                        await bot.save();

                        await sendText(server_url, apikey, instance, remoteJid,
                            '✅ Legenda de boas-vindas apagada com sucesso.', quotedId);
                        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🗑️');
                        break;
                    }

                    // se não veio legenda nos args, tenta pegar de uma mensagem marcada
                    if (!novaLegenda && quotedText) {
                        novaLegenda = quotedText.trim();
                    }

                    if (!novaLegenda) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            `✏️ Use \`${mainPrefix}legendabemvindo <texto>\` ou responda a uma mensagem com o texto desejado.\nExemplo: \`${mainPrefix}legendabemvindo Bem-vindo(a) ao grupo! 🎉\``, quotedId);
                        break;
                    }

                    bot.bemvindo.caption = novaLegenda;
                    bot.bemvindo.updatedAt = new Date();
                    await bot.save();

                    await sendText(server_url, apikey, instance, remoteJid,
                        '✅ Legenda de boas-vindas atualizada com sucesso!', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✍️');

                } catch (err) {
                    console.error('Erro ao atualizar legenda de boas-vindas:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Erro ao atualizar a legenda de boas-vindas.', quotedId);
                }
                break;

            case 'permitirlink':
                if (!isGroup || !isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Este comando só pode ser usado por administradores em grupos.', quotedId);
                    break;
                }

                if (args.length === 0) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `⚠️ Uso correto: \`${mainPrefix}permitirlink <link ou domínio>\`\nEx: \`${mainPrefix}permitirlink youtube.com\` ou \`${mainPrefix}permitirlink https://bet.com/minhaurl\``,
                        quotedId);
                    break;
                }

                try {
                    const valorBruto = args[0];
                    const normalize = link => {
                        try {
                            const url = new URL(link.includes('://') ? link : `https://${link}`);
                            return url.hostname.toLowerCase().replace(/^www\./, '');
                        } catch {
                            return link.toLowerCase().trim();
                        }
                    };

                    const dominio = normalize(valorBruto);

                    const bot = await BotConfig.findOne({ groupId: remoteJid });
                    if (!bot) {
                        await sendText(server_url, apikey, instance, remoteJid, '❌ Grupo não encontrado na base de dados.', quotedId);
                        break;
                    }

                    const jaTem = bot.linksPermitidos.some(d => normalize(d) === dominio);
                    if (jaTem) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            `ℹ️ O link/domínio \`${dominio}\` já está na lista de permitidos aqui no grupo`, quotedId);
                        break;
                    }

                    bot.linksPermitidos.push(dominio);
                    bot.markModified('linksPermitidos');
                    await bot.save();

                    await sendText(server_url, apikey, instance, remoteJid,
                        `✅ Link/domínio \`${dominio}\` adicionado à whitelist com sucesso.`, quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                } catch (err) {
                    console.error('Erro no comando !permitirlink:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao adicionar o link.', quotedId);
                }
                break;

            case 'removerlink':
                if (!isGroup || !isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Este comando só pode ser usado por administradores em grupos.', quotedId);
                    break;
                }

                if (args.length === 0) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `⚠️ Uso correto: \`${mainPrefix}removerlink <link ou domínio>\`\nEx: \`${mainPrefix}removerlink youtube.com\``, quotedId);
                    break;
                }

                try {
                    const valorBruto = args[0];
                    const normalize = link => {
                        try {
                            const url = new URL(link.includes('://') ? link : `https://${link}`);
                            return url.hostname.toLowerCase().replace(/^www\./, '');
                        } catch {
                            return link.toLowerCase().trim();
                        }
                    };

                    const dominio = normalize(valorBruto);

                    const bot = await BotConfig.findOne({ groupId: remoteJid });
                    if (!bot) {
                        await sendText(server_url, apikey, instance, remoteJid, '❌ Grupo não encontrado na base de dados.', quotedId);
                        break;
                    }

                    const anterior = bot.linksPermitidos.length;
                    bot.linksPermitidos = bot.linksPermitidos.filter(link => normalize(link) !== dominio);
                    const novo = bot.linksPermitidos.length;

                    if (novo === anterior) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            `⚠️ Link/domínio \`${dominio}\` não estava na whitelist.`, quotedId);
                        break;
                    }

                    bot.markModified('linksPermitidos');
                    await bot.save();

                    await sendText(server_url, apikey, instance, remoteJid,
                        `🗑️ Link/domínio \`${dominio}\` removido com sucesso da whitelist.`, quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🗑️');
                } catch (err) {
                    console.error('Erro no comando !removerlink:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao remover o link.', quotedId);
                }
                break;
            case 'linkspermitidos':
                if (!isGroup) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Este comando só pode ser usado dentro de grupos.', quotedId);
                    break;
                }

                try {
                    const bot = await BotConfig.findOne({ groupId: remoteJid });

                    if (!bot) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '❌ Grupo não encontrado na base de dados.', quotedId);
                        break;
                    }

                    const links = bot.linksPermitidos || [];

                    if (links.length === 0) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            'ℹ️ Nenhum link ou domínio foi liberado ainda neste grupo.', quotedId);
                        break;
                    }

                    const listaFormatada = links.map((link, i) => `*${i + 1}.* \`${link}\``).join('\n');

                    const resposta = `📜 *Links e domínios permitidos no grupo:*\n\n${listaFormatada}`;

                    await sendText(server_url, apikey, instance, remoteJid, resposta, quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📃');
                } catch (err) {
                    console.error('Erro ao listar links permitidos:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Erro ao listar os links permitidos.', quotedId);
                }
                break;



            case 'id':
                await sendText(server_url, apikey, instance, remoteJid,
                    `${remoteJid}`, quotedId);
                break;

            case 'participantes':
                if (!isGroup) return;

                try {
                    const sorteioAtivo = await Sorteio.findOne({
                        bot: bot._id,
                        concluido: false
                    }).sort({ createdAt: -1 });

                    if (!sorteioAtivo) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '⚠️ Nenhum sorteio ativo foi encontrado.', quotedId);
                        break;
                    }

                    const { tipo, pergunta, participantes = [], createdAt } = sorteioAtivo;

                    const dataCriacao = new Date(createdAt).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/Sao_Paulo'
                    });

                    const listaFormatada = participantes.map(p => `• @${p.split('@')[0]}`).join('\n');

                    const mensagem = `📊 *Participantes do sorteio ${tipo}:* ${pergunta}\n` +
                        `📅 Criado em: ${dataCriacao}\n\n` +
                        `${listaFormatada}`;

                    await sendText(server_url, apikey, instance, remoteJid, mensagem, quotedId, true);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📋');
                } catch (err) {
                    console.error('❌ Erro ao buscar participantes do sorteio:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Ocorreu um erro ao consultar os participantes.', quotedId);
                }
                break;

            case 'tomp3':
                if (!quotedMessageId) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '⚠️ Use o comando *!tomp3* respondendo a um vídeo ou documento de vídeo.', quotedId);
                    break;
                }

                try {
                    const media = await downloadMedia(server_url, apikey, instance, remoteJid, quotedMessageId);
                    if (!media?.base64 || !media.mimetype) {
                        await sendText(server_url, apikey, instance, remoteJid, '❌ Mídia inválida ou não encontrada.', quotedId);
                        break;
                    }

                    // Identifica extensão
                    const videoExtensoes = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'mpeg'];
                    const extFromName = media.fileName?.split('.').pop()?.toLowerCase() || '';
                    const extFromMime = media.mimetype.split('/').pop()?.toLowerCase() || '';

                    const isVideo = media.mimetype.startsWith('video/') ||
                        (media.mimetype === 'application/octet-stream' && videoExtensoes.includes(extFromName)) ||
                        videoExtensoes.includes(extFromMime);

                    if (!isVideo) {
                        await sendText(server_url, apikey, instance, remoteJid, '⚠️ Apenas vídeos são suportados para conversão.', quotedId);
                        break;
                    }

                    const { filePath, fileName } = await salvarMidiaDoGrupo(remoteJid, media.base64, extFromName || 'mp4');
                    const mp3Path = filePath.replace(/\.\w+$/, '.mp3');

                    const command = `ffmpeg -i "${filePath}" -vn -ar 44100 -ac 2 -b:a 192k "${mp3Path}" -y`;
                    execSync(command);

                    const base64 = (await fs.readFile(mp3Path)).toString('base64');
                    await sendMedia(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        'audio',
                        'audio/mpeg',
                        `${fileName.replace(/\.\w+$/, '')}.mp3`,
                        `data:audio/mpeg;base64,${base64}`,
                        `${fileName.replace(/\.\w+$/, '')}.mp3`,
                        quotedId
                    );

                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🎧');
                } catch (err) {
                    console.error('❌ Erro no tomp3:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao converter vídeo para MP3.', quotedId);
                }
                break;


            case 'fixar':
                if (!isGroup) {
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Este comando só pode ser usado em grupos.', quotedId);
                    break;
                }

                if (!quotedMessageId) {
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Você precisa responder a uma mensagem para fixá-la.', quotedId);
                    break;
                }

                try {
                    await fixarMensagem(server_url, apikey, instance, remoteJid, quotedMessageId);
                    await sendText(server_url, apikey, instance, remoteJid, '📌 Mensagem fixada com sucesso.', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📌');
                } catch (err) {
                    console.error('❌ Erro ao fixar mensagem:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao fixar a mensagem.', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                }
                break;



            case 'desfixar':
                if (!isAdmin || !quotedMessageId) return;
                try {
                    await desfixarMensagem(server_url, apikey, instance, remoteJid, quotedMessageId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🧹');
                } catch (err) {
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao desfixar a mensagem.', quotedId);
                }
                break;

            case 'abrirgp':
                if (!isGroup || !isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Este comando só pode ser usado por administradores em grupos.', quotedId);
                    break;
                }

                const horarioAbrir = args[0];
                if (!horarioAbrir || (!/^\d{2}:\d{2}$/.test(horarioAbrir) && horarioAbrir !== '0')) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `❌ Por favor, forneça o horário no formato HH:MM ou \`0\` para limpar.\nExemplo: \`${mainPrefix}abrirgp 08:00\` ou \`${mainPrefix}abrirgp 0\``,
                        quotedId);
                    break;
                }

                try {
                    await BotConfig.updateOne(
                        { groupId: remoteJid },
                        { $set: { 'horarioGrupo.abrir': horarioAbrir === '0' ? '' : horarioAbrir } }
                    );

                    const respostaAbrir = horarioAbrir === '0'
                        ? '⛔ Horário automático de abrir grupo removido.'
                        : `🕓 Grupo será aberto automaticamente às *${horarioAbrir}*.`;

                    await sendText(server_url, apikey, instance, remoteJid, respostaAbrir, quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                } catch (err) {
                    console.error('Erro ao configurar abrirgp:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao salvar o horário.', quotedId);
                }
                break;
            case 'fechargp':
                if (!isGroup || !isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Este comando só pode ser usado por administradores em grupos.', quotedId);
                    break;
                }

                const horarioFechar = args[0];
                if (!horarioFechar || (!/^\d{2}:\d{2}$/.test(horarioFechar) && horarioFechar !== '0')) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `❌ Por favor, forneça o horário no formato HH:MM ou \`0\` para limpar.\nExemplo: \`${mainPrefix}fechargp 23:30\` ou \`${mainPrefix}fechargp 0\``,
                        quotedId);
                    break;
                }

                try {
                    await BotConfig.updateOne(
                        { groupId: remoteJid },
                        { $set: { 'horarioGrupo.fechar': horarioFechar === '0' ? '' : horarioFechar } }
                    );

                    const respostaFechar = horarioFechar === '0'
                        ? '⛔ Horário automático de fechar grupo removido.'
                        : `🔒 Grupo será fechado automaticamente às *${horarioFechar}*.`;

                    await sendText(server_url, apikey, instance, remoteJid, respostaFechar, quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                } catch (err) {
                    console.error('Erro ao configurar fechargp:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao salvar o horário.', quotedId);
                }
                break;



            case 'all':
            case 'hidetagall':
                if (!isAdmin) return;

                // helper pra salvar no banco
                async function saveUltima({ caption, filePath, mimetype, fileName, hasMedia }) {
                    await BotConfig.updateOne(
                        { groupId: remoteJid },
                        {
                            $set: {
                                ultimaMensagemAll: {
                                    caption,
                                    filePath,
                                    mimetype,
                                    fileName,
                                    hasMedia,
                                    updatedAt: new Date()
                                }
                            }
                        }
                    );
                }

                const hasText = argsStr.length > 0;
                const textToSend = hasText ? argsStr : '';
                const isReply = Boolean(quotedMessageId);
                const isNewMedia = messageHasMedia;

                // 1) NOVA MÍDIA (pode ou não ser reply) → download e envio
                if (isNewMedia) {
                    try {
                        const media = await downloadMedia(server_url, apikey, instance, remoteJid, id);
                        if (media?.base64 && media.mimetype) {
                            const ext = media.mimetype.split('/')[1].split(';')[0] || 'bin';
                            const { filePath, fileName } = await salvarMidiaDoGrupo(remoteJid, media.base64, ext);
                            const mediaType = media.mimetype.split('/')[0];

                            await saveUltima({
                                caption: textToSend,
                                filePath,
                                mimetype: media.mimetype,
                                fileName,
                                hasMedia: true
                            });

                            await sendMedia(
                                server_url, apikey, instance, remoteJid,
                                mediaType,
                                media.mimetype,
                                textToSend,
                                `data:${media.mimetype};base64,${media.base64}`,
                                fileName,
                                null,
                                true
                            );
                            await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📁');
                        }
                    } catch (err) {
                        console.error('❌ Erro no !all (nova mídia):', err.message);
                        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    }
                    break;
                }

                // 2) REPLY + TEXTO NOVO → baixa mídia da mensagem citada (se existir) e reenvia com NOVA legenda
                if (isReply && hasText) {
                    let downloaded = null;
                    try {
                        downloaded = await downloadMedia(server_url, apikey, instance, remoteJid, quotedMessageId);
                    } catch { }
                    if (downloaded?.base64 && downloaded.mimetype) {
                        const ext = downloaded.mimetype.split('/')[1].split(';')[0] || 'bin';
                        const { filePath, fileName } = await salvarMidiaDoGrupo(remoteJid, downloaded.base64, ext);
                        const mediaType = downloaded.mimetype.split('/')[0]; // image, video, audio, etc

                        await saveUltima({
                            caption: textToSend,
                            filePath,
                            mimetype: downloaded.mimetype,
                            fileName,
                            hasMedia: true
                        });

                        await sendMedia(
                            server_url, apikey, instance, remoteJid,
                            mediaType,
                            downloaded.mimetype,
                            textToSend,
                            `data:${downloaded.mimetype};base64,${downloaded.base64}`,
                            fileName,
                            null,
                            true
                        );
                        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📁');
                        break;
                    }
                    // se não havia mídia, é só texto em reply
                    await sendText(server_url, apikey, instance, remoteJid, textToSend, null, true);
                    await saveUltima({ caption: textToSend, filePath: '', mimetype: '', fileName: '', hasMedia: false });
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🗣️');
                    break;
                }

                // 3) REPLY sem texto extra → apenas encaminha (preserva legenda original)
                if (isReply && !hasText) {
                    await forwardWithMentionAll(server_url, apikey, instance, remoteJid, quotedMessageId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🔄');
                    break;
                }

                // 4) TEXTO PURO → envia e salva
                if (!isNewMedia && !isReply && hasText) {
                    await sendText(server_url, apikey, instance, remoteJid, textToSend, null, true);
                    await saveUltima({ caption: textToSend, filePath: '', mimetype: '', fileName: '', hasMedia: false });
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🗣️');
                    break;
                }

                // 5) APENAS COMANDO → reutiliza o último salvo
                const ultima = bot.ultimaMensagemAll;
                if (ultima?.hasMedia && ultima.filePath) {
                    try {
                        const buffer = await fs.readFile(ultima.filePath);
                        const base64 = buffer.toString('base64');
                        const mediaType = ultima.mimetype.split('/')[0];
                        await sendMedia(
                            server_url, apikey, instance, remoteJid,
                            mediaType,
                            ultima.mimetype,
                            ultima.caption,
                            `data:${ultima.mimetype};base64,${base64}`,
                            ultima.fileName,
                            null,
                            true
                        );
                        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📁');
                    } catch (err) {
                        console.warn('⚠️ Falha ao ler mídia salva, revertendo para texto:', err.message);
                        if (ultima.caption) {
                            await sendText(server_url, apikey, instance, remoteJid, ultima.caption, null, true);
                            await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🗣️');
                        } else {
                            await sendText(server_url, apikey, instance, remoteJid, '⚠️ Nenhuma mensagem anterior salva para reenviar.', id);
                            await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                        }
                    }
                } else if (ultima?.caption) {
                    await sendText(server_url, apikey, instance, remoteJid, ultima.caption, null, true);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🗣️');
                } else {
                    await sendText(server_url, apikey, instance, remoteJid, '⚠️ Nenhuma mensagem anterior salva para reenviar.', id);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                }

                break;



            case 'tabela':
                if (!isGroup) return;

                // Apenas exibição da tabela
                const tabelaAtual = bot.tabela || '';
                const textoTabela = tabelaAtual
                    ? `${tabelaAtual}`
                    : `ℹ️ Nenhuma tabela foi definida ainda para este grupo.\n\n✍️ Use o comando:\n*${mainPrefix}addtabela conteúdo da nova linha*`;
                await sendText(server_url, apikey, instance, remoteJid, textoTabela, quotedId);
                break;

            case 'addtabela':
                if (!isGroup) return;

                if (!isAdmin) {
                    await sendText(
                        server_url, apikey, instance, remoteJid,
                        '🚫 *Apenas administradores podem adicionar à tabela.*',
                        quotedId
                    );
                    break;
                }

                if (args.length === 0) {
                    await sendText(
                        server_url, apikey, instance, remoteJid,
                        `⚠️ *Uso correto:* ${mainPrefix}addtabela conteúdo da nova linha\n\n📌 Exemplo:\n${mainPrefix}addtabela Aula 03 - Terça-feira 14h\n\n🧩 O texto será adicionado ao final da tabela atual.`,
                        quotedId
                    );
                    break;
                }

                const novaLinha = text.substring(text.indexOf(' ') + 1); // preserva o conteúdo original
                const tabelaExistente = bot.tabela || '';
                const tabelaAtualizada = tabelaExistente
                    ? `${tabelaExistente}\n${novaLinha}`
                    : novaLinha;

                try {
                    await BotConfig.updateOne({ groupId: remoteJid }, { $set: { tabela: tabelaAtualizada } });
                    await sendText(
                        server_url, apikey, instance, remoteJid,
                        '✅ *Nova linha adicionada com sucesso à tabela!*',
                        quotedId
                    );
                } catch (err) {
                    console.error('Erro ao adicionar na tabela:', err.message);
                    await sendText(
                        server_url, apikey, instance, remoteJid,
                        '❌ Ocorreu um erro ao atualizar a tabela.',
                        quotedId
                    );
                }
                break;

            case 'sorteio':
                if (!isGroup) break;

                const partes = text.replace(/^!sorteio\s*/i, '').split('|').map(p => p.trim());
                if (partes.length < 4) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `❌ Formato inválido.\n\n📌 Use: *${mainPrefix}sorteio <limite> | <vencedores> | <tempo> | <título>*\n\nEx: ${mainPrefix}sorteio 30 | 2 | 5m | Sorteio de Pix R$50`,
                        quotedId
                    );
                    break;
                }

                const maxParticipantes = parseInt(partes[0], 10);
                const winnersCount = parseInt(partes[1], 10);
                const delayString = partes[2];
                const pergunta = partes.slice(3).join(' | ');

                if (isNaN(maxParticipantes) || isNaN(winnersCount) || maxParticipantes < 1 || winnersCount < 1) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Os dois primeiros parâmetros devem ser números válidos.\nEx: `30 | 2`',
                        quotedId
                    );
                    break;
                }

                const matchTempo = delayString.match(/^(\d+)([mhd])$/i);
                if (!matchTempo) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Tempo inválido. Use "5m" para minutos, "2h" para horas ou "1d" para dias.',
                        quotedId
                    );
                    break;
                }

                const [_, valorTempo, tipoTempo] = matchTempo;
                const tempo = parseInt(valorTempo, 10);
                const msPorUnidade = tipoTempo === 'm' ? 60_000 : tipoTempo === 'h' ? 3_600_000 : 86_400_000;
                const sortearEm = new Date(Date.now() + tempo * msPorUnidade);

                const opcoes = [
                    { name: 'Participar', localId: 0 },
                    { name: 'Não participar', localId: 1 }
                ];

                try {
                    const messageId = await sendPoll(server_url, apikey, instance, remoteJid, pergunta, opcoes.map(o => o.name), false, true);
                    const botConfig = await BotConfig.findOne({ groupId: remoteJid });
                    if (!botConfig) throw new Error('BotConfig não encontrado para o grupo.');

                    await Sorteio.create({
                        bot: botConfig._id,
                        pergunta,
                        tipo: 'automatico',
                        serialized: messageId,
                        opcoes,
                        participantes: [],
                        maxParticipantes,
                        sortearEm,
                        winnersCount
                    });

                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🎟️');
                } catch (err) {
                    console.error('❌ Erro ao cadastrar sorteio:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Falha ao registrar o sorteio.', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                }

                break;

            case 'sorteio2':
                if (!isGroup) {
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Este comando só pode ser usado em grupos.', quotedId);
                    break;
                }

                const partes2 = text.replace(/^!sorteio2\s*/i, '').split('|').map(p => p.trim());

                let quantidade = 1;
                let titulo = '';

                if (partes2.length === 1) {
                    titulo = partes2[0];
                } else if (partes2.length >= 2) {
                    quantidade = parseInt(partes2[0], 10);
                    titulo = partes2.slice(1).join(' |');
                }

                if (!titulo) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `❌ Formato inválido.\n\n📌 Use: *${mainPrefix}sorteio2 <quantidade> | <título>*\nEx: \`${mainPrefix}sorteio2 2 | Pix de R$50\`\nOu apenas: \`${mainPrefix}sorteio2 Pix de R$50\``,
                        quotedId
                    );
                    break;
                }

                if (isNaN(quantidade) || quantidade < 1) {
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Quantidade de vencedores inválida.', quotedId);
                    break;
                }

                try {
                    const info = await findGroupInfos(server_url, instance, remoteJid, apikey);
                    const membros = info.participants.map(p => p.id).filter(j => j);

                    if (membros.length === 0) {
                        await sendText(server_url, apikey, instance, remoteJid, '❌ Nenhum participante encontrado no grupo.', quotedId);
                        break;
                    }

                    const vencedores = membros.sort(() => 0.5 - Math.random()).slice(0, quantidade);

                    const linhasVencedores = vencedores
                        .map(jid => `🏆 @${jid.replace(/@c\.us$/, '')}`)
                        .join('\n');

                    const mensagem = [
                        '乂  S O R T E I O   F I N A L I Z A D O 乂  🎉',
                        '',
                        'Parabéns!',
                        linhasVencedores,
                        '',
                        `Ganhou: *${titulo}*`
                    ].join('\n');

                    await sendText(server_url, apikey, instance, remoteJid, mensagem, null, false, vencedores);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🎉');
                } catch (err) {
                    console.error('❌ Erro no sorteio2:', err);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Ocorreu um erro ao realizar o sorteio.', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                }
                break;

            case 'enquete':
                if (!isGroup) {
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Este comando só pode ser usado em grupos.', quotedId);
                    break;
                }

                const argsEnquete = text.replace(/^!enquete\s*/i, '').split('|').map(p => p.trim());

                const tituloEnquete = argsEnquete[0];
                const opcoesEnquete = argsEnquete.slice(1);

                if (!tituloEnquete || opcoesEnquete.length < 2) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `❌ Formato inválido.\n\n📌 Use: *${mainPrefix}enquete título | opção 1 | opção 2 | ...*\nEx: \`${mainPrefix}enquete Qual seu prêmio favorito? | Casa | Carro | Moto\``,
                        quotedId
                    );
                    break;
                }

                try {
                    await sendPoll(server_url, apikey, instance, remoteJid, tituloEnquete, opcoesEnquete, false, true);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📊');
                } catch (err) {
                    console.error('❌ Erro ao criar enquete:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Ocorreu um erro ao criar a enquete.', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                }

                break;



            case 'abrirgrupo':
                if (!isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        "🚫 Apenas administradores podem usar este comando.", quotedId);
                    break;
                }

                try {
                    await openGroupWindow(server_url, apikey, instance, remoteJid);
                    await sendText(server_url, apikey, instance, remoteJid,
                        "✅ Janela do grupo aberta com sucesso (no cliente do bot).", quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📂');
                } catch (err) {
                    console.error('❌ Erro ao abrir janela do grupo:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Não foi possível abrir a janela do grupo.', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                }
                break;

            case 'vencimento':
                if (!isGroup || !isAdmin) return;

                const vencimentoData = planoVencimento
                    ? new Date(planoVencimento).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                    })
                    : '⚠️ `Data não definida`';

                const mensagemVenc = `⏳ *Vencimento do plano do grupo:*\n\n📅 *${vencimentoData}* `;

                await sendText(server_url, apikey, instance, remoteJid, mensagemVenc, quotedId);
                await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📆');
                break;

            case 'sticker':
            case 's':
                if (quotedMessageId) {
                    if (['image', 'video'].includes(quotedType) || isQuotedGif) {
                        try {
                            await convertQuotedToSticker(server_url, apikey, instance, remoteJid, { quotedId: quotedMessageId });
                        } catch (error) {
                            console.error('Erro no comando !sticker (resposta):', error.message);
                        }
                    } else {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '⚠️ Responda a uma imagem ou vídeo para criar figurinha.', id);
                    }
                    break;
                }

                if (messageHasMedia && (['image', 'video'].includes(messageType) || isGif)) {
                    try {
                        await convertQuotedToSticker(server_url, apikey, instance, remoteJid, { messageId: id });
                    } catch (error) {
                        console.error('Erro no comando !sticker (legenda):', error.message);
                    }
                    break;
                }

                await sendText(server_url, apikey, instance, remoteJid,
                    "⚠️ Responda a uma imagem ou vídeo *ou envie o comando como legenda* para gerar uma figurinha.", id);
                break;

            case 'sfundo':
            case 'f':
                try {
                    const targetId = quotedMessageId || (messageHasMedia && messageType === 'image' ? id : null);
                    if (!targetId) {
                        await sendText(
                            server_url,
                            apikey,
                            instance,
                            remoteJid,
                            '⚠️ Responda a uma imagem para remover o fundo.',
                            id
                        );
                        break;
                    }

                    const media = await downloadMedia(server_url, apikey, instance, remoteJid, targetId);
                    if (!media?.base64 || !media.mimetype.startsWith('image/')) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '⚠️ Apenas imagens são suportadas.', id);
                        break;
                    }

                    const buffer = Buffer.from(media.base64, 'base64');
                    let removeBackground;
                    try {
                        ({ removeBackground } = await import('modern-rembg'));
                    } catch (modErr) {
                        console.error('modern-rembg não encontrado:', modErr.message);
                        await sendText(server_url, apikey, instance, remoteJid,
                            '❌ Função indisponível no momento.', id);
                        break;
                    }

                    const result = await removeBackground(buffer);
                    const arrBuffer = result.arrayBuffer ? Buffer.from(await result.arrayBuffer()) : Buffer.from(result);
                    const noBgBase64 = `data:image/png;base64,${arrBuffer.toString('base64')}`;
                    const webpBase64 = await converterSticker(noBgBase64, 'sfundo.png');

                    await sendStickerFromUrl(server_url, apikey, instance, remoteJid, webpBase64, quotedId);
                } catch (err) {
                    console.error('Erro no comando sfundo:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Falha ao gerar figurinha sem fundo.', id);
                }
                break;



            case 'ban':
            case 'mban':
                if (!isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        "🚫 *Apenas administradores podem usar este comando.*", quotedId);
                    break;
                }
                if (!isBotAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '⚠️ Não consigo banir membros porque não sou administrador do grupo.', quotedId);
                    break;
                }

                let targets = [];

                // 🔹 Se respondeu uma mensagem
                if (data?.contextInfo?.participant) {
                    targets.push(data.contextInfo.participant.replace(/@c\.us$/, ''));
                }

                // 🔹 Se mencionou usuários corretamente (menções reais)
                if (data?.contextInfo?.mentionedJid?.length > 0) {
                    targets.push(...data.contextInfo.mentionedJid.map(j => j.replace(/@c\.us$/, '')));
                }

                // 🔹 Captura números digitados no texto
                const numerosNoTexto = args
                    .map(a => a.replace(/[^0-9]/g, ''))
                    .filter(n => n.length >= 8);

                if (numerosNoTexto.length > 0) {
                    targets.push(...numerosNoTexto);
                }

                targets = [...new Set(targets)];

                if (targets.length > 0) {
                    const removidos = [];
                    for (const alvo of targets) {
                        const jid = `${alvo}@c.us`;
                        try {
                            await updateGroupParticipants(
                                server_url,
                                apikey,
                                instance,
                                remoteJid,
                                [jid],
                                'remove'
                            );
                            removidos.push(alvo);
                        } catch (error) {
                            console.error('❌ Erro ao banir:', error.message);
                        }
                    }

                    if (removidos.length > 0) {
                        const mentions = removidos.map(t => `@${t}`).join(' ');
                        await sendText(
                            server_url,
                            apikey,
                            instance,
                            remoteJid,
                            `❌ ${mentions} removido(s) do grupo.`,
                            quotedId
                        );
                        await sendReaction(
                            server_url,
                            apikey,
                            instance,
                            { remoteJid, id },
                            '✅'
                        );
                    } else {
                        await sendText(
                            server_url,
                            apikey,
                            instance,
                            remoteJid,
                            '❌ Erro ao tentar remover os usuários.',
                            quotedId
                        );
                        await sendReaction(
                            server_url,
                            apikey,
                            instance,
                            { remoteJid, id },
                            '❌'
                        );
                    }
                } else {
                    await sendText(server_url, apikey, instance, remoteJid,
                        `⚠️ Use este comando respondendo, mencionando ou informando o número.\n\nExemplos:\n• *${mainPrefix}ban @usuario*\n• *${mainPrefix}ban 5511999999999*\n• *${mainPrefix}ban @usuario @outro*`, quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                }
                break;




            case 'kick':
                // Função para adicionar um atraso
                const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                if (!isGroup) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        "⚠️ Este comando só pode ser usado em grupos.", quotedId);
                    break;
                }

                if (!isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        "🚫 *Apenas administradores podem usar este comando.*", quotedId);
                    break;
                }
                if (!isBotAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '⚠️ Não consigo remover membros porque não sou administrador do grupo.', quotedId);
                    break;
                }

                try {
                    // Obter informações do grupo
                    const groupData = await findGroupInfos(server_url, instance, remoteJid, apikey);
                    if (!groupData || !groupData.id) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            "⚠️ Não foi possível obter informações do grupo.", quotedId);
                        break;
                    }

                    // Envia mensagem informando que o grupo está sendo desfeito
                    await sendText(server_url, apikey, instance, remoteJid,
                        "⚠️ Este grupo está sendo desfeito por ordem do administrador. Todos os participantes serão removidos.", quotedId);

                    // Aguardar um tempo para que todos os participantes recebam a mensagem
                    await sleep(5000); // Atraso de 5 segundos

                    // Filtra o bot para não ser removido
                    const participantsToRemove = groupData.participants
                        .filter(p => p.id !== instance) // Remover todos, exceto o bot
                        .map(p => p.id);

                    if (participantsToRemove.length === 0) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            "⚠️ Não há participantes para remover no grupo.", quotedId);
                        break;
                    }

                    // Tente remover os participantes um a um para evitar o erro no envio da solicitação
                    for (let participantId of participantsToRemove) {
                        try {
                            await updateGroupParticipants(
                                server_url,
                                apikey,
                                instance,
                                remoteJid,
                                [participantId],
                                'remove'
                            );
                            console.log(`Participante ${participantId} removido com sucesso`);
                        } catch (error) {
                            console.error(`Erro ao remover participante ${participantId}: ${error.message}`);
                        }
                    }

                    // Envia uma mensagem informando que todos foram removidos
                    await sendText(server_url, apikey, instance, remoteJid,
                        "🚫 *Todos os participantes foram removidos do grupo!*", quotedId);

                    console.log(`Todos os participantes foram removidos do grupo: ${remoteJid}`);
                } catch (error) {
                    console.error('Erro ao remover todos os participantes do grupo:', error.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        "❌ Ocorreu um erro ao tentar remover os participantes.", quotedId);
                }

                break;





            case 'apagar':
                if (!isAdmin) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        "🚫 *Apenas administradores podem usar este comando.*", quotedId);
                    break;
                }

                if (!quotedMessageId || !quotedParticipant) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        "⚠️ Responda a uma mensagem para que ela seja apagada.", quotedId);
                    break;
                }

                try {
                    // Apaga a mensagem citada
                    await deleteMessageForEveryone(
                        server_url,
                        apikey,
                        instance,
                        quotedMessageId,
                        remoteJid,
                        quotedParticipant,
                        contextInfo.quotedFromMe // Verifica se a mensagem é do próprio bot
                    );

                    // Envia uma reação para confirmar a ação de apagar a mensagem citada
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🗑️');

                    await deleteMessageForEveryone(
                        server_url,
                        apikey,
                        instance,
                        messageId,   // Apaga a mensagem original (que foi a que gerou o comando)
                        remoteJid,
                        data.key.participant, // Participante que enviou a mensagem original
                        data.key.fromMe // Verifica se a mensagem foi enviada pelo bot
                    );

                    // Reação para indicar que a mensagem original também foi apagada
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🗑️');
                } catch (error) {
                    console.error('❌ Erro ao apagar mensagem:', error.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Erro ao tentar apagar a mensagem.', quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                }
                break;

            case 'autoresposta': {
                if (!isAdmin) {
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    break;
                }

                if (!allowedCommands.autoresposta) {
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        '⚠️ Esta função não está disponível no seu plano atual. Acesse o painel e atualize o plano do robô.',
                        quotedId
                    );
                    break;
                }

                if (quotedMessageId && argsStr.trim().length > 0) {
                    try {
                        const gatilhos = argsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                        if (!gatilhos.length) {
                            await sendText(server_url, apikey, instance, remoteJid,
                                '⚠️ Informe ao menos um gatilho.', quotedId);
                            break;
                        }

                        const botConfig = await BotConfig.findOne({ groupId: remoteJid });
                        if (!botConfig) {
                            await sendText(server_url, apikey, instance, remoteJid,
                                '❌ Grupo não encontrado na base de dados.', quotedId);
                            break;
                        }

                        const resp = {
                            triggers: gatilhos,
                            contains: false,
                            responseText: '',
                            filePath: '',
                            fileName: '',
                            mimetype: '',
                            asSticker: false,
                            hasMedia: false,
                            updatedAt: new Date()
                        };

                        const q = msgOriginal?._data?.quotedMsg || {};
                        resp.responseText = q.caption || q.body || '';

                        if (q.mimetype || message.hasMedia) {
                            const media = await downloadMedia(server_url, apikey, instance, remoteJid, quotedMessageId);
                            if (media?.base64 && media.mimetype) {
                                const ext = media.mimetype.split('/')[1].split(';')[0] || 'bin';
                                const pasta = path.join('arquivos', remoteJid);
                                await fs.mkdir(pasta, { recursive: true });
                                const nome = `ar_${Date.now()}.${ext}`;
                                const caminho = path.join(pasta, nome);
                                await fs.writeFile(caminho, Buffer.from(media.base64, 'base64'));
                                resp.filePath = caminho.replace(/\\/g, '/');
                                resp.fileName = nome;
                                resp.mimetype = media.mimetype;
                                resp.hasMedia = true;
                            }
                        }

                        botConfig.autoResponses.push(resp);
                        await botConfig.save();

                        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                        await sendText(server_url, apikey, instance, remoteJid,
                            '✅ Autoresposta adicionada com sucesso.', quotedId);
                    } catch (err) {
                        console.error('Erro ao salvar autoresposta via comando:', err.message);
                        await sendText(server_url, apikey, instance, remoteJid,
                            '❌ Erro ao salvar autoresposta.', quotedId);
                        await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    }
                    break;
                }

                try {
                    const botConfig = await BotConfig.findOne({ groupId: remoteJid });
                    if (!botConfig) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '❌ Grupo não encontrado na base de dados.', quotedId);
                        break;
                    }

                    const atual = botConfig.comandos?.autoresposta || false;
                    const novoValor = !atual;
                    await BotConfig.updateOne({ groupId: remoteJid }, { $set: { 'comandos.autoresposta': novoValor } });

                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                    await sendText(server_url, apikey, instance, remoteJid,
                        `✅ *Função autoresposta* ${novoValor ? 'ativada' : 'desativada'} com sucesso.`, quotedId);
                } catch (err) {
                    console.error('Erro ao alternar autoresposta:', err.message);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Ocorreu um erro ao atualizar o comando.', quotedId);
                }
                break;
            }




            case 'botinterage':
            case 'antilink':
            case 'banextremo':
            case 'antilinkgp':
            case 'bangringos':
            case 'soadm':
            case 'autosticker':
            case 'autodownloader':
            case 'modobrincadeira':
                if (!isAdmin) {
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    return;
                }

                const requiresBotAdmin = ['banextremo', 'antilink', 'antilinkgp', 'bangringos'];
                if (!isBotAdmin && requiresBotAdmin.includes(cleanCommand)) {
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    await sendText(server_url, apikey, instance, remoteJid,
                        '⚠️ Para ativar esta função preciso ser administrador do grupo.', quotedId);
                    break;
                }

                const feature = cleanCommand === 'modobrincadeira' ? 'brincadeiras' : cleanCommand; // Nome da chave no bot.comandos

                if (!allowedCommands[feature]) {
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        '⚠️ Esta função não está disponível no seu plano atual. Acesse o painel e atualize o plano do robô.',
                        quotedId
                    );
                    break;
                }

                try {
                    const botConfig = await BotConfig.findOne({ groupId: remoteJid });
                    if (!botConfig) {
                        await sendText(server_url, apikey, instance, remoteJid, '❌ Grupo não encontrado na base de dados.', quotedId);
                        break;
                    }

                    const atual = botConfig.comandos?.[feature] || false;
                    const novoValor = !atual;

                    const update = {};
                    update[`comandos.${feature}`] = novoValor;

                    await BotConfig.updateOne({ groupId: remoteJid }, { $set: update });

                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `✅ *Função ${feature}* ${novoValor ? 'ativada' : 'desativada'} com sucesso.`,
                        quotedId
                    );
                } catch (err) {
                    console.error(`Erro ao atualizar comando ${feature}:`, err.message);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');
                    await sendText(server_url, apikey, instance, remoteJid, `❌ Ocorreu um erro ao atualizar o comando.`, quotedId);
                }
                break;

            case 'status':
                // só em grupos
                if (!isGroup) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        '❌ Este comando só pode ser usado dentro de grupos.',
                        quotedId
                    );
                    break;
                }

                try {
                    // busca a configuração deste grupo no banco
                    const botConfig = await BotConfig.findOne({ groupId: remoteJid });
                    if (!botConfig) {
                        await sendText(
                            server_url,
                            apikey,
                            instance,
                            remoteJid,
                            '❌ Este grupo não está cadastrado no banco de dados.',
                            quotedId
                        );
                        break;
                    }

                    // obtém dinamicamente todas as chaves dentro de comandos
                    const comandosObj = botConfig.comandos;
                    const comandos = Object.keys(
                        typeof comandosObj.toObject === 'function'
                            ? comandosObj.toObject()
                            : comandosObj
                    );

                    // monta a listagem de ON/OFF para cada comando
                    const listaStatus = comandos
                        .map(cmd => `• ${cmd}: ${botConfig.comandos[cmd] ? '✅ ON' : '❌ OFF'}`)
                        .join('\n') || '— Nenhum comando configurado neste grupo';

                    // envia resultado
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `📊 *Status dos comandos neste grupo:*\n\n${listaStatus}`,
                        quotedId
                    );
                    // reação opcional para feedback visual
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '📈');
                } catch (err) {
                    console.error('Erro ao obter status dos comandos:', err);
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        '❌ Ocorreu um erro ao consultar o status dos comandos.',
                        quotedId
                    );
                }
                break;

            case 'play': {
                if (!argsStr) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `⚠️ *Uso:* ${mainPrefix}play <nome da música ou vídeo>`,
                        quotedId
                    );
                    break;
                }

                try {
                    const { data } = await axios.get(`${basesiteUrl}/api/download/ytsearch`, {
                        params: { apikey: 'equipevipadm', nome: argsStr }
                    });

                    const result = data?.resultados?.[0];
                    if (!data?.status || !result) {
                        await sendText(
                            server_url,
                            apikey,
                            instance,
                            remoteJid,
                            '❌ Nenhum resultado encontrado.',
                            quotedId
                        );
                        break;
                    }

                    const caption = [
                        `🎵 *${result.title}*`,
                        `⏱️ ${result.duration?.timestamp || result.timestamp || ''}`,
                        `👤 ${result.author?.name || 'Desconhecido'}`,
                        '',
                        `Use ${mainPrefix}ytmp4 ${result.url} para baixar`
                    ].join('\n');

                    await sendMedia(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        'image',
                        'image/jpeg',
                        caption,
                        result.thumbnail || result.image,
                        'thumb.jpg',
                        quotedId
                    );

                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                } catch (err) {
                    console.error('❌ Erro no play:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao pesquisar.', quotedId);
                }
                break;
            }

            case 'ytmp4':
                if (args.length === 0) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `⚠️ *Uso:* ${mainPrefix}ytmp4 <link do YouTube>`,
                        quotedId
                    );
                    break;
                }

                try {
                    const ytUrl = args[0];
                    const { data } = await axios.get(`${basesiteUrl}/api/download/globalvideo`, {
                        params: { apikey: 'equipevipadm', url: ytUrl }
                    });

                    const info = data?.dados?.video_info;
                    if (!data?.status || !info?.video_url) {
                        throw new Error('API retornou dados inválidos');
                    }

                    const fileName = `yt_${Date.now()}.mp4`;
                    const caption = info.titulo || '';

                    await sendMedia(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        'document',
                        'video/mp4',
                        caption,
                        info.video_url,
                        fileName,
                        quotedId
                    );

                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                } catch (err) {
                    console.error('❌ Erro no ytmp4:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao baixar o vídeo.', quotedId);
                }
                break;

            case 'tiktok':
            case 'instagram':
            case 'facebook':
            case 'kwai': {
                if (args.length === 0) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `⚠️ *Uso:* ${mainPrefix}${cleanCommand} <link>`,
                        quotedId
                    );
                    break;
                }

                const link = args[0];
                const dominioEsperado = LINKS_SUPORTADOS[cleanCommand];
                let isValido = false;
                try {
                    const url = new URL(link);
                    isValido = url.hostname.includes(dominioEsperado);
                } catch {}

                if (!isValido) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `❌ Forneça um link válido do ${cleanCommand}.`,
                        quotedId
                    );
                    break;
                }

                try {
                    await processarAutoDownloader(link, remoteJid, server_url, apikey, instance);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '✅');
                } catch (err) {
                    console.error(`❌ Erro no ${cleanCommand}:`, err.message);
                    await sendText(server_url, apikey, instance, remoteJid, '❌ Erro ao baixar o vídeo.', quotedId);
                }
                break;
            }

            case 'piada':
                try {
                    let tema = argsStr.trim();
                    if (/^sobre\s+/i.test(tema)) {
                        tema = tema.replace(/^sobre\s+/i, '').trim();
                    }

                    const prompt = tema
                        ? `Conte uma piada engraçada, criativa e leve em português sobre ${tema}.`
                        : 'Conte uma piada engraçada, criativa e leve em português.';

                    const response = await axios.post(
                        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyDOb9yaU4Vr_T1Ez-Ul_fghc7pbzoS84tU',
                        {
                            contents: [
                                {
                                    parts: [
                                        { text: prompt }
                                    ]
                                }
                            ]
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    const piada = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

                    if (!piada) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '😕 Não consegui pensar em uma piada agora. Tente novamente!', quotedId);
                        break;
                    }

                    await sendText(server_url, apikey, instance, remoteJid, `😂 ${piada}`, quotedId);
                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🤣');

                } catch (err) {
                    console.error('Erro ao gerar piada com Gemini:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Erro ao gerar piada. Tente novamente mais tarde.', quotedId);
                }
                break;


            case 'hentai': {
                if (isGroup && isNSFW(bot)) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '🔞 Este comando está desativado neste grupo.', quotedId);
                    break;
                }

                try {
                    if (!dono?.apikey) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '🚫 O dono do grupo ainda não configurou uma chave de API NSFW.', quotedId);
                        break;
                    }

                    const nsfwUrl = `${basesiteUrl}/api/nsfw/hentai?apikey=${dono.apikey}`;
                    const resImg = await axios.get(nsfwUrl, { responseType: 'arraybuffer' });

                    if (!resImg.data) {
                        await sendText(server_url, apikey, instance, remoteJid,
                            '⚠️ Não foi possível obter a imagem NSFW no momento.', quotedId);
                        break;
                    }

                    const contentType = resImg.headers['content-type'] || 'image/jpeg';
                    const b64 = Buffer.from(resImg.data, 'binary').toString('base64');
                    const dataUri = `data:${contentType};base64,${b64}`;

                    await sendMedia(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        'image',
                        contentType,
                        '',
                        dataUri,
                        `hentai_${Date.now()}.jpg`,
                        quotedId
                    );

                    await sendReaction(server_url, apikey, instance, { remoteJid, id }, '🔥');

                } catch (err) {
                    console.error('❌ Erro ao buscar hentai:', err.message);
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Ocorreu um erro ao tentar buscar o conteúdo NSFW.', quotedId);
                }
                break;
            }

            case 'stknsfw': {
                if (isGroup && isNSFW(bot)) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '🔞 Este comando está desativado neste grupo.',
                        quotedId);
                    break;
                }

                const count = Math.min(parseInt(args[0], 10) || 1, 5);

                if (!dono?.apikey) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '🚫 O dono do grupo ainda não configurou uma chave de API NSFW.',
                        quotedId);
                    break;
                }

                for (let i = 0; i < count; i++) {
                    try {
                        const nsfwUrl = `${basesiteUrl}/api/nsfw/hentai?apikey=${dono.apikey}`;

                        // 🔄 Converte o conteúdo NSFW localmente em WebP
                        const webpBase64 = await converterSticker(nsfwUrl, `nsfw_${Date.now()}.jpg`);

                        // 🚀 Envia como sticker
                        await sendStickerFromUrl(server_url, apikey, instance, remoteJid, webpBase64, quotedId);

                    } catch (err) {
                        console.error('❌ Erro ao gerar figurinha NSFW:', err.message);
                        if (i === 0) {
                            await sendText(server_url, apikey, instance, remoteJid,
                                '❌ Não consegui gerar as figurinhas NSFW.',
                                quotedId);
                        }
                        break;
                    }
                }

                break;
            }



            case 'brincadeiras':
                const prefix = mainPrefix;

                const comandos = `
╭──🎮 *BRINCADEIRAS DISPONÍVEIS* ──╮
│ Interaja com os membros usando:
│
│ \`${prefix}matar\`
│ \`${prefix}beijar\`
│ \`${prefix}abraçar\`
│ \`${prefix}bater\`
│ \`${prefix}chutar\`
│ \`${prefix}morder\`
│ \`${prefix}bonk\`
│ \`${prefix}lamber\`
│ \`${prefix}cutucar\`
│ \`${prefix}acariciar\`
│ \`${prefix}segurar\`
│ \`${prefix}dançar\`
│ \`${prefix}envergonhar\`
│ \`${prefix}intimidar\`
│ \`${prefix}chorar\`
│ \`${prefix}brincar\`
│ \`${prefix}sorrir\`
│ \`${prefix}acenar\`
│ \`${prefix}tapa\`
│ \`${prefix}glomp\`
│ \`${prefix}yeet\`
│ \`${prefix}feliz\`
│ \`${prefix}esfregar\`
│ \`${prefix}winkar\`
│ \`${prefix}cringe\`
│ \`${prefix}chance\`
│ \`${prefix}match\`
│ \`${prefix}nazista\`
│ \`${prefix}gay\`
│ \`${prefix}feio\`
│ \`${prefix}corno\`
│ \`${prefix}vesgo\`
│ \`${prefix}bebado\`
│ \`${prefix}gado\`
│ \`${prefix}gostoso\`
│ \`${prefix}gostosa\`
│
│ ✨ Exemplo:
│ \`${prefix}beijar @alguem\`
│ ou apenas \`${prefix}beijar\` para sortear alguém
╰────────────────────────────╯`;

                await sendText(server_url, apikey, instance, remoteJid, comandos, id);
                break;

            case 'chance': {
                if (!bot.comandos?.brincadeiras) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `Este tipo de comando só pode ser utilizado com o modobrincadeira ativo, fale com um adm ou se você for um, apenas digite ${mainPrefix}modobrincadeira`,
                        id
                    );
                    break;
                }

                const porcentagem = Math.floor(Math.random() * 101);

                const mencList = collectMentions({
                    message,
                    contextInfo,
                    data,
                    msgOriginal,
                    argsStr
                }).slice(0, 2);
                const mentionsUnique = mencList;

                let textoChance;
                if (mentionsUnique.length >= 2) {
                    const [a, b] = mentionsUnique;
                    textoChance = `A chance de @${a.split('@')[0]} ficar com @${b.split('@')[0]} é de ${porcentagem}%`;
                } else if (argsStr) {
                    textoChance = `A chance ${argsStr.trim()} é de ${porcentagem}%`;
                } else {
                    textoChance = `A chance é de ${porcentagem}%`;
                }

                await sendText(
                    server_url,
                    apikey,
                    instance,
                    remoteJid,
                    textoChance,
                    id,
                    false,
                    mentionsUnique
                );
                break;
            }

            case 'match': {
                if (!bot.comandos?.brincadeiras) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `Este tipo de comando só pode ser utilizado com o modobrincadeira ativo, fale com um adm ou se você for um, apenas digite ${mainPrefix}modobrincadeira`,
                        id
                    );
                    break;
                }

                const membrosGrupo = bot.participantes?.map(p => p.id) || [];
                let idsMencionados = collectMentions({
                    message,
                    contextInfo,
                    data,
                    msgOriginal,
                    argsStr
                }).slice(0, 2);

                while (idsMencionados.length < 2 && membrosGrupo.length > 0) {
                    const candidato = membrosGrupo[Math.floor(Math.random() * membrosGrupo.length)];
                    if (!idsMencionados.includes(candidato)) {
                        idsMencionados.push(candidato);
                    }
                }

                if (idsMencionados.length < 2) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        'Não foi possível encontrar pessoas suficientes para o match.',
                        id
                    );
                    break;
                }

                const [idA, idB] = idsMencionados;
                const porcentagemMatch = Math.floor(Math.random() * 101);
                const fraseMatch = `O match entre @${idA.split('@')[0]} e @${idB.split('@')[0]} é de ${porcentagemMatch}% 💘`;

                await sendText(
                    server_url,
                    apikey,
                    instance,
                    remoteJid,
                    fraseMatch,
                    id,
                    false,
                    [idA, idB]
                );
                break;
            }

            case 'nazista':
            case 'gay':
            case 'feio':
            case 'corno':
            case 'vesgo':
            case 'bebado':
            case 'gado':
            case 'gostoso':
            case 'gostosa': {
                if (!bot.comandos?.brincadeiras) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `Este tipo de comando só pode ser utilizado com o modobrincadeira ativo, fale com um adm ou se você for um, apenas digite ${mainPrefix}modobrincadeira`,
                        id
                    );
                    break;
                }

                const alvo = (message?.mentionedIds && message.mentionedIds[0])
                    || (contextInfo?.mentionedJid && contextInfo.mentionedJid[0])
                    || participant;
                const porcentagem = Math.floor(Math.random() * 110);

                const frases = frasesPercent[cleanCommand] || [
                    `@{alvo} está com ${porcentagem}% de ${cleanCommand}`
                ];
                const escolhida = frases[Math.floor(Math.random() * frases.length)]
                    .replace('{alvo}', `@${alvo.split('@')[0]}`)
                    .replace('{porcentagem}', porcentagem);

                await sendText(
                    server_url,
                    apikey,
                    instance,
                    remoteJid,
                    escolhida,
                    id,
                    false,
                    [alvo]
                );
                break;
            }




            case 'matar':
            case 'beijar':
            case 'abraçar':
            case 'bater':
            case 'chutar':
            case 'morder':
            case 'bonk':
            case 'lamber':
            case 'cutucar':
            case 'acariciar':
            case 'segurar':
            case 'dançar':
            case 'envergonhar':
            case 'intimidar':
            case 'chorar':
            case 'brincar':
            case 'sorrir':
            case 'acenar':
            case 'tapa':
            case 'glomp':
            case 'yeet':
            case 'feliz':
            case 'esfregar':
            case 'winkar':
            case 'cringe': {
                if (!bot.comandos?.brincadeiras) {
                    await sendText(
                        server_url,
                        apikey,
                        instance,
                        remoteJid,
                        `Este tipo de comando só pode ser utilizado com o modobrincadeira ativo, fale com um adm ou se você for um, apenas digite ${mainPrefix}modobrincadeira`,
                        id
                    );
                    break;
                }
                const mapa = {
                    beijar: 'kiss', abraçar: 'hug', bater: 'slap', chutar: 'kick',
                    morder: 'bite', bonk: 'bonk', lamber: 'lick', cutucar: 'poke',
                    acariciar: 'pat', segurar: 'handhold', dançar: 'dance', envergonhar: 'blush',
                    intimidar: 'bully', chorar: 'cry', brincar: 'cuddle', sorrir: 'smile',
                    acenar: 'wave', tapa: 'highfive', glomp: 'glomp', yeet: 'yeet',
                    feliz: 'happy', esfregar: 'lick', winkar: 'wink', cringe: 'cringe',
                    matar: 'kill'
                };

                const tipo = mapa[cleanCommand];
                const countBrincadeira = Math.min(parseInt(args[0], 10) || 1, 3);

                if (!dono?.apikey) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '🚫 O dono do grupo ainda não configurou uma chave de API.',
                        id);
                    break;
                }

                const autorJid = participant;
                let botNumberSelf = instance;
                if (msgOriginal?.to) botNumberSelf = msgOriginal.to.split('@')[0];
                else if (data?.to) botNumberSelf = data.to.split('@')[0];
                else if (msgOriginal?._data?.to) botNumberSelf = msgOriginal._data.to.split('@')[0];
                const botJid = `${botNumberSelf}@c.us`;

                const mencionados = collectMentions({
                    message,
                    contextInfo,
                    data,
                    msgOriginal,
                    argsStr
                });
                const mencUnicos = Array.from(new Set(mencionados))
                    .filter(jid => jid !== autorJid && jid !== botJid);

                let alvoJid = null;
                if (mencUnicos.length) {
                    alvoJid = mencUnicos[0];
                } else if (isGroup && bot.participantes?.length > 1) {
                    const outros = bot.participantes
                        .map(p => p.id)
                        .filter(jid => jid !== autorJid && jid !== botJid && jid.endsWith('@c.us'));
                    if (outros.length) {
                        alvoJid = outros[Math.floor(Math.random() * outros.length)];
                    }
                }

                if (!alvoJid) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '❌ Não encontrei ninguém para brincar com você agora.',
                        id);
                    break;
                }

                for (let i = 0; i < countBrincadeira; i++) {
                    try {
                        const gifUrl = `${basesiteUrl}/api/sfw/anime/?tipo=${tipo}&apikey=${dono.apikey}`;

                        const webpBase64 = await converterSticker(gifUrl, `${tipo}.gif`);

                        const stickerMsgId = await sendStickerFromUrl(
                            server_url,
                            apikey,
                            instance,
                            remoteJid,
                            webpBase64,
                            id
                        );

                        const frases = frasesBrincadeiras[cleanCommand];
                        if (frases) {
                            const texto = frases[
                                Math.floor(Math.random() * frases.length)
                            ]
                                .replace('{autor}', `@${autorJid.split('@')[0]}`)
                                .replace('{alvo}', `@${alvoJid.split('@')[0]}`);

                            await sendText(
                                server_url, apikey, instance, remoteJid,
                                texto,
                                stickerMsgId,
                                false,
                                [autorJid, alvoJid]
                            );
                        }

                    } catch (err) {
                        console.error(`❌ Erro ao gerar figurinha de ${cleanCommand}:`, err);
                        if (i === 0) {
                            await sendText(server_url, apikey, instance, remoteJid,
                                `❌ Não consegui gerar a figurinha de ${cleanCommand}.`,
                                id
                            );
                        }
                        break;
                    }
                }
                break;
            }


            case 'figurinhas': {
                const mapa = {
                    beijar: 'kiss', abraçar: 'hug', bater: 'slap', chutar: 'kick',
                    morder: 'bite', bonk: 'bonk', lamber: 'lick', cutucar: 'poke',
                    acariciar: 'pat', segurar: 'handhold', dançar: 'dance', envergonhar: 'blush',
                    intimidar: 'bully', chorar: 'cry', brincar: 'cuddle', sorrir: 'smile',
                    acenar: 'wave', tapa: 'highfive', glomp: 'glomp', yeet: 'yeet',
                    feliz: 'happy', esfregar: 'lick', winkar: 'wink', cringe: 'cringe',
                    matar: 'kill'
                };

                const requested = parseInt(args[0], 10) || 1;
                const qtd = Math.min(Math.max(requested, 1), 3);

                const tipoArg = (args[1] || '').toLowerCase();
                if (tipoArg && !mapa[tipoArg]) {
                    const valids = Object.keys(mapa).join(', ');
                    await sendText(server_url, apikey, instance, remoteJid,
                        `❌ Tipo inválido. Use um destes: ${valids}`, id);
                    break;
                }

                const tipoFixo = tipoArg ? mapa[tipoArg] : null;

                if (!dono?.apikey) {
                    await sendText(server_url, apikey, instance, remoteJid,
                        '🚫 O dono do grupo não configurou a API key.', id);
                    break;
                }

                for (let i = 0; i < qtd; i++) {
                    const tipo = tipoFixo
                        ? tipoFixo
                        : mapa[Object.keys(mapa)[Math.floor(Math.random() * Object.keys(mapa).length)]];

                    const endpoint = `${basesiteUrl}/api/sfw/anime/?tipo=${tipo}&apikey=${dono.apikey}`;

                    try {
                        // 🔁 Conversão local do GIF para WebP base64
                        const webpBase64 = await converterSticker(endpoint, `${tipo}.gif`);

                        // 🚀 Envia o sticker convertido
                        await sendStickerFromUrl(
                            server_url,
                            apikey,
                            instance,
                            remoteJid,
                            webpBase64,
                            id
                        );

                    } catch (err) {
                        console.error(`❌ Erro ao gerar figurinha [${tipo}]:`, err);
                        if (i === 0) {
                            await sendText(server_url, apikey, instance, remoteJid,
                                '❌ Falha ao gerar figurinhas.', id);
                        }
                        break;
                    }
                }
                break;
            }











            default:
                await sendReaction(server_url, apikey, instance, { remoteJid, id }, '❌');

                const now = moment().tz('America/Sao_Paulo');

                const nomeUsuario = data.pushName || senderId || '-';
                const idUsuario = participant || remoteJid || '-';

                const info = [
                    `📅 *Data:* ${now.format('DD/MM/YYYY')}`,
                    `⏰ *Hora:* ${now.format('HH:mm:ss')}`,
                    `👤 *Usuário:* ${nomeUsuario}`,
                    `🆔 *ID:* ${idUsuario}`,
                    isGroup ? `👥 *Grupo:* ${remoteJid}` : `📞 *Chat privado*`
                ].join('\n');

                const similar = getSimilarCommand(cleanCommand);
                const hint = similar ? t('comando_semelhante').replace('{cmd}', `${mainPrefix}${similar}`) : '';

                await sendText(
                    server_url,
                    apikey,
                    instance,
                    remoteJid,
                    t('comando_desconhecido').replace('{cmd}', cleanCommand) + `\n\n${info}${hint ? `\n${hint}` : ''}`,
                    quotedId
                );
                break;

        }

        return;
    }



};
