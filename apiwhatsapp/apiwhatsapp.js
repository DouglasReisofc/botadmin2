// ✅ Imports
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const Crypto = require('crypto');
const { tmpdir } = require('os');
const ff = require('fluent-ffmpeg');
const SITE_URL = process.env.SITE_URL || 'http://localhost:7766';
const WA_PORT = process.env.WA_API_PORT || 4477;

// Diretório onde as sessões serão salvas
const SESSIONS_DIR = './sessoes';
// URL deste servidor para vinculação automática de sessões
const SELF_URL = (process.env.WA_SELF_URL || `https://zap.botadmin.shop`).replace(/\/+$/, '');
function sanitizeBase(url) {
    return (url || '').replace(/\/+$/, '');
}

function cloneRaw(obj) {
    return JSON.parse(JSON.stringify(obj, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v
    ));
}
const util = require('util');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode'); // esta é diferente de qrcode-terminal
const {
    Client,
    LocalAuth,
    Poll,
    List,
    Buttons,
    MessageMedia,
    sendInteractive,
    Events
} = require('whatsapp-web.js');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ✅ Configurações e pastas
const router = express.Router();
const MASTER_APIKEY = process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU';



// ✅ Variáveis de controle
const clients = {};         // { instance: Client }
const pairingCodes = {};    // { instance: pairingCode atual }
const qrTexts = {};         // { instance: último texto de QR recebido }
const instances = {};       // { instance: { status, lastChange } }
const savedQrCodes = {};    // { instance: qr salvo em DB }
const webhooks = {};        // { instance: webhook URL }

async function auth(req, res, next) {
    const sessionId = req.params.instance || req.body.instance || req.query.instance;
    const apikey = req.headers['apikey'] || req.headers['x-api-key'] || req.body.apikey || req.query.apikey;

    if (!sessionId || !apikey) {
        return res.status(403).json({ error: 'sessionId ou apikey ausentes.' });
    }

    try {
        const { data: instancia } = await axios.get(`${SITE_URL}/webhook/info/${sessionId}`, {
            headers: { apikey: MASTER_APIKEY }
        });
        if (!instancia) return res.status(404).json({ error: 'Instância não encontrada.' });

        if (instancia.apikey !== apikey && instancia.globalapikey !== apikey) {
            return res.status(403).json({ error: 'API key inválida para esta instância.' });
        }

        req.instancia = instancia;
        next();
    } catch (err) {
        console.error('[auth - verificação por instância]', err.message);
        return res.status(500).json({ error: 'Erro ao validar apikey.' });
    }
}


// ✅ Atualiza status interno
function setStatus(instance, status) {
    if (!instances[instance]) instances[instance] = {};
    instances[instance].status = status;
    instances[instance].lastChange = new Date().toISOString();
}


async function dispatchWebhook(inst, event, data) {
    const url = webhooks[inst] || `${SITE_URL}/webhook/event`;
    try {
        await axios.post(
            url,
            { event, data, instance: inst },
            { headers: { apikey: MASTER_APIKEY } }
        );
    } catch (err) {
        console.error(`[${inst}] Webhook erro (${event}):`, err.message);
    }
}

async function startClient(instance) {
    if (clients[instance]) return clients[instance];

    let session;
    try {
        const res = await axios.get(`${SITE_URL}/webhook/info/${instance}`, {
            headers: { apikey: MASTER_APIKEY }
        });
        session = res.data;
        if (session?.webhook) {
            webhooks[instance] = session.webhook;
        }
    } catch {
        throw new Error(`Instância ${instance} não encontrada no servidor`);
    }

    await axios.post(`${SITE_URL}/webhook/update/${instance}`,
        { sessionStatus: 'inicializando', lastSeen: new Date() },
        { headers: { apikey: MASTER_APIKEY } });

    setStatus(instance, 'inicializando');

    // Verifica se já existe sessão local salva
    try {
        const sessionPath = path.join(SESSIONS_DIR, instance);
        const hasSession = fs.existsSync(sessionPath);
        console.log(`[${instance}] ${hasSession ? 'Restaurando sessão existente' : 'Nenhuma sessão encontrada, nova conexão.'}`);
    } catch (err) {
        console.warn(`[${instance}] Erro ao verificar sessão local:`, err.message);
    }
    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: path.join(SESSIONS_DIR, instance) }),
        puppeteer: { headless: true, args: ['--no-sandbox'] }
    });

    clients[instance] = client;

    async function processUnreadMessages() {
        try {
            const chats = await client.getChats();
            for (const chat of chats) {
                if (chat.unreadCount > 0) {
                    const msgs = await chat.fetchMessages({ limit: chat.unreadCount });
                    for (const m of msgs) {
                        await dispatchWebhook(instance, 'message.upsert', cloneRaw(m));
                    }
                }
            }
            console.log(`[${instance}] Mensagens não lidas processadas.`);
        } catch (err) {
            console.warn(`[${instance}] Falha ao processar mensagens pendentes:`, err.message);
        }
    }

    client.on('ready', async () => {
        setStatus(instance, 'conectado');
        await axios.post(`${SITE_URL}/webhook/update/${instance}`,
            { sessionStatus: 'conectado', lastSeen: new Date(), pairingCode: null },
            { headers: { apikey: MASTER_APIKEY } });
        console.log(`[${instance}] ✅ Pronto!`);
        try {
            const chats = await client.getChats();
            for (const chat of chats) {
                await client.syncHistory(chat.id._serialized).catch(() => { });
            }
            console.log(`[${instance}] Histórico sincronizado para ${chats.length} chats.`);
            await processUnreadMessages();
        } catch (e) {
            console.warn(`[${instance}] Erro ao sincronizar histórico:`, e.message);
        }
    });

    client.on('authenticated', async () => {
        console.log(`[${instance}] 🔑 Autenticado!`);
        await axios.post(`${SITE_URL}/webhook/update/${instance}`,
            { sessionStatus: 'conectado', lastSeen: new Date(), pairingCode: null },
            { headers: { apikey: MASTER_APIKEY } });
    });

    client.on('auth_failure', async msg => {
        setStatus(instance, 'falha_autenticacao');
        console.error(`[${instance}] ❌ Falha de autenticação:`, msg);
        await axios.post(`${SITE_URL}/webhook/update/${instance}`,
            { sessionStatus: 'falha_auth', lastSeen: new Date() },
            { headers: { apikey: MASTER_APIKEY } });
        delete clients[instance];
    });

    client.on('disconnected', async reason => {
        setStatus(instance, 'desconectado');
        console.log(`[${instance}] ⚠️ Desconectado:`, reason);

        // Atualiza status via webhook
        try {
            await axios.post(`${SITE_URL}/webhook/update/${instance}`, {
                sessionStatus: 'desconectado',
                lastSeen: new Date()
            }, {
                headers: { apikey: MASTER_APIKEY }
            });
        } catch (err) {
            console.error(`[${instance}] erro ao atualizar webhook:`, err.message);
        }

        // Remove dados de sessão locais
        try {
            fs.rmSync(path.join(SESSIONS_DIR, instance), { recursive: true, force: true });
            console.log(`[${instance}] sessão local removida.`);
        } catch (err) {
            console.error(`[${instance}] erro ao remover sessão local:`, err.message);
        }

        // Remove cliente da memória
        delete clients[instance];
    });



    client.on('qr', async qr => {
        console.log(`[${instance}] ➡️  QR-Code gerado.`);
        console.log('QR RECEIVED (texto):', qr);

        qrcode.generate(qr, { small: true }, code => {
            console.log(code);
        });

        setStatus(instance, 'aguardando_qr');

        qrTexts[instance] = qr;

        // Tenta gerar automaticamente o código de pareamento numérico
        let pairCode = pairingCodes[instance];
        if (!pairCode || !/^[A-Z0-9]{6,}$/.test(pairCode)) {
            pairCode = null;
            try {
                pairCode = await client.requestPairingCode(instance);
                console.log(`[${instance}] 📲 Pairing-code gerado: ${pairCode}`);
                pairingCodes[instance] = pairCode;
            } catch (err) {
                console.warn(`[${instance}] ⚠️ Falha ao gerar pairing-code:`, err.message);
            }
        }

        const lastSaved = savedQrCodes[instance];
        if (lastSaved !== qr) {
            try {
                await axios.post(`${SITE_URL}/webhook/update/${instance}`, {
                    sessionStatus: 'aguardando_qr',
                    pairingCode: pairCode,
                    qrCode: qr
                }, { headers: { apikey: MASTER_APIKEY } });
                savedQrCodes[instance] = qr;
            } catch (err) {
                console.error(`[${instance}] erro ao atualizar QR no banco:`, err.message);
            }
        }

        const eventName = lastSaved ? 'session.qr.updated' : 'session.created';
        await dispatchWebhook(instance, eventName, {
            instance,
            pairingCode: pairCode,
            qrCode: qr,
            status: 'aguardando_qr'
        });
    });





    client.on('message', async msg => {
        const raw = JSON.parse(JSON.stringify(msg));
        console.log('📥 Mensagem recebida (RAW):');
        console.dir(raw, { depth: null });
        await dispatchWebhook(instance, 'message.upsert', raw);
    });





    client.on('vote_update', async (vote) => {
        const raw = cloneRaw(vote);
        console.log('\n[VOTE_UPDATE RAW]\n');
        console.dir(raw, { depth: null });
        await dispatchWebhook(instance, 'poll.vote', raw);
    });



    client.on('group_join', async (notification) => {
        const raw = cloneRaw(notification);
        console.log('📥 EVENTO group_join RECEBIDO COMPLETO:');
        console.dir(raw, { depth: null });

        await dispatchWebhook(instance, 'group.join', raw);
    });


    client.on('group_admin_changed', async (notification) => {
        const raw = cloneRaw(notification);
        console.log('⚙️ Bot teve mudança de permissão administrativa:');
        console.dir(raw, { depth: null });
        await dispatchWebhook(instance, 'group.admin.changed', raw);
    });



    client.on('group_update', async (notification) => {
        const raw = cloneRaw(notification);
        console.log('🔄 Evento de atualização do grupo recebido:');
        console.dir(raw, { depth: null });

        await dispatchWebhook(instance, 'group.update', raw);
    });



    client.on('group_participants_update', async (update) => {
        const raw = cloneRaw(update);
        console.log('Atualiza\u00e7\u00e3o de participantes:');
        console.dir(raw, { depth: null });
        await dispatchWebhook(instance, 'group.participants.update', raw);
    });


    try {
        await client.initialize();
    } catch (err) {
        console.error(`[${instance}] erro ao inicializar cliente:`, err.message);
        throw err;
    }
    return client;
}

// Conexões são restauradas a partir dos arquivos locais

// Busca no site todas as instâncias vinculadas a este servidor e as inicia
async function autoStartSessions() {
    try {
        let { data } = await axios.get(
            `${SITE_URL}/webhook/instances`,
            {
                headers: { apikey: MASTER_APIKEY },
                params: { baseUrl: SELF_URL }
            }
        );

        if (!Array.isArray(data) || data.length === 0) {
            const fallback = await axios.get(`${SITE_URL}/webhook/instances`, {
                headers: { apikey: MASTER_APIKEY }
            });
            data = (fallback.data || []).filter(a =>
                sanitizeBase(a.baseUrl) === SELF_URL
            );
        }

        if (Array.isArray(data)) {
            const valid = data.map(api => api.instance);
            for (const inst of valid) {
                try {
                    await startClient(inst);
                } catch (err) {
                    console.error(`[${inst}] falha ao iniciar:`, err.message);
                }
            }

            // Remove clientes em memória que não estão mais cadastrados
            for (const dir of Object.keys(clients)) {
                if (!valid.includes(dir)) {
                    try { await clients[dir].destroy(); } catch { }
                    delete clients[dir];
                    delete instances[dir];
                    pairingCodes[dir] = null;
                    console.log(`[${dir}] sessão removida (não cadastrada).`);
                }
            }
        }
    } catch (err) {
        console.error('autoStartSessions erro:', err.message);
    }
}


/** Helper para pegar client conectado */
function getClient(req, res) {
    const inst = req.params.instance;
    if (!clients[inst]) {
        res.status(400).json({ error: `Instância ${inst} não conectada` });
        return null;
    }
    return clients[inst];
}

/* ===== ROTAS DE INSTÂNCIA ===== */

router.get('/painel', (req, res) => {
    res.render('painelwhatsapp', {
        SITE_URL,
        layout: 'painelwhatsapp'
    });
});

// Atualiza configurações da instância (ex.: webhook)
router.put('/api/instance/:instance', async (req, res) => {
    const key = req.headers['x-api-key'] || req.query.apiKey;
    if (key !== MASTER_APIKEY) {
        return res.status(401).json({ error: 'Invalid api key' });
    }
    const inst = req.params.instance;
    if (!inst) return res.status(400).json({ error: 'instance required' });
    if (typeof req.body.webhook === 'string') {
        webhooks[inst] = req.body.webhook;
    }
    res.json({ status: true, instance: inst });
});



router.get('/instance/qrcode/:instance', async (req, res) => {
    const inst = req.params.instance;
    const apikey = req.query.apikey || req.headers['apikey'];

    let data;
    try {
        const resInfo = await axios.get(`${SITE_URL}/webhook/info/${inst}`, { headers: { apikey: MASTER_APIKEY } });
        data = resInfo.data;
    } catch {
        return res.status(403).send('API não registrada.');
    }

    if (!data || (apikey !== data.apikey && apikey !== data.globalapikey)) {
        return res.status(403).send('API key inválida.');
    }

    try {
        // Força start (caso necessário)
        await startClient(inst);

        // 1) Se já conectado, envia imagem de status
        if (instances[inst]?.status === 'conectado') {
            const connectedImgPath = path.join(__dirname, '../public/img/conectado.png');
            return res.sendFile(connectedImgPath);
        }

        // 2) Tenta esperar pelo QR (no máximo 10s)
        const qr = await new Promise((resolve, reject) => {
            const t0 = Date.now();
            const loop = () => {
                if (qrTexts[inst]) return resolve(qrTexts[inst]);
                if (instances[inst]?.status === 'conectado') return reject(new Error('já conectado'));
                if (Date.now() - t0 > 10000) return reject(new Error('timeout'));
                setTimeout(loop, 300);
            };
            loop();
        });

        // 3) Renderiza o QR
        res.setHeader('Content-Type', 'image/png');
        return QRCode.toFileStream(res, qr, {
            errorCorrectionLevel: 'H',
            width: 320,
            margin: 2
        });
    } catch (err) {
        console.warn(`[${inst}] ⚠️ Erro no QR:`, err.message);
        return res.status(500).send(err.message.includes('conectado') ? 'Instância já conectada' : 'Erro ao gerar QR ou timeout');
    }
});


// 1) tentativa com pairing-code
router.post('/instance/pair/:instance', auth, async (req, res) => {
    const inst = req.params.instance;

    try {
        const client = await startClient(inst);
        setStatus(inst, 'aguardando_pareamento');

        // ------- tentativa 1: número de telefone (pairing-code) -------------
        const code = await client.requestPairingCode(inst);

        console.log(`[${inst}] 📲 Pairing-code gerado: ${code}`);
        pairingCodes[inst] = code;
        return res.json({ modo: 'pairing_code', code });

    } catch (err) {
        // ------- falhou → tenta QR -----------------
        console.warn(`[${inst}] ⚠️ Falhou pairing-code (${err.message}). Tentando QR...`);

        const client = clients[inst];          // já existe porque startClient foi chamado
        if (!client) return res.json({ modo: null });

        // Espera o evento 'qr' ser disparado (até 30s)
        const qr = await new Promise(resolve => {
            const t = setTimeout(() => resolve(null), 30000);
            client.once('qr', q => { clearTimeout(t); resolve(q); });
        });

        if (qr) {
            console.log(`[${inst}] 📷 QR-Code pronto (fallback).`);
            qrTexts[inst] = qr;
            setStatus(inst, 'aguardando_qr');
            return res.json({ modo: 'qr_code', qr });
        }

        console.error(`[${inst}] ❌ Nem QR foi gerado. Verifique o Chrome ou o número.`);
        return res.json({ modo: null });
    }
});





// 2) Lê código de pareamento + status
router.get('/instance/pairing-code/:instance', auth, (req, res) => {
    const inst = req.params.instance;
    res.json({
        code: pairingCodes[inst] || null,
        qr: qrTexts[inst] || null,
        status: instances[inst]?.status || 'desconhecido'
    });
});

// Recupera status e código armazenado no banco de dados
router.get('/instance/status/:instance', auth, async (req, res) => {
    try {
        const { data } = await axios.get(
            `${SITE_URL}/webhook/info/${req.params.instance}`,
            { headers: { apikey: MASTER_APIKEY } }
        );

        if (!data) return res.status(404).json({ error: 'Instância não encontrada' });

        let pair = data.pairingCode || null;
        let qr = data.qrCode || null;
        if (pair && pair.length > 40) { // dado incorreto, provavelmente base64
            qr = pair;
            pair = null;
        }

        res.json({
            instance: data.instance,
            sessionStatus: data.sessionStatus,
            pairingCode: pair,
            qrCode: qr,
            lastSeen: data.lastSeen
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3) Logout
router.post('/instance/logout/:instance', auth, async (req, res) => {
    const inst = req.params.instance;

    if (!clients[inst]) {
        return res.status(404).json({ error: 'Instância não conectada' });
    }

    try {
        // 1. Finaliza e remove client
        await clients[inst].destroy();
        delete clients[inst];

        // 2. Atualiza status
        setStatus(inst, 'reiniciando');

        // 3. Recria client (gera novo QR automaticamente)
        await startClient(inst);

        res.json({ status: true, message: 'Logout concluído e nova sessão iniciada.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// 4) Reiniciar
router.post('/instance/restart/:instance', auth, async (req, res) => {
    const inst = req.params.instance;
    if (clients[inst]) {
        await clients[inst].destroy();
        delete clients[inst];
    }
    try {
        setStatus(inst, 'reiniciando');
        await startClient(inst);
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});



router.post('/instance/delete/:instance', auth, async (req, res) => {
    const inst = req.params.instance;
    const apikeyRecebida = req.headers['apikey'] || req.body.apikey || req.query.apikey;

    console.log(`\n📥 [DELETE] Requisição para apagar instância: ${inst}`);
    console.log(`🔑 API Key recebida: ${apikeyRecebida}`);

    try {
        // 1. Destrói client se estiver ativo
        if (clients[inst]) {
            try {
                await clients[inst].destroy();
                delete clients[inst];
                console.log(`✅ Client ${inst} destruído com sucesso.`);
                await new Promise(r => setTimeout(r, 300)); // aguarda liberação de file lock
            } catch (err) {
                console.error(`❌ Erro ao destruir client ${inst}:`, err.message);
            }
        } else {
            console.log(`⚠️ Client ${inst} não estava ativo.`);
        }

        // 2. Limpa dados em memória
        delete instances[inst];
        pairingCodes[inst] = null;
        qrTexts[inst] = null;
        delete webhooks[inst];
        console.log(`🧹 Dados em memória para ${inst} limpos.`);

        // 3. Remove pasta de sessão local
        const sessionPath = path.join(SESSIONS_DIR, inst);
        if (fs.existsSync(sessionPath)) {
            try {
                const antes = fs.readdirSync(sessionPath);
                console.log(`📂 Conteúdo antes da exclusão:`, antes);

                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(`🗑 Pasta de sessão removida: ${sessionPath}`);

                if (fs.existsSync(sessionPath)) {
                    console.warn(`❌ A pasta ainda existe após tentativa de exclusão.`);
                } else {
                    console.log(`✅ Pasta realmente removida.`);
                }
            } catch (err) {
                console.error(`❌ Erro ao remover pasta ${sessionPath}:`, err.message);
            }
        } else {
            console.warn(`📁 Pasta ${sessionPath} já não existia.`);
        }

        return res.json({ status: true, message: `Instância ${inst} apagada com sucesso.` });

    } catch (e) {
        console.error(`❌ Erro geral na exclusão da instância ${inst}:`, e.message);
        return res.status(500).json({ status: false, error: e.message });
    }
});


/* ==== Lista de instâncias ==== */
router.get('/instances', (req, res) => {
    const out = {};
    for (const i in instances) {
        out[i] = {
            status: instances[i].status,
            connected: !!clients[i]
        };
    }
    res.json(out);
});

/* ==== Status geral ==== */
router.get('/status', (req, res) => {
    res.json({ status: 'API Multi-instâncias ativa' });
});

// Envio de texto com menções (trata @123456789 ou @123456789@c.us)
router.post('/message/sendText/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;

    let { number, text, quoted, mentionAll, mentionIds } = req.body;
    if (!number || !text) {
        return res.status(400).json({ error: 'Campos obrigatórios: number e text.' });
    }

    // Garante que number termine em "@c.us" ou "@g.us"
    const chatId = number.includes('@') ? number : `${number}@c.us`;

    try {
        const chat = await client.getChatById(chatId);

        // Se for grupo, pega a lista de participantes
        let participantes = [];
        if (chat.isGroup) {
            participantes = await chat.participants;
            // Cada participante p tem p.id.user (ex: "559295333643") e p.id._serialized ("559295333643@c.us")
        }

        const options = {};
        const mentions = [];
        const explicitMentions = Array.isArray(mentionIds)
            ? mentionIds
                .filter(id => typeof id === 'string')
                .map(id => id.includes('@') ? id : `${id}@c.us`)
            : [];

        if (chat.isGroup && explicitMentions.length === 0) {
            // Regex que captura:
            //   • @123456789
            //   • @123456789@c.us
            const regex = /@(\d{6,15})(?:@c\.us)?/g;
            const matches = [...text.matchAll(regex)];

            for (const match of matches) {
                const rawNum = match[1];
                // match[0] é o trecho completo encontrado (por exemplo "@559295333643" ou "@559295333643@c.us")
                const fullMatch = match[0];
                let foundUser = null;

                // Percorre todos os participantes para achar alguém cujo p.id.user bate com rawNum,
                // ou se rawNum tiver nono dígito extra, remover e comparar.
                for (const p of participantes) {
                    const userStr = p.id.user; // ex: "559295333643"

                    // 1) checa se exatamente bate
                    if (userStr === rawNum) {
                        foundUser = userStr;
                        break;
                    }

                    // 2) checa se rawNum termina com o userStr (ou vice-versa)
                    if (rawNum.endsWith(userStr) || userStr.endsWith(rawNum)) {
                        foundUser = userStr;
                        break;
                    }

                    // 3) se rawNum tiver um dígito a mais (13 digitos) e for nono dígito do celular,
                    //    tenta remover esse nono e comparar
                    if (
                        rawNum.length === userStr.length + 1 &&
                        rawNum.startsWith(userStr.slice(0, 4)) &&
                        rawNum.charAt(4) === '9'
                    ) {
                        const possivel = rawNum.slice(0, 4) + rawNum.slice(5);
                        if (possivel === userStr) {
                            foundUser = userStr;
                            break;
                        }
                    }
                }

                if (foundUser) {
                    // Substitui no texto exatamente o trecho completo encontrado (fullMatch)
                    // por "@<foundUser>". Ex.: substitui "@5592995333643@c.us" → "@559295333643"
                    text = text.replace(fullMatch, `@${foundUser}`);
                    mentions.push(`${foundUser}@c.us`);
                }
            }

            // Ao final do processamento em grupos, unifica menções
            let finalMentions = [...mentions];
            if (mentionAll) {
                const allIds = participantes.map((p) => p.id._serialized);
                finalMentions = finalMentions.concat(allIds);
            }
            if (finalMentions.length > 0) {
                options.mentions = Array.from(new Set(finalMentions));
            }
        } else {
            let finalMentions = [...explicitMentions];
            if (chat.isGroup && mentionAll) {
                const allIds = participantes.map((p) => p.id._serialized);
                finalMentions = finalMentions.concat(allIds);
            }
            if (finalMentions.length > 0) {
                options.mentions = Array.from(new Set(finalMentions));
            }
        }

        console.log('→ Enviando texto:', {
            originalText: req.body.text,
            parsedText: text,
            mentionAll,
            mentionsArray: options.mentions || []
        });

        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 1500));

        let sentMessage;
        if (quoted?.key?.id) {
            const msgs = await chat.fetchMessages({ limit: 50 });
            const quotedMsg = msgs.find((m) => m.id.id === quoted.key.id);
            if (quotedMsg) {
                sentMessage = await quotedMsg.reply(text, null, options);
            } else {
                sentMessage = await client.sendMessage(chatId, text, options);
            }
        } else {
            sentMessage = await client.sendMessage(chatId, text, options);
        }
        await chat.clearState();

        return res.json({ status: true, messageId: sentMessage.id._serialized });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});


// Envio de mídia (imagem, vídeo, documento) com suporte a menções no caption
router.post('/message/sendMedia/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;

    let { number, mediatype, mimetype, caption = '', media, fileName, quoted, mentionAll, viewOnce, mentionIds } = req.body;
    const isViewOnce = viewOnce === true || viewOnce === 'true';
    if (!number || !media || !mimetype || !fileName) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    // Garante que number termine com @c.us ou @g.us
    const chatId = number.includes('@') ? number : `${number}@c.us`;

    try {
        // 1) Prepara o objeto de mídia
        let mediaObj;
        if (media.startsWith('data:')) {
            // Base64 inline
            const base64Data = media.replace(/^data:.*;base64,/, '');
            mediaObj = new MessageMedia(mimetype, base64Data, fileName);
        } else {
            // URL ou caminho local
            mediaObj = await MessageMedia.fromUrl(media, { unsafeMime: true });
            mediaObj.filename = fileName;
        }

        // 2) Se for grupo, busca participantes para tratar menções
        let participantes = [];
        const options = {
            caption: caption || '',
            sendMediaAsDocument: mediatype === 'document'
        };
        const explicitMentions = Array.isArray(mentionIds)
            ? mentionIds
                .filter(id => typeof id === 'string')
                .map(id => id.includes('@') ? id : `${id}@c.us`)
            : [];

        if (isViewOnce) options.isViewOnce = true;

        const chat = await client.getChatById(chatId);
        if (chat.isGroup && explicitMentions.length === 0) {
            participantes = await chat.participants;
            // Cada participante p possui:
            //   • p.id.user       → ex: "559295333643"
            //   • p.id._serialized → ex: "559295333643@c.us"
        }

        // 3) Detecta menções no caption do tipo "@123456789" ou "@123456789@c.us"
        if (chat.isGroup && caption) {
            const mentions = [];
            // Regex para capturar:
            //    • @559295333643
            //    • @559295333643@c.us
            const regex = /@(\d{6,15})(?:@c\.us)?/g;
            const matches = [...caption.matchAll(regex)];

            for (const match of matches) {
                const rawNum = match[1];      // ex: "559295333643" ou "5592995333643"
                const fullMatch = match[0];   // ex: "@559295333643" ou "@5592995333643@c.us"
                let foundUser = null;

                // Percorre lista de participantes para encontrar quem bate com rawNum
                for (const p of participantes) {
                    const userStr = p.id.user; // ex: "559295333643"

                    // (1) Se der exato
                    if (userStr === rawNum) {
                        foundUser = userStr;
                        break;
                    }

                    // (2) Se rawNum termina com userStr ou userStr termina com rawNum
                    if (rawNum.endsWith(userStr) || userStr.endsWith(rawNum)) {
                        foundUser = userStr;
                        break;
                    }

                    // (3) Se rawNum tiver 1 dígito a mais (possível nono do Brasil)
                    //     e esse nono estiver na posição correta
                    if (
                        rawNum.length === userStr.length + 1 &&
                        rawNum.startsWith(userStr.slice(0, 4)) &&
                        rawNum.charAt(4) === '9'
                    ) {
                        const possivel = rawNum.slice(0, 4) + rawNum.slice(5);
                        if (possivel === userStr) {
                            foundUser = userStr;
                            break;
                        }
                    }
                }

                if (foundUser) {
                    // Substitui o trecho completo (fullMatch) por "@<foundUser>"
                    caption = caption.replace(fullMatch, `@${foundUser}`);
                    mentions.push(`${foundUser}@c.us`);
                }
            }

            // 4) Unifica menções identificadas com as explícitas enviadas
            let finalMentions = [...mentions];
            if (mentionAll) {
                const allIds = participantes.map((p) => p.id._serialized);
                finalMentions = finalMentions.concat(allIds);
            }
            if (finalMentions.length > 0) {
                options.mentions = Array.from(new Set(finalMentions));
            }
            // Atualiza a legenda no options para a versão “corrigida”
            options.caption = caption;
        } else {
            let finalMentions = [...explicitMentions];
            if (chat.isGroup && mentionAll) {
                const allIds = participantes.map((p) => p.id._serialized);
                finalMentions = finalMentions.concat(allIds);
            }
            if (finalMentions.length > 0) {
                options.mentions = Array.from(new Set(finalMentions));
            }
        }

        // 6) Se for reply (quoted), tenta incluir quotedMessageId
        if (quoted?.key?.id) {
            const messages = await chat.fetchMessages({ limit: 50 });
            const quotedMsg = messages.find((m) => m.id.id === quoted.key.id);
            if (quotedMsg) {
                options.quotedMessageId = quotedMsg.id._serialized;
            }
        }

        if (mediatype === 'audio') {
            await chat.sendStateRecording();
        } else {
            await chat.sendStateTyping();
        }
        await new Promise(r => setTimeout(r, 1500));
        await client.sendMessage(chatId, mediaObj, options);
        await chat.clearState();
        return res.json({ status: true, message: 'Mídia enviada com sucesso.' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});


// Converter mensagem citada (imagem ou vídeo) em sticker
router.post('/message/convertQuotedToSticker/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { remoteJid, quotedId, messageId } = req.body;
    if (!remoteJid || (!quotedId && !messageId))
        return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });

    const getTempFile = ext => path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.${ext}`);
    const videoToWebp = async buffer => {
        const inP = getTempFile('mp4'), outP = getTempFile('webp');
        fs.writeFileSync(inP, buffer);
        await new Promise((r, rej) => ff(inP)
            .on('error', rej)
            .on('end', () => r(true))
            .addOutputOptions([
                '-vcodec', 'libwebp',
                '-vf', "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on[p];[b][p]paletteuse",
                '-loop', '0', '-ss', '00:00:00', '-t', '00:00:05', '-preset', 'default', '-an', '-vsync', '0'
            ]).save(outP)
        );
        const buff = fs.readFileSync(outP);
        fs.unlinkSync(inP); fs.unlinkSync(outP);
        return buff;
    };

    try {
        const chat = await client.getChatById(remoteJid);
        const messages = await chat.fetchMessages({ limit: 50 });
        const msg = messages.find(m => m.id.id === (quotedId || messageId));
        if (!msg || !msg.hasMedia) return res.status(400).json({ error: 'Mensagem não contém mídia.' });
        const media = await msg.downloadMedia();

        const stickerOpts = {
            sendMediaAsSticker: true,
            stickerName: '𝗕𝗼𝘁 𝗔𝗱𝗺𝗶𝗻\n𝖇𝖔𝖙𝖆𝖉𝖒𝖎𝖓.𝖘𝖍𝖔𝖕\n𝘃𝟭.𝟬',
            stickerAuthor: '\n𝘼𝙘𝙚𝙨𝙨𝙚 𝙤 𝙨𝙞𝙩𝙚 👇\nhttps://botadmin.shop'
        };

        if (msg.type === 'image') {
            await client.sendMessage(remoteJid, media, stickerOpts);
            return res.json({ status: true, tipo: 'imagem' });
        }
        if (msg.type === 'video') {
            const buf = await videoToWebp(Buffer.from(media.data, 'base64'));
            const mSticker = new MessageMedia('image/webp', buf.toString('base64'));
            await client.sendMessage(remoteJid, mSticker, stickerOpts);
            return res.json({ status: true, tipo: 'video' });
        }
        res.status(400).json({ error: 'Tipo de mídia não suportado para sticker.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Enviar sticker diretamente de uma URL
router.post('/message/sendStickerFromUrl/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { number, url, quotedId } = req.body;
    if (!number || !url) return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });

    // Garante que number termine com @c.us ou @g.us
    const chatId = number.includes('@') ? number : `${number}@c.us`;
    try {
        let media;
        if (url.startsWith('data:')) {
            const match = url.match(/^data:(.*?);base64,(.*)$/);
            if (!match) return res.status(400).json({ error: 'URL base64 inválida.' });
            const mimetype = match[1] || 'image/webp';
            const base64Data = match[2];
            media = new MessageMedia(mimetype, base64Data, 'sticker');
        } else {
            media = await MessageMedia.fromUrl(url, { unsafeMime: true });
        }
        const options = {
            sendMediaAsSticker: true,
            stickerName: '𝗕𝗼𝘁 𝗔𝗱𝗺𝗶𝗻\n𝖇𝖔𝖙𝖆𝖉𝖒𝖎𝖓.𝖘𝖍𝖔𝖕\n𝘃𝟭.𝟬',
            stickerAuthor: '\n𝘼𝙘𝙚𝙨𝙨𝙚 𝙤 𝙨𝙞𝙩𝙚 👇\nhttps://botadmin.shop'
        };

        if (quotedId) {
            const chat = await client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit: 50 });
            const q = messages.find(m => m.id.id === quotedId);
            if (q) options.quotedMessageId = q.id._serialized;
        }

        const msg = await client.sendMessage(chatId, media, options);
        res.json({ status: true, messageId: msg.id.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Download de mídia de uma mensagem
router.post('/message/downloadMedia/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { remoteJid, messageId } = req.body;
    if (!remoteJid || !messageId)
        return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    try {
        const chat = await client.getChatById(remoteJid);
        const messages = await chat.fetchMessages({ limit: 50 });
        const msg = messages.find(m => m.id.id === messageId);
        if (!msg || !msg.hasMedia) return res.status(404).json({ error: 'Mensagem não encontrada ou sem mídia.' });
        const media = await msg.downloadMedia();
        res.json({ status: true, base64: media.data, mimetype: media.mimetype, fileName: media.filename || `file_${Date.now()}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reenviar mensagem com menções (inclui mídia)
router.post('/message/forwardWithMention/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { number, messageId, newCaption } = req.body;
    if (!number || !messageId) return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    try {
        const chat = await client.getChatById(number);
        const messages = await chat.fetchMessages({ limit: 50 });
        const msg = messages.find(m => m.id.id === messageId);
        if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });
        const mentions = chat.isGroup ? chat.participants.map(p => p.id._serialized) : [];
        if (msg.hasMedia) {
            const m = await msg.downloadMedia();
            await client.sendMessage(number, m, { caption: newCaption || msg.caption || msg.body, mentions });
        } else {
            await client.sendMessage(number, newCaption || msg.body || msg.caption, { mentions });
        }
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reação a mensagem
router.post('/message/sendReaction/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { key, reaction } = req.body;
    if (!key || !reaction) return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    try {
        const chat = await client.getChatById(key.remoteJid);
        const messages = await chat.fetchMessages({ limit: 50 });
        const msg = messages.find(m => m.id.id === key.id);
        if (!msg) throw new Error('Mensagem não encontrada para reagir.');
        await msg.react(reaction);
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Marcar mensagem como lida
router.post('/chat/markMessageAsRead/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { readMessages } = req.body;
    if (!Array.isArray(readMessages)) return res.status(400).json({ error: 'Lista readMessages obrigatória.' });
    try {
        for (const m of readMessages) await client.sendSeen(m.remoteJid);
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Apagar mensagem para todos
router.delete('/chat/deleteMessageForEveryone/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;

    const { id, remoteJid, quotedMessageId, fromMe } = req.body;
    if (!remoteJid || !(id || quotedMessageId)) {
        return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    }

    try {
        const msgId = quotedMessageId || id;
        const botJid = client.info?.wid?._serialized;
        const serialized = fromMe
            ? `true_${remoteJid}_${msgId}_${botJid}`
            : `false_${remoteJid}_${msgId}`;

        let msg;
        try {
            msg = await client.getMessageById(serialized);
        } catch {
            msg = null;
        }

        const chat = await client.getChatById(remoteJid);

        if (!msg) {
            let last;
            for (let i = 0; i < 5 && !msg; i++) {
                const opts = { limit: 50 };
                if (last) opts.before = last.id._serialized;
                const msgs = await chat.fetchMessages(opts);
                if (!msgs.length) break;
                msg = msgs.find(m => m.id.id === msgId);
                last = msgs[msgs.length - 1];
            }
        }

        if (!msg) throw new Error('Mensagem não encontrada.');

        await msg.delete(true);
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Editar texto de mensagem enviada pelo bot
router.post('/message/editText/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { remoteJid, messageId, newText, mentionAll } = req.body;
    if (!remoteJid || !messageId || !newText)
        return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    try {
        const chatId = remoteJid.includes('@') ? remoteJid : `${remoteJid}@c.us`;
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 100 });
        const msg = messages.find(m => m.fromMe && (m.id._serialized === messageId || m.id.id === messageId));
        if (!msg) throw new Error('Mensagem não encontrada ou não enviada por este bot.');
        const options = {};
        if (mentionAll && chat.isGroup) {
            const participants = await chat.participants;
            options.mentions = participants.map(p => p.id._serialized);
        }
        await msg.edit(newText, options);
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Gerenciar participantes de grupo (remove/promote/demote)
router.post('/group/updateParticipant/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { groupJid } = req.query;
    const { action, participants } = req.body;
    if (!groupJid || !action || !participants?.length)
        return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    try {
        const chat = await client.getChatById(groupJid);
        if (!chat.isGroup) throw new Error('Chat não é grupo.');
        switch (action) {
            case 'remove': await chat.removeParticipants(participants); break;
            case 'promote': await chat.promoteParticipants(participants); break;
            case 'demote': await chat.demoteParticipants(participants); break;
            default: throw new Error('Ação inválida. Use: remove, promote ou demote.');
        }
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Obter informações de convite
router.get('/group/inviteInfo/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { inviteCode } = req.query;
    if (!inviteCode) return res.status(400).json({ error: 'inviteCode obrigatório.' });
    try {
        const info = await client.getInviteInfo(inviteCode);
        res.json(info);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rota: aceitar convite de grupo ou retornar detalhes se precisar de aprovação  
router.get('/group/acceptGroupInvite/:instance', auth, async (req, res) => {
    const client = getClient(req, res)
    if (!client) return

    let { inviteCode } = req.query
    if (!inviteCode) {
        return res.status(400).json({ error: 'inviteCode obrigatório.' })
    }

    // 👉 Limpeza flexível (link completo, código puro ou até JID)
    inviteCode = inviteCode
        .replace('https://chat.whatsapp.com/', '')
        .replace('chat.whatsapp.com/', '')
        .replace(/[^A-Za-z0-9@.]/g, '')
        .trim()
    if (!inviteCode) {
        return res.status(400).json({ error: 'Código inválido após processamento.' })
    }

    try {
        // 1) Se vier um JID, só buscamos o chat
        if (inviteCode.endsWith('@g.us')) {
            const chat = await client.getChatById(inviteCode)
            if (!chat.isGroup) throw new Error('O ID fornecido não é de um grupo.')
            return res.json({ accepted: true, groupJid: chat.id._serialized })
        }

        // 2) Caso contrário, tentamos aceitar o convite
        const joinedJid = await client.acceptInvite(inviteCode)
        return res.json({ accepted: true, groupJid: joinedJid })

    } catch (e) {
        // 3) Fallback para grupos que exigem aprovação de admin
        if (e.message.includes('Evaluation failed')) {
            try {
                const inviteInfo = await client.getInviteInfo(inviteCode)

                // Extrai o ID do grupo (suporta tanto v4 quanto v3)
                const rawId = inviteInfo.groupMetadata?.id ?? inviteInfo.id
                if (!rawId) {
                    throw new Error('Não foi possível extrair o ID do grupo do inviteInfo.')
                }
                const groupJid = typeof rawId === 'string'
                    ? rawId
                    : rawId._serialized

                // Busca detalhes completos do grupo
                const chat = await client.getChatById(groupJid)
                if (!chat.isGroup) throw new Error('Não é um grupo.')

                await chat.fetchMessages({ limit: 1 })
                const participants = chat.participants.map(p => ({
                    id: p.id._serialized,
                    admin: p.isSuperAdmin ? 'superadmin'
                        : p.isAdmin ? 'admin'
                            : 'member'
                }))
                const pictureUrl = await client.getProfilePicUrl(groupJid)

                return res.json({
                    accepted: false,
                    needApproval: true,
                    groupJid,
                    id: chat.id._serialized,
                    name: chat.name,
                    subject: chat.name,
                    description: inviteInfo.groupMetadata?.desc ?? '',
                    pictureUrl,
                    participants
                })

            } catch (innerErr) {
                return res
                    .status(500)
                    .json({ accepted: false, error: innerErr.message })
            }
        }

        // 4) Erro inesperado
        return res
            .status(500)
            .json({ accepted: false, error: e.message })
    }
})

// Buscar infos completas do grupo (com logs e proteção robusta)
router.get('/group/findGroupInfos/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;

    const { groupJid } = req.query;

    if (!groupJid) {
        console.warn('⚠️ groupJid é obrigatório.');
        return res.status(400).json({ error: 'groupJid é obrigatório.' });
    }

    try {
        const chat = await client.getChatById(groupJid).catch(() => null);

        if (!chat || !chat.isGroup) {
            console.warn(`❌ Grupo não encontrado ou chat inválido: ${groupJid}`);
            return res.status(404).json({ error: 'grupo não encontrado' });
        }

        // Força carregamento do metadata do grupo, se possível
        try { await chat.fetchMessages({ limit: 1 }); } catch { }

        const participants = await chat.participants;
        const allParticipants = participants.map(p => ({
            id: p.id._serialized,
            admin: p.isSuperAdmin
                ? 'superadmin'
                : p.isAdmin
                    ? 'admin'
                    : 'member'
        }));

        const pictureUrl = await client.getProfilePicUrl(groupJid).catch(() => null);
        const description = chat.groupMetadata?.desc || '';
        const owner = chat.groupMetadata?.owner?._serialized || null;

        const result = {
            id: chat.id._serialized,
            name: chat.name,
            subject: chat.name,
            pictureUrl: pictureUrl || null,
            description,
            desc: description,
            participants: allParticipants,
            owner,
            announce: chat.groupMetadata?.announce || false
        };

        res.json(result);
    } catch (err) {
        console.error('❌ Erro ao obter informações completas do grupo:\n', err);
        res.status(500).json({ error: err.message });
    }
});


// Enviar enquete
router.post('/message/sendPoll/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { number, question, options, allowsMultipleAnswers, mentionAll } = req.body;
    if (!number || !question || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: 'Número, pergunta e ≥2 opções obrigatórios.' });
    }
    const chatId = number.includes('@') ? number : `${number}@c.us`;
    try {
        const chat = await client.getChatById(chatId);
        const poll = new Poll(question, options, { allowMultipleAnswers: allowsMultipleAnswers || false });
        const sendOpts = {};
        if (mentionAll && chat.isGroup) {
            const ps = await chat.participants;
            sendOpts.mentions = ps.map(p => p.id._serialized);
        }

        // 1) Envia a enquete
        const msg = await chat.sendMessage(poll, sendOpts);


        // 2) Abre automaticamente a janela do chat onde a enquete foi postada
        await client.interface.openChatWindow(chatId);

        // 3) Retorna o ID da mensagem da enquete
        res.json({ status: true, messageId: msg.id._serialized });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// Abrir janela de chat/grupo
router.post('/group/openChatWindow/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;

    const { groupJid } = req.body;
    if (!groupJid) return res.status(400).json({ error: 'groupJid obrigatório.' });

    console.log(`📥 ROTA CHAMADA: /group/openChatWindow/${req.params.instance}`);
    console.log('🔹 Parâmetros recebidos:', req.body);

    try {
        await client.interface.openChatWindow(groupJid);
        res.json({ status: true });
    } catch (e) {
        console.error('❌ Erro ao abrir janela do grupo:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Definir se apenas admins podem enviar mensagens
router.post('/group/setMessagesAdminsOnly/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;

    const { groupJid, onlyAdmins } = req.body;
    if (!groupJid) return res.status(400).json({ error: 'groupJid obrigatório.' });

    try {
        const chat = await client.getChatById(groupJid);
        if (!chat.isGroup) throw new Error('Chat não é grupo.');
        await chat.setMessagesAdminsOnly(onlyAdmins);
        res.json({ status: true });
    } catch (e) {
        console.error('❌ Erro ao definir mensagens somente admins:', e.message);
        res.status(500).json({ error: e.message });
    }
});


router.post('/message/pinQuoted/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;

    const { remoteJid, quotedId, duration } = req.body;
    if (!remoteJid || !quotedId) {
        return res.status(400).json({ error: 'Parâmetros obrigatórios: remoteJid e quotedId.' });
    }

    try {
        // Tenta recuperar a mensagem diretamente pelo ID serializado
        const botJid = client.info?.wid?._serialized;
        const serialized = `true_${remoteJid}_${quotedId}_${botJid}`;
        let msg;

        try {
            msg = await client.getMessageById(serialized);
        } catch {
            msg = null;
        }

        // Fallback: busca no histórico caso getMessageById falhe
        if (!msg) {
            const chat = await client.getChatById(remoteJid);
            const messages = await chat.fetchMessages({ limit: 100 });
            msg = messages.find(m => m.id.id === quotedId && m.id.remote === remoteJid);
        }

        if (!msg) {
            return res.status(404).json({ error: `Mensagem não encontrada para pinagem (id: ${remoteJid}_${quotedId})` });
        }

        // Duração padrão: 30 dias (em segundos)
        const pinSeconds = parseInt(duration, 10) || 2592000;

        const success = await msg.pin(pinSeconds);

        if (!success) {
            return res.status(500).json({ error: 'Falha ao fixar a mensagem.' });
        }

        return res.json({ status: true, message: 'Mensagem fixada com sucesso.', messageId: msg.id._serialized });

    } catch (e) {
        console.error('Erro ao fixar mensagem:', e);
        return res.status(500).json({ error: e.message });
    }
});




router.post('/message/unpin/:instance', auth, async (req, res) => {
    const client = getClient(req, res);
    if (!client) return;
    const { serialized } = req.body;
    if (!serialized) return res.status(400).json({ error: 'serialized obrigatório.' });
    try {
        const [fromMeFlag, remoteJid, messageId] = serialized.split('_');
        if (fromMeFlag !== 'true') throw new Error('Só mensagens do bot podem ser desfixadas.');
        const chat = await client.getChatById(remoteJid);
        const msgs = await chat.fetchMessages({ limit: 100 });
        const msg = msgs.find(m => m.id.id === messageId && m.id.fromMe);
        if (!msg) throw new Error('Mensagem não encontrada.');
        await msg.unpin();
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = {
    router,
    clients,
    instances,
    startClient,
    setStatus
};

// Allow running this file standalone as an Express server os
if (require.main === module) {
    const PORT = process.env.WA_API_PORT || 4477;
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/', router);
    app.listen(PORT, () => {
        console.log(`WhatsApp API listening on port ${PORT}`);
        autoStartSessions();
    });
}
