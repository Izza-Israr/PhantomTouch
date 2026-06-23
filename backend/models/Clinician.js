const mongoose = require('mongoose');

const clinicianSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  fullName: { type: String, required: true },
  medicalSpecialty: { type: String },
  licenseNumber: { type: String, required: true }
}, { 
  timestamps: false,
  collection: 'clinicians' 
});

module.exports = mongoose.model('Clinician', clinicianSchema);
