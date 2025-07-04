
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const { Boom } = require('@hapi/boom');
const fs = require('fs/promises');
const { formatPairCode } = require('../../utils/pairCode');
const db = require('../db');
const { getSessionPath } = db;
const axios = require('axios');
const { basesiteUrl } = require('../../configuracao');

const DEFAULT_WEBHOOK = `${basesiteUrl}/webhook/event`;

const instances = new Map();

async function startInstance(name, usePairingCode = false, number) {
  const authPath = getSessionPath(name);
  await fs.mkdir(authPath, { recursive: true }); // Garante que o diretório existe
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const credsFile = path.join(authPath, 'creds.json');

  const credsExists = await fs
    .access(credsFile)
    .then(() => true)
    .catch(() => false);

  if (
    credsExists &&
    (!state.creds || !state.creds.me || !state.creds.me.id)
  ) {
    console.warn(`[${name}] ⚠️ Credenciais ausentes. Limpando sessão...`);
    await db.deleteSessionData(name);
    await db.deleteStore(name);
    instances.delete(name);
    await db.deleteRecord(name);
    throw new Error('Sessão inválida apagada. Recrie a instância.');
  }

  const { version } = await fetchLatestBaileysVersion();
  const { map: store, save } = await db.loadStore(name);
  const record = (await db.loadRecords()).find(r => r.name === name) || {};

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: ['Ubuntu', 'Chrome', '110.0.0']
  });

  const session = {
    name,
    sock,
    store,
    write: save,
    qr: null,
    pairCode: null,
    status: 'connecting',
    number: number || null,
    webhook: record.webhook || DEFAULT_WEBHOOK,
    apiKey: record.apiKey || ''
  };
  instances.set(name, session);

  const masterKey = process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU';

  async function dispatchWebhook(event, data) {
    if (!session.webhook) return;
    try {
      await axios.post(
        session.webhook,
        { event, data, instance: name, apikey: session.apiKey },
        { headers: { apikey: masterKey } }
      );
    } catch (err) {
      console.warn(`[${name}] ⚠️ erro ao enviar webhook:`, err.message);
    }
  }

  sock.ev.on('creds.update', async () => {
    try {
      await fs.mkdir(authPath, { recursive: true });
      await saveCreds();
    } catch (err) {
      console.error(`[${name}] ❌ Erro ao salvar credenciais:`, err.message);
    }
  });

  sock.ev.on('messages.upsert', async m => {
    if (m.messages) {
      console.log(`[${name}] 📩 messages.upsert (${m.type}) ->`, m.messages.length);
      for (const msg of m.messages) {
        store.set(msg.key.id, msg);
        await dispatchWebhook('message.upsert', msg);
      }
      await save();
    }
  });

  sock.ev.on('messages.update', u => {
    console.log(`[${name}] 🔄 messages.update`, JSON.stringify(u, null, 2));
    dispatchWebhook('messages.update', u).catch(() => {});
  });
  sock.ev.on('messages.delete', del => {
    console.log(`[${name}] ❌ messages.delete`, JSON.stringify(del, null, 2));
    dispatchWebhook('messages.delete', del).catch(() => {});
  });
  sock.ev.on('chats.upsert', up => {
    console.log(`[${name}] 💬 chats.upsert`, JSON.stringify(up, null, 2));
    dispatchWebhook('chats.upsert', up).catch(() => {});
  });
  sock.ev.on('chats.update', up => {
    console.log(`[${name}] ✏️ chats.update`, JSON.stringify(up, null, 2));
    dispatchWebhook('chats.update', up).catch(() => {});
  });
  sock.ev.on('contacts.upsert', up => {
    console.log(`[${name}] 👥 contacts.upsert`, JSON.stringify(up, null, 2));
    dispatchWebhook('contacts.upsert', up).catch(() => {});
  });
  sock.ev.on('presence.update', up => {
    console.log(`[${name}] 👤 presence.update`, JSON.stringify(up, null, 2));
    dispatchWebhook('presence.update', up).catch(() => {});
  });
  sock.ev.on('call', call => {
    console.log(`[${name}] 📞 call`, JSON.stringify(call, null, 2));
    dispatchWebhook('call', call).catch(() => {});
  });

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr, pairingCode } = update;
    if (qr) session.qr = qr;
    if (pairingCode) session.pairCode = formatPairCode(pairingCode);
    dispatchWebhook('connection.update', update).catch(() => {});

    if (connection === 'open') {
      session.status = 'open';
      session.qr = null;
      session.pairCode = null;
      try {
        await fs.mkdir(authPath, { recursive: true });
        await saveCreds();
      } catch (err) {
        console.error(`[${name}] ❌ Erro ao salvar credenciais:`, err.message);
      }
      await save();

      if (!session.number && sock.user?.id) {
        session.number = sock.user.id.split(':')[0];
        await db.updateRecord(name, { number: session.number });
      }

      console.log(`[${name}] ✅ Sessão conectada com sucesso.`);
    } else if (connection === 'close') {
      session.status = 'close';
      console.log(`[${name}] ❌ conexão encerrada`);
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (
        code === DisconnectReason.loggedOut ||
        code === DisconnectReason.badSession
      ) {
        await db.deleteSessionData(name);
        await db.deleteStore(name);
        instances.delete(name);
        await db.deleteRecord(name);
        return;
      }
      setTimeout(() => startInstance(name, usePairingCode, session.number), 1000);
    }
  });

  if (usePairingCode && !state.creds.registered) {
    try {
      const code = await sock.requestPairingCode(number);
      session.pairCode = formatPairCode(code);
      if (number) {
        session.number = number;
        await db.updateRecord(name, { number });
      }
    } catch (err) {
      console.error(`[${name}] ❌ Erro ao solicitar pairing code:`, err.message);
    }
  }

  return session;
}

async function createInstance(name, webhook, apiKey, force = false) {
  if (!name) throw new Error('name required');
  const existing = await db.loadRecords();
  if (existing.some(r => r.name === name)) {
    if (!force) throw new Error('instance exists');
  }
  await db.saveRecord({ name, webhook: webhook || DEFAULT_WEBHOOK, apiKey: apiKey || '' });
  return startInstance(name);
}

async function updateInstance(name, data) {
  await db.updateRecord(name, data);
  const session = instances.get(name);
  if (session) {
    if (data.webhook !== undefined) session.webhook = data.webhook;
    if (data.apiKey !== undefined) session.apiKey = data.apiKey;
  }
  return session;
}

async function deleteInstance(name) {
  const session = instances.get(name);
  if (session) {
    session.sock.end();
    instances.delete(name);
  }
  await db.deleteStore(name);
  await db.deleteSessionData(name);
  await db.deleteRecord(name);
}

async function restartInstance(name, usePairingCode = false, number) {
  const session = instances.get(name);
  if (session) session.sock.end();
  return startInstance(name, usePairingCode, number);
}

function getInstance(name) {
  return instances.get(name)?.sock || null;
}

function getSession(name) {
  return instances.get(name) || null;
}

function getInstanceStatus(name) {
  return instances.get(name)?.status || 'closed';
}

function getInstanceQR(name) {
  return instances.get(name)?.qr || null;
}

function getPairCode(name) {
  return instances.get(name)?.pairCode || null;
}

async function requestPairCode(name, number) {
  const session = instances.get(name);
  if (!session) throw new Error('instance not found');
  const code = await session.sock.requestPairingCode(number);
  session.pairCode = formatPairCode(code);
  if (number) session.number = number;
  return session.pairCode;
}

async function listInstances() {
  const records = await db.loadRecords();
  return records.map(r => ({
    name: r.name,
    webhook: r.webhook,
    number: r.number || null,
    status: getInstanceStatus(r.name),
    connected: getInstanceStatus(r.name) === 'open'
  }));
}

async function getRecord(name) {
  const records = await db.loadRecords();
  return records.find(r => r.name === name) || null;
}

async function restoreInstances() {
  const records = await db.loadRecords();
  for (const r of records) {
    try {
      await startInstance(r.name);
    } catch (err) {
      console.error(`failed to restore ${r.name}:`, err.message);
    }
  }
}

module.exports = {
  createInstance,
  updateInstance,
  deleteInstance,
  restartInstance,
  listInstances,
  getRecord,
  getInstance,
  getInstanceStatus,
  getInstanceQR,
  getPairCode,
  requestPairCode,
  restoreInstances,
  getSession
};
