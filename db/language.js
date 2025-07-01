const mongoose = require('mongoose');

const languageSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  translations: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { versionKey: false });

module.exports = mongoose.model('Language', languageSchema);
