const express = require('express');
const router = express.Router();
const webhookHandler = require('../db/webhook');
const { BotApi } = require('../db/botApi');
const axios = require('axios');

const MASTER_APIKEY = process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU';

function checkKey(req, res, next) {
  const key = req.headers['apikey'] || req.query.apikey;
  if (key !== MASTER_APIKEY) return res.status(401).json({ error: 'invalid apikey' });
  next();
}

router.get('/info/:instance', checkKey, async (req, res) => {
  const data = await BotApi.findOne({ instance: req.params.instance });
  if (!data) return res.status(404).json({ error: 'instance not found' });
  res.json(data);
});

router.post('/update/:instance', checkKey, async (req, res) => {
  try {
    await BotApi.updateOne({ instance: req.params.instance }, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/event', checkKey, async (req, res) => {
  const { event, data, instance } = req.body;
  if (!event) return res.status(400).json({ error: 'missing event' });
  try {
    console.log('[webhook/event] recebido', {
      event,
      instance,
      chatId:
        data?.key?.remoteJid ||
        data?.chatId ||
        data?.groupId ||
        data?.id?.remoteJid ||
        data?.id?.remote
    });
    console.log('[webhook/event] raw JSON:', JSON.stringify(req.body, null, 2));
    const bot = instance ? await BotApi.findOne({ instance }).lean() : null;
    if (!bot && instance) {
      console.warn('⚠️ Webhook event for unknown instance:', instance);
    }
    await webhookHandler({
      event,
      data,
      instance,
      server_url: bot?.baseUrl,
      apikey: bot?.apikey
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista todas as instâncias ativas. Pode filtrar por baseUrl.
router.get('/instances', checkKey, async (req, res) => {
  const filter = { status: true };
  if (req.query.baseUrl) filter.baseUrl = req.query.baseUrl;
  try {
    const apis = await BotApi.find(filter).lean();
    res.json(apis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Checa e inicializa instâncias na API WhatsApp
router.post('/instances/init', checkKey, async (req, res) => {
  const filter = { status: true };
  if (req.body.baseUrl) filter.baseUrl = req.body.baseUrl;
  const results = [];
  try {
    const apis = await BotApi.find(filter).lean();
    for (const api of apis) {
      try {
        await axios.post(`${api.baseUrl}/instance/restart/${api.instance}`, {}, { headers: { apikey: api.globalapikey } });
        results.push({ instance: api.instance, started: true });
      } catch (err) {
        results.push({ instance: api.instance, started: false, error: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
