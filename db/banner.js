const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  type: { type: String, enum: ['video', 'image'], default: 'video' },
  text: { type: String, default: '' },
  buttonText: { type: String, default: '' },
  buttonUrl: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.Banner = mongoose.model('Banner', bannerSchema);
