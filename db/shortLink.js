const mongoose = require('mongoose');

const shortLinkSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  originalUrl: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios', required: true },
  ad: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerAd' },
  clickCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  logs: [{
    ip: String,
    country: String,
    app: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.ShortLink = mongoose.model('ShortLink', shortLinkSchema);
