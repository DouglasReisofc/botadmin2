const mongoose = require('mongoose');

/**
 * Esquema de Plano (MongoDB / Mongoose)
 * - Suporta teste grátis: testeGratis (boolean) + diasTeste (integer)
 */
const planoSchema = new mongoose.Schema(
    {
        /* --- Informações básicas --- */
        nome: {
            type: String,
            required: true,           // Ex.: "Plano 30 dias", "Plano Anual"
            trim: true
        },

        preco: {
            type: Number,
            required: true            // Valor em R$
        },

        duracao: {
            type: Number,
            required: true            // Duração total do plano em dias
        },

        descricao: {
            type: String,
            required: false,
            default: ''
        },

        /* --- Limites do plano --- */
        limiteGrupos: {
            type: Number,
            required: true,
            default: 1                // Quantos grupos o usuário pode criar
        },

        limiteInstancias: {
            type: Number,
            required: true,
            default: 0                // 0 = sem instância dedicada
        },

        // Quantidade de anúncios inclusos no plano
        includedAds: {
            type: Number,
            required: true,
            default: 0
        },

        // Quantidade de links encurtados inclusos
        includedShortLinks: {
            type: Number,
            required: true,
            default: 0
        },

        /* --- Teste grátis --- */
        testeGratis: {
            type: Boolean,
            required: true,
            default: false            // Se true, o plano disponibiliza período de teste
        },

        diasTeste: {
            type: Number,
            required: true,
            default: 0,               // Número de dias de teste grátis (0 = sem teste)
            min: 0
        },

        // Indica se é o plano gratuito padrão
        isFree: { type: Boolean, default: false },

        // Plano ativo ou desativado para novas assinaturas
        active: { type: Boolean, default: true },

        // Limite de anúncios automáticos por dia (plano free)
        dailyAdLimit: { type: Number, default: 0 },

        // Horários em que os anúncios serão enviados (HH:mm)
        adTimes: { type: [String], default: [] },

        /* --- Comandos Permitidos no Plano --- */
        allowedCommands: {
            antilink: { type: Boolean, default: false },
            banextremo: { type: Boolean, default: false },
            antilinkgp: { type: Boolean, default: false },
            bangringos: { type: Boolean, default: false },
            proibirnsfw: { type: Boolean, default: false },
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
        }
    },
    { versionKey: false }
);

module.exports.Plano = mongoose.model('Plano', planoSchema);
