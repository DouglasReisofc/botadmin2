const fs = require('fs/promises');
const path = require('path');
const { log } = require('./utils/logger');

function safeName(name) {
  return name.replace(/[:\\/]/g, '-');
}

const dataDir = path.join(__dirname, 'data');
// para compatibilidade com o script code.js, mantemos as credenciais em "auth"
const sessionDir = path.join(__dirname, 'auth');
const storeDir = path.join(dataDir, 'stores');
const recordFile = path.join(dataDir, 'records.json');

async function ensureDirs() {
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(storeDir, { recursive: true });
  try {
    await fs.access(recordFile);
  } catch {
    await fs.writeFile(recordFile, '[]');
  }
}

async function initDb() {
  await ensureDirs();
  log(`[db] using file storage at ${dataDir}`);
}

async function readJSON(file, def) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    return JSON.parse(txt);
  } catch {
    return def;
  }
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function loadStore(name) {
  await ensureDirs();
  const file = path.join(storeDir, `${safeName(name)}.json`);
  const data = await readJSON(file, { messages: [] });
  const map = new Map(data.messages);
  async function save() {
    await writeJSON(file, { messages: Array.from(map.entries()) });
  }
  return { map, save };
}

async function deleteStore(name) {
  const file = path.join(storeDir, `${safeName(name)}.json`);
  await fs.rm(file, { force: true });
}

async function deleteSessionData(name) {
  const dir = path.join(sessionDir, safeName(name));
  await fs.rm(dir, { recursive: true, force: true });
}

async function getRecords() {
  await ensureDirs();
  return (await readJSON(recordFile, [])) || [];
}

async function saveRecords(records) {
  await writeJSON(recordFile, records);
}

async function loadRecords() {
  return getRecords();
}

async function saveRecord(record) {
  const records = await getRecords();
  const idx = records.findIndex(r => r.name === record.name);
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...record };
  } else {
    records.push(record);
  }
  await saveRecords(records);
}

async function deleteRecord(name) {
  const records = await getRecords();
  const idx = records.findIndex(r => r.name === name);
  if (idx >= 0) {
    records.splice(idx, 1);
    await saveRecords(records);
  }
}

async function updateRecord(name, data) {
  const records = await getRecords();
  const idx = records.findIndex(r => r.name === name);
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...data };
    await saveRecords(records);
  }
}

module.exports = {
  initDb,
  sessionDir,
  loadStore,
  deleteStore,
  deleteSessionData,
  loadRecords,
  saveRecord,
  deleteRecord,
  updateRecord
};
