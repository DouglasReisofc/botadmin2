const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  message: { type: String, required: true },
  fileName: { type: String, default: '' },
  type: { type: String, enum: ['video', 'image', ''], default: '' },
  buttonLabel: { type: String, default: '' },
  buttonUrl: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports.Post = mongoose.model('Post', postSchema);

