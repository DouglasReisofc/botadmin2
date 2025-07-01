const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    baseUrl: { type: String, required: true },
    globalapikey: { type: String, required: true },
    sessionLimit: { type: Number, default: 0 }, // 0 = ilimitado
    status: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.Server = mongoose.model('Server', serverSchema);
