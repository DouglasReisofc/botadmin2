const mongoose = require('mongoose');

const visitLogSchema = new mongoose.Schema({
  ip: String,
  country: String,
  userAgent: String,
  path: String,
  referer: String,
  details: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.VisitLog = mongoose.model('VisitLog', visitLogSchema);
