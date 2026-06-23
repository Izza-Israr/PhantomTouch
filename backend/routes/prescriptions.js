const express = require('express');
const router = express.Router();
const ClinicalPrescription = require('../models/ClinicalPrescription');
const Patient = require('../models/Patient');
const Clinician = require('../models/Clinician');
const auth = require('../middleware/auth');

// Get current active prescription for a specific patient
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Check access permissions
    if (req.user.role === 'PATIENT') {
      const patient = await Patient.findOne({ userId: req.user._id });
      if (!patient || patient._id.toString() !== patientId) {
        return res.status(403).json({ message: 'Access denied to this prescription' });
      }
    }

    const prescription = await ClinicalPrescription.findOne({ patientId, isActive: true })
      .populate('clinicianId');
    
    // If no active prescription exists, return a default/mock one so the app doesn't crash
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

    res.json(prescription);
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

    // Verify patient profile exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    // Get clinician profile
    const clinician = await Clinician.findOne({ userId: req.user._id });
    if (!clinician) {
      return res.status(404).json({ message: 'Clinician profile not found' });
    }

    // Deactivate previous active prescriptions
    await ClinicalPrescription.updateMany(
      { patientId, isActive: true },
      { $set: { isActive: false } }
    );

    // Save new prescription
    const newPrescription = new ClinicalPrescription({
      patientId,
      clinicianId: clinician._id,
      prescribedSessionDurationSeconds: prescribedSessionDurationSeconds ? Number(prescribedSessionDurationSeconds) : 300,
      targetSpawnRadius: targetSpawnRadius ? Number(targetSpawnRadius) : 2.0,
      requiredHoverDwellTimeMs: requiredHoverDwellTimeMs ? Number(requiredHoverDwellTimeMs) : 1000,
      isActive: true
    });

    await newPrescription.save();
    res.status(214).json(newPrescription);
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

    const prescription = await ClinicalPrescription.findById(req.params.id);
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }

    prescription.isActive = false;
    await prescription.save();

    res.json(prescription);
  } catch (error) {
    console.error('Deactivate prescription error:', error);
    res.status(500).json({ message: 'Failed to archive prescription' });
  }
});

module.exports = router;
