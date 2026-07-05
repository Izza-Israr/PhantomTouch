const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const { normalizeRow, normalizeRows } = require('../utils/supabaseHelpers');
const auth = require('../middleware/auth');
const { hashPassword } = require('../utils/authHelper');

// Get all patients assigned to a clinician (or the current patient if patient role)
router.get('/', auth, async (req, res) => {
  try {
    let query = supabase
      .from('patients')
      .select('*, assigned_clinician:clinicians(*), hospital:hospitals(*)');

    if (req.user.role === 'CLINICIAN') {
      const { data: clinician, error: clinicianError } = await supabase
        .from('clinicians')
        .select('id, hospital_id')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (clinicianError) {
        console.error('Clinician lookup error:', clinicianError);
        return res.status(500).json({ message: 'Failed to retrieve clinician profile' });
      }
      if (!clinician) {
        return res.status(404).json({ message: 'Clinician profile not found' });
      }
      query = query.eq('assigned_clinician_id', clinician.id);
    } else if (req.user.role === 'PATIENT') {
      query = query.eq('user_id', req.user.id);
    }

    const { data, error } = await query.order('full_name', { ascending: true });
    if (error) {
      console.error('Fetch patients error:', error);
      return res.status(500).json({ message: 'Failed to retrieve patients' });
    }

    res.json(normalizeRows(data || []));
  } catch (error) {
    console.error('Fetch patients error:', error);
    res.status(500).json({ message: 'Failed to retrieve patients' });
  }
});

// Create a new Patient profile + User credentials (invoked by a Clinician)
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'CLINICIAN' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Unauthorized. Only clinicians can create patients' });
    }

    const { email, password, fullName, dateOfBirth, amputationSide, amputationLevel, skinToneSliderHex, meshScaleMultiplier } = req.body;

    if (!email || !password || !fullName || !amputationSide || !amputationLevel) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const { data: existingUser, error: existingError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingError) {
      console.error('User existence check error:', existingError);
      return res.status(500).json({ message: 'Failed to verify user' });
    }
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    const { data: clinician, error: clinicianError } = await supabase
      .from('clinicians')
      .select('id, hospital_id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (clinicianError) {
      console.error('Clinician lookup error:', clinicianError);
      return res.status(500).json({ message: 'Failed to retrieve clinician profile' });
    }

    const passwordHash = hashPassword(password);
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([{
        email: email.toLowerCase(),
        password_hash: passwordHash,
        role: 'PATIENT',
        session_token: null,
        last_login: null
      }])
      .select('*')
      .single();

    if (userError) {
      console.error('Create patient user error:', userError);
      return res.status(500).json({ message: 'Failed to create patient account' });
    }

    const { data: newPatient, error: patientError } = await supabase
      .from('patients')
      .insert([{
        user_id: newUser.id,
        hospital_id: clinician?.hospital_id || null,
        assigned_clinician_id: clinician?.id || null,
        full_name: fullName,
        date_of_birth: dateOfBirth ? new Date(dateOfBirth).toISOString() : null,
        amputation_side: amputationSide,
        amputation_level: amputationLevel,
        skin_tone_slider_hex: skinToneSliderHex || '#aa3bff',
        mesh_scale_multiplier: meshScaleMultiplier || 1.0
      }])
      .select('*')
      .single();

    if (patientError) {
      console.error('Create patient profile error:', patientError);
      return res.status(500).json({ message: 'Failed to create patient profile' });
    }

    res.status(201).json(normalizeRow(newPatient));
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ message: 'Failed to create patient account' });
  }
});

// Get detailed view of specific patient
router.get('/:id', auth, async (req, res) => {
  try {
    const { data: patient, error } = await supabase
      .from('patients')
      .select('*, assigned_clinician:clinicians(*), hospital:hospitals(*)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) {
      console.error('Fetch patient detail error:', error);
      return res.status(500).json({ message: 'Failed to retrieve patient details' });
    }
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    if (req.user.role === 'PATIENT' && patient.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(normalizeRow(patient));
  } catch (error) {
    console.error('Fetch patient detail error:', error);
    res.status(500).json({ message: 'Failed to retrieve patient details' });
  }
});

// Update patient settings/calibration variables
router.put('/:id', auth, async (req, res) => {
  try {
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (patientError) {
      console.error('Fetch patient error:', patientError);
      return res.status(500).json({ message: 'Failed to retrieve patient profile' });
    }
    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    if (req.user.role === 'PATIENT' && patient.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this profile' });
    }

    const { fullName, amputationSide, amputationLevel, skinToneSliderHex, meshScaleMultiplier, assignedClinicianId } = req.body;
    const updates = {};

    if (fullName) updates.full_name = fullName;
    if (amputationSide) updates.amputation_side = amputationSide;
    if (amputationLevel) updates.amputation_level = amputationLevel;
    if (skinToneSliderHex) updates.skin_tone_slider_hex = skinToneSliderHex;
    if (meshScaleMultiplier !== undefined) updates.mesh_scale_multiplier = Number(meshScaleMultiplier);
    if (assignedClinicianId && req.user.role === 'ADMIN') updates.assigned_clinician_id = assignedClinicianId;

    const { data: updatedPatient, error: updateError } = await supabase
      .from('patients')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Update patient profile error:', updateError);
      return res.status(500).json({ message: 'Failed to update patient profile' });
    }

    res.json(normalizeRow(updatedPatient));
  } catch (error) {
    console.error('Update patient profile error:', error);
    res.status(500).json({ message: 'Failed to update patient profile' });
  }
});

module.exports = router;
