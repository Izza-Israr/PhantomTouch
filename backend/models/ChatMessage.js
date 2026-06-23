const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messageBody: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  sentAt: { type: Date, default: Date.now }
}, { 
  timestamps: false, // We use standard sentAt as defined in the structure
  collection: 'chat_messages' 
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
