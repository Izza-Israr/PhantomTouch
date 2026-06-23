const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Patient = require('../models/Patient');
const Clinician = require('../models/Clinician');
const auth = require('../middleware/auth');
const { hashPassword, generateToken } = require('../utils/authHelper');

// Get all patients assigned to a clinician (or all patients if admin)
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'CLINICIAN') {
      const clinician = await Clinician.findOne({ userId: req.user._id });
      if (!clinician) {
        return res.status(404).json({ message: 'Clinician profile not found' });
      }
      query.assignedClinicianId = clinician._id;
    } else if (req.user.role === 'PATIENT') {
      // Patients should only see themselves
      query.userId = req.user._id;
    }
    
    const list = await Patient.find(query).populate('assignedClinicianId');
    res.json(list);
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

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Get clinician ID
    let assignedClinicianId = null;
    let hospitalId = null;
    if (req.user.role === 'CLINICIAN') {
      const clinician = await Clinician.findOne({ userId: req.user._id });
      if (clinician) {
        assignedClinicianId = clinician._id;
        hospitalId = clinician.hospitalId;
      }
    }

    // Create User
    const passwordHash = hashPassword(password);
    const newUser = new User({
      email: email.toLowerCase(),
      passwordHash,
      role: 'PATIENT',
    });
    await newUser.save();

    // Create Patient profile
    const newPatient = new Patient({
      userId: newUser._id,
      fullName,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      amputationSide,
      amputationLevel,
      assignedClinicianId,
      hospitalId,
      skinToneSliderHex: skinToneSliderHex || '#aa3bff',
      meshScaleMultiplier: meshScaleMultiplier || 1.0
    });
    await newPatient.save();

    res.status(214).json(newPatient);
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ message: 'Failed to create patient account' });
  }
});

// Get detailed view of specific patient
router.get('/:id', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('assignedClinicianId')
      .populate('hospitalId');
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Authorization checks
    if (req.user.role === 'PATIENT' && patient.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(patient);
  } catch (error) {
    console.error('Fetch patient detail error:', error);
    res.status(500).json({ message: 'Failed to retrieve patient details' });
  }
});

// Update patient settings/calibration variables
router.put('/:id', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    // Authorization: only the patient themselves, their assigned clinician, or an admin
    if (req.user.role === 'PATIENT' && patient.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied to this profile' });
    }

    const { fullName, amputationSide, amputationLevel, skinToneSliderHex, meshScaleMultiplier, assignedClinicianId } = req.body;

    if (fullName) patient.fullName = fullName;
    if (amputationSide) patient.amputationSide = amputationSide;
    if (amputationLevel) patient.amputationLevel = amputationLevel;
    if (skinToneSliderHex) patient.skinToneSliderHex = skinToneSliderHex;
    if (meshScaleMultiplier !== undefined) patient.meshScaleMultiplier = Number(meshScaleMultiplier);
    if (assignedClinicianId && req.user.role === 'ADMIN') patient.assignedClinicianId = assignedClinicianId;

    await patient.save();
    res.json(patient);
  } catch (error) {
    console.error('Update patient profile error:', error);
    res.status(500).json({ message: 'Failed to update patient profile' });
  }
});

module.exports = router;
