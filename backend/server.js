require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Routes imports
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const prescriptionRoutes = require('./routes/prescriptions');
const sessionRoutes = require('./routes/sessions');

// Bind API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/sessions', sessionRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PhantomTouch backend is running' });
});

// Database Auto-Seeder
const Hospital = require('./models/Hospital');
const User = require('./models/User');
const Clinician = require('./models/Clinician');
const Patient = require('./models/Patient');
const ClinicalPrescription = require('./models/ClinicalPrescription');
const TherapySession = require('./models/TherapySession');
const { hashPassword } = require('./utils/authHelper');

async function seedDatabase() {
  try {
    const hospitalCount = await Hospital.countDocuments();
    if (hospitalCount > 0) {
      console.log('Database already seeded.');
      return;
    }

    console.log('Seeding default database records...');

    // 1. Seed Hospital
    const hospital = new Hospital({
      hospitalName: 'PhantomTouch Telerehab Center',
      regulatoryLicense: 'PT-12345-USA',
      city: 'Seattle',
      country: 'USA'
    });
    await hospital.save();
    console.log('Seeded Hospital:', hospital.hospitalName);

    // 2. Seed Clinician User
    const docPass = hashPassword('doctor123');
    const docUser = new User({
      email: 'doctor@phantomtouch.com',
      passwordHash: docPass,
      role: 'CLINICIAN'
    });
    await docUser.save();

    const clinician = new Clinician({
      userId: docUser._id,
      hospitalId: hospital._id,
      fullName: 'Dr. Sarah Jenkins',
      medicalSpecialty: 'Neurological Rehabilitation & PLP',
      licenseNumber: 'LIC-778899'
    });
    await clinician.save();
    console.log('Seeded Clinician User:', docUser.email);

    // 3. Seed Patient Users
    const patPass = hashPassword('patient123');
    const patUser1 = new User({
      email: 'patient@phantomtouch.com',
      passwordHash: patPass,
      role: 'PATIENT'
    });
    await patUser1.save();

    const patient1 = new Patient({
      userId: patUser1._id,
      hospitalId: hospital._id,
      assignedClinicianId: clinician._id,
      fullName: 'Alex Carter',
      dateOfBirth: new Date('1985-05-15'),
      amputationSide: 'LEFT',
      amputationLevel: 'TRANSRADIAL',
      skinToneSliderHex: '#aa3bff',
      meshScaleMultiplier: 1.0
    });
    await patient1.save();
    console.log('Seeded Patient 1:', patUser1.email);

    const patUser2 = new User({
      email: 'john@phantomtouch.com',
      passwordHash: patPass,
      role: 'PATIENT'
    });
    await patUser2.save();

    const patient2 = new Patient({
      userId: patUser2._id,
      hospitalId: hospital._id,
      assignedClinicianId: clinician._id,
      fullName: 'John Doe',
      dateOfBirth: new Date('1990-11-20'),
      amputationSide: 'RIGHT',
      amputationLevel: 'TRANSHUMERAL',
      skinToneSliderHex: '#00f5ff',
      meshScaleMultiplier: 1.2
    });
    await patient2.save();
    console.log('Seeded Patient 2:', patUser2.email);

    // 4. Seed Clinical Prescription for Alex
    const prescription = new ClinicalPrescription({
      patientId: patient1._id,
      clinicianId: clinician._id,
      prescribedSessionDurationSeconds: 120, // 2 minutes
      targetSpawnRadius: 2.5,
      requiredHoverDwellTimeMs: 800, // 0.8 seconds
      isActive: true
    });
    await prescription.save();
    console.log('Seeded Prescription for Alex Carter');

    // 5. Seed Historical Sessions for Alex
    const now = new Date();
    const sessionData = [
      { offsetDays: 5, spawned: 10, hit: 6, rom: 45, duration: 120 },
      { offsetDays: 4, spawned: 12, hit: 9, rom: 52, duration: 120 },
      { offsetDays: 2, spawned: 15, hit: 13, rom: 68, duration: 120 },
      { offsetDays: 1, spawned: 15, hit: 15, rom: 75, duration: 120 }
    ];

    for (const data of sessionData) {
      const sTime = new Date(now.getTime() - data.offsetDays * 24 * 60 * 60 * 1000);
      const eTime = new Date(sTime.getTime() + data.duration * 1000);
      
      const session = new TherapySession({
        patientId: patient1._id,
        prescriptionId: prescription._id,
        startTime: sTime,
        endTime: eTime,
        totalDurationSeconds: data.duration,
        targetsSpawned: data.spawned,
        targetsHit: data.hit,
        accuracyPercentage: Math.round((data.hit / data.spawned) * 100),
        peakRangeOfMotionDegrees: data.rom
      });
      await session.save();
    }
    console.log('Seeded 4 therapy history runs for Alex Carter');

  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB connected');
    await seedDatabase();
  })
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));