const { getSessionCollection } = require('../db');
const { initAuthCreds, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const P = require('pino');

function convertBinary(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj._bsontype === 'Binary' && obj.buffer) {
    return Buffer.from(obj.buffer);
  }
  for (const key of Object.keys(obj)) {
    obj[key] = convertBinary(obj[key]);
  }
  return obj;
}

async function useMongoAuthState(name) {
  const coll = await getSessionCollection();
  const doc = (await coll.findOne({ name })) || { name, creds: {}, keys: {} };
  const creds =
    Object.keys(doc.creds || {}).length ? convertBinary(doc.creds) : initAuthCreds();
  const keys = convertBinary(doc.keys || {});

  const save = async () => {
    await coll.updateOne({ name }, { $set: { creds, keys } }, { upsert: true });
  };

  const store = {
    get: (type, ids) => {
      const data = {};
      for (const id of ids) {
        if (keys[type]?.[id]) data[id] = keys[type][id];
      }
      return data;
    },
    set: async (data) => {
      for (const category of Object.keys(data)) {
        keys[category] = keys[category] || {};
        Object.assign(keys[category], data[category]);
      }
      await save();
    }
  };

  const keyStore = makeCacheableSignalKeyStore(store, P({ level: 'silent' }));

  return {
    state: { creds, keys: keyStore },
    saveCreds: save
  };
}

module.exports = { useMongoAuthState };
