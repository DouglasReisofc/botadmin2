// /root/api/db/Sorteio.js

const mongoose = require('mongoose');

const sorteioSchema = new mongoose.Schema({
    // referência ao BotConfig que pertence ao usuário
    bot: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BotConfig',
        required: true,
        index: true
    },
    // pergunta/título do sorteio
    pergunta: {
        type: String,
        required: true
    },
    // manual ou automático
    tipo: {
        type: String,
        enum: ['manual', 'automatico'],
        default: 'automatico'
    },
    // para enquete automática
    serialized: {
        type: String,
        required: function () {
            return this.tipo === 'automatico';
        }
    },
    // opções da enquete (só usado em automático)
    opcoes: [{
        name: { type: String, required: true },
        localId: { type: Number, required: true }
    }],
    // lista de JIDs de participantes (manual)
    participantes: {
        type: [String],
        validate: {
            validator: function (arr) {
                return !(this.maxParticipantes != null && arr.length > this.maxParticipantes);
            },
            message: 'Número de participantes ultrapassa o máximo permitido'
        }
    },
    // máximo de participantes (manual)
    maxParticipantes: {
        type: Number,
        default: null,
        min: 1
    },
    // data de término (automático)
    sortearEm: {
        type: Date,
        default: null
    },
    // número de vencedores (só para automático)
    winnersCount: {
        type: Number,
        default: null,
        min: 1,
        required: function () {
            return this.tipo === 'automatico';
        }
    },
    // se já foi concluído
    concluido: {
        type: Boolean,
        default: false
    },
    // timestamp de criação
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Sorteio', sorteioSchema);
