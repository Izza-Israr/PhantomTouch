import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { PremiumLineChart } from './DashboardCharts';
import { PlayIcon, ClockIcon, ActivityIcon, AwardIcon, HospitalIcon, CheckIcon } from './Icons';

export const PatientDashboard = ({ user, profile, onUpdateProfile, onNavigate, theme, onToggleTheme, view = 'overview' }) => {
  const [sessions, setSessions] = useState([]);
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({
    fullName: profile?.fullName || '',
    amputationSide: profile?.amputationSide || 'LEFT',
    amputationLevel: profile?.amputationLevel || 'TRANSRADIAL'
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
      const rxRes = await axios.get(`http://localhost:5000/api/prescriptions/patient/${profile._id}`, config);
      setPrescription(rxRes.data);
      if (rxRes.data?.id && profile.currentPrescriptionId !== rxRes.data.id) {
        onUpdateProfile({ ...profile, currentPrescriptionId: rxRes.data.id });
      }

      const sessionsRes = await axios.get(`http://localhost:5000/api/sessions/patient/${profile._id}`, config);
      setSessions(sessionsRes.data);
    } catch (err) {
      console.error('Failed to load patient dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [onUpdateProfile, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (profile?._id) fetchDashboardData();
  }, [fetchDashboardData, profile?._id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileForm({
      fullName: profile?.fullName || '',
      amputationSide: profile?.amputationSide || 'LEFT',
      amputationLevel: profile?.amputationLevel || 'TRANSRADIAL'
    });
  }, [profile]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      const res = await axios.put(`http://localhost:5000/api/patients/${profile._id}`, profileForm, {
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
  const avgAccuracy = totalRuns
    ? Math.round(sessions.reduce((acc, curr) => acc + (curr.accuracyPercentage || 0), 0) / totalRuns)
    : 0;
  const peakROM = totalRuns ? Math.max(...sessions.map(s => s.peakRangeOfMotionDegrees || 0)) : 0;
  const totalMinutes = totalRuns
    ? Math.round(sessions.reduce((acc, curr) => acc + (curr.totalDurationSeconds || 0), 0) / 60)
    : 0;
  const lastSession = sessions[0];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <p>Loading your dashboard data...</p>
      </div>
    );
  }

  const metricCards = (
    <section className="metric-grid template-metrics">
      <div className="metric-tile metric-blue">
        <div className="metric-icon"><ActivityIcon /></div>
        <span>Completed Sessions</span>
        <strong>{totalRuns}</strong>
      </div>
      <div className="metric-tile metric-cyan">
        <div className="metric-icon"><AwardIcon /></div>
        <span>Average Accuracy</span>
        <strong>{avgAccuracy}%</strong>
      </div>
      <div className="metric-tile metric-green">
        <div className="metric-icon"><HospitalIcon /></div>
        <span>Peak Range of Motion</span>
        <strong>{peakROM}&deg;</strong>
      </div>
      <div className="metric-tile metric-violet">
        <div className="metric-icon"><ClockIcon /></div>
        <span>Total Practice Time</span>
        <strong>{totalMinutes}m</strong>
      </div>
    </section>
  );

  const prescriptionPanel = (
    <div className="glass-panel clinical-card prescription-panel">
      <div className="clinical-card-title">
        <h3>Active Prescription</h3>
        <span className="clinical-eyebrow">Clinical plan</span>
      </div>
      <div className="clinical-table">
        <div className="clinical-row">
          <span>Duration limit</span>
          <strong>{prescription ? Math.round(prescription.prescribedSessionDurationSeconds / 60) : 5} min</strong>
        </div>
        <div className="clinical-row">
          <span>Target radius</span>
          <strong>{prescription?.targetSpawnRadius || 2.0} m</strong>
        </div>
        <div className="clinical-row">
          <span>Hover dwell</span>
          <strong>{prescription ? prescription.requiredHoverDwellTimeMs / 1000 : 1.0}s</strong>
        </div>
        <div className="clinical-row">
          <span>Authorized by</span>
          <strong>{prescription?.clinicianId?.fullName || 'System Default'}</strong>
        </div>
      </div>
    </div>
  );

  const readinessPanel = (
    <div className="glass-panel clinical-card session-panel">
      <div className="clinical-card-title">
        <h3>Session Readiness</h3>
        <span className="clinical-eyebrow">Practice setup</span>
      </div>
      <div className="readiness-body">
        <div className="readiness-icon">
          <PlayIcon className="w-5 h-5" />
        </div>
        <div>
          <strong>Camera practice screen is ready</strong>
          <p>Prescription settings apply when practice starts. Results save automatically when you finish.</p>
        </div>
      </div>
      <button className="btn btn-primary begin-session-btn" onClick={() => onNavigate('game')}>
        <PlayIcon className="w-5 h-5" /> Begin Session
      </button>
    </div>
  );

  const sessionRows = sessions.map((session, index) => (
    <tr key={session._id || session.id || index}>
      <td>{session.startTime ? new Date(session.startTime).toLocaleDateString() : `Session ${index + 1}`}</td>
      <td>{Math.round((session.totalDurationSeconds || 0) / 60)} min</td>
      <td>{session.targetsHit || 0}/{session.targetsSpawned || 0}</td>
      <td>{session.accuracyPercentage || 0}%</td>
      <td>{session.peakRangeOfMotionDegrees || 0}&deg;</td>
    </tr>
  ));

  return (
    <div className="clinical-dashboard animate-fade-in">
      <section className="dashboard-topbar">
        <div>
          <div className="dashboard-hero-pill">AI-Powered Mirror Therapy</div>
          <h2>Hello, {profile?.fullName || user?.email || 'Patient'}</h2>
          <p>
            Browser-based rehabilitation using real-time hand tracking and a 3D phantom limb.
            Reduce pain, improve range of motion, and track progress — all from your browser.
          </p>
        </div>
        <div className="dashboard-status-row">
          <div className="status-pill status-active">Active tracking</div>
          <div className="status-pill status-date">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
          <div className="topbar-actions">
            <button className="btn btn-secondary theme-toggle" onClick={onToggleTheme}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button className="btn btn-primary" onClick={() => onNavigate('game')}>
              <PlayIcon className="w-5 h-5" /> Start Practice
            </button>
          </div>
        </div>
      </section>

      {view === 'overview' && (
        <>
          {metricCards}
          <div className="overview-details-grid">
            <div>
              {prescriptionPanel}
              {readinessPanel}
            </div>
            <div className="glass-panel clinical-card doctor-notes-panel">
              <div className="clinical-card-title">
                <h3>Doctor Notes</h3>
                <span className="clinical-eyebrow">Dr. Anita Patel · Jul 6, 2026</span>
              </div>
              <p>
                Patient shows significant improvement in phantom limb pain management.
                Recommend continuing daily 20-minute sessions with focus on finger extension exercises.
                Monitor grip strength progression.
              </p>
              <button className="btn btn-cyan" type="button">Save Note</button>
            </div>
          </div>
          <section>
            <div className="clinical-card-title">
              <h3>Recent Progress</h3>
              <span className="clinical-eyebrow">Updated after every saved session</span>
            </div>
            <div className="chart-grid">
              <PremiumLineChart data={sessions} yField="accuracyPercentage" title="Target Accuracy History" stroke="var(--accent-purple)" suffix="%" />
              <PremiumLineChart data={sessions} yField="peakRangeOfMotionDegrees" title="Peak Range of Motion" stroke="var(--accent-cyan)" suffix="deg" />
            </div>
          </section>
        </>
      )}

      {view === 'profile' && (
        <section className="glass-panel clinical-card profile-panel">
          <div className="clinical-card-title">
            <h3>Profile Details</h3>
            <span className="clinical-eyebrow">Patient settings</span>
          </div>
          <form className="profile-form" onSubmit={handleSaveProfile}>
            <div>
              <label htmlFor="profile-name">Full Name</label>
              <input id="profile-name" value={profileForm.fullName} onChange={e => setProfileForm(prev => ({ ...prev, fullName: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="profile-side">Amputation Side</label>
              <select id="profile-side" value={profileForm.amputationSide} onChange={e => setProfileForm(prev => ({ ...prev, amputationSide: e.target.value }))}>
                <option value="LEFT">Left Side</option>
                <option value="RIGHT">Right Side</option>
              </select>
            </div>
            <div>
              <label htmlFor="profile-level">Amputation Level</label>
              <select id="profile-level" value={profileForm.amputationLevel} onChange={e => setProfileForm(prev => ({ ...prev, amputationLevel: e.target.value }))}>
                <option value="TRANSRADIAL">Transradial</option>
                <option value="TRANSHUMERAL">Transhumeral</option>
                <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                <option value="FINGER_AMPUTATION">Fingers Only</option>
              </select>
            </div>
            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
              {profileSaved && <span><CheckIcon className="w-5 h-5" /> Saved</span>}
            </div>
          </form>
        </section>
      )}

      {view === 'statistics' && (
        <>
          {metricCards}
          <section>
            <div className="clinical-card-title">
              <h3>Performance Statistics</h3>
              <span className="clinical-eyebrow">Clinical outcomes</span>
            </div>
            <div className="chart-grid">
              <PremiumLineChart data={sessions} yField="accuracyPercentage" title="Target Accuracy History" stroke="var(--accent-purple)" suffix="%" />
              <PremiumLineChart data={sessions} yField="peakRangeOfMotionDegrees" title="Range of Motion Trend" stroke="var(--accent-cyan)" suffix="deg" />
            </div>
          </section>
        </>
      )}

      {view === 'sessions' && (
        <section className="glass-panel clinical-card">
          <div className="clinical-card-title">
            <h3>Session History</h3>
            <span className="clinical-eyebrow">{totalRuns} saved sessions</span>
          </div>
          <div className="session-table-wrap">
            <table className="session-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Targets</th>
                  <th>Accuracy</th>
                  <th>Peak ROM</th>
                </tr>
              </thead>
              <tbody>
                {sessionRows.length ? sessionRows : (
                  <tr><td colSpan="5">No saved sessions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
