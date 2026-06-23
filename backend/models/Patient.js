const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  assignedClinicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinician' },
  fullName: { type: String, required: true },
  dateOfBirth: { type: Date },
  amputationSide: { type: String, enum: ['LEFT', 'RIGHT', 'BILATERAL'], required: true },
  amputationLevel: { type: String, required: true },
  skinToneSliderHex: { type: String, default: '#aa3bff' },
  meshScaleMultiplier: { type: Number, default: 1.0 }
}, { 
  timestamps: false,
  collection: 'patients' 
});

module.exports = mongoose.model('Patient', patientSchema);
