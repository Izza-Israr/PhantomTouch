const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const { normalizeRow, normalizeRows } = require('../utils/supabaseHelpers');
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

    const { data: session, error: sessionError } = await supabase
      .from('therapy_sessions')
      .insert([{
        patient_id: patientId,
        prescription_id: prescriptionId || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_duration_seconds: totalDurationSeconds,
        targets_spawned: Number(targetsSpawned || 0),
        targets_hit: Number(targetsHit || 0),
        accuracy_percentage: accuracyPercentage,
        peak_range_of_motion_degrees: Number(peakRangeOfMotionDegrees || 0)
      }])
      .select('*')
      .single();

    if (sessionError) {
      console.error('Save session error:', sessionError);
      return res.status(500).json({ message: 'Failed to save therapy session data' });
    }

    if (telemetryStream && Array.isArray(telemetryStream) && telemetryStream.length > 0) {
      const { error: telemetryError } = await supabase
        .from('kinematic_telemetry')
        .insert([{
          session_id: session.id,
          minute_bucket_index: 0,
          data_stream: telemetryStream
        }]);

      if (telemetryError) {
        console.error('Save telemetry error:', telemetryError);
        return res.status(500).json({ message: 'Failed to save telemetry stream' });
      }
    }

    res.status(201).json({
      message: 'Session recorded successfully',
      session: normalizeRow(session)
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

    if (req.user.role === 'PATIENT') {
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (patientError) {
        console.error('Patient lookup error:', patientError);
        return res.status(500).json({ message: 'Failed to validate patient access' });
      }
      if (!patient || patient.id !== patientId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (req.user.role === 'CLINICIAN') {
      const { data: clinician, error: clinicianError } = await supabase
        .from('clinicians')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (clinicianError) {
        console.error('Clinician lookup error:', clinicianError);
        return res.status(500).json({ message: 'Failed to validate clinician access' });
      }

      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('assigned_clinician_id')
        .eq('id', patientId)
        .maybeSingle();

      if (patientError) {
        console.error('Patient lookup error:', patientError);
        return res.status(500).json({ message: 'Failed to validate patient access' });
      }
      if (!patient || !clinician || patient.assigned_clinician_id !== clinician.id) {
        return res.status(403).json({ message: 'Access denied. Patient is not assigned to you.' });
      }
    }

    const { data: sessions, error } = await supabase
      .from('therapy_sessions')
      .select('*')
      .eq('patient_id', patientId)
      .order('start_time', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Fetch sessions history error:', error);
      return res.status(500).json({ message: 'Failed to retrieve session history' });
    }

    res.json(normalizeRows(sessions || []));
  } catch (error) {
    console.error('Fetch sessions history error:', error);
    res.status(500).json({ message: 'Failed to retrieve session history' });
  }
});

// Fetch raw telemetry stream for a session (optional playback)
router.get('/:sessionId/telemetry', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('therapy_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError) {
      console.error('Fetch session error:', sessionError);
      return res.status(500).json({ message: 'Failed to retrieve session' });
    }
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (req.user.role === 'PATIENT') {
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (patientError) {
        console.error('Patient lookup error:', patientError);
        return res.status(500).json({ message: 'Failed to validate patient access' });
      }
      if (!patient || patient.id !== session.patient_id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const { data: telemetry, error: telemetryError } = await supabase
      .from('kinematic_telemetry')
      .select('data_stream')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (telemetryError) {
      console.error('Fetch telemetry error:', telemetryError);
      return res.status(500).json({ message: 'Failed to retrieve telemetry' });
    }

    res.json(telemetry ? telemetry.data_stream : []);
  } catch (error) {
    console.error('Fetch telemetry error:', error);
    res.status(500).json({ message: 'Failed to retrieve telemetry' });
  }
});

module.exports = router;
