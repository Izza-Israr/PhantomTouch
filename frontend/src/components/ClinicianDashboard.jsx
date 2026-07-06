import { useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import { PremiumLineChart } from './DashboardCharts';
import { PlusIcon, UserIcon, ActivityIcon, ClockIcon, AwardIcon, CheckIcon, ChevronRightIcon } from './Icons';

export const ClinicianDashboard = ({ user, profile, theme, onToggleTheme }) => {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPatientSessions, setSelectedPatientSessions] = useState([]);
  const [selectedPatientPrescription, setSelectedPatientPrescription] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newSide, setNewSide] = useState('LEFT');
  const [newLevel, setNewLevel] = useState('TRANSRADIAL');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  const [prescribedDuration, setPrescribedDuration] = useState(300);
  const [spawnRadius, setSpawnRadius] = useState(2.0);
  const [dwellTime, setDwellTime] = useState(1000);
  const [rxSaving, setRxSaving] = useState(false);
  const [rxSuccess, setRxSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPatients = useCallback(async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
      const res = await axios.get('http://localhost:5000/api/patients', config);
      setPatients(res.data);
    } catch (err) {
      console.error('Failed to fetch patients list:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPatients();
  }, [fetchPatients]);

  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    setSelectedPatientSessions([]);
    setSelectedPatientPrescription(null);
    setRxSuccess(false);

    try {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
      const [rxRes, sessionsRes] = await Promise.all([
        axios.get(`http://localhost:5000/api/prescriptions/patient/${patient._id}`, config),
        axios.get(`http://localhost:5000/api/sessions/patient/${patient._id}`, config)
      ]);

      setSelectedPatientPrescription(rxRes.data);
      setPrescribedDuration(rxRes.data?.prescribedSessionDurationSeconds || 300);
      setSpawnRadius(rxRes.data?.targetSpawnRadius || 2.0);
      setDwellTime(rxRes.data?.requiredHoverDwellTimeMs || 1000);
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
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
      await axios.post('http://localhost:5000/api/patients', {
        email: newEmail,
        password: newPassword,
        fullName: newFullName,
        amputationSide: newSide,
        amputationLevel: newLevel
      }, config);

      setAddSuccess(true);
      setNewEmail('');
      setNewPassword('');
      setNewFullName('');
      fetchPatients();
      setTimeout(() => {
        setAddSuccess(false);
        setShowAddForm(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to register patient:', err);
      setAddError(err.response?.data?.message || 'Failed to create patient account.');
    }
  };

  const handleSavePrescription = async (e) => {
    e.preventDefault();
    setRxSaving(true);
    setRxSuccess(false);

    try {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
      const res = await axios.post('http://localhost:5000/api/prescriptions', {
        patientId: selectedPatient._id,
        prescribedSessionDurationSeconds: Number(prescribedDuration),
        targetSpawnRadius: Number(spawnRadius),
        requiredHoverDwellTimeMs: Number(dwellTime)
      }, config);

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

  const selectedRuns = selectedPatientSessions.length;
  const selectedAccuracy = selectedRuns
    ? Math.round(selectedPatientSessions.reduce((acc, curr) => acc + (curr.accuracyPercentage || 0), 0) / selectedRuns)
    : 0;
  const selectedROM = selectedRuns
    ? Math.max(...selectedPatientSessions.map(s => s.peakRangeOfMotionDegrees || 0))
    : 0;
  const selectedMinutes = selectedRuns
    ? Math.round(selectedPatientSessions.reduce((acc, curr) => acc + (curr.totalDurationSeconds || 0), 0) / 60)
    : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading clinician portal data...</p>
      </div>
    );
  }

  return (
    <div className="clinical-dashboard animate-fade-in">
      <section className="clinical-toolbar">
        <div>
          <span className="clinical-eyebrow">Clinician command center</span>
          <h2 className="clinical-title">Clinician Dashboard</h2>
          <p className="clinical-subtitle">
            Welcome, <strong>{profile?.fullName || user?.email || 'Therapist'}</strong>. Monitor assigned patients,
            update prescriptions, and review performance trends from saved practice sessions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary theme-toggle" onClick={onToggleTheme}>
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
            <PlusIcon className="w-5 h-5" /> {showAddForm ? 'View Patients' : 'Register Patient'}
          </button>
        </div>
      </section>

      <section className="metric-grid">
        <div className="glass-panel metric-card">
          <div className="metric-icon"><UserIcon /></div>
          <div><span>Assigned Patients</span><strong>{patients.length}</strong></div>
        </div>
        <div className="glass-panel metric-card">
          <div className="metric-icon" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}><ActivityIcon /></div>
          <div><span>Selected Sessions</span><strong>{selectedRuns}</strong></div>
        </div>
        <div className="glass-panel metric-card">
          <div className="metric-icon" style={{ background: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)' }}><AwardIcon /></div>
          <div><span>Selected Accuracy</span><strong>{selectedAccuracy}%</strong></div>
        </div>
        <div className="glass-panel metric-card">
          <div className="metric-icon" style={{ background: 'rgba(120, 82, 255, 0.12)', color: '#7852ff' }}><ClockIcon /></div>
          <div><span>Selected Practice</span><strong>{selectedMinutes}m</strong></div>
        </div>
      </section>

      {showAddForm ? (
        <section className="glass-panel clinical-card animate-fade-in" style={{ maxWidth: 680, margin: '0 auto' }}>
          <div className="clinical-card-title"><h3>Onboard New Patient</h3></div>
          {addError && <div style={{ background: 'rgba(225, 29, 72, 0.1)', border: '1px solid var(--error)', color: 'var(--error)', padding: 12, borderRadius: 8, marginBottom: 18 }}>{addError}</div>}
          {addSuccess && (
            <div style={{ background: 'var(--success-glow)', border: '1px solid var(--success)', color: 'var(--success)', padding: 12, borderRadius: 8, marginBottom: 18, display: 'flex', gap: 8, alignItems: 'center' }}>
              <CheckIcon className="w-5 h-5" /> Patient registered successfully.
            </div>
          )}
          <form onSubmit={handleAddPatient} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label htmlFor="patient-name">Patient Full Name</label><input id="patient-name" type="text" required value={newFullName} onChange={e => setNewFullName(e.target.value)} /></div>
            <div><label htmlFor="patient-email">Login Email Address</label><input id="patient-email" type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div>
            <div><label htmlFor="patient-pass">Temporary Password</label><input id="patient-pass" type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div><label htmlFor="patient-side">Amputation Side</label><select id="patient-side" value={newSide} onChange={e => setNewSide(e.target.value)}><option value="LEFT">Left Side</option><option value="RIGHT">Right Side</option></select></div>
              <div><label htmlFor="patient-level">Amputation Level</label><select id="patient-level" value={newLevel} onChange={e => setNewLevel(e.target.value)}><option value="TRANSRADIAL">Transradial</option><option value="TRANSHUMERAL">Transhumeral</option><option value="WRIST_DISARTICULATION">Wrist Disarticulation</option><option value="FINGER_AMPUTATION">Fingers Only</option></select></div>
            </div>
            <button type="submit" className="btn btn-primary">Create Patient Credentials</button>
          </form>
        </section>
      ) : (
        <div className="clinical-grid">
          <div className="glass-panel clinical-card">
            <div className="clinical-card-title">
              <h3>Enrolled Patients</h3>
              <span className="clinical-eyebrow">Care list</span>
            </div>
            {patients.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No patients currently enrolled.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {patients.map((pat) => (
                  <button
                    key={pat._id}
                    type="button"
                    onClick={() => handleSelectPatient(pat)}
                    className="glass-panel"
                    style={{
                      width: '100%',
                      padding: 14,
                      borderColor: selectedPatient?._id === pat._id ? 'var(--accent-purple)' : 'var(--border-color)',
                      background: selectedPatient?._id === pat._id ? 'var(--accent-purple-dim)' : 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      justifyContent: 'space-between',
                      textAlign: 'left'
                    }}
                  >
                    <span>
                      <strong style={{ display: 'block' }}>{pat.fullName}</strong>
                      <small style={{ color: 'var(--text-secondary)' }}>{pat.amputationSide} | {pat.amputationLevel}</small>
                    </span>
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedPatient ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="glass-panel clinical-card">
                <div className="clinical-card-title">
                  <h3>{selectedPatient.fullName}</h3>
                  <span className="clinical-eyebrow">Treatment setup</span>
                </div>
                <div className="clinical-table" style={{ marginBottom: 18 }}>
                  <div className="clinical-row"><span>3D scale</span><strong>{selectedPatient.meshScaleMultiplier || 1}x</strong></div>
                  <div className="clinical-row"><span>Peak ROM</span><strong>{selectedROM}&deg;</strong></div>
                  <div className="clinical-row"><span>Current prescription</span><strong>{selectedPatientPrescription ? `${Math.round(selectedPatientPrescription.prescribedSessionDurationSeconds / 60)} min` : 'Default'}</strong></div>
                </div>
                <form onSubmit={handleSavePrescription} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                    <div><label htmlFor="rx-dur">Duration (Seconds)</label><input id="rx-dur" type="number" min="30" max="1800" value={prescribedDuration} onChange={e => setPrescribedDuration(e.target.value)} /></div>
                    <div><label htmlFor="rx-rad">Spawn Boundary (m)</label><input id="rx-rad" type="number" step="0.1" min="0.5" max="5.0" value={spawnRadius} onChange={e => setSpawnRadius(e.target.value)} /></div>
                  </div>
                  <div><label htmlFor="rx-dwell">Hover Dwell Threshold (ms)</label><input id="rx-dwell" type="number" min="100" max="5000" step="100" value={dwellTime} onChange={e => setDwellTime(e.target.value)} /></div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="submit" className="btn btn-primary" disabled={rxSaving}>{rxSaving ? 'Saving...' : 'Update Prescription'}</button>
                    {rxSuccess && <span style={{ color: 'var(--success)', display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 700 }}><CheckIcon className="w-5 h-5" /> Saved</span>}
                  </div>
                </form>
              </div>

              <div className="chart-grid">
                <PremiumLineChart data={selectedPatientSessions} yField="accuracyPercentage" title={`${selectedPatient.fullName} Accuracy`} stroke="var(--accent-purple)" suffix="%" />
                <PremiumLineChart data={selectedPatientSessions} yField="peakRangeOfMotionDegrees" title={`${selectedPatient.fullName} Range of Motion`} stroke="var(--accent-cyan)" suffix="deg" />
              </div>
            </div>
          ) : (
            <div className="glass-panel clinical-card" style={{ minHeight: 300, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div>
                <UserIcon className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
                <p>Select a patient to configure prescriptions and view performance graphs.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
