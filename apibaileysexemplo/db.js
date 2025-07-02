const { MongoClient } = require('mongodb');
const { log } = require('./utils/logger');

// Default connection string points to the shared Mongo server
const mongoUri =
  process.env.MONGO_URI ||
  'mongodb://admin:Shinobi7766@150.230.85.70:27017/?authSource=admin';
const client = new MongoClient(mongoUri);
let db;

async function initDb() {
  if (!db) {
    log(`[db] connecting to ${mongoUri}`);
    await client.connect();
    db = client.db();
    await db.collection('session_records').createIndex(
      { name: 1 },
      { unique: true }
    );
    log('[db] connected');
  }
  return db;
}

async function getSessionCollection() {
  const database = await initDb();
  return database.collection('sessions');
}

async function getStoreCollection() {
  const database = await initDb();
  return database.collection('stores');
}

async function getRecordCollection() {
  const database = await initDb();
  return database.collection('session_records');
}

module.exports = {
  initDb,
  getSessionCollection,
  getStoreCollection,
  getRecordCollection
};
