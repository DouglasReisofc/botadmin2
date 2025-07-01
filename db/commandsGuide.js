const mongoose = require('mongoose');

const commandsGuideSchema = new mongoose.Schema({
  message: { type: String, required: true },
  fileName: { type: String, default: '' },
  type: { type: String, enum: ['video', 'image', ''], default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.CommandsGuide = mongoose.model('CommandsGuide', commandsGuideSchema);
