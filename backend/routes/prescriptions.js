const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const { normalizeRow } = require('../utils/supabaseHelpers');
const auth = require('../middleware/auth');

// Get current active prescription for a specific patient
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
        return res.status(403).json({ message: 'Access denied to this prescription' });
      }
    }

    const { data: prescription, error } = await supabase
      .from('clinical_prescriptions')
      .select('*, clinician:clinicians(*)')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Fetch prescription error:', error);
      return res.status(500).json({ message: 'Failed to retrieve prescription' });
    }

    if (!prescription) {
      return res.json({
        patientId,
        prescribedSessionDurationSeconds: 300,
        targetSpawnRadius: 2.0,
        requiredHoverDwellTimeMs: 1000,
        isActive: true,
        isDefault: true
      });
    }

    res.json(normalizeRow(prescription));
  } catch (error) {
    console.error('Fetch prescription error:', error);
    res.status(500).json({ message: 'Failed to retrieve prescription' });
  }
});

// Create/post a new prescription configuration for a patient (Clinicians only)
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'CLINICIAN' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Unauthorized. Only clinicians can create prescriptions' });
    }

    const { patientId, prescribedSessionDurationSeconds, targetSpawnRadius, requiredHoverDwellTimeMs } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: 'Patient ID is required' });
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .eq('id', patientId)
      .maybeSingle();

    if (patientError) {
      console.error('Patient lookup error:', patientError);
      return res.status(500).json({ message: 'Failed to verify patient profile' });
    }
    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    const { data: clinician, error: clinicianError } = await supabase
      .from('clinicians')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (clinicianError) {
      console.error('Clinician lookup error:', clinicianError);
      return res.status(500).json({ message: 'Failed to verify clinician profile' });
    }
    if (!clinician) {
      return res.status(404).json({ message: 'Clinician profile not found' });
    }

    const { error: deactivateError } = await supabase
      .from('clinical_prescriptions')
      .update({ is_active: false })
      .eq('patient_id', patientId)
      .eq('is_active', true);

    if (deactivateError) {
      console.error('Deactivate old prescriptions error:', deactivateError);
      return res.status(500).json({ message: 'Failed to deactivate previous prescriptions' });
    }

    const { data: newPrescription, error: createError } = await supabase
      .from('clinical_prescriptions')
      .insert([{
        patient_id: patientId,
        clinician_id: clinician.id,
        prescribed_session_duration_seconds: prescribedSessionDurationSeconds ? Number(prescribedSessionDurationSeconds) : 300,
        target_spawn_radius: targetSpawnRadius ? Number(targetSpawnRadius) : 2.0,
        required_hover_dwell_time_ms: requiredHoverDwellTimeMs ? Number(requiredHoverDwellTimeMs) : 1000,
        is_active: true
      }])
      .select('*')
      .single();

    if (createError) {
      console.error('Create prescription error:', createError);
      return res.status(500).json({ message: 'Failed to save clinical prescription' });
    }

    res.status(201).json(normalizeRow(newPrescription));
  } catch (error) {
    console.error('Create prescription error:', error);
    res.status(500).json({ message: 'Failed to save clinical prescription' });
  }
});

// Archive / Deactivate a prescription
router.put('/:id/deactivate', auth, async (req, res) => {
  try {
    if (req.user.role !== 'CLINICIAN' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const { data: prescription, error: fetchError } = await supabase
      .from('clinical_prescriptions')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Fetch prescription error:', fetchError);
      return res.status(500).json({ message: 'Failed to retrieve prescription' });
    }
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }

    const { data: updatedPrescription, error: updateError } = await supabase
      .from('clinical_prescriptions')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Deactivate prescription error:', updateError);
      return res.status(500).json({ message: 'Failed to archive prescription' });
    }

    res.json(normalizeRow(updatedPrescription));
  } catch (error) {
    console.error('Deactivate prescription error:', error);
    res.status(500).json({ message: 'Failed to archive prescription' });
  }
});

module.exports = router;
