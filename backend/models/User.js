const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['PATIENT', 'CLINICIAN', 'ADMIN'], required: true },
  sessionToken: { type: String }, // session state identifier
  lastLogin: { type: Date }
}, { 
  timestamps: false,
  collection: 'users' 
});

module.exports = mongoose.model('User', userSchema);