import { useCallback, useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { PremiumLineChart } from './DashboardCharts';
import { PlayIcon, CheckIcon } from './Icons';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const FINGER_OPTIONS = ['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'];

const CircularProgressCard = ({ value, label, sublabel, percentage, strokeColor }) => {
  const radius = 34;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="circular-metric-card" style={{ transition: 'var(--transition-smooth)' }}>
      <div className="circular-progress-container">
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="var(--border-color)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
          />
        </svg>
        <div className="circular-progress-text">
          <span className="value">{value}</span>
          <span className="label" style={{ marginTop: '2px' }}>{sublabel}</span>
        </div>
      </div>
      <span className="circular-metric-label">{label}</span>
    </div>
  );
};

export const PatientDashboard = ({ user, profile, onUpdateProfile, onNavigate, theme, onToggleTheme, view = 'overview', onSetDashboardView, appVoiceEnabled, onDisableAppVoice }) => {
  const [sessions, setSessions] = useState([]);
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({
    fullName: profile?.fullName || '',
    amputationSide: profile?.amputationSide || 'LEFT',
    amputationLevel: profile?.amputationLevel || 'TRANSRADIAL',
    missingFingers: profile?.missingFingers || [],
    leftAmputationLevel: profile?.leftAmputationLevel || 'TRANSRADIAL',
    rightAmputationLevel: profile?.rightAmputationLevel || 'TRANSRADIAL',
    leftMissingFingers: profile?.leftMissingFingers || [],
    rightMissingFingers: profile?.rightMissingFingers || [],
    voiceModePreferred: Boolean(profile?.voiceModePreferred || profile?.amputationSide === 'BILATERAL')
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [patientDetail, setPatientDetail] = useState(null);
  const [doctorEmailInput, setDoctorEmailInput] = useState('');
  const [doctorLookupState, setDoctorLookupState] = useState({ status: 'idle', message: '' });

  const authorizedClinicianName = prescription?.clinician?.fullName || patientDetail?.assignedClinician?.fullName || 'Self';

  const formatToPakistanTime = useCallback((value, options = {}) => {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      ...options
    });
  }, []);

  const fetchPatientDetail = useCallback(async () => {
    if (!profile?._id) return;
    try {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
      const res = await axios.get(`/api/patients/${profile._id}`, config);
      setPatientDetail(res.data);
    } catch (err) {
      console.error('Failed to load patient detail:', err);
    }
  }, [profile?._id]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
      const rxRes = await axios.get(`/api/prescriptions/patient/${profile._id}`, config);
      setPrescription(rxRes.data);
      if (rxRes.data?.id && profile.currentPrescriptionId !== rxRes.data.id) {
        onUpdateProfile({ ...profile, currentPrescriptionId: rxRes.data.id });
      }

      const sessionsRes = await axios.get(`/api/sessions/patient/${profile._id}`, config);
      setSessions(sessionsRes.data);

      await fetchPatientDetail();
    } catch (err) {
      console.error('Failed to load patient dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [onUpdateProfile, profile, fetchPatientDetail]);

  const tableRef = useRef(null);
  const progressRef = useRef(null);

  const exportSectionAsPDF = async (element, filenamePrefix, orientation = 'landscape') => {
    if (!element) {
      alert('Nothing to export yet.');
      return;
    }
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF(orientation, 'pt', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 20, pdfWidth, pdfHeight);
      pdf.save(`${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error(`Export PDF error (${filenamePrefix}):`, err);
      alert('Failed to export PDF');
    }
  };

  const exportReport = async () => {
    const el = document.querySelector('.session-table');
    if (!el) return alert('No session table to export');
    await exportSectionAsPDF(el, 'phantomtouch_sessions', 'landscape');
  };

  const exportProgress = async () => {
    await exportSectionAsPDF(progressRef.current, 'phantomtouch_progress', 'portrait');
  };

  const startPracticeMode = (mode) => {
    sessionStorage.setItem('phantomtouchPracticeMode', mode);
    onNavigate('game');
  };

  const startPoseRecordingMode = () => {
    sessionStorage.setItem('phantomtouchAutoRecordPose', 'true');
    onNavigate('game');
  };

  const handleAddDoctor = async (e) => {
    e.preventDefault();
    const email = doctorEmailInput.trim();
    if (!email) {
      setDoctorLookupState({ status: 'error', message: 'Enter a doctor email first.' });
      return;
    }

    setDoctorLookupState({ status: 'loading', message: 'Looking up doctor...' });
    try {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };

      const lookupRes = await axios.get(
        `/api/patients/lookup-clinician?email=${encodeURIComponent(email)}`,
        config
      );

      if (!lookupRes.data?.found) {
        setDoctorLookupState({ status: 'error', message: 'No doctor account found with that email.' });
        return;
      }

      await axios.put(`/api/patients/${profile._id}`, {
        assignedClinicianId: lookupRes.data.clinicianId
      }, config);

      setDoctorLookupState({ status: 'success', message: `Dr. ${lookupRes.data.fullName} has been added.` });
      setDoctorEmailInput('');
      await fetchPatientDetail();
    } catch (err) {
      const serverMessage = err.response?.data?.message;
      if (err.response?.status === 404) {
        setDoctorLookupState({ status: 'error', message: 'No doctor account found with that email.' });
      } else {
        setDoctorLookupState({ status: 'error', message: serverMessage || 'Could not add doctor. Try again.' });
      }
      console.error('Add doctor error:', err);
    }
  };

  useEffect(() => {
    if (profile?._id) fetchDashboardData();
  }, [fetchDashboardData, profile?._id]);

  useEffect(() => {
    setProfileForm({
      fullName: profile?.fullName || '',
      amputationSide: profile?.amputationSide || 'LEFT',
      amputationLevel: profile?.amputationLevel || 'TRANSRADIAL',
      missingFingers: profile?.missingFingers || [],
      leftAmputationLevel: profile?.leftAmputationLevel || 'TRANSRADIAL',
      rightAmputationLevel: profile?.rightAmputationLevel || 'TRANSRADIAL',
      leftMissingFingers: profile?.leftMissingFingers || [],
      rightMissingFingers: profile?.rightMissingFingers || [],
      voiceModePreferred: Boolean(profile?.voiceModePreferred || profile?.amputationSide === 'BILATERAL')
    });
  }, [profile]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      const payload = {
        ...profileForm,
        amputationLevel: profileForm.amputationSide === 'BILATERAL' ? profileForm.leftAmputationLevel : profileForm.amputationLevel,
        missingFingers: profileForm.amputationSide === 'BILATERAL'
          ? []
          : profileForm.amputationLevel === 'FINGER_AMPUTATION' ? profileForm.missingFingers : [],
        leftMissingFingers: profileForm.leftAmputationLevel === 'FINGER_AMPUTATION' ? profileForm.leftMissingFingers : [],
        rightMissingFingers: profileForm.rightAmputationLevel === 'FINGER_AMPUTATION' ? profileForm.rightMissingFingers : [],
        voiceModePreferred: profileForm.voiceModePreferred || profileForm.amputationSide === 'BILATERAL'
      };
      const res = await axios.put(`/api/patients/${profile._id}`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      onUpdateProfile(res.data);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSavingProfile(false);
    }
  };

  const totalRuns = sessions.length;
  const avgAccuracy = sessions.length
    ? Math.round(sessions.reduce((acc, curr) => acc + (curr.accuracyPercentage || 0), 0) / sessions.length)
    : null;
  const avgTherapyScore = sessions.length
    ? Math.round(sessions.reduce((acc, curr) => acc + (curr.therapyScore || 0), 0) / sessions.length)
    : null;
  const peakROM = sessions.length ? Math.max(...sessions.map(s => s.peakRangeOfMotionDegrees || 0)) : null;
  const totalMinutes = sessions.length
    ? Math.round(sessions.reduce((acc, curr) => acc + (curr.totalDurationSeconds || 0), 0) / 60)
    : null;

  if (loading) {
    return (
      <div className="dashboard-loading">
        <p>Loading your dashboard data...</p>
      </div>
    );
  }

  const getPainForIndex = (idx) => {
    const s = sessions[idx];
    if (!s || typeof s.painLevel === 'undefined' || s.painLevel === null) return null;
    return `${s.painLevel}/10`;
  };

  const getPainColor = (painStr) => {
    const isDark = theme === 'dark';
    if (!painStr) {
      return {
        background: 'transparent',
        color: 'var(--text-muted)',
        padding: '4px 10px',
        borderRadius: '99px',
        fontSize: '0.78rem',
        fontWeight: '700',
        display: 'inline-block'
      };
    }
    const value = Number(painStr.split('/')[0]) || 0;
    if (value <= 4) {
      return {
        background: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
        color: isDark ? '#fbbf24' : '#d97706',
        border: isDark ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid #fde68a',
        padding: '4px 10px',
        borderRadius: '99px',
        fontSize: '0.78rem',
        fontWeight: '700',
        display: 'inline-block'
      };
    }
    return {
      background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fff5f5',
      color: isDark ? '#f87171' : '#e53e3e',
      border: isDark ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid #fecaca',
      padding: '4px 10px',
      borderRadius: '99px',
      fontSize: '0.78rem',
      fontWeight: '700',
      display: 'inline-block'
    };
  };

  const formatDurationMinSec = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const displaySessions = sessions;
  const renderFingerSelector = (field) => (
    <div className="finger-checkbox-grid">
      {FINGER_OPTIONS.map((finger) => (
        <label key={finger} className="finger-checkbox">
          <input
            type="checkbox"
            checked={(profileForm[field] || []).includes(finger)}
            onChange={(e) => setProfileForm((prev) => ({
              ...prev,
              [field]: e.target.checked
                ? Array.from(new Set([...(prev[field] || []), finger]))
                : (prev[field] || []).filter((item) => item !== finger)
            }))}
          />
          <span>{finger.charAt(0) + finger.slice(1).toLowerCase()}</span>
        </label>
      ))}
    </div>
  );

  const renderSessionRows = (rows) => rows.map((session, index) => {
    const sDate = session.startTime ? formatToPakistanTime(session.startTime, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jul 6, 2026';
    const sTime = session.startTime ? formatToPakistanTime(session.startTime, { hour: '2-digit', minute: '2-digit', hour12: true }) : '09:14 AM';
    const sDuration = formatDurationMinSec(session.totalDurationSeconds || 0);
    const isCameraSession = session.sessionType === 'CAMERA';
    const sType = isCameraSession ? 'Camera' : 'Game';
    const sTargets = isCameraSession ? '—' : (session.targetsHit != null ? `${session.targetsHit}/${session.targetsSpawned ?? '--'}` : '—');
    const sAccuracy = isCameraSession ? '—' : (session.accuracyPercentage != null ? `${session.accuracyPercentage}%` : '—');
    const sPain = getPainForIndex(index);
    const sScore = session.therapyScore != null ? Math.round(session.therapyScore) : null;
    return (
      <tr key={session._id || session.id || index}>
        <td>{sDate}</td>
        <td style={{ color: 'var(--text-muted)' }}>{sTime}</td>
        <td>{sType}</td>
        <td>{sDuration}</td>
        <td>{sTargets}</td>
        <td style={{ color: 'var(--accent-cyan)' }}>{sAccuracy}</td>
        <td>
          <span style={getPainColor(sPain)}>{sPain || 'Not set'}</span>
        </td>
        <td>
          {sScore === null ? (
            <span style={{ color: 'var(--text-muted)' }}>—</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '40px', height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                <div style={{ width: `${sScore}%`, height: '100%', backgroundColor: 'var(--accent-cyan)' }} />
              </div>
              <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{sScore}</span>
            </div>
          )}
        </td>
      </tr>
    );
  });
  const recentSessionRows = renderSessionRows(displaySessions.slice(0, 5));
  const allSessionRows = renderSessionRows(displaySessions);

  const lastSessionObj = sessions[0] || {};

  const computeDailyStreak = (sess) => {
    if (!sess || sess.length === 0) return 0;
    const dates = Array.from(new Set(sess.map(s => new Date(s.startTime).toISOString().slice(0, 10))));
    dates.sort((a, b) => b.localeCompare(a));
    let streak = 0;
    let prev = null;
    for (let i = 0; i < dates.length; i++) {
      if (i === 0) {
        streak = 1; prev = dates[0];
        continue;
      }
      const dPrev = new Date(prev);
      const dCurr = new Date(dates[i]);
      const diffDays = Math.round((dPrev - dCurr) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streak += 1;
        prev = dates[i];
      } else if (diffDays === 0) {
        prev = dates[i];
        continue;
      } else {
        break;
      }
    }
    return streak;
  };

  const dailyStreak = computeDailyStreak(sessions);

  const computePainReduction = (sess) => {
    const painEntries = sess
      .filter(s => s.startTime && typeof s.painLevel !== 'undefined' && s.painLevel !== null)
      .map(s => ({ pain: Number(s.painLevel), time: new Date(s.startTime).getTime() }))
      .filter(entry => Number.isFinite(entry.pain) && Number.isFinite(entry.time))
      .sort((a, b) => a.time - b.time);

    if (painEntries.length < 2) return null;

    const previous = painEntries[painEntries.length - 2].pain;
    const current = painEntries[painEntries.length - 1].pain;
    if (previous === 0) return current === 0 ? 0 : -100;

    return Math.round(((previous - current) / previous) * 100);
  };

  const painReductionPercent = computePainReduction(sessions);

  const prescriptionPanel = (
    <div className="glass-panel clinical-card dashboard-prescription-card">
      <div className="prescription-header">
        <div>
          <span className="clinical-eyebrow" style={{ color: 'var(--accent-cyan)' }}>Clinical plan</span>
          <h3>Active Prescription</h3>
          <p>Your current therapy limits and target settings.</p>
        </div>
        <div className="prescription-action-group">
          <button className="btn btn-secondary prescription-start-btn" onClick={() => startPracticeMode('camera')}>
            Camera Mirror
          </button>
          <button className="btn btn-primary prescription-start-btn" onClick={() => startPracticeMode('game')}>
            Therapy Game
          </button>
          {profile?.amputationSide === 'BILATERAL' && (
            <button className="btn btn-secondary prescription-start-btn" onClick={startPoseRecordingMode}>
              Record Pose Library
            </button>
          )}
        </div>
      </div>
      <div className="prescription-metric-grid">
        <div className="prescription-metric">
          <span>Duration</span>
          <strong>{prescription ? Math.round(prescription.prescribedSessionDurationSeconds / 60) : 20}<small>min</small></strong>
        </div>
        <div className="prescription-metric">
          <span>Target Radius</span>
          <strong>{prescription?.targetSpawnRadius || 2.5}<small>m</small></strong>
        </div>
        <div className="prescription-metric">
          <span>Hover Dwell</span>
          <strong>{prescription ? prescription.requiredHoverDwellTimeMs / 1000 : 0.8}<small>s</small></strong>
        </div>
      </div>
      <div className="prescription-footer">
        <span>Authorized by</span>
        <strong>{authorizedClinicianName}</strong>
      </div>
    </div>
  );

  return (
    <div className="clinical-dashboard animate-fade-in" style={{ padding: '24px 0 60px' }}>
      <div className="dashboard-status-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <div className="status-pill status-active">
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)' }} />
            Tracking Active
          </div>
          <div className="status-pill status-date">{formatToPakistanTime(new Date(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} PST</div>
        </div>
        {profile?.amputationSide !== 'BILATERAL' && appVoiceEnabled && onDisableAppVoice && (
          <button type="button" className="btn btn-secondary" onClick={onDisableAppVoice} style={{ padding: '10px 18px', borderRadius: '14px', whiteSpace: 'nowrap' }}>
            Turn off voice recognition
          </button>
        )}
      </div>

      {view === 'overview' && (
        <>
          {/* Dashboard Hero Block (Image 5 style) */}
          <div className="glass-panel dashboard-hero-surface" style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr',
            gap: '30px',
            padding: '40px',
            background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--surface-muted) 100%)',
            border: '1px solid var(--border-color)',
            borderRadius: '24px',
            marginBottom: '28px',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '50px',
                background: 'var(--accent-cyan-dim)',
                color: 'var(--accent-cyan)',
                fontSize: '0.82rem',
                fontWeight: 750,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                alignSelf: 'flex-start'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'currentColor' }} />
                Digital Mirror Therapy
              </div>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.1, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Virtual Mirror Therapy for <span style={{ color: 'var(--accent-cyan)' }}>Phantom Limb</span> Rehabilitation
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.5, margin: '8px 0 16px' }}>
                Browser-based rehabilitation using real-time hand tracking and a 3D phantom limb.
                Reduce pain, improve range of motion, and track progress — all from your browser.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <button className="btn btn-primary" onClick={() => onNavigate('game')} style={{ padding: '12px 28px', borderRadius: '14px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="6 3 20 12 6 21 6 3" />
                  </svg>
                  Start Therapy
                </button>
                {profile?.amputationSide !== 'BILATERAL' && appVoiceEnabled && onDisableAppVoice && (
                  <button className="btn btn-secondary" onClick={onDisableAppVoice} style={{ padding: '12px 28px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                    Turn off voice recognition
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => (onSetDashboardView ? onSetDashboardView('statistics') : onNavigate('dashboard'))} style={{ padding: '12px 28px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                  View Progress
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Sessions Completed</span>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /><path d="M12 7v5l3 3" /></svg>
                  </div>
                </div>
                <strong style={{ fontSize: '1.6rem', fontWeight: 800 }}>{typeof totalRuns === 'number' ? totalRuns : '—'}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>{totalRuns > 0 ? `+${Math.min(9, Math.floor(totalRuns / 2))} this week` : 'No recent sessions'}</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Pain Reduction</span>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--success-glow)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
                  </div>
                </div>
                <strong style={{ fontSize: '1.6rem', fontWeight: 800, color: painReductionPercent !== null && painReductionPercent < 0 ? 'var(--error)' : 'var(--success)' }}>{painReductionPercent !== null ? `${painReductionPercent}%` : '—'}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{painReductionPercent !== null ? 'vs. previous' : 'Need 2 scores'}</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Daily Streak</span>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--warning-bg)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
                  </div>
                </div>
                <strong style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--warning)' }}>{dailyStreak ? `${dailyStreak} days` : '0 days'}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{dailyStreak ? 'Personal best!' : 'No streak yet'}</span>
              </div>

              <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Therapy Score</span>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
                  </div>
                </div>
                <strong style={{ fontSize: '1.6rem', fontWeight: 800 }}>{avgTherapyScore !== null ? `${avgTherapyScore}/100` : '--/100'}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>{avgTherapyScore !== null ? 'Based on accuracy, ROM & completion' : 'No score yet'}</span>
              </div>
            </div>
          </div>

          {/* Horizontal metrics row (Image 3 style) */}
          <section className="horizontal-metrics-row">
            <div className="horizontal-metric-tile">
              <div className="horizontal-metric-icon color-green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                </svg>
              </div>
              <div className="horizontal-metric-content">
                <span>Targets Hit</span>
                <strong className="green-text">{
                  typeof lastSessionObj.targetsHit === 'number'
                    ? `${lastSessionObj.targetsHit} / ${lastSessionObj.targetsSpawned ?? '--'}`
                    : '—'
                }</strong>
              </div>
            </div>

            <div className="horizontal-metric-tile">
              <div className="horizontal-metric-icon color-cyan">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="horizontal-metric-content">
                <span>Session Time</span>
                <strong className="cyan-text">{
                  typeof lastSessionObj.totalDurationSeconds === 'number' && lastSessionObj.totalDurationSeconds > 0
                    ? formatDurationMinSec(lastSessionObj.totalDurationSeconds)
                    : '—'
                }</strong>
              </div>
            </div>

            <div className="horizontal-metric-tile">
              <div className="horizontal-metric-icon color-cyan">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div className="horizontal-metric-content">
                <span>Accuracy</span>
                <strong className="cyan-text">{
                  typeof lastSessionObj.accuracyPercentage === 'number'
                    ? `${lastSessionObj.accuracyPercentage}%`
                    : '—'
                }</strong>
              </div>
            </div>



            <div className="horizontal-metric-tile">
              <div className="horizontal-metric-icon color-orange">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                </svg>
              </div>
              <div className="horizontal-metric-content">
                <span>Range of Motion</span>
                <strong className="orange-text">{
                  typeof lastSessionObj.peakRangeOfMotionDegrees === 'number'
                    ? `${lastSessionObj.peakRangeOfMotionDegrees}\u00b0`
                    : '—'
                }</strong>
              </div>
            </div>
          </section>

          {/* Table & Notes Grid (Image 4 style) */}
          <div className="dashboard-session-notes-grid">
            <div className="glass-panel clinical-card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Recent Sessions</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Last 5 therapy sessions</p>
                </div>
                <button className="btn btn-secondary" onClick={exportReport} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '10px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export Report
                </button>
              </div>
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
                    {recentSessionRows.length > 0 ? recentSessionRows : (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No sessions recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {prescription?.clinicianNotes && (
              <div className="glass-panel clinical-card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '380px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Doctor Notes</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{authorizedClinicianName}{prescription?.prescribedAt ? ` · ${formatToPakistanTime(prescription.prescribedAt, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</p>
                  </div>
                </div>
                <div style={{
                  background: 'var(--bg-primary)',
                  borderRadius: '16px',
                  padding: '20px',
                  fontSize: '0.92rem',
                  lineHeight: '1.6',
                  color: 'var(--text-secondary)',
                  flexGrow: 1,
                  border: '1px solid var(--border-color)'
                }}>
                  {prescription.clinicianNotes}
                </div>

                <button className="btn btn-secondary" style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'var(--accent-cyan-dim)',
                  color: 'var(--accent-cyan)',
                  border: 'none',
                  fontWeight: '700'
                }}>
                  Save Note
                </button>
              </div>
            )}
          </div>

          {/* Active Prescription section */}
          <div className="dashboard-practice-grid">
            {prescriptionPanel}
          </div>
        </>
      )}

      {view === 'profile' && (
        <>
          <section className="glass-panel clinical-card profile-panel" style={{ maxWidth: 760, margin: '24px auto 20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="clinical-card-title" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Assigned Doctor</h3>
              <span className="clinical-eyebrow">Who's overseeing your therapy</span>
            </div>

            {patientDetail?.assignedClinician?.fullName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan-dim)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                  Dr
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '1rem' }}>Dr. {patientDetail.assignedClinician.fullName}</strong>
                  {patientDetail.assignedClinician.medicalSpecialty && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{patientDetail.assignedClinician.medicalSpecialty}</span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    —
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '1rem' }}>Self</strong>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No doctor assigned yet</span>
                  </div>
                </div>

                <form onSubmit={handleAddDoctor} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="email"
                    placeholder="Doctor's email address"
                    value={doctorEmailInput}
                    onChange={(e) => setDoctorEmailInput(e.target.value)}
                    style={{ flex: '1 1 240px' }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={doctorLookupState.status === 'loading'}
                    style={{ padding: '10px 20px' }}
                  >
                    {doctorLookupState.status === 'loading' ? 'Checking...' : 'Add Doctor'}
                  </button>
                </form>

                {doctorLookupState.message && (
                  <p style={{
                    marginTop: '10px',
                    fontSize: '0.85rem',
                    color: doctorLookupState.status === 'error' ? 'var(--error, #e53e3e)' : 'var(--accent-cyan)'
                  }}>
                    {doctorLookupState.message}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="glass-panel clinical-card profile-panel" style={{ maxWidth: 760, margin: '0 auto 24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="clinical-card-title" style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Profile Details</h3>
              <span className="clinical-eyebrow">Patient settings</span>
            </div>
            <form className="profile-form" onSubmit={handleSaveProfile} style={{ gap: '20px' }}>
              <div>
                <label htmlFor="profile-name">Full Name</label>
                <input id="profile-name" value={profileForm.fullName} onChange={e => setProfileForm(prev => ({ ...prev, fullName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="profile-side">Amputation Side</label>
                <select id="profile-side" value={profileForm.amputationSide} onChange={e => setProfileForm(prev => ({ ...prev, amputationSide: e.target.value }))}>
                  <option value="LEFT">Left Side</option>
                  <option value="RIGHT">Right Side</option>
                  <option value="BILATERAL">Bilateral</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="profile-level">Amputation Level</label>
                <select id="profile-level" value={profileForm.amputationLevel} onChange={e => setProfileForm(prev => ({ ...prev, amputationLevel: e.target.value }))} disabled={profileForm.amputationSide === 'BILATERAL'}>
                  <option value="TRANSRADIAL">Transradial</option>
                  <option value="TRANSHUMERAL">Transhumeral</option>
                  <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                  <option value="FINGER_AMPUTATION">Fingers Only</option>
                </select>
              </div>
              {profileForm.amputationSide === 'BILATERAL' && (
                <div style={{ gridColumn: '1 / -1', border: '1px solid var(--border-color)', borderRadius: 14, padding: 16, background: 'var(--bg-primary)' }}>
                  <h4 style={{ marginBottom: 12 }}>Bilateral Settings</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label htmlFor="profile-left-level">Left Side Level</label>
                      <select id="profile-left-level" value={profileForm.leftAmputationLevel} onChange={e => setProfileForm(prev => ({ ...prev, leftAmputationLevel: e.target.value }))}>
                        <option value="TRANSRADIAL">Transradial</option>
                        <option value="TRANSHUMERAL">Transhumeral</option>
                        <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                        <option value="FINGER_AMPUTATION">Fingers Only</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="profile-right-level">Right Side Level</label>
                      <select id="profile-right-level" value={profileForm.rightAmputationLevel} onChange={e => setProfileForm(prev => ({ ...prev, rightAmputationLevel: e.target.value }))}>
                        <option value="TRANSRADIAL">Transradial</option>
                        <option value="TRANSHUMERAL">Transhumeral</option>
                        <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                        <option value="FINGER_AMPUTATION">Fingers Only</option>
                      </select>
                    </div>
                  </div>
                  {profileForm.leftAmputationLevel === 'FINGER_AMPUTATION' && (
                    <div style={{ marginTop: 14 }}>
                      <label>Left Missing Fingers</label>
                      {renderFingerSelector('leftMissingFingers')}
                    </div>
                  )}
                  {profileForm.rightAmputationLevel === 'FINGER_AMPUTATION' && (
                    <div style={{ marginTop: 14 }}>
                      <label>Right Missing Fingers</label>
                      {renderFingerSelector('rightMissingFingers')}
                    </div>
                  )}
                </div>
              )}
              {profileForm.amputationSide !== 'BILATERAL' && profileForm.amputationLevel === 'FINGER_AMPUTATION' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Missing Fingers</label>
                  {renderFingerSelector('missingFingers')}
                </div>
              )}
              <div className="profile-actions" style={{ marginTop: '10px' }}>
                <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ padding: '12px 24px' }}>
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
                {profileSaved && <span><CheckIcon className="w-5 h-5" /> Saved</span>}
              </div>
            </form>
          </section>
        </>
      )}

      {view === 'statistics' && (
        <>
          <div ref={progressRef}>
            {/* Circular progress cards (Image 2 style) */}
            <section className="circular-metric-grid">
              <CircularProgressCard value={dailyStreak ? `${dailyStreak}` : '—'} label="Daily Streak" sublabel="days" percentage={dailyStreak ? Math.min(100, dailyStreak) : 0} strokeColor="var(--warning)" />
              <CircularProgressCard value={typeof totalRuns === 'number' ? totalRuns : '—'} label="Sessions" sublabel="total" percentage={totalRuns ? Math.min(100, totalRuns) : 0} strokeColor="var(--accent-cyan)" />
              <CircularProgressCard value={painReductionPercent !== null ? `${painReductionPercent}%` : '—'} label="Pain Relief" sublabel="previous" percentage={painReductionPercent !== null ? Math.min(100, Math.max(0, painReductionPercent)) : 0} strokeColor={painReductionPercent !== null && painReductionPercent < 0 ? 'var(--error)' : 'var(--success)'} />
              <CircularProgressCard value={avgTherapyScore !== null ? `${avgTherapyScore}` : '--'} label="Score" sublabel="/100" percentage={avgTherapyScore !== null ? avgTherapyScore : 0} strokeColor="var(--accent-cyan)" />            </section>

            <section style={{ marginTop: '24px' }}>
              <div className="clinical-card-title" style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Performance Statistics</h3>
                  <span className="clinical-eyebrow">Clinical outcomes</span>
                </div>
                <button className="btn btn-secondary" onClick={exportProgress} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '10px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export Progress
                </button>
              </div>
              <div className="chart-grid">
                <PremiumLineChart data={sessions.length ? sessions : displaySessions} yField="accuracyPercentage" title="Accuracy" stroke="var(--accent-cyan)" suffix="%" />
                <PremiumLineChart data={sessions.length ? sessions : displaySessions} yField="peakRangeOfMotionDegrees" title="Range of Motion" stroke="var(--success)" suffix="deg" />
              </div>
            </section>
          </div>
        </>
      )}

      {view === 'reports' && (
        <>
          <section className="circular-metric-grid">
            <CircularProgressCard value={dailyStreak ? `${dailyStreak}` : '—'} label="Daily Streak" sublabel="days" percentage={dailyStreak ? Math.min(100, dailyStreak) : 0} strokeColor="var(--warning)" />
            <CircularProgressCard value={typeof totalRuns === 'number' ? totalRuns : '—'} label="Sessions" sublabel="total" percentage={totalRuns ? Math.min(100, totalRuns) : 0} strokeColor="var(--accent-cyan)" />
            <CircularProgressCard value={painReductionPercent !== null ? `${painReductionPercent}%` : '—'} label="Pain Relief" sublabel="previous" percentage={painReductionPercent !== null ? Math.min(100, Math.max(0, painReductionPercent)) : 0} strokeColor={painReductionPercent !== null && painReductionPercent < 0 ? 'var(--error)' : 'var(--success)'} />
            <CircularProgressCard value={avgTherapyScore !== null ? `${avgTherapyScore}` : '--'} label="Score" sublabel="/100" percentage={avgTherapyScore !== null ? avgTherapyScore : 0} strokeColor="var(--accent-cyan)" />          </section>

          <section className="glass-panel clinical-card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginTop: '24px' }}>
            <div className="clinical-card-title" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Clinical Diagnostic Report</h3>
                <span className="clinical-eyebrow" style={{ color: 'var(--accent-cyan)' }}>SaaS Audit</span>
              </div>
              <button className="btn btn-secondary" onClick={exportReport} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '10px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export Report
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '20px' }}>
              This diagnostic report summarizes performance logs, daily streak history, and range of motion milestones.
              It is generated for telerehabilitation monitoring and is readable by clinicians.
            </p>
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
                  {allSessionRows.length > 0 ? allSessionRows : (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No sessions recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {view === 'sessions' && (
        <section className="glass-panel clinical-card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', margin: '24px 0' }}>
          <div className="clinical-card-title" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Session History</h3>
            <span className="clinical-eyebrow">{sessions.length || 5} saved sessions</span>
          </div>
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
                {allSessionRows.length > 0 ? allSessionRows : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No sessions recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
