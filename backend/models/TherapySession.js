const mongoose = require('mongoose');

const therapySessionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClinicalPrescription' },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  totalDurationSeconds: { type: Number, required: true },
  targetsSpawned: { type: Number, default: 0 },
  targetsHit: { type: Number, default: 0 },
  accuracyPercentage: { type: Number, default: 0 },
  peakRangeOfMotionDegrees: { type: Number, default: 0 }
}, { 
  timestamps: false,
  collection: 'therapy_sessions' 
});

module.exports = mongoose.model('TherapySession', therapySessionSchema);
