const mongoose = require('mongoose');

const extraPlanSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  preco: { type: Number, required: true },
  tipo: { type: String, enum: ['premium', 'ads', 'shortener'], required: true },
  dias: { type: Number, required: true },
  quantidadeAds: {
    type: Number,
    default: 0,
    required: function () { return this.tipo === 'ads'; }
  },
  quantidadeLinks: {
    type: Number,
    default: 0,
    required: function () { return this.tipo === 'shortener'; }
  }
}, { versionKey: false });

module.exports.ExtraPlan = mongoose.model('ExtraPlan', extraPlanSchema);
