const mongoose = require('mongoose');

const kinematicTelemetrySchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TherapySession', required: true },
  minuteBucketIndex: { type: Number, default: 0 },
  dataStream: { type: Array, default: [] }
}, { 
  timestamps: false,
  collection: 'kinematic_telemetry' 
});

module.exports = mongoose.model('KinematicTelemetry', kinematicTelemetrySchema);
