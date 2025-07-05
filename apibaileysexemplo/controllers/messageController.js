const P = require("pino");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { getInstance, getSession } = require('../sessions/sessionManager');
const { log } = require('../utils/logger');
const connectionManager = require('../utils/connectionManager');
const retryHandler = require('../utils/retryHandler');

async function ensureConnected(sock, instanceName = 'unknown') {
  if (!sock) {
    const err = new Error('Socket não encontrado');
    err.status = 404;
    throw err;
  }

  try {
    // Verificar saúde da conexão
    const health = connectionManager.getConnectionHealth(sock);

    if (health === 'healthy') {
      return true;
    }

    if (health === 'connecting') {
      console.log(`[${instanceName}] ⏳ Aguardando conexão...`);
      await connectionManager.waitForConnection(sock, 15000);
      return true;
    }

    if (health === 'disconnected' || health === 'error') {
      const err = new Error('Instância desconectada');
      err.status = 503;
      throw err;
    }

    // Fallback: tentar waitForSocketOpen se disponível
    if (typeof sock.waitForSocketOpen === 'function') {
      await sock.waitForSocketOpen();
    }

    return true;
  } catch (error) {
    console.error(`[${instanceName}] ❌ Erro na verificação de conexão:`, error.message);
    const err = new Error('Falha na conexão - tente novamente');
    err.status = 503;
    throw err;
  }
}

async function validateMessageData(data) {
  const { instance, number, message } = data;

  if (!instance) {
    throw new Error('Parâmetro "instance" é obrigatório');
  }

  if (!number) {
    throw new Error('Parâmetro "number" é obrigatório');
  }

  if (!message && !data.media) {
    throw new Error('Parâmetro "message" ou "media" é obrigatório');
  }

  // Validar formato do número
  if (!/^\d+$/.test(number.replace(/\D/g, ''))) {
    throw new Error('Número de telefone inválido');
  }

  return true;
}

function buildQuoted(jid, quotedId) {
  if (!quotedId) return undefined;
  return {
    key: { remoteJid: jid, id: quotedId },
    message: { conversation: '' }
  };
}

async function sendMessage(req, res) {
  try {
    const { instance, number, message, ghost = false, quotedId } = req.body;

    // Validar dados de entrada
    await validateMessageData({ instance, number, message });

    const session = getInstance(instance);
    if (!session) {
      return res.status(404).json({ error: 'Instância não encontrada' });
    }

    // Enviar mensagem com retry
    const result = await retryHandler.retryMessageSend(async () => {
      await ensureConnected(session, instance);

      log(`[sendMessage] ${instance} -> ${number}`);
      const jid = `${number}@s.whatsapp.net`;

      const messageContent = {
        text: message,
        contextInfo: ghost ? { mentionedJid: [jid] } : {}
      };

      const options = quotedId ? { quoted: buildQuoted(jid, quotedId) } : {};

      return await session.sendMessage(jid, messageContent, options);
    }, { maxAttempts: 2, baseDelay: 1000 });

    log(`[sendMessage] ✅ Mensagem enviada: ${instance} -> ${number}`);
    res.json({
      status: 'success',
      message: 'Mensagem enviada com sucesso',
      data: result
    });

  } catch (e) {
    log(`[sendMessage] ❌ Erro: ${e.message}`);
    const status = e.status || 500;
    res.status(status).json({
      error: e.message,
      status: 'error'
    });
  }
}

async function sendMedia(req, res) {
  try {
    const { instance, number, caption = '', media, mimetype, ghost = false, quotedId } = req.body;

    // Validações
    if (!media || !mimetype) {
      return res.status(400).json({ error: 'Parâmetros "media" e "mimetype" são obrigatórios' });
    }

    await validateMessageData({ instance, number, media });

    const session = getInstance(instance);
    if (!session) {
      return res.status(404).json({ error: 'Instância não encontrada' });
    }

    // Enviar mídia com retry
    const result = await retryHandler.retryMessageSend(async () => {
      await ensureConnected(session, instance);

      log(`[sendMedia] ${instance} -> ${number} (${mimetype})`);

      let buffer;
      try {
        buffer = Buffer.from(media, 'base64');
      } catch (err) {
        throw new Error('Formato de mídia inválido - deve ser base64');
      }

      if (buffer.length === 0) {
        throw new Error('Arquivo de mídia vazio');
      }

      // Verificar tamanho do arquivo (limite de 64MB)
      if (buffer.length > 64 * 1024 * 1024) {
        throw new Error('Arquivo muito grande - máximo 64MB');
      }

      const jid = `${number}@s.whatsapp.net`;
      const type = mimetype.startsWith('image/')
        ? 'image'
        : mimetype.startsWith('video/')
          ? 'video'
          : mimetype.startsWith('audio/')
            ? 'audio'
            : 'document';

      const content = {
        [type]: buffer,
        mimetype,
        caption,
        contextInfo: ghost ? { mentionedJid: [jid] } : {}
      };

      const options = quotedId ? { quoted: buildQuoted(jid, quotedId) } : {};

      return await session.sendMessage(jid, content, options);
    }, { maxAttempts: 2, baseDelay: 2000 });

    log(`[sendMedia] ✅ Mídia enviada: ${instance} -> ${number}`);
    res.json({
      status: 'success',
      message: 'Mídia enviada com sucesso',
      data: result
    });

  } catch (e) {
    log(`[sendMedia] ❌ Erro: ${e.message}`);
    const status = e.status || 500;
    res.status(status).json({
      error: e.message,
      status: 'error'
    });
  }
}

async function deleteMessage(req, res) {
  const { instance, number, messageId } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await ensureConnected(session);
    log(`[deleteMessage] ${instance} -> ${number} ${messageId}`);
    const jid = `${number}@s.whatsapp.net`;
    await session.sendMessage(jid, {
      delete: { remoteJid: jid, fromMe: true, id: messageId }
    });
    res.json({ status: 'deleted' });
  } catch (e) {
    log(`[deleteMessage] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function sendPoll(req, res) {
  try {
    const { instance, number, question, options = [], multiple = false } = req.body;

    // Validações específicas para enquete
    if (!question) {
      return res.status(400).json({ error: 'Parâmetro "question" é obrigatório' });
    }

    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Pelo menos 2 opções são necessárias' });
    }

    if (options.length > 12) {
      return res.status(400).json({ error: 'Máximo de 12 opções permitidas' });
    }

    await validateMessageData({ instance, number, message: question });

    const session = getSession(instance);
    if (!session) {
      return res.status(404).json({ error: 'Instância não encontrada' });
    }

    // Enviar enquete com retry
    const result = await retryHandler.retryMessageSend(async () => {
      await ensureConnected(session.sock, instance);

      const jid = `${number}@s.whatsapp.net`;
      log(`[sendPoll] ${instance} -> ${number}`);

      const sent = await session.sock.sendMessage(jid, {
        poll: {
          name: question,
          values: options,
          selectableCount: multiple ? options.length : 1
        }
      });

      // Tentar carregar mensagem completa
      let stored = sent;
      if (typeof session.sock.loadMessage === 'function') {
        try {
          const full = await session.sock.loadMessage(jid, sent.key.id);
          if (full) stored = full;
        } catch (err) {
          log(`[sendPoll] loadMessage failed: ${err.message}`);
        }
      }

      // Salvar no store
      if (session.store && session.store.messages) {
        session.store.messages.insert(jid, [stored]);
      }

      if (session.write) await session.write();

      return sent;
    }, { maxAttempts: 2, baseDelay: 1500 });

    log(`[sendPoll] ✅ Enquete enviada: ${instance} -> ${number}`);
    res.json({
      status: 'success',
      message: 'Enquete enviada com sucesso',
      data: result
    });

  } catch (e) {
    log(`[sendPoll] ❌ Erro: ${e.message}`);
    const status = e.status || 500;
    res.status(status).json({
      error: e.message,
      status: 'error'
    });
  }
}

// export at bottom

async function sendReaction(req, res) {
  const { instance, key, reaction } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await ensureConnected(session);
    await session.sendMessage(key.remoteJid, { react: { text: reaction, key } });
    res.json({ status: 'ok' });
  } catch (e) {
    log(`[sendReaction] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function editMessage(req, res) {
  const { instance, chatId, messageId, text } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await ensureConnected(session);
    await session.sendMessage(chatId, { text, edit: messageId });
    res.json({ status: 'edited' });
  } catch (e) {
    log(`[editMessage] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function forwardWithMention(req, res) {
  const { instance, number, messageId, newCaption = '' } = req.body;
  const session = getSession(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await ensureConnected(session.sock);
    const jid = `${number}@s.whatsapp.net`;
    const msg = await session.store.loadMessage(jid, messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const participants = session.store.chats.get(jid)?.participants?.map(p => p.id) || [];
    await session.sock.sendMessage(jid, { forward: msg, text: newCaption, mentions: participants });
    res.json({ status: 'forwarded' });
  } catch (e) {
    log(`[forwardWithMention] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function convertQuotedToSticker(req, res) {
  const { instance, remoteJid, quotedId, messageId } = req.body;
  const session = getSession(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await ensureConnected(session.sock);
    const id = quotedId || messageId;
    const msg = await session.store.loadMessage(remoteJid, id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: P({ level: 'error' }), reuploadRequest: session.sock.updateMediaMessage });
    await session.sock.sendMessage(remoteJid, { sticker: buffer }, { quoted: msg });
    res.json({ status: 'sticker sent' });
  } catch (e) {
    log(`[convertQuotedToSticker] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function downloadMedia(req, res) {
  const { instance, remoteJid, messageId } = req.body;
  const session = getSession(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await ensureConnected(session.sock);
    const msg = await session.store.loadMessage(remoteJid, messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: P({ level: 'error' }), reuploadRequest: session.sock.updateMediaMessage });
    res.json({ data: buffer.toString('base64') });
  } catch (e) {
    log(`[downloadMedia] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function sendStickerFromUrl(req, res) {
  const { instance, number, url, quotedId } = req.body;
  const session = getInstance(instance);
  if (!session) return res.status(404).json({ error: 'Instance not found' });
  try {
    await ensureConnected(session);
    const jid = `${number}@s.whatsapp.net`;
    await session.sendMessage(jid, { sticker: { url } }, { quoted: buildQuoted(jid, quotedId) });
    res.json({ status: 'sticker sent' });
  } catch (e) {
    log(`[sendStickerFromUrl] error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function pinQuoted(req, res) {
  res.status(501).json({ error: 'not implemented' });
}

async function unpin(req, res) {
  res.status(501).json({ error: 'not implemented' });
}

module.exports = {
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
};
