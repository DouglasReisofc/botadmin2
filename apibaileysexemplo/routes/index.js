const express = require('express');
const router = express.Router();
const { log } = require('../utils/logger');
const GLOBAL_KEY =
  process.env.GLOBAL_API_KEY || 'AIAO1897AHJAKACMC817ADOU';
const usePairingCode =
  process.env.USE_PAIRING_CODE === '1' ||
  process.env.USE_PAIRING_CODE === 'true';

router.use((req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key !== GLOBAL_KEY) return res.status(401).json({ error: 'Invalid api key' });
  log(`[route] ${req.method} ${req.originalUrl}`);
  next();
});

async function checkInstance(req, res, next) {
  const body = req.body || {};
  const name =
    body.instance ||
    (req.query ? req.query.instance : undefined) ||
    req.params.id;
  if (!name || name === 'undefined') {
    return res.status(400).json({ error: 'Instance required' });
  }
  let record = await getRecord(name);
  if (!record) {
    const running = getInstance(name);
    if (!running) return res.status(404).json({ error: 'Instance not found' });
    record = { name };
  }
  const key =
    req.headers['x-instance-key'] ||
    body.instanceKey ||
    (req.query ? req.query.instanceKey : undefined);
  if (record.apiKey && record.apiKey !== key) {
    return res.status(401).json({ error: 'Invalid instance key' });
  }
  req.instanceName = name;
  next();
}

// used for delete routes - succeeds even if record is missing
async function locateInstance(req, res, next) {
  const body = req.body || {};
  const name =
    body.instance || (req.query ? req.query.instance : undefined) || req.params.id;
  if (!name || name === 'undefined') {
    return res.status(400).json({ error: 'Instance required' });
  }
  let record = await getRecord(name);
  if (!record) {
    const running = getInstance(name);
    if (running) record = { name };
  }
  const key =
    req.headers['x-instance-key'] ||
    body.instanceKey ||
    (req.query ? req.query.instanceKey : undefined);
  if (record && record.apiKey && record.apiKey !== key) {
    return res.status(401).json({ error: 'Invalid instance key' });
  }
  req.instanceName = name;
  req.instanceRecord = record || null;
  next();
}
const {
  createInstance,
  getInstanceStatus,
  getInstanceQR,
  getPairCode,
  requestPairCode,
  restartInstance,
  updateInstance,
  deleteInstance,
  listInstances,
  getRecord
} = require('../sessions/sessionManager');
const {
  sendMessage,
  sendMedia,
  deleteMessage,
  sendPoll,
  sendReaction,
  editMessage,
  forwardWithMention,
  convertQuotedToSticker,
  downloadMedia,
  sendStickerFromUrl,
  pinQuoted,
  unpin
} = require('../controllers/messageController');
const {
  createGroup,
  updateSubject,
  addParticipants,
  removeParticipants,
  promoteParticipants,
  demoteParticipants,
  leaveGroup,
  fetchMetadata,
  getInviteCode,
  revokeInvite,
  joinByCode,
  inviteInfo,
  updateDescription,
  updateSetting,
  toggleEphemeral,
  listGroups,
  openGroupWindow
} = require('../controllers/groupController');
const { fetchStatus, block, unblock } = require('../controllers/contactController');
const { getInstance } = require('../sessions/sessionManager');

router.get('/instances', async (req, res) => {
  res.json({ instances: await listInstances() });
});

router.post('/instance', async (req, res) => {
  const { name, webhook, apiKey } = req.body;
  const force = req.query.force === '1' || req.query.force === 'true';
  try {
    await createInstance(name, webhook, apiKey, force);
    res.json({ status: 'instance created', name });
  } catch (e) {
    const status = /exists/i.test(e.message) ? 409 : 500;
    res.status(status).json({ error: e.message });
  }
});


router.put('/instance/:id', checkInstance, async (req, res) => {
  const { id } = req.params;
  const session = await updateInstance(id, req.body);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  res.json({ status: 'updated', id });
});


router.get('/instance/:id/status', checkInstance, (req, res) => {
  const { id } = req.params;
  res.json({ status: getInstanceStatus(id) });
});


router.get('/instance/:id/qr', checkInstance, (req, res) => {
  const { id } = req.params;
  const qr = getInstanceQR(id);
  if (!qr) {
    return res.status(404).json({ error: 'QR not available' });
  }
  res.json({ qr });
});


// Trigger reconnect and wait for a QR code
router.post('/instance/:id/pair', checkInstance, async (req, res) => {
  const { id } = req.params;
  const mode = req.query.mode;
  const number = req.body ? req.body.number : undefined;
  try {
    const usePair = mode === 'pair' || (!mode && usePairingCode);
    await restartInstance(id, usePair, number);
    if (usePair) {
      await requestPairCode(id, number).catch(() => {});
    }
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const qr = getInstanceQR(id);
      const code = getPairCode(id);
      if (qr || code) {
        return res.json({ qr: qr || null, code: code || null });
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    res.status(404).json({ error: 'QR not available' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.post('/instance/:id/restart', checkInstance, async (req, res) => {
  const { id } = req.params;
  try {
    await restartInstance(id);
    res.json({ status: 'restarted', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.post('/instance/:id/reconnect', checkInstance, async (req, res) => {
  const { id } = req.params;
  try {
    await restartInstance(id);
    res.json({ status: 'reconnected', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.delete('/instance/:id', locateInstance, async (req, res) => {
  const { id } = req.params;
  try {
    if (req.instanceRecord) {
      await deleteInstance(id);
    }
    res.json({ status: 'deleted', id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


router.post('/message', checkInstance, sendMessage);
router.post('/message/media', checkInstance, sendMedia);
router.post('/message/poll', checkInstance, sendPoll);
router.post('/message/delete', checkInstance, deleteMessage);
router.post('/message/sendReaction', checkInstance, sendReaction);
router.post('/message/edit', checkInstance, editMessage);
router.post('/message/forwardWithMention', checkInstance, forwardWithMention);
router.post('/message/convertQuotedToSticker', checkInstance, convertQuotedToSticker);
router.post('/message/downloadMedia', checkInstance, downloadMedia);
router.post('/message/sendStickerFromUrl', checkInstance, sendStickerFromUrl);
router.post('/message/pinQuoted', checkInstance, pinQuoted);
router.post('/message/unpin', checkInstance, unpin);

// Mark messages as read
router.post('/chat/markMessageAsRead/:id', checkInstance, async (req, res) => {
  const { id } = req.params;
  const { readMessages } = req.body || {};
  const sock = getInstance(id);
  if (!sock) return res.status(404).json({ error: 'Instance not found' });
  if (!Array.isArray(readMessages) || !readMessages.length) {
    return res.status(400).json({ error: 'readMessages array required' });
  }
  try {
    await sock.readMessages(readMessages);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Group endpoints
router.post('/group', checkInstance, createGroup);
router.get('/group/:id', checkInstance, fetchMetadata);
router.post('/group/:id/subject', checkInstance, updateSubject);
router.post('/group/:id/add', checkInstance, addParticipants);
router.post('/group/:id/remove', checkInstance, removeParticipants);
router.post('/group/:id/promote', checkInstance, promoteParticipants);
router.post('/group/:id/demote', checkInstance, demoteParticipants);
router.post('/group/:id/leave', checkInstance, leaveGroup);
router.get('/group/:id/invite', checkInstance, getInviteCode);
router.post('/group/:id/invite/revoke', checkInstance, revokeInvite);
router.post('/group/join', checkInstance, joinByCode);
router.get('/group/invite/:code', checkInstance, inviteInfo);
router.post('/group/:id/description', checkInstance, updateDescription);
router.post('/group/:id/setting', checkInstance, updateSetting);
router.post('/group/:id/ephemeral', checkInstance, toggleEphemeral);
router.get('/groups', checkInstance, listGroups);
router.post('/group/:id/open', checkInstance, openGroupWindow);

// Contact actions (PV)
router.get('/contact/:id/status', checkInstance, fetchStatus);
router.post('/contact/:id/block', checkInstance, block);
router.post('/contact/:id/unblock', checkInstance, unblock);

module.exports = router;
