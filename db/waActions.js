// waActions.js -- HTTP-based WhatsApp API client
// This module replaces the former evolution.js and communicates
// with external WhatsApp APIs via HTTP requests.

const axios = require('axios');

function sanitizeBase(url) {
  return (url || '').replace(/\/+$/, '');
}

function headers(apiKey, instanceKey = apiKey) {
  const h = { 'x-api-key': apiKey };
  if (instanceKey) h['x-instance-key'] = instanceKey;
  return h;
}

async function sendText(serverUrl, apiKey, instance, number, text, quoted = null, mentionAll = false, mentionIds = []) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, number, message: text };
  if (quoted) payload.quotedId = typeof quoted === 'string' ? quoted : quoted.key?.id;
  if (mentionAll) payload.mentionAll = true;
  if (mentionIds) {
    const arr = Array.isArray(mentionIds) ? mentionIds : [mentionIds];
    if (arr.length) payload.mentionIds = arr;
  }
  const { data } = await axios.post(`${base}/api/message`, payload, { headers: headers(apiKey) });
  return data?.messageId || data?.id || null;
}

async function sendMedia(serverUrl, apiKey, instance, number, mediatype, mimetype, caption, media, fileName, quoted = null, mentionAll = false, mentionIds = []) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, number, mimetype, media, caption, fileName };
  if (quoted) payload.quotedId = typeof quoted === 'string' ? quoted : quoted.key?.id;
  if (mentionAll) payload.mentionAll = true;
  if (mentionIds) {
    const arr = Array.isArray(mentionIds) ? mentionIds : [mentionIds];
    if (arr.length) payload.mentionIds = arr;
  }
  if (mediatype) payload.mediatype = mediatype;
  const { data } = await axios.post(`${base}/api/message/media`, payload, { headers: headers(apiKey) });
  return data?.messageId || data?.id || null;
}

async function sendReaction(serverUrl, apiKey, instance, key, reaction) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, key, reaction };
  await axios.post(`${base}/api/message/sendReaction`, payload, { headers: headers(apiKey) });
}

async function sendPoll(serverUrl, apiKey, instance, number, question, options, allowsMultipleAnswers = false, mentionAll = false) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, number, question, options, multiple: allowsMultipleAnswers, mentionAll };
  const { data } = await axios.post(`${base}/api/message/poll`, payload, { headers: headers(apiKey) });
  return data?.messageId || data?.id || null;
}

// Mark a message as read. The API expects an array of objects
// with the chat id under the `remoteJid` property.
async function markMessageAsRead(serverUrl, apiKey, instance, chatId) {
  const base = sanitizeBase(serverUrl);
  const payload = { readMessages: [{ remoteJid: chatId }] };
  await axios.post(
    `${base}/chat/markMessageAsRead/${instance}`,
    payload,
    { headers: headers(apiKey) }
  );
}

// Delete a message for everyone using the remote WhatsApp API
async function deleteMessageForEveryone(serverUrl, apiKey, instance, messageId, chatId) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, number: chatId, messageId };
  await axios.post(`${base}/api/message/delete`, payload, { headers: headers(apiKey) });
}

async function editText(serverUrl, apiKey, instance, chatId, messageId, text) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, chatId, messageId, text };
  await axios.post(`${base}/api/message/edit`, payload, { headers: headers(apiKey) });
}

async function updateGroupParticipants(serverUrl, apiKey, instance, groupJid, participants, action) {
  const base = sanitizeBase(serverUrl);
  const url = `${base}/api/group/${groupJid}/${action}`;
  const payload = { instance, participants };
  await axios.post(url, payload, { headers: headers(apiKey) });
}

async function setMessagesAdminsOnly(serverUrl, apiKey, instance, groupJid, onlyAdmins) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, setting: onlyAdmins ? 'announcement' : 'not_announcement' };
  await axios.post(`${base}/api/group/${groupJid}/setting`, payload, { headers: headers(apiKey) });
}

// === IA Utilities ===
const fs = require('fs');
const FormData = require('form-data');

const GROQ_API_KEY = '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';

/* ───────────── GROQ CHAT & ÁUDIO -------------------------------------- */
async function getGroqReply(history, prompt, apiKey = GROQ_API_KEY) {
  try {
    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [{ role: 'system', content: prompt }, ...history],
        temperature: 1,
        max_tokens: 200
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    return data.choices?.[0]?.message?.content?.trim() || 'Sem resposta';
  } catch (err) {
    console.error('getGroqReply error:', err.message);
    return null;
  }
}

async function acceptGroupInvite(serverUrl, instance, inviteCode, apiKey) {
  const base = sanitizeBase(serverUrl);
  const url = `${base}/api/group/join`;
  const { data } = await axios.post(url, { instance, code: inviteCode }, { headers: headers(apiKey) });
  return data;
}

async function getGroupInviteInfo(serverUrl, instance, inviteCode, apiKey) {
  const base = sanitizeBase(serverUrl);
  const url = `${base}/api/group/invite/${inviteCode}?instance=${instance}`;
  const { data } = await axios.get(url, { headers: headers(apiKey) });
  return data;
}

async function findGroupInfos(serverUrl, instance, groupJid, apiKey) {
  const base = sanitizeBase(serverUrl);
  const url = `${base}/api/group/${groupJid}?instance=${instance}`;
  try {
    const { data } = await axios.get(url, { headers: headers(apiKey) });
    return data;
  } catch (err) {
    console.error('findGroupInfos error:', err.message);
    throw err;
  }
}

async function fixarMensagem(serverUrl, apiKey, instance, remoteJid, quotedId, duration) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, remoteJid, quotedId, duration };
  await axios.post(`${base}/api/message/pinQuoted`, payload, { headers: headers(apiKey) });
}

async function desfixarMensagem(serverUrl, apiKey, instance, remoteJid, quotedId) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, remoteJid, quotedId };
  await axios.post(`${base}/api/message/unpin`, payload, { headers: headers(apiKey) });
}

async function openGroupWindow(serverUrl, apiKey, instance, groupJid) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, id: groupJid };
  await axios.post(`${base}/api/group/${groupJid}/open`, payload, { headers: headers(apiKey) }).catch(() => {});
}

// Converte uma mensagem (própria ou citada) em figurinha
async function convertQuotedToSticker(serverUrl, apiKey, instance, remoteJid, opts) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, remoteJid };
  if (opts?.quotedId) payload.quotedId = opts.quotedId;
  if (opts?.messageId) payload.messageId = opts.messageId;
  const { data } = await axios.post(`${base}/api/message/convertQuotedToSticker`, payload, { headers: headers(apiKey) });
  return data;
}
async function forwardWithMentionAll(serverUrl, apiKey, instance, number, messageId, newCaption = '') {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, number, messageId };
  if (newCaption) payload.newCaption = newCaption;
  const { data } = await axios.post(`${base}/api/message/forwardWithMention`, payload, { headers: headers(apiKey) });
  return data;
}
async function downloadMedia(serverUrl, apiKey, instance, remoteJid, messageId) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, remoteJid, messageId };
  const { data } = await axios.post(`${base}/api/message/downloadMedia`, payload, { headers: headers(apiKey) });
  return data;
}

async function transcribeAudioGroq(filePath, apiKey = GROQ_API_KEY) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('model', 'whisper-large-v3');
  try {
    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      form,
      { headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` } }
    );
    return data.text?.trim() || '';
  } catch (err) {
    console.error('transcribeAudioGroq error:', err.message);
    return '';
  }
}

async function describeImageGroq(filePath, prompt = '', pushname = '', apiKey = GROQ_API_KEY) {
  try {
    const b64 = fs.readFileSync(filePath, { encoding: 'base64' });
    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        messages: [
          ...(prompt ? [{ role: 'system', content: prompt }] : []),
          {
            role: 'user',
            content: [
              { type: 'text', text: `Descreva essa imagem respondendo a mim ${pushname}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
            ]
          }
        ],
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 1,
        max_completion_tokens: 1024,
        top_p: 1,
        stream: false,
        stop: null
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    return data.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('describeImageGroq error:', err.message);
    return '';
  }
}

async function synthesizeGroqSpeech(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const { data } = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      { model: 'tts-1', input: text, voice: 'nova' },
      { headers: { Authorization: `Bearer ${apiKey}` }, responseType: 'arraybuffer' }
    );
    return data; // Buffer with MP3 data
  } catch (err) {
    console.error('synthesizeGroqSpeech error:', err.message);
    return null;
  }
}
async function synthesizegesseritTTS() { }
async function synthesizeGeminiTTS() { }
async function synthesizeElevenTTS() { }
// Envia um sticker a partir de uma URL
async function sendStickerFromUrl(serverUrl, apiKey, instance, number, url, quotedId) {
  const base = sanitizeBase(serverUrl);
  const payload = { instance, number, url };
  if (quotedId) payload.quotedId = quotedId;
  const { data } = await axios.post(`${base}/api/message/sendStickerFromUrl`, payload, { headers: headers(apiKey) });
  return data?.messageId || null;
}

module.exports = {
  sendText,
  sendMedia,
  sendReaction,
  sendPoll,
  markMessageAsRead,
  deleteMessageForEveryone,
  editText,
  updateGroupParticipants,
  setMessagesAdminsOnly,
  getGroqReply,
  acceptGroupInvite,
  getGroupInviteInfo,
  findGroupInfos,
  convertQuotedToSticker,
  forwardWithMentionAll,
  downloadMedia,
  fixarMensagem,
  desfixarMensagem,
  transcribeAudioGroq,
  describeImageGroq,
  synthesizeGroqSpeech,
  synthesizegesseritTTS,
  synthesizeGeminiTTS,
  synthesizeElevenTTS,
  openGroupWindow,
  sendStickerFromUrl
};
