require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./utils/supabaseClient');
const { hashPassword } = require('./utils/authHelper');

const app = express();
app.use(cors());
app.use(express.json());

// Routes imports
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const prescriptionRoutes = require('./routes/prescriptions');
const sessionRoutes = require('./routes/sessions');
const notificationRoutes = require('./routes/notifications');

// Bind API Routes
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/patients', '/patients'], patientRoutes);
app.use(['/api/prescriptions', '/prescriptions'], prescriptionRoutes);
app.use(['/api/sessions', '/sessions'], sessionRoutes);
app.use(['/api/notifications', '/notifications'], notificationRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PhantomTouch backend root. Use /api/* routes.' });
});

app.get('/api', (req, res) => {
  res.json({ status: 'ok', message: 'PhantomTouch API root. Use /api/auth, /api/health, etc.' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PhantomTouch backend is running' });
});

async function seedDatabase() {
  try {
    const { count, error: countError } = await supabase
      .from('hospitals')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Seed skipped: could not count hospitals. Supabase error:', countError);
      console.error('Check that SUPABASE_SERVICE_KEY is the service role key and that the backend is using it.');
      return;
    }

    if (count === null || count === undefined) {
      console.error('Seed skipped: count result was not returned from Supabase.');
      return;
    }

    if (count > 0) {
      console.log('Supabase already seeded.');
      return;
    }

    console.log('Seeding default Supabase database records...');

    const { data: hospital, error: hospitalError } = await supabase
      .from('hospitals')
      .insert([{
        hospital_name: 'PhantomTouch Telerehab Center',
        regulatory_license: 'PT-12345-USA',
        city: 'Seattle',
        country: 'USA'
      }])
      .select('id')
      .single();

    if (hospitalError) throw hospitalError;

    const docPass = hashPassword('doctor123');
    const { data: docUser, error: docUserError } = await supabase
      .from('users')
      .insert([{
        email: 'doctor@phantomtouch.com',
        password_hash: docPass,
        role: 'CLINICIAN',
        session_token: null,
        last_login: null
      }])
      .select('id')
      .single();

    if (docUserError) throw docUserError;

    const { data: clinician, error: clinicianError } = await supabase
      .from('clinicians')
      .insert([{
        user_id: docUser.id,
        hospital_id: hospital.id,
        full_name: 'Dr. Sarah Jenkins',
        medical_specialty: 'Neurological Rehabilitation & PLP',
        license_number: 'LIC-778899'
      }])
      .select('id')
      .single();

    if (clinicianError) throw clinicianError;
    console.log('Seeded Clinician User: doctor@phantomtouch.com');

    const patPass = hashPassword('patient123');
    const { data: patUser1, error: patUser1Error } = await supabase
      .from('users')
      .insert([{
        email: 'patient@phantomtouch.com',
        password_hash: patPass,
        role: 'PATIENT',
        session_token: null,
        last_login: null
      }])
      .select('id')
      .single();

    if (patUser1Error) throw patUser1Error;

    const { data: patient1, error: patient1Error } = await supabase
      .from('patients')
      .insert([{
        user_id: patUser1.id,
        hospital_id: hospital.id,
        assigned_clinician_id: clinician.id,
        full_name: 'Alex Carter',
        date_of_birth: '1985-05-15',
        amputation_side: 'LEFT',
        amputation_level: 'TRANSRADIAL',
        skin_tone_slider_hex: '#aa3bff',
        mesh_scale_multiplier: 1.0
      }])
      .select('id')
      .single();

    if (patient1Error) throw patient1Error;
    console.log('Seeded Patient 1: patient@phantomtouch.com');

    const { data: patUser2, error: patUser2Error } = await supabase
      .from('users')
      .insert([{
        email: 'john@phantomtouch.com',
        password_hash: patPass,
        role: 'PATIENT',
        session_token: null,
        last_login: null
      }])
      .select('id')
      .single();

    if (patUser2Error) throw patUser2Error;

    const { data: patient2, error: patient2Error } = await supabase
      .from('patients')
      .insert([{
        user_id: patUser2.id,
        hospital_id: hospital.id,
        assigned_clinician_id: clinician.id,
        full_name: 'John Doe',
        date_of_birth: '1990-11-20',
        amputation_side: 'RIGHT',
        amputation_level: 'TRANSHUMERAL',
        skin_tone_slider_hex: '#00f5ff',
        mesh_scale_multiplier: 1.2
      }])
      .select('id')
      .single();

    if (patient2Error) throw patient2Error;
    console.log('Seeded Patient 2: john@phantomtouch.com');

    const { data: prescription, error: prescriptionError } = await supabase
      .from('clinical_prescriptions')
      .insert([{
        patient_id: patient1.id,
        clinician_id: clinician.id,
        prescribed_session_duration_seconds: 120,
        target_spawn_radius: 2.5,
        required_hover_dwell_time_ms: 800,
        is_active: true
      }])
      .select('id')
      .single();

    if (prescriptionError) throw prescriptionError;
    console.log('Seeded Prescription for Alex Carter');

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

      const { error: sessionError } = await supabase
        .from('therapy_sessions')
        .insert([{
          patient_id: patient1.id,
          prescription_id: prescription.id,
          start_time: sTime,
          end_time: eTime,
          total_duration_seconds: data.duration,
          targets_spawned: data.spawned,
          targets_hit: data.hit,
          accuracy_percentage: Math.round((data.hit / data.spawned) * 100),
          peak_range_of_motion_degrees: data.rom
        }]);

      if (sessionError) throw sessionError;
    }

    console.log('Seeded 4 therapy history runs for Alex Carter');
  } catch (error) {
    console.error('Error seeding Supabase database:', error);
  }
}

if (!process.env.VERCEL) {
  seedDatabase().catch((error) => console.error('Seed init error:', error));

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;