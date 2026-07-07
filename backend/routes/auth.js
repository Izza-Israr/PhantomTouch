const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabaseClient');
const { normalizeRow, normalizeRows } = require('../utils/supabaseHelpers');
const { hashPassword, verifyPassword, generateToken } = require('../utils/authHelper');
const auth = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');
const VALID_FINGERS = new Set(['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY']);
const normalizeMissingFingers = (value) => Array.isArray(value)
  ? value.map((finger) => String(finger).toUpperCase()).filter((finger) => VALID_FINGERS.has(finger))
  : [];

const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(googleClientId);

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
      return res.status(404).json({
        message: 'No account found for this email. Please complete registration first.',
        needsRegistration: true,
        email: email.toLowerCase()
      });
    }

    // Prevent email login for Google-only accounts
    if (user.password_hash?.startsWith('google-oauth:')) {
      return res.status(400).json({ message: 'This account uses Google sign-in. Please use the "Continue with Google" button.' });
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

// Google OAuth Endpoint
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Google credential token is required' });
    }

    // Verify the Google ID token
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
    } catch (verifyErr) {
      console.error('Google token verification failed:', verifyErr);
      return res.status(401).json({ message: 'Invalid Google credential' });
    }

    const payload = ticket.getPayload();
    const googleEmail = payload.email?.toLowerCase();
    const googleName = payload.name || payload.email?.split('@')[0] || 'Google User';

    if (!googleEmail) {
      return res.status(400).json({ message: 'Google account email not available' });
    }

    // Check if user already exists
    const { data: existingUser, error: lookupError } = await supabase
      .from('users')
      .select('*')
      .eq('email', googleEmail)
      .maybeSingle();

    if (lookupError) {
      console.error('Google user lookup error:', lookupError);
      return res.status(500).json({ message: 'Failed to look up user' });
    }

    const token = generateToken();

    if (existingUser) {
      // Existing user — update session and log them in
      const { error: updateError } = await supabase
        .from('users')
        .update({ session_token: token, last_login: new Date().toISOString() })
        .eq('id', existingUser.id);

      if (updateError) {
        console.error('Google login update error:', updateError);
        return res.status(500).json({ message: 'Failed to update user session' });
      }

      const normalizedUser = normalizeRow(existingUser);

      // Check if profile exists
      let profile = null;
      let needsProfileSetup = false;

      if (normalizedUser.role === 'CLINICIAN') {
        const { data: clinician } = await supabase
          .from('clinicians')
          .select('*')
          .eq('user_id', normalizedUser.id)
          .maybeSingle();
        profile = clinician ? normalizeRow(clinician) : null;
        if (!profile) needsProfileSetup = true;
      } else if (normalizedUser.role === 'PATIENT') {
        const { data: patient } = await supabase
          .from('patients')
          .select('*')
          .eq('user_id', normalizedUser.id)
          .maybeSingle();
        profile = patient ? normalizeRow(patient) : null;
        if (!profile) needsProfileSetup = true;

        if (profile) {
          const { data: activePrescription } = await supabase
            .from('clinical_prescriptions')
            .select('id')
            .eq('patient_id', profile.id)
            .eq('is_active', true)
            .order('prescribed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activePrescription) {
            profile.currentPrescriptionId = activePrescription.id;
          }
        }
      }

      return res.json({
        token,
        user: normalizedUser,
        profile,
        needsProfileSetup,
        googleName
      });
    }

    // New user — create a pending account and let the user complete the remaining profile details
    const { role = 'PATIENT', fullName = googleName, createAccount = false, ...extraFields } = req.body;
    const placeholderHash = 'google-oauth:no-password';

    if (!createAccount) {
      return res.status(404).json({
        message: 'No account found for this Google email. Please complete registration first.',
        needsRegistration: true,
        email: googleEmail,
        googleName
      });
    }

    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{
        email: googleEmail,
        password_hash: placeholderHash,
        role,
        session_token: token,
        last_login: new Date().toISOString()
      }])
      .select('*')
      .single();

    if (createError) {
      console.error('Google user creation error:', createError);
      return res.status(500).json({ message: 'Failed to create user from Google account' });
    }

    const normalizedUser = normalizeRow(newUser);

    return res.status(201).json({
      token,
      user: normalizedUser,
      profile: null,
      needsProfileSetup: true,
      googleName
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ message: 'Google authentication failed' });
  }
});

// Complete Profile (for Google OAuth users who need to set up their role/profile)
router.post('/complete-profile', auth, async (req, res) => {
  try {
    const user = req.user;
    const { role, fullName, ...extraFields } = req.body;

    if (!role || !fullName) {
      return res.status(400).json({ message: 'Role and full name are required' });
    }

    if (!['PATIENT', 'CLINICIAN'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Update user role if different
    if (user.role !== role) {
      const { error: roleUpdateError } = await supabase
        .from('users')
        .update({ role })
        .eq('id', user.id);

      if (roleUpdateError) {
        console.error('Role update error:', roleUpdateError);
        return res.status(500).json({ message: 'Failed to update user role' });
      }
    }

    let profile = null;

    if (role === 'CLINICIAN') {
      if (!extraFields.licenseNumber) {
        return res.status(400).json({ message: 'License number is required for clinicians' });
      }
      const { data: clinician, error: clinicianError } = await supabase
        .from('clinicians')
        .insert([{
          user_id: user.id,
          full_name: fullName,
          medical_specialty: extraFields.medicalSpecialty || '',
          license_number: extraFields.licenseNumber
        }])
        .select('*')
        .single();

      if (clinicianError) {
        console.error('Clinician profile creation error:', clinicianError);
        return res.status(500).json({ message: 'Failed to create clinician profile' });
      }
      profile = normalizeRow(clinician);
    } else if (role === 'PATIENT') {
      if (!extraFields.amputationSide || !extraFields.amputationLevel) {
        return res.status(400).json({ message: 'Amputation side and level are required for patients' });
      }
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert([{
          user_id: user.id,
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
        console.error('Patient profile creation error:', patientError);
        return res.status(500).json({ message: 'Failed to create patient profile' });
      }
      profile = normalizeRow(patient);
    }

    // Fetch updated user
    const { data: updatedUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    res.json({
      user: normalizeRow(updatedUser),
      profile
    });
  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({ message: 'Failed to complete profile setup' });
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

    // Check if profile setup is needed (for Google OAuth users)
    const needsProfileSetup = !profile;

    res.json({
      user: normalizeRow(user),
      profile,
      needsProfileSetup
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

