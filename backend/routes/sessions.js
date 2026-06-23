const express = require('express');
const router = express.Router();
const TherapySession = require('../models/TherapySession');
const KinematicTelemetry = require('../models/KinematicTelemetry');
const Patient = require('../models/Patient');
const Clinician = require('../models/Clinician');
const auth = require('../middleware/auth');

// Save a completed therapy session + its kinematic telemetry stream
router.post('/', auth, async (req, res) => {
  try {
    const { 
      patientId, 
      prescriptionId, 
      startTime, 
      endTime, 
      targetsSpawned, 
      targetsHit, 
      peakRangeOfMotionDegrees,
      telemetryStream 
    } = req.body;

    if (!patientId || !startTime || !endTime) {
      return res.status(400).json({ message: 'Missing required session parameters' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const totalDurationSeconds = Math.max(1, Math.round((end - start) / 1000));
    
    const accuracyPercentage = targetsSpawned > 0 
      ? Math.round((targetsHit / targetsSpawned) * 100) 
      : 0;

    // Create session record
    const session = new TherapySession({
      patientId,
      prescriptionId: prescriptionId || null,
      startTime: start,
      endTime: end,
      totalDurationSeconds,
      targetsSpawned: Number(targetsSpawned || 0),
      targetsHit: Number(targetsHit || 0),
      accuracyPercentage,
      peakRangeOfMotionDegrees: Number(peakRangeOfMotionDegrees || 0)
    });

    await session.save();

    // If telemetry coordinates stream is included, save to bucket
    if (telemetryStream && Array.isArray(telemetryStream) && telemetryStream.length > 0) {
      const telemetry = new KinematicTelemetry({
        sessionId: session._id,
        minuteBucketIndex: 0,
        dataStream: telemetryStream
      });
      await telemetry.save();
    }

    res.status(214).json({
      message: 'Session recorded successfully',
      session
    });
  } catch (error) {
    console.error('Save session error:', error);
    res.status(500).json({ message: 'Failed to save therapy session data' });
  }
});

// Fetch sessions list for a patient (sorting descending by startTime)
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;

    // Access control check
    if (req.user.role === 'PATIENT') {
      const patient = await Patient.findOne({ userId: req.user._id });
      if (!patient || patient._id.toString() !== patientId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (req.user.role === 'CLINICIAN') {
      // Clinicians can fetch stats for any of their assigned patients
      const clinician = await Clinician.findOne({ userId: req.user._id });
      const patient = await Patient.findById(patientId);
      if (!patient || !clinician || patient.assignedClinicianId.toString() !== clinician._id.toString()) {
        return res.status(403).json({ message: 'Access denied. Patient is not assigned to you.' });
      }
    }

    const sessions = await TherapySession.find({ patientId })
      .sort({ startTime: -1 })
      .limit(50); // limit to last 50 sessions for dashboard safety

    res.json(sessions);
  } catch (error) {
    console.error('Fetch sessions history error:', error);
    res.status(500).json({ message: 'Failed to retrieve session history' });
  }
});

// Fetch raw telemetry stream for a session (optional playback)
router.get('/:sessionId/telemetry', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Quick security validation
    const session = await TherapySession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (req.user.role === 'PATIENT') {
      const patient = await Patient.findOne({ userId: req.user._id });
      if (!patient || patient._id.toString() !== session.patientId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const telemetry = await KinematicTelemetry.findOne({ sessionId });
    res.json(telemetry ? telemetry.dataStream : []);
  } catch (error) {
    console.error('Fetch telemetry error:', error);
    res.status(500).json({ message: 'Failed to retrieve telemetry' });
  }
});

module.exports = router;
