const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const { normalizeRow, normalizeRows } = require('../utils/supabaseHelpers');
const auth = require('../middleware/auth');
const { hashPassword } = require('../utils/authHelper');
const VALID_FINGERS = new Set(['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY']);
const normalizeMissingFingers = (value) => Array.isArray(value)
  ? value.map((finger) => String(finger).toUpperCase()).filter((finger) => VALID_FINGERS.has(finger))
  : [];
const getBilateralPatientFields = (body) => ({
  left_amputation_level: body.leftAmputationLevel || null,
  right_amputation_level: body.rightAmputationLevel || null,
  left_missing_fingers: normalizeMissingFingers(body.leftMissingFingers),
  right_missing_fingers: normalizeMissingFingers(body.rightMissingFingers),
  voice_mode_preferred: Boolean(body.voiceModePreferred || body.amputationSide === 'BILATERAL')
});

async function getAuthorizedPatient(req, res, patientId) {
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  if (patientError) {
    console.error('Patient lookup error:', patientError);
    res.status(500).json({ message: 'Failed to validate patient access' });
    return null;
  }
  if (!patient) {
    res.status(404).json({ message: 'Patient not found' });
    return null;
  }

  if (req.user.role === 'PATIENT' && patient.user_id !== req.user.id) {
    res.status(403).json({ message: 'Access denied' });
    return null;
  }

  if (req.user.role === 'CLINICIAN') {
    const { data: clinician, error: clinicianError } = await supabase
      .from('clinicians')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (clinicianError) {
      console.error('Clinician lookup error:', clinicianError);
      res.status(500).json({ message: 'Failed to validate clinician access' });
      return null;
    }
    if (!clinician || patient.assigned_clinician_id !== clinician.id) {
      res.status(403).json({ message: 'Access denied. Patient is not assigned to you.' });
      return null;
    }
  }

  return patient;
}

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

    const { email, password, fullName, dateOfBirth, amputationSide, amputationLevel, missingFingers, skinToneSliderHex, meshScaleMultiplier } = req.body;

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
        missing_fingers: normalizeMissingFingers(missingFingers),
        ...getBilateralPatientFields(req.body),
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

router.get('/:id/bilateral-pose-library', auth, async (req, res) => {
  try {
    const patient = await getAuthorizedPatient(req, res, req.params.id);
    if (!patient) return;

    const { data, error } = await supabase
      .from('bilateral_pose_libraries')
      .select('*')
      .eq('patient_id', patient.id)
      .maybeSingle();

    if (error) {
      console.error('Fetch bilateral pose library error:', error);
      return res.status(500).json({ message: 'Failed to retrieve bilateral pose library' });
    }

    res.json({
      patientId: patient.id,
      poseLibrary: data?.pose_library || {},
      recordedAt: data?.recorded_at || null,
      updatedAt: data?.updated_at || null,
    });
  } catch (error) {
    console.error('Fetch bilateral pose library error:', error);
    res.status(500).json({ message: 'Failed to retrieve bilateral pose library' });
  }
});

router.put('/:id/bilateral-pose-library', auth, async (req, res) => {
  try {
    const patient = await getAuthorizedPatient(req, res, req.params.id);
    if (!patient) return;

    const poseLibrary = req.body?.poseLibrary;
    if (!poseLibrary || typeof poseLibrary !== 'object' || Array.isArray(poseLibrary)) {
      return res.status(400).json({ message: 'poseLibrary must be an object keyed by action name' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('bilateral_pose_libraries')
      .upsert([{
        patient_id: patient.id,
        pose_library: poseLibrary,
        recorded_by_user_id: req.user.id,
        recorded_at: now,
        updated_at: now,
      }], { onConflict: 'patient_id' })
      .select('*')
      .single();

    if (error) {
      console.error('Save bilateral pose library error:', error);
      return res.status(500).json({ message: 'Failed to save bilateral pose library' });
    }

    res.json({
      patientId: patient.id,
      poseLibrary: data.pose_library || {},
      recordedAt: data.recorded_at || null,
      updatedAt: data.updated_at || null,
    });
  } catch (error) {
    console.error('Save bilateral pose library error:', error);
    res.status(500).json({ message: 'Failed to save bilateral pose library' });
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

    const {
      fullName,
      amputationSide,
      amputationLevel,
      missingFingers,
      leftAmputationLevel,
      rightAmputationLevel,
      leftMissingFingers,
      rightMissingFingers,
      voiceModePreferred,
      skinToneSliderHex,
      meshScaleMultiplier,
      assignedClinicianId
    } = req.body;
    const updates = {};

    if (fullName) updates.full_name = fullName;
    if (amputationSide) updates.amputation_side = amputationSide;
    if (amputationLevel) updates.amputation_level = amputationLevel;
    if (missingFingers !== undefined) updates.missing_fingers = normalizeMissingFingers(missingFingers);
    if (leftAmputationLevel !== undefined) updates.left_amputation_level = leftAmputationLevel || null;
    if (rightAmputationLevel !== undefined) updates.right_amputation_level = rightAmputationLevel || null;
    if (leftMissingFingers !== undefined) updates.left_missing_fingers = normalizeMissingFingers(leftMissingFingers);
    if (rightMissingFingers !== undefined) updates.right_missing_fingers = normalizeMissingFingers(rightMissingFingers);
    if (voiceModePreferred !== undefined) updates.voice_mode_preferred = Boolean(voiceModePreferred);
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
