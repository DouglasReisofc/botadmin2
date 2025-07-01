const mongoose = require('mongoose');

// Subdocumento com o snapshot do plano contratado
const planoUsuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    preco: { type: Number, required: true },
    duracao: { type: Number, required: true },   // dias
    descricao: { type: String, default: '' },
    limiteGrupos: { type: Number, required: true },
    limiteInstancias: { type: Number, required: true },   // 0 = sem instância dedicada
    includedAds: { type: Number, default: 0 },
    includedShortLinks: { type: Number, default: 0 },
    isFree: { type: Boolean, default: false },
    allowedCommands: {
        antilink: Boolean,
        banextremo: Boolean,
        antilinkgp: Boolean,
        bangringos: Boolean,
        proibirnsfw: Boolean,
        soadm: Boolean,
        autoresposta: Boolean,
        autosticker: Boolean,
        autodownloader: Boolean,
        brincadeiras: Boolean,
        vozbotinterage: Boolean,
        moderacaocomia: Boolean,
        botinterage: Boolean,
        lerimagem: Boolean,
        bemvindo: Boolean
    }
}, { _id: false });

const usuarioSchema = new mongoose.Schema({
    // === Dados básicos ===
    nome: { type: String, required: true },
    senha: { type: String, required: true },
    apikey: { type: String, required: true },
    defaultKey: { type: String, required: true },
    limit: { type: Number, default: 10 },
    saldo: { type: Number, default: 0 },

    // Benefício antigo
    premium: { type: Date },

    // === Plano contratado ===
    planoContratado: {
        type: planoUsuarioSchema,
        default: null
    },
    planoVencimento: { type: Date },

    // === Teste grátis ===
    testeGratisUsado: { type: Boolean, default: false },

    // === WhatsApp & outros ===
    whatsapp: { type: String },
    status: { type: String, default: 'ativo' },
    admin: { type: Boolean, default: false },
    bots: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BotConfig' }],
    codigoVerificacao: { type: String },
    whatsappVerificado: { type: Boolean, default: false },

    // === Limites extras de anúncios de parceiros ===
    // cada quota armazena a quantidade de anúncios e a duração (dias) de cada um
    // a data de expiração de um anúncio é calculada somente quando criado
    adQuotas: [{
        limite: Number,
        dias: Number,
        source: { type: String, default: 'extra' }
    }],

    shortLinkExtras: { type: Number, default: 0 },

    // Limite de links encurtados com rastreamento
    shortLinkLimit: { type: Number, default: 0 }

}, { versionKey: false });

module.exports.usuario = mongoose.model('usuarios', usuarioSchema);
