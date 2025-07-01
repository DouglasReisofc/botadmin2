const mongoose = require('mongoose');

const tutorialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  tutorialId: { type: String, required: true, unique: true },
  message: { type: String, required: true },
  fileName: { type: String, default: '' },
  type: { type: String, enum: ['video', 'image', ''], default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.Tutorial = mongoose.model('Tutorial', tutorialSchema);
