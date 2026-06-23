import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PremiumLineChart } from './DashboardCharts';
import { PlusIcon, UserIcon, ActivityIcon, ClockIcon, AwardIcon, CheckIcon, ChevronRightIcon } from './Icons';

export const ClinicianDashboard = ({ user, profile }) => {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPatientSessions, setSelectedPatientSessions] = useState([]);
  const [selectedPatientPrescription, setSelectedPatientPrescription] = useState(null);

  // New Patient registration states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newSide, setNewSide] = useState('LEFT');
  const [newLevel, setNewLevel] = useState('TRANSRADIAL');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);

  // Prescription configuration states
  const [prescribedDuration, setPrescribedDuration] = useState(300);
  const [spawnRadius, setSpawnRadius] = useState(2.0);
  const [dwellTime, setDwellTime] = useState(1000);
  const [rxSaving, setRxSaving] = useState(false);
  const [rxSuccess, setRxSuccess] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const config = {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      };
      const res = await axios.get('http://localhost:5000/api/patients', config);
      setPatients(res.data);
    } catch (err) {
      console.error('Failed to fetch patients list:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    setSelectedPatientSessions([]);
    setSelectedPatientPrescription(null);
    setRxSuccess(false);

    try {
      const config = {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      };
      
      // Fetch selected patient's active prescription
      const rxRes = await axios.get(`http://localhost:5000/api/prescriptions/patient/${patient._id}`, config);
      setSelectedPatientPrescription(rxRes.data);
      
      // Seed prescription editor states
      setPrescribedDuration(rxRes.data?.prescribedSessionDurationSeconds || 300);
      setSpawnRadius(rxRes.data?.targetSpawnRadius || 2.0);
      setDwellTime(rxRes.data?.requiredHoverDwellTimeMs || 1000);

      // Fetch selected patient's completed sessions history
      const sessionsRes = await axios.get(`http://localhost:5000/api/sessions/patient/${patient._id}`, config);
      setSelectedPatientSessions(sessionsRes.data);
    } catch (err) {
      console.error('Failed to load patient detail data:', err);
    }
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess(false);

    try {
      const config = {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      };
      
      const payload = {
        email: newEmail,
        password: newPassword,
        fullName: newFullName,
        amputationSide: newSide,
        amputationLevel: newLevel
      };

      await axios.post('http://localhost:5000/api/patients', payload, config);
      
      setAddSuccess(true);
      setNewEmail('');
      setNewPassword('');
      setNewFullName('');
      
      // Reload lists
      fetchPatients();
      
      setTimeout(() => {
        setAddSuccess(false);
        setShowAddForm(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to register patient:', err);
      const msg = err.response?.data?.message || 'Failed to create patient account.';
      setAddError(msg);
    }
  };

  const handleSavePrescription = async (e) => {
    e.preventDefault();
    setRxSaving(true);
    setRxSuccess(false);

    try {
      const config = {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      };

      const payload = {
        patientId: selectedPatient._id,
        prescribedSessionDurationSeconds: Number(prescribedDuration),
        targetSpawnRadius: Number(spawnRadius),
        requiredHoverDwellTimeMs: Number(dwellTime)
      };

      const res = await axios.post('http://localhost:5000/api/prescriptions', payload, config);
      if (res.data) {
        setSelectedPatientPrescription(res.data);
        setRxSuccess(true);
        setTimeout(() => setRxSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to post clinical prescription:', err);
    } finally {
      setRxSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading clinician portal data...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '30px 20px', maxWidth: '1200px', margin: '0 auto', textAlign: 'left' }}>
      
      {/* Title */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>
            Clinician Dashboard
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Welcome, <strong>{profile?.fullName || 'Therapist'}</strong> ({profile?.medicalSpecialty || 'PLP Specialist'})
          </p>
        </div>

        <button 
          className="btn btn-primary" 
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <PlusIcon className="w-5 h-5" /> {showAddForm ? 'View Patients' : 'Register New Patient'}
        </button>
      </section>

      {showAddForm ? (
        /* Patient Onboarding form */
        <section className="glass-panel p-8 animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', marginBottom: '20px' }}>Onboard New Patient</h3>
          
          {addError && (
            <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--error)', color: '#f43f5e', padding: '12px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '20px' }}>
              {addError}
            </div>
          )}
          {addSuccess && (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', color: '#10b981', padding: '12px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckIcon className="w-5 h-5" /> Patient registered successfully!
            </div>
          )}

          <form onSubmit={handleAddPatient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label htmlFor="patient-name">Patient Full Name</label>
              <input id="patient-name" type="text" placeholder="e.g. John Doe" required value={newFullName} onChange={e => setNewFullName(e.target.value)} />
            </div>

            <div>
              <label htmlFor="patient-email">Login Email Address</label>
              <input id="patient-email" type="email" placeholder="e.g. john@mail.com" required value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>

            <div>
              <label htmlFor="patient-pass">Temporary Password</label>
              <input id="patient-pass" type="password" placeholder="••••••••" required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label htmlFor="patient-side">Amputation Side</label>
                <select id="patient-side" value={newSide} onChange={e => setNewSide(e.target.value)}>
                  <option value="LEFT">Left Side</option>
                  <option value="RIGHT">Right Side</option>
                </select>
              </div>
              <div>
                <label htmlFor="patient-level">Amputation Level</label>
                <select id="patient-level" value={newLevel} onChange={e => setNewLevel(e.target.value)}>
                  <option value="TRANSRADIAL">Transradial (Below Elbow)</option>
                  <option value="TRANSHUMERAL">Transhumeral (Above Elbow)</option>
                  <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                  <option value="FINGER_AMPUTATION">Fingers Only</option>
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
              Create Patient Credentials
            </button>
          </form>
        </section>
      ) : (
        /* Main Clinician View: Table & Review Panel */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '30px', alignItems: 'start' }}>
          
          {/* Patients Listing list */}
          <div className="glass-panel p-6" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Your Enrolled Patients</h3>
            {patients.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>No patients currently enrolled.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {patients.map((pat) => (
                  <div 
                    key={pat._id} 
                    onClick={() => handleSelectPatient(pat)}
                    className="glass-panel" 
                    style={{ 
                      padding: '16px', 
                      cursor: 'pointer', 
                      borderLeft: selectedPatient?._id === pat._id ? '4px solid var(--accent-purple)' : '1px solid var(--border-color)',
                      background: selectedPatient?._id === pat._id ? 'var(--bg-secondary)' : '',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      <strong style={{ display: 'block', color: selectedPatient?._id === pat._id ? '#fff' : 'var(--text-primary)' }}>{pat.fullName}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {pat.amputationSide} Amputation | {pat.amputationLevel}
                      </span>
                    </div>
                    <ChevronRightIcon className="w-5 h-5" style={{ color: selectedPatient?._id === pat._id ? 'var(--accent-purple)' : 'var(--text-muted)' }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected Patient Telemetry Review & Prescription Panel */}
          {selectedPatient ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              
              {/* Profile Details & Prescription Form */}
              <div className="glass-panel p-8">
                <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', marginBottom: '4px' }}>
                  Manage: {selectedPatient.fullName}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                  3D Render Scale: <strong>{selectedPatient.meshScaleMultiplier}x</strong> | Accent color: <span style={{ color: selectedPatient.skinToneSliderHex, fontWeight: 700 }}>{selectedPatient.skinToneSliderHex.toUpperCase()}</span>
                </p>

                <h4 style={{ fontSize: '1.1rem', marginBottom: '16px', fontFamily: 'var(--font-display)' }}>Update Treatment Prescription</h4>
                
                <form onSubmit={handleSavePrescription} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label htmlFor="rx-dur">Duration (Seconds)</label>
                      <input 
                        id="rx-dur"
                        type="number" 
                        min="30" 
                        max="1800" 
                        value={prescribedDuration} 
                        onChange={e => setPrescribedDuration(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label htmlFor="rx-rad">Spawn Boundary (m)</label>
                      <input 
                        id="rx-rad"
                        type="number" 
                        step="0.1" 
                        min="0.5" 
                        max="5.0" 
                        value={spawnRadius} 
                        onChange={e => setSpawnRadius(e.target.value)} 
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="rx-dwell">Hover Dwell Threshold (ms)</label>
                    <input 
                      id="rx-dwell"
                      type="number" 
                      min="100" 
                      max="5000" 
                      step="100" 
                      value={dwellTime} 
                      onChange={e => setDwellTime(e.target.value)} 
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button type="submit" className="btn btn-primary" disabled={rxSaving}>
                      {rxSaving ? 'Saving...' : 'Update Prescription'}
                    </button>
                    {rxSuccess && (
                      <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', fontWeight: 600 }}>
                        <CheckIcon className="w-5 h-5" /> Saved!
                      </span>
                    )}
                  </div>
                </form>
              </div>

              {/* Selected Patient Graphs */}
              <div>
                <h3 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-display)', marginBottom: '20px' }}>
                  {selectedPatient.fullName}'s Progress Charts
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <PremiumLineChart 
                    data={selectedPatientSessions} 
                    yField="accuracyPercentage" 
                    title="Target Accuracy History" 
                    stroke="var(--accent-purple)" 
                    suffix="%"
                  />
                  <PremiumLineChart 
                    data={selectedPatientSessions} 
                    yField="peakRangeOfMotionDegrees" 
                    title="Range of Motion (ROM) Trend" 
                    stroke="var(--accent-cyan)" 
                    suffix="°"
                  />
                </div>
              </div>

            </div>
          ) : (
            <div className="glass-panel p-8 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'var(--text-secondary)' }}>
              <UserIcon className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
              <p>Select a patient from the left column to configure treatment prescriptions and view telemetry progress charts.</p>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
