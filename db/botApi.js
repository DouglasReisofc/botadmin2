const mongoose = require('mongoose');

const botApiSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true
    },  // Nome da API para fácil identificação

    baseUrl: {
        type: String,
        required: true
    },  // URL base da API

    webhook: {
        type: String,
        default: ''
    }, // Webhook para envio dos eventos da instância

    globalapikey: {
        type: String,
        required: true
    },  // Chave de API global, que controla funções globais da instância

    apikey: {
        type: String,
        required: true
    },  // Chave de API da instância, usada para autenticar a instância do bot

    instance: {
        type: String,
        required: true,  // Agora obrigatório, é o número do WhatsApp ou nome da instância
        unique: true
    },

    server: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Server',
        required: true
    },

    gruposlimite: {
        type: Number,
        default: 5
    },  // Limite de grupos por instância da API

    status: {
        type: Boolean,
        default: true
    },  // Status geral da API (ativa ou não)

    // 🔥 Dados da sessão WhatsApp vinculada
    sessionStatus: {
        type: String,
        enum: ['inicializando', 'conectado', 'desconectado', 'falha_auth'],
        default: 'desconectado'
    },

    pairingCode: {
        type: String,
        default: null
    },  // Código atual de pareamento (se houver)

    lastSeen: {
        type: Date,
        default: Date.now
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    },

    // 🔥 Identificação de quem é dono da sessão
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'usuarios',
        default: null // Se null → sessão global
    }

}, { versionKey: false });

module.exports.BotApi = mongoose.model('BotApi', botApiSchema);
