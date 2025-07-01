const mongoose = require('mongoose');

const whatsappSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('whatsapp_sessions', whatsappSessionSchema);
