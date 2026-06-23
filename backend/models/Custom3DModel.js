const mongoose = require('mongoose');

const custom3DModelSchema = new mongoose.Schema({
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinician' },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  modelName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  fileSizeBytes: { type: Number },
  fileFormat: { type: String, enum: ['glTF', 'GLB'], default: 'GLB' },
  riggingNodesConfig: { type: Map, of: String },
  createdAt: { type: Date, default: Date.now }
}, { 
  timestamps: false,
  collection: 'custom_3d_models' 
});

module.exports = mongoose.model('Custom3DModel', custom3DModelSchema);
