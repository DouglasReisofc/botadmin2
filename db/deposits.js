const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'usuario',
        required: true
    },
    valor: {
        type: Number,
        required: true
    },
    metodo: {
        type: String,
        required: true // Ex: 'mercadopago', 'pix', 'stripe'
    },
    status: {
        type: String,
        enum: ['pendente', 'aprovado', 'recusado'],
        default: 'pendente'
    },
    referencia: {
        type: String,
        required: true,
        unique: true // Usado para identificar transações únicas (ex: external_reference)
    },
    id: {
        type: String,
        required: true,
        unique: true // ID gerado pela API externa (ex: id do Mercado Pago)
    },
    detalhes: {
        type: Object,
        default: {} // Dados adicionais retornados pela API
    },
    criadoEm: {
        type: Date,
        default: Date.now
    },
    atualizadoEm: {
        type: Date,
        default: Date.now
    }
});

depositSchema.pre('save', function (next) {
    this.atualizadoEm = new Date();
    next();
});

module.exports = mongoose.model('Deposit', depositSchema);
