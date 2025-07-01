const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  fileName: { type: String, default: '' },
  type: { type: String, enum: ['video', 'image', ''], default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.CommandInfo = mongoose.model('CommandInfo', commandSchema);
