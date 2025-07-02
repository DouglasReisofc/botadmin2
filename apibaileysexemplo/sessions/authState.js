const { getSessionCollection } = require('../db');

async function useMongoAuthState(name) {
  const coll = await getSessionCollection();
  const doc = (await coll.findOne({ name })) || { name, creds: {}, keys: {} };
  const { creds = {}, keys = {} } = doc;

  const save = async () => {
    await coll.updateOne({ name }, { $set: { creds, keys } }, { upsert: true });
  };

  return {
    state: {
      creds,
      keys: {
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
      }
    },
    saveCreds: save
  };
}

module.exports = { useMongoAuthState };
