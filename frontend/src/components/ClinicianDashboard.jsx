import { useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import { PremiumLineChart } from './DashboardCharts';
import { PlusIcon, UserIcon, CheckIcon, ChevronRightIcon } from './Icons';

export const ClinicianDashboard = ({ user, profile, theme, onToggleTheme, view }) => {
  const [patients, setPatients] = useState([]);
  // Sessions aren't included in GET /api/patients, so we fetch them separately
  // per patient and key them here by patient id — this is what actually makes
  // "session runs" counts real instead of always reading undefined.
  const [patientSessionsMap, setPatientSessionsMap] = useState({});
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPatientSessions, setSelectedPatientSessions] = useState([]);
  const [selectedPatientPrescription, setSelectedPatientPrescription] = useState(null);
  const [modalTab, setModalTab] = useState('progress');
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
      const res = await axios.get('/api/patients', config);
      const patientList = res.data || [];
      setPatients(patientList);

      // GET /api/patients doesn't return session data, so pull each patient's
      // sessions separately and store them keyed by patient id.
      const entries = await Promise.all(
        patientList.map(async (pat) => {
          try {
            const sRes = await axios.get(`/api/sessions/patient/${pat._id}`, config);
            return [pat._id, sRes.data || []];
          } catch (err) {
            console.error(`Failed to load sessions for patient ${pat._id}:`, err);
            return [pat._id, []];
          }
        })
      );
      setPatientSessionsMap(Object.fromEntries(entries));
    } catch (err) {
      console.error('Failed to fetch patients list:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleSelectPatient = async (patient, tab = 'progress') => {
    setSelectedPatient(patient);
    setModalTab(tab);
    // Show cached session data immediately so the modal isn't empty while the
    // fresh request is in flight.
    setSelectedPatientSessions(patientSessionsMap[patient._id] || []);
    setSelectedPatientPrescription(null);
    setRxSuccess(false);

    try {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
      const [rxRes, sessionsRes] = await Promise.all([
        axios.get(`/api/prescriptions/patient/${patient._id}`, config),
        axios.get(`/api/sessions/patient/${patient._id}`, config)
      ]);

      setSelectedPatientPrescription(rxRes.data);
      setPrescribedDuration(rxRes.data?.prescribedSessionDurationSeconds || 300);
      setSpawnRadius(rxRes.data?.targetSpawnRadius || 2.0);
      setDwellTime(rxRes.data?.requiredHoverDwellTimeMs || 1000);
      setSelectedPatientSessions(sessionsRes.data);
      // Keep the cached map fresh too, so the patient list count stays correct.
      setPatientSessionsMap((prev) => ({ ...prev, [patient._id]: sessionsRes.data }));
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
      await axios.post('/api/patients', {
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
      const res = await axios.post('/api/prescriptions', {
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

  // Real, derived from actual session data — used to fill the overview with
  // something genuine instead of a broken/invented stat.
  const recentlyActivePatients = patients
    .map((pat) => {
      const sessions = patientSessionsMap[pat._id] || [];
      const lastSession = sessions.reduce((latest, s) => {
        const t = s.startTime ? new Date(s.startTime).getTime() : 0;
        return t > latest ? t : latest;
      }, 0);
      return { patient: pat, sessionCount: sessions.length, lastSessionTime: lastSession };
    })
    .filter((entry) => entry.lastSessionTime > 0)
    .sort((a, b) => b.lastSessionTime - a.lastSessionTime)
    .slice(0, 5);

  const formatShortDate = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatShortTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDurationMinSec = (sec) => {
    const total = sec || 0;
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const getPainBadgeStyle = (painLevel) => {
    const isDark = theme === 'dark';
    if (painLevel === null || painLevel === undefined) {
      return { background: 'transparent', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: '700', display: 'inline-block' };
    }
    if (painLevel <= 4) {
      return {
        background: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
        color: isDark ? '#fbbf24' : '#d97706',
        border: isDark ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid #fde68a',
        padding: '4px 10px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: '700', display: 'inline-block'
      };
    }
    return {
      background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fff5f5',
      color: isDark ? '#f87171' : '#e53e3e',
      border: isDark ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid #fecaca',
      padding: '4px 10px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: '700', display: 'inline-block'
    };
  };

  const renderReportRows = (sessions) => sessions.map((session, index) => {
    const isCameraSession = session.sessionType === 'CAMERA';
    const score = session.therapyScore != null ? Math.round(session.therapyScore) : null;    return (
      <tr key={session._id || session.id || index}>
        <td>{formatShortDate(session.startTime)}</td>
        <td style={{ color: 'var(--text-muted)' }}>{formatShortTime(session.startTime)}</td>
        <td>{isCameraSession ? 'Camera' : 'Game'}</td>
        <td>{formatDurationMinSec(session.totalDurationSeconds)}</td>
        <td>{isCameraSession ? '—' : (session.targetsHit != null ? `${session.targetsHit}/${session.targetsSpawned ?? '--'}` : '—')}</td>
        <td style={{ color: 'var(--accent-cyan)' }}>{isCameraSession ? '—' : (session.accuracyPercentage != null ? `${session.accuracyPercentage}%` : '—')}</td>
        <td><span style={getPainBadgeStyle(session.painLevel)}>{session.painLevel != null ? `${session.painLevel}/10` : 'Not set'}</span></td>
        <td>{score === null ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <strong>{score}</strong>}</td>
      </tr>
    );
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading clinician portal data...</p>
      </div>
    );
  }

  return (
    <div className="clinical-dashboard animate-fade-in" style={{ padding: '40px 32px', maxWidth: '1440px', margin: '0 auto', position: 'relative' }}>

      {/* STATUS ROW — matches patient dashboard styling */}
      <div className="dashboard-status-row" style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
        <div className="status-pill status-active">
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)' }} />
          {patients.length} Patient{patients.length === 1 ? '' : 's'} Under Care
        </div>
        <div className="status-pill status-date">
          {new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} PST
        </div>
      </div>

      {/* HEADER SECTION */}
      <section className="clinical-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px', borderBottom: '1px solid var(--border-color)', paddingBottom: '24px' }}>
        <div>
          <span className="clinical-eyebrow" style={{ textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px', color: 'var(--accent-cyan)', fontWeight: 700 }}>Clinician command center</span>
          <h2 className="clinical-title" style={{ margin: '6px 0 4px 0', fontSize: '32px', fontWeight: '800', letterSpacing: '-0.5px' }}>Clinician Dashboard</h2>
          <p className="clinical-subtitle" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Welcome, <strong style={{ color: 'var(--text-primary)' }}>{profile?.fullName || user?.email || 'Therapist'}</strong>. Manage your clinic patient list and monitor session outcomes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <button
            className="btn btn-secondary theme-toggle"
            onClick={onToggleTheme}
            style={{ padding: '12px 24px', fontSize: '14px', fontWeight: 600, minHeight: '44px', borderRadius: '10px' }}
          >
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </button>
        </div>
      </section>

      {/* DASHBOARD OVERVIEW SECTION */}
      {(!view || view === 'overview') && (
        <>
          {/* Hero-style panel, matching the patient dashboard's gradient hero block */}
          <div className="glass-panel" style={{
            padding: '40px',
            background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--surface-muted) 100%)',
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            marginBottom: '28px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '24px'
          }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '50px',
                background: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)', fontSize: '0.82rem', fontWeight: 750,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'currentColor' }} />
                Clinic Overview
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.15, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
                Monitoring <span style={{ color: 'var(--accent-cyan)' }}>{patients.length}</span> patient{patients.length === 1 ? '' : 's'} in your care
              </h2>
            </div>
            <div style={{ width: '110px', height: '110px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <strong style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1 }}>{patients.length}</strong>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Patients</span>
            </div>
          </div>

          {/* Recently active patients — real data, not a fabricated stat */}
          <div className="glass-panel clinical-card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="clinical-card-title" style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Recently Active Patients</h3>
              <span className="clinical-eyebrow">Most recent therapy sessions</span>
            </div>

            {recentlyActivePatients.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No sessions logged yet across your patients.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recentlyActivePatients.map(({ patient, sessionCount, lastSessionTime }) => (
                  <div key={patient._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                    padding: '14px 16px', borderRadius: '14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <UserIcon style={{ width: '18px', height: '18px' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', fontSize: '0.95rem' }}>{patient.fullName}</strong>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {sessionCount} session{sessionCount === 1 ? '' : 's'} · last on {formatShortDate(new Date(lastSessionTime).toISOString())}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button className="btn btn-secondary" onClick={() => handleSelectPatient(patient, 'progress')} style={{ padding: '8px 14px', fontSize: '0.8rem', borderRadius: '10px' }}>View Progress</button>
                      <button className="btn btn-secondary" onClick={() => handleSelectPatient(patient, 'reports')} style={{ padding: '8px 14px', fontSize: '0.8rem', borderRadius: '10px' }}>View Reports</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* PATIENTS SECTION */}
      {view === 'patients' && (
        <>
          {showAddForm ? (
            /* REGISTER FORM PANEL */
            <section className="glass-panel clinical-card animate-fade-in" style={{ maxWidth: 640, margin: '40px auto', padding: '32px' }}>
              <div className="clinical-card-title" style={{ marginBottom: '24px' }}><h3 style={{ margin: 0, fontSize: '20px' }}>Onboard New Patient</h3></div>
              {addError && <div style={{ background: 'rgba(225, 29, 72, 0.1)', border: '1px solid var(--error)', color: 'var(--error)', padding: 12, borderRadius: 8, marginBottom: 18, fontSize: '14px' }}>{addError}</div>}
              {addSuccess && (
                <div style={{ background: 'var(--success-glow)', border: '1px solid var(--success)', color: 'var(--success)', padding: 12, borderRadius: 8, marginBottom: 18, display: 'flex', gap: 8, alignItems: 'center', fontSize: '14px' }}>
                  <CheckIcon style={{ width: '16px', height: '16px' }} /> Patient registered successfully.
                </div>
              )}
              <form onSubmit={handleAddPatient} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Patient Full Name</label><input type="text" required value={newFullName} onChange={e => setNewFullName(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} /></div>
                <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Login Email Address</label><input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} /></div>
                <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Temporary Password</label><input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Amputation Side</label><select value={newSide} onChange={e => setNewSide(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}><option value="LEFT">Left Side</option><option value="RIGHT">Right Side</option></select></div>
                  <div><label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Amputation Level</label><select value={newLevel} onChange={e => setNewLevel(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}><option value="TRANSRADIAL">Transradial</option><option value="TRANSHUMERAL">Transhumeral</option><option value="WRIST_DISARTICULATION">Wrist Disarticulation</option><option value="FINGER_AMPUTATION">Fingers Only</option></select></div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginTop: '12px', padding: '14px', fontSize: '14px', fontWeight: 600 }}>Create Patient Credentials</button>
              </form>
            </section>
          ) : (
            /* PATIENTS REGISTRY VIEW */
            <div className="patients-directory-view animate-fade-in" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>All Registered Patients</h3>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowAddForm(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, minHeight: '44px', borderRadius: '10px' }}
                >
                  <PlusIcon style={{ width: '18px', height: '18px' }} /> Register New Patient
                </button>
              </div>

              {patients.length === 0 ? (
                <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                  <p>No patients currently registered. Click "Register New Patient" to onboard a patient.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                  {patients.map((pat) => {
                    const patSessions = patientSessionsMap[pat._id] || [];
                    return (
                      <div
                        key={pat._id}
                        onClick={() => handleSelectPatient(pat, 'progress')}
                        className="glass-panel patient-grid-card"
                        style={{
                          padding: '28px',
                          borderRadius: '16px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          cursor: 'pointer',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.01)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: '150px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 8px 24px rgba(6, 182, 212, 0.25)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.01)';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ background: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)', padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <UserIcon style={{ width: '24px', height: '24px' }} />
                            </div>
                            <div>
                              <strong style={{ display: 'block', fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                {pat.fullName}
                              </strong>
                              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                {pat.amputationSide} | {pat.amputationLevel}
                              </span>
                            </div>
                          </div>
                          <ChevronRightIcon style={{ width: '22px', height: '22px', color: 'var(--text-muted)' }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Session Logs</span>
                            <strong style={{ fontSize: '13px', color: 'var(--accent-cyan)', background: 'var(--accent-cyan-dim)', padding: '4px 12px', borderRadius: '12px', fontWeight: 700 }}>
                              {patSessions.length} run{patSessions.length === 1 ? '' : 's'}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={(e) => { e.stopPropagation(); handleSelectPatient(pat, 'progress'); }}
                              style={{ padding: '8px 14px', fontSize: '0.8rem', borderRadius: '10px' }}
                            >
                              View Progress
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={(e) => { e.stopPropagation(); handleSelectPatient(pat, 'reports'); }}
                              style={{ padding: '8px 14px', fontSize: '0.8rem', borderRadius: '10px' }}
                            >
                              View Reports
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* PROFILE SECTION */}
      {view === 'profile' && (
        <div className="profile-view animate-fade-in" style={{ width: '100%' }}>
          <div className="glass-panel clinical-card" style={{ padding: '32px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '800', margin: '0 0 24px 0', color: 'var(--text-primary)' }}>Clinician Profile</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
              <div style={{ padding: '24px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>Full Name</span>
                <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{profile?.fullName || 'N/A'}</strong>
              </div>
              <div style={{ padding: '24px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>Email</span>
                <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{user?.email || 'N/A'}</strong>
              </div>
              <div style={{ padding: '24px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>Role</span>
                <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>Clinician / Therapist</strong>
              </div>
              <div style={{ padding: '24px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>Total Patients</span>
                <strong style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>{patients.length}</strong>
              </div>
              <div style={{ padding: '24px', background: 'rgba(0,0,0,0.02)', borderRadius: '12px' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>Account Status</span>
                <strong style={{ fontSize: '16px', color: 'var(--success)' }}>Active</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL FOR SELECTED PATIENT RESULTS */}
      {selectedPatient && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px',
            //overflowY: 'auto'
          }}
          onClick={() => setSelectedPatient(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1000px',
              maxHeight: '90vh',
              backgroundColor: 'var(--bg-card)',
              borderRadius: '24px',
              border: '1px solid var(--border-color)',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 36px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--accent-cyan)', fontWeight: 700, letterSpacing: '1px' }}>Patient Clinical Profile</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '24px', fontWeight: '800' }}>{selectedPatient.fullName}</h3>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                style={{
                  background: 'rgba(0, 0, 0, 0.05)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  color: 'var(--text-primary)',
                  fontSize: '18px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)'}
              >
                &times;
              </button>
            </div>

            {/* Modal Scrollable Body Content */}
            <div style={{ padding: '36px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Tab switcher */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className={modalTab === 'progress' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setModalTab('progress')}
                  style={{ padding: '10px 20px', fontSize: '0.85rem', borderRadius: '10px' }}
                >
                  Progress
                </button>
                <button
                  className={modalTab === 'reports' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setModalTab('reports')}
                  style={{ padding: '10px 20px', fontSize: '0.85rem', borderRadius: '10px' }}
                >
                  Full Report ({selectedRuns})
                </button>
              </div>

              {modalTab === 'progress' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  {/* Profile Details Panel */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', background: 'var(--bg-card-secondary, rgba(0,0,0,0.02))', padding: '24px', borderRadius: '16px' }}>
                    <div style={{ textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 600 }}>Amputation Type</span>
                      <strong style={{ fontSize: '15px' }}>{selectedPatient.amputationSide} — {selectedPatient.amputationLevel}</strong>
                    </div>
                    <div style={{ textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 600 }}>Peak ROM Progress</span>
                      <strong style={{ fontSize: '15px', color: 'var(--accent-cyan)' }}>{selectedROM}&deg;</strong>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 600 }}>Completed Sessions</span>
                      <strong style={{ fontSize: '15px' }}>{selectedRuns} runs</strong>
                    </div>
                  </div>

                  {/* Configure Prescription Form */}
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '32px' }}>
                    <h4 style={{ margin: '0 0 18px 0', fontSize: '18px', fontWeight: '800' }}>Active Medical Prescription</h4>
                    <form onSubmit={handleSavePrescription} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        <div>
                          <label htmlFor="rx-dur" style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Duration (Seconds)</label>
                          <input id="rx-dur" type="number" min="30" max="1800" value={prescribedDuration} onChange={e => setPrescribedDuration(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }} />
                        </div>
                        <div>
                          <label htmlFor="rx-rad" style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Spawn Radius (m)</label>
                          <input id="rx-rad" type="number" step="0.1" min="0.5" max="5.0" value={spawnRadius} onChange={e => setSpawnRadius(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }} />
                        </div>
                        <div>
                          <label htmlFor="rx-dwell" style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>Dwell Time (ms)</label>
                          <input id="rx-dwell" type="number" min="100" max="5000" step="100" value={dwellTime} onChange={e => setDwellTime(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, alignItems: 'center', marginTop: '8px' }}>
                        {rxSuccess && <span style={{ color: 'var(--success)', display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: '13px', fontWeight: 600 }}><CheckIcon style={{ width: '16px', height: '16px' }} /> Prescriptions updated</span>}
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={rxSaving}
                          style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600, minHeight: '44px', borderRadius: '10px' }}
                        >
                          {rxSaving ? 'Saving...' : 'Update Treatment Profile'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Charts & Analytics */}
                  <div>
                    <h4 style={{ margin: '0 0 18px 0', fontSize: '18px', fontWeight: '800' }}>Session Analytics</h4>
                    <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px' }}>
                      <PremiumLineChart data={selectedPatientSessions} yField="accuracyPercentage" title="Accuracy Over Time" stroke="var(--accent-cyan)" suffix="%" />
                      <PremiumLineChart data={selectedPatientSessions} yField="peakRangeOfMotionDegrees" title="Range of Motion Progress" stroke="var(--success)" suffix="deg" />
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'reports' && (
                <div>
                  <h4 style={{ margin: '0 0 18px 0', fontSize: '18px', fontWeight: '800' }}>Full Session Report</h4>
                  {selectedPatientSessions.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No sessions recorded for this patient yet.
                    </div>
                  ) : (
                    <div className="session-table-wrap">
                      <table className="session-table">
                        <thead>
                          <tr>
                            <th>DATE</th>
                            <th>TIME</th>
                            <th>MODE</th>
                            <th>DURATION</th>
                            <th>TARGETS</th>
                            <th>ACCURACY</th>
                            <th>PAIN</th>
                            <th>SCORE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {renderReportRows(selectedPatientSessions)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};