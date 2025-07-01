const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    author: { type: String, default: '' },         // Nome
    authorNumber: { type: String, default: '' },   // Número sem @c.us
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const iaGroupMemorySchema = new mongoose.Schema({
    groupId: { type: String, required: true, unique: true },
    messages: [messageSchema]
}, { timestamps: true });

module.exports.IAGroupMemory = mongoose.model('IAGroupMemory', iaGroupMemorySchema);
