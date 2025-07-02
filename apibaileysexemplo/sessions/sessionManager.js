const fs = require('fs');
const path = require('path');
const axios = require('axios');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const { getStoreCollection } = require('../db');

const sessions = new Map(); // name -> { sock, store, webhook, apiKey }
const records = new Map(); // name -> { name, webhook, apiKey }
const qrCodes = new Map();
const recordsFile = path.join(__dirname, 'records.json');

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

function loadRecords() {
  if (fs.existsSync(recordsFile)) {
    const arr = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));
    for (const r of arr) records.set(r.name, r);
  }
}

function saveRecords() {
  fs.writeFileSync(recordsFile, JSON.stringify(Array.from(records.values()), null, 2));
}

async function dispatch(name, event, data) {
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
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, `session-${name}`));
  const { version } = await fetchLatestBaileysVersion();
  const store = await loadStoreMap(name);
  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', data => {
    if (data.qr) {
      qrCodes.set(name, data.qr);
      qrcode.generate(data.qr, { small: true });
      dispatch(name, 'session.qr.updated', { qr: data.qr });
    }
    if (data.connection === 'open') {
      dispatch(name, 'session.connected', { user: sock.user });
    } else if (data.connection === 'close') {
      dispatch(name, 'session.disconnected', { reason: data.lastDisconnect?.error?.message });
    }
  });
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
  if (sessions.has(name)) throw new Error('instance already exists');
  const record = { name, webhook, apiKey };
  records.set(name, record);
  saveRecords();
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

async function restartInstance(name) {
  await deleteInstance(name);
  const rec = records.get(name);
  if (rec) await createInstance(rec.name, rec.webhook, rec.apiKey);
}

function updateInstance(name, data) {
  const rec = records.get(name);
  if (!rec) return null;
  Object.assign(rec, data);
  saveRecords();
  return sessions.get(name)?.sock || null;
}

async function deleteInstance(name) {
  const session = sessions.get(name);
  if (session) {
    session.sock.end();
    sessions.delete(name);
    try {
      const coll = await getStoreCollection();
      await coll.deleteOne({ name });
    } catch (err) {
      console.error(`[${name}] failed to delete store:`, err.message);
    }
  }
  records.delete(name);
  saveRecords();
}

function listInstances() {
  return Array.from(records.values()).map(r => ({
    name: r.name,
    webhook: r.webhook,
    connected: sessions.has(r.name)
  }));
}

async function restoreInstances() {
  loadRecords();
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
  restartInstance,
  updateInstance,
  deleteInstance,
  listInstances,
  getRecord: name => records.get(name),
  restoreInstances,
  dispatch,
  downloadMediaMessage
};
