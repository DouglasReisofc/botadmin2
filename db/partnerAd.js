const mongoose = require('mongoose');

const partnerAdSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  type: { type: String, enum: ['video', 'image'], default: 'video' },
  text: { type: String, default: '' },
  link: { type: String, default: '' },
  shortCode: { type: String },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios' },
  active: { type: Boolean, default: true },
  displayCount: { type: Number, default: 0 },
  clickCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }
}, { versionKey: false });

module.exports.PartnerAd = mongoose.model('PartnerAd', partnerAdSchema);
