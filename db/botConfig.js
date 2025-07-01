const mongoose = require('mongoose');

// Schema de Anúncios
const anuncioSchema = new mongoose.Schema({
    caption: String,
    filePath: String,
    mimetype: String,
    fileName: String,
    hasMedia: { type: Boolean, default: false },
    frequencia: { type: String, default: '1d' },
    lastSent: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
    mentionAll: { type: Boolean, default: false }
}, { _id: true });

// Schema de Boas-vindas
const bemVindoSchema = new mongoose.Schema({
    caption: { type: String, default: '' },
    filePath: String,
    fileName: String,
    mimetype: String,
    externalUrl: String,
    asSticker: { type: Boolean, default: false },
    hasMedia: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
}, { _id: false });

// Schema de AutoRespostas
const autoRespSchema = new mongoose.Schema({
    triggers: { type: [String], required: true },
    contains: { type: Boolean, default: false },
    responseText: { type: String, default: '' },
    filePath: String,
    fileName: String,
    mimetype: String,
    asSticker: { type: Boolean, default: false },
    hasMedia: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
}, { _id: true });

// Schema principal do Bot
const botConfigSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'usuarios',
        required: true
    },
    botApi: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BotApi',
        required: true
    },
    linkGrupo: { type: String, required: true },
    groupId: { type: String, required: true, index: true },
    nomeGrupo: String,
    imagemGrupo: String,
    descricaoGrupo: String,
    language: { type: String, default: null },
    ownerGrupo: String,
    participantes: [{
        id: { type: String },
        admin: { type: String, default: null }
    }],
    botAdmin: { type: Boolean, default: false },
    status: { type: Boolean, default: true },
    comandos: {
        antilink: { type: Boolean, default: false },
        banextremo: { type: Boolean, default: false },
        antilinkgp: { type: Boolean, default: false },
        bangringos: { type: Boolean, default: false },
        proibirnsfw: { type: Boolean, default: true },
        soadm: { type: Boolean, default: false },
        autoresposta: { type: Boolean, default: false },
        autosticker: { type: Boolean, default: false },
        autodownloader: { type: Boolean, default: false },
        brincadeiras: { type: Boolean, default: false },
        vozbotinterage: { type: Boolean, default: false },
        moderacaocomia: { type: Boolean, default: false },
        botinterage: { type: Boolean, default: false },
        lerimagem: { type: Boolean, default: false },
        bemvindo: { type: Boolean, default: false }
    },
    linksPermitidos: {
        type: [String],
        default: ['botadmin.shop']
    },
    ddiPermitidos: {
        type: [String],
        default: ['55']     // ex: ['55', '1', '44']
    },
    iaConversas: { type: Boolean, default: true },
    groqKey: { type: String, default: '' },
    botinteragePrompt: {
        type: String,
        default: 'Responda em português do Brasil de forma clara e objetiva sem textão e sem palavras difíceis...'
    },
    prefixo: {
        type: String,
        required: true,
        // permite múltiplos prefixos separados por vírgula ou espaço
        default: '!,#,.,-,/'
    },
    horarioGrupo: {
        abrir: { type: String, default: '' },  // Formato HH:mm
        fechar: { type: String, default: '' },
        statusAtual: { type: String, default: '' },
        ativo: { type: Boolean, default: false }
    },
    ultimaMensagemAll: {
        caption: String,
        filePath: String,
        mimetype: String,
        fileName: String,
        hasMedia: { type: Boolean, default: false },
        updatedAt: { type: Date, default: Date.now }
    },
    tabela: { type: String, default: '' },
    adsMensagem: [anuncioSchema],
    freeAds: {
        count: { type: Number, default: 0 },
        lastDate: { type: Date }
    },
    autoResponses: { type: [autoRespSchema], default: [] },
    bemvindo: {
        type: bemVindoSchema,
        default: () => ({
            caption: `Seja bem-vindo, {{pushName}}!

Você está no grupo **{{nomeGrupo}}**. Estamos felizes em tê-lo aqui!

Aqui estão algumas informações importantes:
- Número: {{numero}}
- Data: {{data}}
- Hora: {{hora}}

O prefixo do bot é **{{prefixo}}**. 
Se precisar de ajuda, é só chamar!`,
            filePath: '',
            fileName: '',
            mimetype: '',
            externalUrl: '',
            asSticker: false,
            hasMedia: false,
            updatedAt: new Date()
        })
    }
}, { versionKey: false });

module.exports.BotConfig = mongoose.model('BotConfig', botConfigSchema);
