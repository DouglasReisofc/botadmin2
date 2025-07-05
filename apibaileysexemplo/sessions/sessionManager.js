
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const { Boom } = require('@hapi/boom');
const fs = require('fs/promises');
const { formatPairCode } = require('../../utils/pairCode');
const db = require('../db');
const { getSessionPath } = db;
const axios = require('axios');
const { basesiteUrl } = require('../../configuracao');
const connectionManager = require('../utils/connectionManager');
const retryHandler = require('../utils/retryHandler');
const QRCode = require('qrcode-terminal');

const DEFAULT_WEBHOOK = `${basesiteUrl}/webhook/event`;

const instances = new Map();
let isShuttingDown = false;

// Configurações melhoradas
const CONFIG = {
  QR_TIMEOUT: 120000, // 2 minutos
  CONNECTION_TIMEOUT: 180000, // 3 minutos
  PAIRING_TIMEOUT: 300000, // 5 minutos
  RECONNECT_DELAY: 5000, // 5 segundos
  MAX_RECONNECT_ATTEMPTS: 10,
  WEBHOOK_TIMEOUT: 15000 // 15 segundos
};

async function startInstance(name, usePairingCode = false, number) {
  console.log(`[${name}] 🚀 Iniciando instância...`);

  const authPath = getSessionPath(name);
  await fs.mkdir(authPath, { recursive: true });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const credsFile = path.join(authPath, 'creds.json');

    const credsExists = await fs
      .access(credsFile)
      .then(() => true)
      .catch(() => false);

    // Validação mais robusta das credenciais
    if (credsExists && state.creds) {
      const isValidCreds = state.creds.me && state.creds.me.id &&
        state.creds.signedIdentityKey &&
        state.creds.signedPreKey;

      if (!isValidCreds) {
        console.warn(`[${name}] ⚠️ Credenciais corrompidas. Limpando sessão...`);
        await cleanupSession(name);
        throw new Error('Sessão inválida apagada. Recrie a instância.');
      }
    }

    const { version } = await fetchLatestBaileysVersion();
    const { map: store, save } = await db.loadStore(name);
    let record = (await db.loadRecords()).find(r => r.name === name);
    if (!record) {
      record = { name, webhook: DEFAULT_WEBHOOK, apiKey: '' };
      await db.saveRecord(record);
    }

    // Configuração mais robusta do socket
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'debug' }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'debug' }))
      },
      browser: ['BotAdmin', 'Chrome', '120.0.0'],
      connectTimeoutMs: 120000,
      defaultQueryTimeoutMs: 120000,
      keepAliveIntervalMs: 60000,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      printQRInTerminal: true,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: true,
      patchMessageBeforeSending: (message) => {
        // Patch para melhor compatibilidade
        if (message.deviceSentMessage) {
          message.deviceSentMessage.destinationJid = message.deviceSentMessage.destinationJid || '';
        }
        return message;
      },
      // Adicionando tratamento para erros de stream
      getMessage: async (key) => {
        try {
          const msg = await store.loadMessage(key.remoteJid, key.id);
          return msg?.message || null;
        } catch (err) {
          console.error(`[${name}] ❌ Erro ao obter mensagem:`, err.message);
          return null;
        }
      }
    });

    const session = {
      name,
      sock,
      store,
      write: save,
      qr: null,
      pairCode: null,
      status: 'connecting',
      number: number || null,
      webhook: record.webhook || DEFAULT_WEBHOOK,
      apiKey: record.apiKey || '',
      lastSeen: new Date(),
      connectionAttempts: 0,
      isReconnecting: false,
      qrTimeout: null
    };
    instances.set(name, session);

    const masterKey = process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU';

    async function dispatchWebhook(event, data) {
      const targetWebhook = session.webhook || DEFAULT_WEBHOOK;
      try {
        console.log(
          `[${name}] 📤 Enviando evento '${event}' para webhook: ${targetWebhook}`
        );

        const payload = {
          event,
          data,
          instance: name,
          server_url: basesiteUrl,
          apikey: session.apiKey || masterKey
        };

        const response = await axios.post(targetWebhook, payload, {
          headers: {
            apikey: masterKey,
            'Content-Type': 'application/json'
          },
          timeout: CONFIG.WEBHOOK_TIMEOUT
        });

        if (response.status === 200) {
          console.log(
            `[${name}] ✅ Evento '${event}' processado com sucesso pelo webhook`
          );
        } else {
          console.warn(
            `[${name}] ⚠️ Webhook retornou status ${response.status} para evento '${event}'`
          );
        }
      } catch (err) {
        console.error(
          `[${name}] ❌ Erro ao enviar evento '${event}' para webhook:`,
          err.message
        );

        if (err.response) {
          console.error(`[${name}] Status: ${err.response.status}, Data:`, err.response.data);
        } else if (err.code) {
          console.error(`[${name}] Código de erro: ${err.code}`);
        }
      }
    }

    sock.ev.on('creds.update', async () => {
      try {
        await fs.mkdir(authPath, { recursive: true });
        await saveCreds();
      } catch (err) {
        console.error(`[${name}] ❌ Erro ao salvar credenciais:`, err.message);
      }
    });

    sock.ev.on('messages.upsert', async m => {
      if (m.messages) {
        console.log(`[${name}] 📩 messages.upsert (${m.type}) ->`, m.messages.length);
        for (const msg of m.messages) {
          store.set(msg.key.id, msg);
          await dispatchWebhook('message.upsert', msg);
        }
        await save();
      }
    });

    sock.ev.on('messages.update', u => {
      console.log(`[${name}] 🔄 messages.update`, JSON.stringify(u, null, 2));
      dispatchWebhook('messages.update', u).catch(() => { });
    });
    sock.ev.on('messages.delete', del => {
      console.log(`[${name}] ❌ messages.delete`, JSON.stringify(del, null, 2));
      dispatchWebhook('messages.delete', del).catch(() => { });
    });
    sock.ev.on('chats.upsert', up => {
      console.log(`[${name}] 💬 chats.upsert`, JSON.stringify(up, null, 2));
      dispatchWebhook('chats.upsert', up).catch(() => { });
    });
    sock.ev.on('chats.update', up => {
      console.log(`[${name}] ✏️ chats.update`, JSON.stringify(up, null, 2));
      dispatchWebhook('chats.update', up).catch(() => { });
    });
    sock.ev.on('contacts.upsert', up => {
      console.log(`[${name}] 👥 contacts.upsert`, JSON.stringify(up, null, 2));
      dispatchWebhook('contacts.upsert', up).catch(() => { });
    });
    sock.ev.on('presence.update', up => {
      console.log(`[${name}] 👤 presence.update`, JSON.stringify(up, null, 2));
      dispatchWebhook('presence.update', up).catch(() => { });
    });
    sock.ev.on('call', call => {
      console.log(`[${name}] 📞 call`, JSON.stringify(call, null, 2));
      dispatchWebhook('call', call).catch(() => { });
    });

    // Debouncing para eventos de conexão - evitar múltiplos eventos simultâneos
    let connectionUpdateTimeout = null;
    
    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr, pairingCode, isNewLogin } = update;

      // Debouncing - evitar processamento de múltiplos eventos muito rápidos
      if (connectionUpdateTimeout) {
        clearTimeout(connectionUpdateTimeout);
      }

      connectionUpdateTimeout = setTimeout(async () => {
        try {
          await processConnectionUpdate(update);
        } catch (err) {
          console.error(`[${name}] ❌ Erro ao processar connection.update:`, err.message);
        }
      }, 500); // 500ms de debounce
    });

    // Função separada para processar atualizações de conexão
    async function processConnectionUpdate(update) {
      const { connection, lastDisconnect, qr, pairingCode, isNewLogin } = update;

      // Verificar se a instância ainda existe e não está sendo encerrada
      if (!instances.has(name) || isShuttingDown) {
        console.log(`[${name}] ⚠️ Instância não existe ou está sendo encerrada - ignorando connection.update`);
        return;
      }

      if (qr) {
        session.qr = qr;
        console.log(`\n[${name}] 📱 QR Code gerado - Escaneie com seu WhatsApp:`);
        console.log('━'.repeat(50));

        // Exibir QR Code no terminal
        QRCode.generate(qr, { small: true }, (qrString) => {
          console.log(qrString);
        });

        console.log('━'.repeat(50));
        console.log(`[${name}] ⏰ QR Code expira em 2 minutos`);
        console.log(`[${name}] 📱 Abra o WhatsApp > Dispositivos conectados > Conectar dispositivo`);

        // Limpar timeout anterior se existir
        if (session.qrTimeout) {
          clearTimeout(session.qrTimeout);
        }

        // QR timeout - NÃO regenerar automaticamente para evitar loops
        session.qrTimeout = setTimeout(() => {
          console.log(`[${name}] ⏰ QR Code expirado`);
          session.qr = null;
          if (session.qrTimeout) {
            clearTimeout(session.qrTimeout);
            session.qrTimeout = null;
          }
          console.log(`[${name}] 💡 Para gerar novo QR, reinicie a instância manualmente`);
        }, CONFIG.QR_TIMEOUT);
      }

      if (pairingCode) {
        session.pairCode = formatPairCode(pairingCode);
        console.log(`\n[${name}] 🔑 Código de pareamento: ${session.pairCode}`);
        console.log(`[${name}] 📱 Digite este código no seu WhatsApp`);
      }

      // Enviar webhook de forma assíncrona sem bloquear
      dispatchWebhook('connection.update', update).catch(() => { });

      if (connection === 'open') {
        session.status = 'open';
        session.qr = null;
        session.pairCode = null;
        session.lastSeen = new Date();
        session.connectionAttempts = 0;
        session.isReconnecting = false;

        // Limpar timeout do QR
        if (session.qrTimeout) {
          clearTimeout(session.qrTimeout);
          session.qrTimeout = null;
        }

        // Reset contador de reconexão
        connectionManager.resetReconnectAttempts(name);

        try {
          await fs.mkdir(authPath, { recursive: true });
          await saveCreds();
          console.log(`[${name}] 💾 Credenciais salvas`);
        } catch (err) {
          console.error(`[${name}] ❌ Erro ao salvar credenciais:`, err.message);
        }

        await save();

        if (!session.number && sock.user?.id) {
          session.number = sock.user.id.split(':')[0];
          await db.updateRecord(name, { number: session.number });
          console.log(`[${name}] 📞 Número registrado: ${session.number}`);
        }

        console.log(`\n🎉 [${name}] ✅ CONEXÃO ESTABELECIDA COM SUCESSO! 🎉`);
        console.log(`[${name}] 👤 Usuário: ${sock.user?.name || 'N/A'}`);
        console.log(`[${name}] 📱 Número: ${session.number || 'N/A'}`);

        if (isNewLogin) {
          console.log(`[${name}] 🆕 Novo login detectado`);
        }

      } else if (connection === 'close') {
        session.status = 'close';
        session.isReconnecting = true;

        // Limpar timeout do QR
        if (session.qrTimeout) {
          clearTimeout(session.qrTimeout);
          session.qrTimeout = null;
        }

        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Desconhecido';

        console.log(`[${name}] ❌ Conexão encerrada - Código: ${code}, Motivo: ${reason}`);

        // Verificar se pode reconectar usando o connectionManager melhorado
        if (!connectionManager.canReconnect(name)) {
          console.log(`[${name}] ⏹️ Reconexão bloqueada pelo rate limiting ou estado atual`);
          return;
        }

        // Casos onde não devemos reconectar
        if (code === DisconnectReason.loggedOut) {
          console.log(`[${name}] 🚪 Logout detectado - limpando sessão`);
          await cleanupSession(name);
          return;
        }

        if (code === DisconnectReason.multideviceMismatch) {
          console.log(`[${name}] 📱 Incompatibilidade multi-device - limpando`);
          await cleanupSession(name);
          return;
        }

        // badSession - limpar sessão ao invés de reconectar
        if (code === DisconnectReason.badSession) {
          console.log(`[${name}] 💥 Sessão corrompida - limpando para evitar loops`);
          await cleanupSession(name);
          return;
        }

        // Stream Error (515) - usar connectionManager para controle
        if (code === 515 && reason.includes('restart required')) {
          console.log(`[${name}] 🔄 Stream Error detectado - usando reconexão controlada`);

          if (connectionManager.shouldReconnect(lastDisconnect, name)) {
            const reconnectFunction = async () => {
              console.log(`[${name}] 🚀 Reiniciando após Stream Error...`);
              await startInstance(name, usePairingCode, session.number);
            };

            await connectionManager.handleReconnection(name, reconnectFunction);
          }
          return;
        }

        // QR timeout (408) - NÃO reconectar automaticamente
        if (code === 408 && reason.includes('QR refs attempts ended')) {
          console.log(`[${name}] ⏰ QR Code expirou - não reconectando automaticamente`);
          session.isReconnecting = false;
          return;
        }

        // Verificar se devemos reconectar para outros casos
        if (connectionManager.shouldReconnect(lastDisconnect, name)) {
          const reconnectFunction = async () => {
            console.log(`[${name}] 🔄 Tentando reconectar...`);
            await startInstance(name, usePairingCode, session.number);
          };

          await connectionManager.handleReconnection(name, reconnectFunction);
        } else {
          console.log(`[${name}] ⏹️ Reconexão não recomendada para este tipo de desconexão`);
          session.isReconnecting = false;
        }

      } else if (connection === 'connecting') {
        // Verificar se não estamos em loop de conexão
        const currentState = connectionManager.getConnectionState(name);
        if (currentState === 'connecting' || currentState === 'reconnecting') {
          console.log(`[${name}] ⚠️ Já está conectando - ignorando evento duplicado`);
          return;
        }

        session.status = 'connecting';
        session.connectionAttempts++;
        console.log(`[${name}] 🔄 Conectando... (tentativa ${session.connectionAttempts})`);
        
        // Timeout para conexão - evitar ficar conectando indefinidamente
        setTimeout(() => {
          if (session.status === 'connecting' && session.connectionAttempts > 5) {
            console.log(`[${name}] ⏰ Timeout na conexão - parando tentativas`);
            session.isReconnecting = false;
          }
        }, CONFIG.CONNECTION_TIMEOUT);
      }
    }

    // Solicitar código de pareamento com retry
    if (usePairingCode && !state.creds.registered) {
      try {
        console.log(`[${name}] 🔑 Solicitando código de pareamento para ${number}...`);

        const code = await retryHandler.retryPairingCode(
          async (num) => await sock.requestPairingCode(num),
          number,
          { maxAttempts: 3, baseDelay: 2000 }
        );

        session.pairCode = formatPairCode(code);
        if (number) {
          session.number = number;
          await db.updateRecord(name, { number });
        }

        console.log(`[${name}] ✅ Código de pareamento gerado: ${session.pairCode}`);
      } catch (err) {
        console.error(`[${name}] ❌ Erro ao solicitar pairing code:`, err.message);
        throw new Error(`Falha ao gerar código de pareamento: ${err.message}`);
      }
    }

    return session;

  } catch (error) {
    console.error(`[${name}] ❌ Erro ao iniciar instância:`, error.message);

    // Cleanup em caso de erro
    if (instances.has(name)) {
      const session = instances.get(name);
      if (session?.sock) {
        try {
          session.sock.end();
        } catch (e) {
          console.warn(`[${name}] ⚠️ Erro ao fechar socket:`, e.message);
        }
      }
      instances.delete(name);
    }

    throw error;
  }
}

// Função auxiliar para limpeza de sessão
async function cleanupSession(name) {
  try {
    console.log(`[${name}] 🧹 Limpando sessão...`);

    const session = instances.get(name);
    if (session?.sock) {
      try {
        session.sock.end();
      } catch (e) {
        console.warn(`[${name}] ⚠️ Erro ao fechar socket:`, e.message);
      }
    }

    await db.deleteSessionData(name);
    await db.deleteStore(name);
    instances.delete(name);
    await db.deleteRecord(name);

    console.log(`[${name}] ✅ Sessão limpa com sucesso`);
  } catch (err) {
    console.error(`[${name}] ❌ Erro ao limpar sessão:`, err.message);
  }
}

async function createInstance(name, webhook, apiKey, force = false) {
  if (!name) throw new Error('name required');
  const existing = await db.loadRecords();
  if (existing.some(r => r.name === name)) {
    if (!force) throw new Error('instance exists');
  }
  await db.saveRecord({ name, webhook: webhook || DEFAULT_WEBHOOK, apiKey: apiKey || '' });
  return startInstance(name);
}

async function updateInstance(name, data) {
  const record = await getRecord(name);
  if (record) {
    await db.updateRecord(name, data);
  } else {
    await db.saveRecord({ name, ...data });
  }
  const session = instances.get(name);
  if (session) {
    if (data.webhook !== undefined) session.webhook = data.webhook;
    if (data.apiKey !== undefined) session.apiKey = data.apiKey;
  }
  return session;
}

async function deleteInstance(name) {
  const session = instances.get(name);
  if (session) {
    session.sock.end();
    instances.delete(name);
  }
  await db.deleteStore(name);
  await db.deleteSessionData(name);
  await db.deleteRecord(name);
}

async function restartInstance(name, usePairingCode = false, number) {
  const session = instances.get(name);
  if (session) session.sock.end();
  return startInstance(name, usePairingCode, number);
}

function getInstance(name) {
  return instances.get(name)?.sock || null;
}

function getSession(name) {
  return instances.get(name) || null;
}

function getInstanceStatus(name) {
  return instances.get(name)?.status || 'closed';
}

function getInstanceQR(name) {
  return instances.get(name)?.qr || null;
}

function getPairCode(name) {
  return instances.get(name)?.pairCode || null;
}

async function requestPairCode(name, number) {
  const session = instances.get(name);
  if (!session) throw new Error('Instância não encontrada');

  if (!number || !/^\d+$/.test(number)) {
    throw new Error('Número inválido fornecido');
  }

  try {
    console.log(`[${name}] 🔑 Solicitando novo código de pareamento para ${number}...`);

    const code = await retryHandler.retryPairingCode(
      async (num) => await session.sock.requestPairingCode(num),
      number,
      { maxAttempts: 3, baseDelay: 2000 }
    );

    session.pairCode = formatPairCode(code);
    if (number) {
      session.number = number;
      await db.updateRecord(name, { number });
    }

    console.log(`[${name}] ✅ Novo código gerado: ${session.pairCode}`);
    return session.pairCode;
  } catch (err) {
    console.error(`[${name}] ❌ Erro ao solicitar código:`, err.message);
    throw new Error(`Falha ao gerar código de pareamento: ${err.message}`);
  }
}

async function listInstances() {
  const records = await db.loadRecords();
  return records.map(r => ({
    name: r.name,
    webhook: r.webhook,
    number: r.number || null,
    status: getInstanceStatus(r.name),
    connected: getInstanceStatus(r.name) === 'open'
  }));
}

async function getRecord(name) {
  const records = await db.loadRecords();
  return records.find(r => r.name === name) || null;
}

async function restoreInstances() {
  const records = await db.loadRecords();
  for (const r of records) {
    if (instances.has(r.name)) continue;
    try {
      await startInstance(r.name);
    } catch (err) {
      console.error(`failed to restore ${r.name}:`, err.message);
    }
  }
}

async function syncRegisteredInstances() {
  const base = basesiteUrl.replace(/\/+$/, '');
  try {
    const res = await axios.get(
      `${base}/webhook/instances?baseUrl=${encodeURIComponent(base)}`,
      { headers: { apikey: process.env.MASTER_APIKEY || 'AIAO1897AHJAKACMC817ADOU' } }
    );
    const apis = Array.isArray(res.data) ? res.data : [];
    const records = await db.loadRecords();
    for (const api of apis) {
      const record = records.find(r => r.name === api.instance);
      if (!record) {
        try {
          await createInstance(api.instance, api.webhook, api.globalapikey);
        } catch (err) {
          console.error(`failed to create ${api.instance}:`, err.message);
        }
      } else if (!instances.has(api.instance)) {
        try {
          await startInstance(api.instance);
        } catch (err) {
          console.error(`failed to start ${api.instance}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('failed to sync instances:', err.message);
  }
}

// Função para shutdown graceful de todas as instâncias
async function shutdownAllInstances() {
  console.log('🛑 Iniciando shutdown graceful de todas as instâncias...');
  isShuttingDown = true;

  const shutdownPromises = [];

  for (const [name, session] of instances) {
    shutdownPromises.push(
      (async () => {
        try {
          console.log(`[${name}] 🔄 Encerrando instância...`);

          // Limpar timeouts
          if (session.qrTimeout) {
            clearTimeout(session.qrTimeout);
            session.qrTimeout = null;
          }

          // Fechar socket
          if (session.sock) {
            try {
              await session.sock.end();
              console.log(`[${name}] ✅ Socket fechado`);
            } catch (err) {
              console.warn(`[${name}] ⚠️ Erro ao fechar socket:`, err.message);
            }
          }

          // Salvar dados finais
          if (session.write) {
            try {
              await session.write();
              console.log(`[${name}] 💾 Dados salvos`);
            } catch (err) {
              console.warn(`[${name}] ⚠️ Erro ao salvar dados:`, err.message);
            }
          }

        } catch (err) {
          console.error(`[${name}] ❌ Erro durante shutdown:`, err.message);
        }
      })()
    );
  }

  // Aguardar todas as instâncias fecharem (com timeout)
  try {
    await Promise.race([
      Promise.all(shutdownPromises),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout no shutdown')), 10000)
      )
    ]);
    console.log('✅ Todas as instâncias foram encerradas com sucesso');
  } catch (err) {
    console.warn('⚠️ Timeout no shutdown, forçando encerramento:', err.message);
  }

  // Limpar mapa de instâncias
  instances.clear();
  console.log('🏁 Shutdown graceful concluído');
}

// Função para verificar se está em processo de shutdown
function isShuttingDownProcess() {
  return isShuttingDown;
}

// Função para obter estatísticas das instâncias
function getInstancesStats() {
  const stats = {
    total: instances.size,
    connected: 0,
    connecting: 0,
    closed: 0,
    reconnecting: 0
  };

  for (const [name, session] of instances) {
    switch (session.status) {
      case 'open':
        stats.connected++;
        break;
      case 'connecting':
        stats.connecting++;
        break;
      case 'close':
        stats.closed++;
        break;
      default:
        if (session.isReconnecting) {
          stats.reconnecting++;
        }
    }
  }

  return stats;
}

module.exports = {
  startInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  restartInstance,
  listInstances,
  getRecord,
  getInstance,
  getInstanceStatus,
  getInstanceQR,
  getPairCode,
  requestPairCode,
  restoreInstances,
  syncRegisteredInstances,
  getSession,
  shutdownAllInstances,
  isShuttingDownProcess,
  getInstancesStats
};
