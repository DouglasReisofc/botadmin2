const mongoose = require('mongoose');

const commandCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.CommandCategory = mongoose.model('CommandCategory', commandCategorySchema);
