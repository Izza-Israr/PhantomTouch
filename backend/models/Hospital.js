const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  hospitalName: { type: String, required: true },
  regulatoryLicense: { type: String, required: true, unique: true },
  city: { type: String },
  country: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { 
  timestamps: false,
  collection: 'hospitals' 
});

module.exports = mongoose.model('Hospital', hospitalSchema);
