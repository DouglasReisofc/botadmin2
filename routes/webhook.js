const express = require('express');
const router = express.Router();
const webhookHandler = require('../db/webhook');
const { BotApi } = require('../db/botApi');
const axios = require('axios');

const MASTER_APIKEY = process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU';

// Configurações melhoradas para webhooks
const WEBHOOK_CONFIG = {
  timeout: 15000, // 15 segundos
  retryAttempts: 3,
  retryDelay: 2000, // 2 segundos
  maxConcurrentRequests: 10
};

// Controle de rate limiting
const requestQueue = new Map();
let activeRequests = 0;

function checkKey(req, res, next) {
  const key = req.headers['apikey'] || req.query.apikey;
  if (key !== MASTER_APIKEY) return res.status(401).json({ error: 'invalid apikey' });
  next();
}

// Função para fazer requisições HTTP com retry
async function makeHttpRequestWithRetry(url, data, headers, attempts = 0) {
  try {
    const response = await axios.post(url, data, {
      headers,
      timeout: WEBHOOK_CONFIG.timeout,
      validateStatus: (status) => status < 500 // Retry apenas em erros 5xx
    });

    return response;
  } catch (error) {
    const isLastAttempt = attempts >= WEBHOOK_CONFIG.retryAttempts - 1;
    const shouldRetry = error.code === 'ECONNABORTED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      (error.response && error.response.status >= 500);

    if (!isLastAttempt && shouldRetry) {
      console.warn(`⚠️ Tentativa ${attempts + 1} falhou, tentando novamente em ${WEBHOOK_CONFIG.retryDelay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, WEBHOOK_CONFIG.retryDelay));
      return makeHttpRequestWithRetry(url, data, headers, attempts + 1);
    }

    throw error;
  }
}

// Middleware para controle de rate limiting
function rateLimitMiddleware(req, res, next) {
  if (activeRequests >= WEBHOOK_CONFIG.maxConcurrentRequests) {
    return res.status(429).json({
      error: 'Too many concurrent requests',
      retryAfter: 1000
    });
  }

  activeRequests++;
  res.on('finish', () => {
    activeRequests--;
  });

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
  const { event, data, instance, server_url: bodyUrl, apikey: bodyKey } = req.body;
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
    const serverUrl = bot?.baseUrl || bodyUrl;
    const apiKey = bot?.globalapikey || bodyKey;
    await webhookHandler({
      event,
      data,
      instance,
      server_url: serverUrl,
      apikey: apiKey
    });
    const thisEndpoint = `${req.protocol}://${req.get('host')}${req.baseUrl}/event`;
    const targetWebhook = bot?.webhook?.replace(/\/+$/, '');
    if (targetWebhook && targetWebhook !== thisEndpoint.replace(/\/+$/, '')) {
      try {
        const webhookData = {
          event,
          data,
          instance,
          server_url: serverUrl,
          apikey: apiKey
        };

        const response = await makeHttpRequestWithRetry(
          targetWebhook,
          webhookData,
          {
            apikey: MASTER_APIKEY,
            'Content-Type': 'application/json'
          }
        );

        console.log(`[webhook/event] ✅ Encaminhado para ${targetWebhook} - Status: ${response.status}`);
      } catch (err) {
        console.error(
          `❌ Falha definitiva ao reenviar evento para webhook da instância (${targetWebhook}):`,
          err.message
        );

        // Log adicional para debug
        if (err.response) {
          console.error(`   Status: ${err.response.status}, Data:`, err.response.data);
        } else if (err.code) {
          console.error(`   Código de erro: ${err.code}`);
        }
      }
    }
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
