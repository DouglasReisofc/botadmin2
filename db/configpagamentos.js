const mongoose = require('mongoose');

const configPagamentoSchema = new mongoose.Schema({
    titulo: {
        type: String,
        required: false
    },
    nome: {
        type: String,
        required: true,
        unique: true // Ex: "mercadopago", "stripe", etc.
    },
    gateway: {
        type: String,
        enum: ['mercadopago', 'asaas'],
        required: true
    },
    accessToken: {
        type: String,
        required: true
    },
    publicKey: {
        type: String,
        required: false // Opcional, conforme sua solicitação
    },
    tipo: {
        type: String,
        enum: ['pix', 'cartao'],
        default: 'pix'
    },
    taxaPercentual: {
        type: Number,
        default: 0 // Exemplo: 4.99%
    },
    taxaFixa: {
        type: Number,
        default: 0 // Exemplo: R$ 1,00
    },
    status: {
        type: Boolean,
        default: true // Ativa ou desativa o uso desta configuração
    },
    criadoEm: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ConfigPagamento', configPagamentoSchema);
