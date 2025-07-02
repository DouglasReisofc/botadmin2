const axios = require('axios');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const {
  getStoreCollection,
  getRecordCollection,
  getSessionCollection
} = require('../db');
const { useMongoAuthState } = require('./authState');

const sessions = new Map(); // name -> { sock, store, webhook, apiKey }
const records = new Map(); // name -> { name, webhook, apiKey }
const qrCodes = new Map();
const pairCodes = new Map();
const restarting = new Set();

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
  await coll.updateOne({ name: record.name }, { $set: record }, { upsert: true });
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
  if (data) console.dir(data, { depth: null });
  const rec = records.get(name);
  if (!rec?.webhook) return;
  const headers = {
    apikey: process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU'
  };
  try {
    await axios.post(
      rec.webhook,
      { event, data: cloneRaw(data), instance: name },
      { headers }
    );
  } catch (err) {
    console.error(`[${name}] dispatch ${event} failed:`, err.message);
  }
}

async function startSocket(name, record) {
  const { state, saveCreds } = await useMongoAuthState(name);
  const { version } = await fetchLatestBaileysVersion();
  const store = await loadStoreMap(name);
  const sock = makeWASocket({
    version,
    logger: P({ level: 'info' }),
    printQRInTerminal: false,
    auth: state
  });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async data => {
    if (data.qr) {
      qrCodes.set(name, data.qr);
      qrcode.generate(data.qr, { small: true });
      dispatch(name, 'session.qr.updated', { qr: data.qr });
      await updateRecord(name, { qr: data.qr, pairCode: null });
    }
    if (data.connection === 'open') {
      dispatch(name, 'session.connected', { user: sock.user });
      pairCodes.delete(name);
      qrCodes.delete(name);
      await updateRecord(name, { qr: null, pairCode: null });
    } else if (data.connection === 'close') {
      dispatch(name, 'session.disconnected', { reason: data.lastDisconnect?.error?.message });
      pairCodes.delete(name);
      await updateRecord(name, { qr: null, pairCode: null });
      if (state.creds.registered && !restarting.has(name)) {
        console.log(`[${name}] automatic reconnection attempt`);
        restartInstance(name).catch(err =>
          console.error(`[${name}] auto restart failed:`, err.message)
        );
      }
    }
  });

  if (!state.creds.registered) {
    try {
      await sock.waitForSocketOpen();
      const phone = String(name).replace(/\D/g, '');
      const code = await sock.requestPairingCode(phone);
      if (code) {
        pairCodes.set(name, code);
        dispatch(name, 'session.pair_code', { code });
        await updateRecord(name, { pairCode: code });
      }
    } catch (err) {
      console.warn(`[${name}] failed to get pairing code:`, err.message);
      dispatch(name, 'session.pair_code_failed', { error: err.message });
    }
  }
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
        const aggregate = getAggregateVotesInPollMessage({ key: stored.key, pollUpdates: data.pollUpdates });
        dispatch(name, 'poll.update', { pollUpdates: data.pollUpdates, aggregate });
        return;
      }
    } catch {}
    dispatch(name, 'poll.update', data);
  });

  sessions.set(name, { sock, store, webhook: record.webhook, apiKey: record.apiKey });
}

async function createInstance(name, webhook, apiKey) {
  if (sessions.has(name) || records.has(name)) {
    throw new Error('instance already exists');
  }
  const record = { name, webhook, apiKey };
  records.set(name, record);
  await saveRecord(record);
  await startSocket(name, record);
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

async function restartInstance(name) {
  const rec = records.get(name);
  if (!rec) throw new Error('instance not found');
  if (restarting.has(name)) return;
  restarting.add(name);
  try {
    await deleteInstance(name);
    // aguarda um curto período para liberar a conexão antiga
    await new Promise((r) => setTimeout(r, 1000));
    for (let i = 0; i < 3; i++) {
      try {
        await createInstance(rec.name, rec.webhook, rec.apiKey);
        return;
      } catch (err) {
        console.warn(`[${name}] restart attempt ${i + 1} failed:`, err.message);
        if (i === 2) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
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
    session.sock.end();
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
}

async function listInstances() {
  const coll = await getRecordCollection();
  const docs = await coll.find().toArray();
  return docs.map(r => ({
    name: r.name,
    webhook: r.webhook,
    connected: sessions.has(r.name)
  }));
}

async function restoreInstances() {
  await loadRecords();
  for (const rec of records.values()) {
    await startSocket(rec.name, rec).catch(err => console.error('restore failed', err.message));
  }
}

module.exports = {
  createInstance,
  getInstance,
  getSession,
  getInstanceStatus,
  getInstanceQR,
  getPairCode,
  restartInstance,
  updateInstance,
  deleteInstance,
  listInstances,
  getRecord: name => records.get(name),
  restoreInstances,
  dispatch,
  downloadMediaMessage
};
