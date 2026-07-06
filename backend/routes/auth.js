const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const { normalizeRow, normalizeRows } = require('../utils/supabaseHelpers');
const { hashPassword, verifyPassword, generateToken } = require('../utils/authHelper');
const auth = require('../middleware/auth');
const VALID_FINGERS = new Set(['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY']);
const normalizeMissingFingers = (value) => Array.isArray(value)
  ? value.map((finger) => String(finger).toUpperCase()).filter((finger) => VALID_FINGERS.has(finger))
  : [];

// Register Endpoint
router.post('/register', async (req, res) => {
  try {
    const { email, password, role, fullName, ...extraFields } = req.body;

    if (!email || !password || !role || !fullName) {
      return res.status(400).json({ message: 'Missing required registration fields' });
    }

    if (!['PATIENT', 'CLINICIAN', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Invalid user role' });
    }

    const { data: existingUser, error: existingError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingError) {
      console.error('Email check error:', existingError);
      return res.status(500).json({ message: 'Failed to verify existing user' });
    }
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const passwordHash = hashPassword(password);
    const token = generateToken();

    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        email: email.toLowerCase(),
        password_hash: passwordHash,
        role,
        session_token: token,
        last_login: new Date().toISOString()
      }])
      .select('*')
      .single();

    if (createError) {
      console.error('User creation error:', createError);
      return res.status(500).json({ message: 'Failed to register user' });
    }

    let profile = null;
    const normalizedUser = normalizeRow(newUser);

    if (role === 'CLINICIAN') {
      if (!extraFields.licenseNumber) {
        return res.status(400).json({ message: 'License number required for clinicians' });
      }
      const { data: clinician, error: clinicianError } = await supabase
        .from('clinicians')
        .insert([{
          user_id: normalizedUser.id,
          hospital_id: extraFields.hospitalId || null,
          full_name: fullName,
          medical_specialty: extraFields.medicalSpecialty || '',
          license_number: extraFields.licenseNumber
        }])
        .select('*')
        .single();

      if (clinicianError) {
        console.error('Clinician creation error:', clinicianError);
        return res.status(500).json({ message: 'Failed to create clinician profile' });
      }
      profile = normalizeRow(clinician);
    } else if (role === 'PATIENT') {
      if (!extraFields.amputationSide || !extraFields.amputationLevel) {
        return res.status(400).json({ message: 'Amputation side and level required for patients' });
      }
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert([{
          user_id: normalizedUser.id,
          hospital_id: extraFields.hospitalId || null,
          assigned_clinician_id: extraFields.assignedClinicianId || null,
          full_name: fullName,
          date_of_birth: extraFields.dateOfBirth ? new Date(extraFields.dateOfBirth).toISOString() : null,
          amputation_side: extraFields.amputationSide,
          amputation_level: extraFields.amputationLevel,
          missing_fingers: normalizeMissingFingers(extraFields.missingFingers),
          skin_tone_slider_hex: extraFields.skinToneSliderHex || '#aa3bff',
          mesh_scale_multiplier: extraFields.meshScaleMultiplier || 1.0
        }])
        .select('*')
        .single();

      if (patientError) {
        console.error('Patient creation error:', patientError);
        return res.status(500).json({ message: 'Failed to create patient profile' });
      }
      profile = normalizeRow(patient);
    }

    res.status(201).json({
      token,
      user: normalizedUser,
      profile
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Failed to register user' });
  }
});

// Login Endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error('Login query error:', error);
      return res.status(500).json({ message: 'Failed to log in' });
    }
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateToken();
    const { error: updateError } = await supabase
      .from('users')
      .update({ session_token: token, last_login: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      console.error('Login update error:', updateError);
      return res.status(500).json({ message: 'Failed to update user session' });
    }

    let profile = null;
    if (user.role === 'CLINICIAN') {
      const { data: clinician, error: clinicianError } = await supabase
        .from('clinicians')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (clinicianError) {
        console.error('Clinician fetch error:', clinicianError);
        return res.status(500).json({ message: 'Failed to retrieve clinician profile' });
      }
      profile = clinician ? normalizeRow(clinician) : null;
    } else if (user.role === 'PATIENT') {
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (patientError) {
        console.error('Patient fetch error:', patientError);
        return res.status(500).json({ message: 'Failed to retrieve patient profile' });
      }
      profile = patient ? normalizeRow(patient) : null;

      if (profile) {
        const { data: activePrescription, error: activePrescriptionError } = await supabase
          .from('clinical_prescriptions')
          .select('id')
          .eq('patient_id', profile.id)
          .eq('is_active', true)
          .order('prescribed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!activePrescriptionError && activePrescription) {
          profile.currentPrescriptionId = activePrescription.id;
        }
      }
    }

    res.json({
      token,
      user: normalizeRow(user),
      profile
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Failed to log in' });
  }
});

// Get Current User Profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = req.user;
    let profile = null;

    if (user.role === 'CLINICIAN') {
      const { data: clinician, error: clinicianError } = await supabase
        .from('clinicians')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (clinicianError) {
        console.error('Fetch clinician profile error:', clinicianError);
        return res.status(500).json({ message: 'Failed to retrieve profile' });
      }
      profile = clinician ? normalizeRow(clinician) : null;
    } else if (user.role === 'PATIENT') {
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (patientError) {
        console.error('Fetch patient profile error:', patientError);
        return res.status(500).json({ message: 'Failed to retrieve profile' });
      }
      profile = patient ? normalizeRow(patient) : null;
    }

    res.json({
      user: normalizeRow(user),
      profile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to retrieve profile' });
  }
});

// Logout
router.post('/logout', auth, async (req, res) => {
  try {
    const user = req.user;
    const { error } = await supabase
      .from('users')
      .update({ session_token: null })
      .eq('id', user.id);

    if (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ message: 'Failed to log out' });
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Failed to log out' });
  }
});

module.exports = router;
