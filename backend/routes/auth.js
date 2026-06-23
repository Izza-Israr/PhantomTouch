const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Clinician = require('../models/Clinician');
const Patient = require('../models/Patient');
const { hashPassword, verifyPassword, generateToken } = require('../utils/authHelper');
const auth = require('../middleware/auth');

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

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const passwordHash = hashPassword(password);
    const token = generateToken();

    const newUser = new User({
      email: email.toLowerCase(),
      passwordHash,
      role,
      sessionToken: token,
      lastLogin: new Date()
    });

    await newUser.save();

    let profile = null;

    if (role === 'CLINICIAN') {
      if (!extraFields.licenseNumber) {
        return res.status(400).json({ message: 'License number required for clinicians' });
      }
      const clinician = new Clinician({
        userId: newUser._id,
        fullName,
        medicalSpecialty: extraFields.medicalSpecialty || '',
        licenseNumber: extraFields.licenseNumber,
        hospitalId: extraFields.hospitalId || null
      });
      profile = await clinician.save();
    } else if (role === 'PATIENT') {
      if (!extraFields.amputationSide || !extraFields.amputationLevel) {
        return res.status(400).json({ message: 'Amputation side and level required for patients' });
      }
      const patient = new Patient({
        userId: newUser._id,
        fullName,
        dateOfBirth: extraFields.dateOfBirth ? new Date(extraFields.dateOfBirth) : null,
        amputationSide: extraFields.amputationSide,
        amputationLevel: extraFields.amputationLevel,
        assignedClinicianId: extraFields.assignedClinicianId || null,
        hospitalId: extraFields.hospitalId || null,
        skinToneSliderHex: extraFields.skinToneSliderHex || '#aa3bff',
        meshScaleMultiplier: extraFields.meshScaleMultiplier || 1.0
      });
      profile = await patient.save();
    }

    res.status(214).json({
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role
      },
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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateToken();
    user.sessionToken = token;
    user.lastLogin = new Date();
    await user.save();

    let profile = null;
    if (user.role === 'CLINICIAN') {
      profile = await Clinician.findOne({ userId: user._id });
    } else if (user.role === 'PATIENT') {
      profile = await Patient.findOne({ userId: user._id });
    }

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      },
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
      profile = await Clinician.findOne({ userId: user._id });
    } else if (user.role === 'PATIENT') {
      profile = await Patient.findOne({ userId: user._id });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      },
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
    user.sessionToken = undefined;
    await user.save();
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Failed to log out' });
  }
});

module.exports = router;
