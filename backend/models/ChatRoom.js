const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId }], // ObjectIds of [Patient, Clinician]
  lastActivityAt: { type: Date, default: Date.now }
}, { 
  timestamps: { createdAt: 'createdAt', updatedAt: false }, // only createdAt needed for room init
  collection: 'chat_rooms' 
});

module.exports = mongoose.model('ChatRoom', chatRoomSchema);
