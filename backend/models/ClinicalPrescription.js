const mongoose = require('mongoose');

const clinicalPrescriptionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  clinicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinician', required: true },
  prescribedSessionDurationSeconds: { type: Number, default: 300 },
  targetSpawnRadius: { type: Number, default: 2.0 },
  requiredHoverDwellTimeMs: { type: Number, default: 1000 },
  isActive: { type: Boolean, default: true },
  prescribedAt: { type: Date, default: Date.now }
}, { 
  timestamps: false,
  collection: 'clinical_prescriptions' 
});

module.exports = mongoose.model('ClinicalPrescription', clinicalPrescriptionSchema);
