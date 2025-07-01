const fs = require('fs-extra');
const bcrypt = require('bcryptjs');  // Importando bcrypt
const axios = require('axios');
const crypto = require('crypto');  // Importando crypto para gerar código de verificação

const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'.split('');

// Função para criptografar a senha com bcrypt
const getHashedPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);  // Gera o salt (sal)
    const hash = await bcrypt.hash(password, salt);  // Criptografa a senha com o salt
    return hash;
}

// Função para gerar o token de autenticação
const generateAuthToken = () => {
    return crypto.randomBytes(30).toString('hex');
}

// Função para gerar um código de verificação de 6 dígitos
function gerarCodigoVerificacao() {
    return crypto.randomInt(100000, 999999).toString();  // Gera um código aleatório de 6 dígitos
}

// Função para gerar um texto aleatório de determinado comprimento
function randomText(len) {
    const result = [];
    for (let i = 0; i < len; i++) result.push(pool[Math.floor(Math.random() * pool.length)]);
    return result.join('');
}

const { SiteConfig } = require('../db/siteConfig');

function buildConfigFields(config) {
    return {
        baseUrl: (config.messageBaseUrl || 'https://wzap.assinazap.shop').replace(/\/+$/, ''),
        apiKey: config.messageApiKey || 'A762E6A59827-4C78-8162-3056A928430C',
        instance: config.messageInstance || '5592991129258',
        numero: config.whatsappNumber || '559295333643'
    };
}

// Função para enviar texto via WhatsApp usando as configurações do site
async function enviarTextoSite(texto, numero = null) {
    const config = (await SiteConfig.findOne()) || {};
    const { baseUrl, apiKey, instance, numero: numPadrao } = buildConfigFields(config);
    const url = `${baseUrl}/message/sendText/${instance}`;
    const headers = { 'Content-Type': 'application/json', apikey: apiKey };
    const data = { number: numero || numPadrao, text: texto };
    try {
        await axios.post(url, data, { headers });
    } catch (error) {
        console.error('Erro ao enviar texto via WhatsApp:', error.message);
    }
}

// Função para enviar texto via Telegram
async function enviarTelegramSite(texto) {
    const config = (await SiteConfig.findOne()) || {};
    if (!config.telegramNotify) return;
    const token = config.telegramToken || '';
    const chatId = config.telegramChatId || '';
    if (!token || !chatId) return;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await axios.post(url, { chat_id: chatId, text: texto });
    } catch (error) {
        console.error('Erro ao enviar texto via Telegram:', error.message);
    }
}

// Função para enviar texto ou mídia para o canal do Telegram com botões opcionais
async function enviarTelegramChannel(texto, buttons = [], media = null) {
    const config = (await SiteConfig.findOne()) || {};
    const token = config.telegramToken || '';
    const channelId = config.telegramChannelId || '';
    if (!token || !channelId) return;

    const baseUrl = `https://api.telegram.org/bot${token}`;
    const hasMedia = media && media.url && media.type;

    const payload = { chat_id: channelId, parse_mode: 'HTML' };
    if (hasMedia) {
        payload.caption = texto;
        payload[media.type === 'video' ? 'video' : 'photo'] = media.url;
    } else {
        payload.text = texto;
    }
    if (Array.isArray(buttons) && buttons.length) {
        payload.reply_markup = { inline_keyboard: [buttons] };
    }

    const method = hasMedia ? (media.type === 'video' ? 'sendVideo' : 'sendPhoto') : 'sendMessage';

    try {
        await axios.post(`${baseUrl}/${method}`, payload);
    } catch (error) {
        console.error('Erro ao enviar texto para canal Telegram:', error.message);
    }
}

// Função para enviar o código de verificação via WhatsApp
async function enviarCodigoWhatsapp(numero, codigo) {
    await enviarTextoSite(`Seu código de verificação é: \n\n${codigo}\n\npara concluir seu cadastro no site Bot Admin`, numero);
}

// Função para ler arquivos TXT
function readFileTxt(file) {
    return new Promise((resolve, reject) => {
        const data = fs.readFileSync(file, 'utf8');
        const array = data.toString().split('\n');
        const random = array[Math.floor(Math.random() * array.length)];
        resolve(random.replace('\r', ''));
    })
}

// Função para ler arquivos JSON
function readFileJson(file) {
    return new Promise((resolve, reject) => {
        const jsonData = JSON.parse(fs.readFileSync(file));
        const index = Math.floor(Math.random() * jsonData.length);
        const random = jsonData[index];
        resolve(random);
    })
}

module.exports = {
    readFileTxt,
    readFileJson,
    getHashedPassword,
    generateAuthToken,
    randomText,
    gerarCodigoVerificacao,
    enviarCodigoWhatsapp,
    enviarTextoSite,
    enviarTelegramSite,
    enviarTelegramChannel
};
