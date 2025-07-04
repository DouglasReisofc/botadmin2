const path = require('path');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { sessionDir } = require('../db');

async function useFileAuthState(name) {
  const dir = path.join(sessionDir, name);
  return useMultiFileAuthState(dir);
}

module.exports = { useFileAuthState };
