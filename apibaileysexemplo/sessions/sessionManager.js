const axios = require('axios');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const {
  getStoreCollection,
  getRecordCollection,
  getSessionCollection
} = require('../db');
const { useMongoAuthState } = require('./authState');

const sessions = new Map();
const records = new Map();
const qrCodes = new Map();
const pairCodes = new Map();
const restarting = new Set();
const { formatPairCode } = require('../../utils/pairCode');

const usePairingCode =
  process.env.USE_PAIRING_CODE === '1' ||
  process.env.USE_PAIRING_CODE === 'true';

// util para entrada via terminal quando disponível
function ask(question) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) return resolve('');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, ans => {
      rl.close();
      resolve(ans);
    });
  });
}

// número a ser usado ao solicitar código de pareamento
function getPairingNumber(name) {
  const env = process.env[`PAIRING_NUMBER_${name}`] || process.env.PAIRING_NUMBER;
  if (env && /^\d{10,15}$/.test(env)) return env;
  if (/^\d{10,15}$/.test(name)) return name;
  return null;
}

// Tratamento global de erros
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

async function loadStoreMap(name) {
  const coll = await getStoreCollection();
  const doc = await coll.findOne({ name });
  const map = new Map(doc?.messages || []);

  async function save() {
    try {
      await coll.updateOne(
        { name },
        { $set: { messages: Array.from(map.entries()) } },
        { upsert: true }
      );
    } catch (err) {
      console.error(`[${name}] store save failed:`, err.message);
    }
  }

  return { map, save };
}

function insertMessages(store, messages) {
  for (const msg of messages) {
    const key = msg?.key;
    if (key?.remoteJid && key?.id) {
      store.map.set(`${key.remoteJid}-${key.id}`, msg);
    }
  }
  store.save();
}

function fetchMessage(store, jid, id) {
  return store.map.get(`${jid}-${id}`);
}

function cloneRaw(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}

async function loadRecords() {
  const coll = await getRecordCollection();
  const arr = await coll.find().toArray();

  records.clear();
  qrCodes.clear();
  pairCodes.clear();

  for (const r of arr) {
    records.set(r.name, { name: r.name, webhook: r.webhook, apiKey: r.apiKey });
    if (r.qr) qrCodes.set(r.name, r.qr);
    if (r.pairCode) pairCodes.set(r.name, r.pairCode);
  }
}

async function saveRecord(record) {
  const coll = await getRecordCollection();
  await coll.updateOne(
    { name: record.name },
    { $set: record },
    { upsert: true }
  );
}

async function deleteRecord(name) {
  const coll = await getRecordCollection();
  await coll.deleteOne({ name });
}

async function updateRecord(name, data) {
  const coll = await getRecordCollection();
  await coll.updateOne({ name }, { $set: data });
}

async function dispatch(name, event, data) {
  console.log(`[${name}] ${event}`);
  if (data) console.dir(data, { depth: null, colors: true });

  const rec = records.get(name);
  if (!rec?.webhook) return;

  const headers = {
    apikey: process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU'
  };

  try {
    await axios.post(
      rec.webhook,
      { event, data: cloneRaw(data), instance: name },
      { headers, timeout: 5000 }
    );
  } catch (err) {
    console.error(`[${name}] dispatch ${event} failed:`, err.message);
  }
}

async function startSocket(name, record, autoPair = usePairingCode) {
  const { state, saveCreds } = await useMongoAuthState(name);
  const { version } = await fetchLatestBaileysVersion();
  const store = await loadStoreMap(name);
  const keyStore = makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }));

  // Configurações críticas para estabilidade
  const sock = makeWASocket({
    version,
    logger: P({ level: 'info' }),
    auth: { creds: state.creds, keys: keyStore },
    browser: ['Ubuntu', 'Chrome', '110.0.0.0'],
    mobile: autoPair,
    printQRInTerminal: false,
    getMessage: async () => { },

    // Configurações para prevenir erros de sincronização
    appStateMacVerification: {
      patch: false,
      snapshot: false
    },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: jid => jid.endsWith('@g.us') || jid.endsWith('@broadcast'),
    transactionOpts: {
      maxCommitRetries: 3,
      delayBetweenTriesMs: 1000
    }
  });

  // Monitoramento de sincronização crítica
  sock.ev.on('appstate.sync', ({ data, isResync }) => {
    if (data && data.syncType === 'critical_block') {
      console.log(`[${name}] Critical block synced successfully`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async data => {
    if (data.qr) {
      qrCodes.set(name, data.qr);
      qrcode.generate(data.qr, { small: true });
      dispatch(name, 'session.qr.updated', { qr: data.qr });
      await updateRecord(name, { qr: data.qr, pairCode: null });
    }

    if (data.pairingCode) {
      pairCodes.set(name, data.pairingCode);
      const formatted = formatPairCode(data.pairingCode);
      console.log(`[${name}] pair code: ${formatted}`);
      qrcode.generate(data.pairingCode, { small: true });
      dispatch(name, 'session.pair_code', { code: data.pairingCode });
      await updateRecord(name, { pairCode: data.pairingCode });
    }

    if (
      autoPair &&
      !state.creds.registered &&
      data.connection === 'connecting' &&
      !pairCodes.has(name)
    ) {
      try {
        let phone = getPairingNumber(name);
        if (!phone) {
          phone = (await ask('📱 Digite seu número completo (ex: 5599999999999): ')).trim();
        }
        if (!/^\d{10,15}$/.test(phone)) {
          throw new Error('número inválido para pareamento');
        }
        const code = await sock.requestPairingCode(phone);
        if (code) {
          pairCodes.set(name, code);
          const formatted = formatPairCode(code);
          console.log(`[${name}] \uD83D\uDD10 Pairing code: ${formatted}`);
          qrcode.generate(code, { small: true });
          dispatch(name, 'session.pair_code', { code });
          await updateRecord(name, { pairCode: code });
        }
      } catch (err) {
        console.warn(`[${name}] \u274C Erro ao gerar pairing code:`, err.message);
        dispatch(name, 'session.pair_code_failed', { error: err.message });

        // Fallback para QR code com delay maior
        console.log(`[${name}] \uD83D\uDD04 Tentando fallback para QR code em 3s...`);
        setTimeout(() => {
          deleteInstance(name, true)
            .then(() => startSocket(name, record, false))
            .catch(console.error);
        }, 3000);
        return;
      }
    }

    if (data.connection === 'open') {
      console.log(`[${name}] ✅ Conexão estabelecida com sucesso`);
      dispatch(name, 'session.connected', { user: sock.user });
      pairCodes.delete(name);
      qrCodes.delete(name);
      await updateRecord(name, { qr: null, pairCode: null });
    }
    else if (data.connection === 'close') {
      const statusCode = new Boom(data.lastDisconnect?.error)?.output?.statusCode;
      const errorMessage = data.lastDisconnect?.error?.message || 'Desconhecido';

      console.log(`[${name}] ❌ Conexão fechada. Razão: ${errorMessage}`);
      dispatch(name, 'session.disconnected', { reason: errorMessage });

      pairCodes.delete(name);
      await updateRecord(name, { qr: null, pairCode: null });

      // Tratamento específico para erro XML
      const errMsg = data.lastDisconnect?.error?.message || '';
      const errNode = data.lastDisconnect?.error?.data;
      const isXmlError =
        /xml-not-well-formed/i.test(errMsg) ||
        (errNode?.content?.[0]?.tag === 'xml-not-well-formed');

      if (isXmlError) {
        console.log(
          `[${name}] ⚠️ Erro XML detectado - Recriando sessão com QR em 10s`
        );
        await deleteInstance(name, true);
        setTimeout(() => startSocket(name, record, false), 10000);
        return;
      }

      // Tratamento melhorado de reconexão
      switch (statusCode) {
        case DisconnectReason.badSession:
        case DisconnectReason.loggedOut:
          console.log(`[${name}] 🧹 Sessão inválida - Recriando em 10s`);
          await deleteInstance(name, true);
          setTimeout(() => startSocket(name, record, autoPair), 10000);
          return;

        case 401:
          if (autoPair) {
            console.log(`[${name}] ⚠️ Pairing code rejeitado. Tentando QR em 10s`);
            await deleteInstance(name, true);
            setTimeout(() => startSocket(name, record, false), 10000);
            return;
          }
          break;

        case DisconnectReason.restartRequired:
          if (!restarting.has(name)) {
            console.log(`[${name}] 🔄 Reinício necessário - Reconectando...`);
            restartInstance(name, false, false);
          }
          break;

        case DisconnectReason.connectionReplaced:
          console.log(`[${name}] 🔄 Conexão substituída - Reconectando em 5s`);
          setTimeout(() => restartInstance(name, autoPair, false), 5000);
          break;

        default:
          if (state.creds.registered && !restarting.has(name)) {
            console.log(`[${name}] 🔁 Tentativa de reconexão em 5s`);
            setTimeout(() => restartInstance(name, autoPair, false), 5000);
          }
      }
    }
  });

  // Event handlers de mensagens
  sock.ev.on('messages.upsert', async ({ messages }) => {
    insertMessages(store, messages);
    for (const m of messages) await dispatch(name, 'message.upsert', m);
  });

  sock.ev.on('groups.upsert', data => dispatch(name, 'groups.upsert', data));
  sock.ev.on('group-participants.update', data => dispatch(name, 'group.participants.update', data));
  sock.ev.on('group.update', data => dispatch(name, 'group.update', data));
  sock.ev.on('group-admin.update', data => dispatch(name, 'group.admin.changed', data));

  sock.ev.on('poll.update', async data => {
    try {
      const stored = fetchMessage(
        store,
        data.pollUpdates[0].pollMessageKey.remoteJid,
        data.pollUpdates[0].pollMessageKey.id
      );
      if (stored) {
        const aggregate = getAggregateVotesInPollMessage({
          key: stored.key,
          pollUpdates: data.pollUpdates
        });
        dispatch(name, 'poll.update', { pollUpdates: data.pollUpdates, aggregate });
        return;
      }
    } catch (err) {
      console.error(`[${name}] poll.update error:`, err.message);
    }
    dispatch(name, 'poll.update', data);
  });

  sessions.set(name, { sock, store, webhook: record.webhook, apiKey: record.apiKey });
}

async function createInstance(name, webhook, apiKey, force = false, autoPair = usePairingCode) {
  if (sessions.has(name) || records.has(name)) {
    if (!force) throw new Error('instance already exists');
    await deleteInstance(name);
  }

  const record = { name, webhook, apiKey };
  records.set(name, record);
  await saveRecord(record);

  try {
    await startSocket(name, record, autoPair);
  } catch (err) {
    console.error(`[${name}] Failed to create instance:`, err.message);
    throw err;
  }
}

function getInstance(name) {
  return sessions.get(name)?.sock || null;
}

function getSession(name) {
  return sessions.get(name) || null;
}

function getInstanceStatus(name) {
  return sessions.has(name) ? 'connected' : 'disconnected';
}

function getInstanceQR(name) {
  return qrCodes.get(name) || null;
}

function getPairCode(name) {
  return pairCodes.get(name) || null;
}

async function requestPairCode(name) {
  if (!usePairingCode) return null;

  const session = sessions.get(name);
  if (!session) throw new Error('instance not found');

  const sock = session.sock;
  try {
    await sock.waitForSocketOpen();
    let phone = getPairingNumber(name);
    if (!phone) {
      phone = (await ask('📱 Digite seu número completo (ex: 5599999999999): ')).trim();
    }
    if (!/^\d{10,15}$/.test(phone)) {
      throw new Error('número inválido para pareamento');
    }
    const code = await sock.requestPairingCode(phone);

    if (code) {
      pairCodes.set(name, code);
      const formatted = formatPairCode(code);
      console.log(`[${name}] pair code: ${formatted}`);
      qrcode.generate(code, { small: true });
      dispatch(name, 'session.pair_code', { code });
      await updateRecord(name, { pairCode: code });
    }

    return code;
  } catch (err) {
    console.warn(`[${name}] failed to get pairing code:`, err.message);
    dispatch(name, 'session.pair_code_failed', { error: err.message });
    throw err;
  }
}

async function restartInstance(name, autoPair = usePairingCode, wipe = true) {
  if (restarting.has(name)) return;
  restarting.add(name);

  try {
    const rec = records.get(name);
    if (!rec) throw new Error('instance not found');

    if (wipe) {
      await deleteInstance(name, true);
    } else {
      const session = sessions.get(name);
      if (session) {
        session.sock.end();
        sessions.delete(name);
      }
      qrCodes.delete(name);
      pairCodes.delete(name);
      await updateRecord(name, { qr: null, pairCode: null });
    }

    // Aguarda para liberar recursos
    await new Promise(r => setTimeout(r, 2000));
    await startSocket(rec.name, rec, autoPair);
  } catch (err) {
    console.error(`[${name}] restart failed:`, err.message);
  } finally {
    restarting.delete(name);
  }
}

async function updateInstance(name, data) {
  const rec = records.get(name);
  if (!rec) return null;

  Object.assign(rec, data);
  await saveRecord(rec);

  return sessions.get(name)?.sock || null;
}

async function deleteInstance(name, preserveRecord = false) {
  const session = sessions.get(name);
  if (session) {
    try {
      session.sock.end();
    } catch (err) {
      console.error(`[${name}] error ending socket:`, err.message);
    }
    sessions.delete(name);
  }

  try {
    const coll = await getStoreCollection();
    await coll.deleteOne({ name });
  } catch (err) {
    console.error(`[${name}] failed to delete store:`, err.message);
  }

  try {
    const sessColl = await getSessionCollection();
    await sessColl.deleteOne({ name });
  } catch (err) {
    console.error(`[${name}] failed to delete session:`, err.message);
  }

  if (!preserveRecord) {
    records.delete(name);
    await deleteRecord(name);
  } else {
    await updateRecord(name, { qr: null, pairCode: null });
  }

  qrCodes.delete(name);
  pairCodes.delete(name);
  dispatch(name, 'session.deleted', { preserveRecord });
}

async function listInstances() {
  const coll = await getRecordCollection();
  const docs = await coll.find().toArray();

  return docs.map(r => ({
    name: r.name,
    webhook: r.webhook,
    connected: sessions.has(r.name),
    qr: qrCodes.has(r.name),
    pairCode: pairCodes.has(r.name)
  }));
}

async function restoreInstances() {
  await loadRecords();

  for (const rec of records.values()) {
    try {
      await startSocket(rec.name, rec);
      console.log(`[${rec.name}] ✅ Instância restaurada`);
    } catch (err) {
      console.error(`[${rec.name}] restore failed:`, err.message);
    }
  }
}

// Monitor de memória
setInterval(() => {
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  if (used > 500) {
    console.warn(`⚠️ Alto uso de memória: ${Math.round(used)} MB`);
  }
}, 60000);

module.exports = {
  createInstance,
  getInstance,
  getSession,
  getInstanceStatus,
  getInstanceQR,
  getPairCode,
  requestPairCode,
  restartInstance,
  updateInstance,
  deleteInstance,
  listInstances,
  getRecord: name => records.get(name),
  restoreInstances,
  dispatch,
  downloadMediaMessage
};