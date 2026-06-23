import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PremiumLineChart } from './DashboardCharts';
import { PlayIcon, ClockIcon, ActivityIcon, AwardIcon, SettingsIcon, CheckIcon } from './Icons';

export const PatientDashboard = ({ user, profile, onUpdateProfile, onNavigate }) => {
  const [sessions, setSessions] = useState([]);
  const [prescription, setPrescription] = useState(null);
  
  // Calibration states
  const [amputationSide, setAmputationSide] = useState(profile?.amputationSide || 'LEFT');
  const [meshScale, setMeshScale] = useState(profile?.meshScaleMultiplier || 1.0);
  const [skinToneHex, setSkinToneHex] = useState(profile?.skinToneSliderHex || '#aa3bff');
  
  const [savingCalib, setSavingCalib] = useState(false);
  const [calibSuccess, setCalibSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?._id) {
      fetchDashboardData();
    }
  }, [profile]);

  const fetchDashboardData = async () => {
    try {
      const config = {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      };
      
      // Fetch active prescription
      const rxRes = await axios.get(`http://localhost:5000/api/prescriptions/patient/${profile._id}`, config);
      setPrescription(rxRes.data);

      // Fetch completed sessions
      const sessionsRes = await axios.get(`http://localhost:5000/api/sessions/patient/${profile._id}`, config);
      setSessions(sessionsRes.data);
    } catch (err) {
      console.error('Failed to load patient dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCalibration = async (e) => {
    e.preventDefault();
    setSavingCalib(true);
    setCalibSuccess(false);

    try {
      const config = {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      };

      const res = await axios.put(`http://localhost:5000/api/patients/${profile._id}`, {
        amputationSide,
        meshScaleMultiplier: Number(meshScale),
        skinToneSliderHex: skinToneHex
      }, config);

      if (res.data) {
        onUpdateProfile(res.data);
        setCalibSuccess(true);
        setTimeout(() => setCalibSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save patient calibration:', err);
    } finally {
      setSavingCalib(false);
    }
  };

  // Compute stat summaries
  const totalRuns = sessions.length;
  const avgAccuracy = totalRuns > 0 
    ? Math.round(sessions.reduce((acc, curr) => acc + curr.accuracyPercentage, 0) / totalRuns)
    : 0;
  const peakROM = totalRuns > 0
    ? Math.max(...sessions.map(s => s.peakRangeOfMotionDegrees))
    : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading your dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '30px 20px', maxWidth: '1200px', margin: '0 auto', textAlign: 'left' }}>
      
      {/* Welcome banner */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px', marginBottom: '40px' }}>
        <div>
          <h2 style={{ fontSize: '2.2rem', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>
            Hello, <span className="text-glow-purple" style={{ color: 'var(--accent-purple)' }}>{profile?.fullName || 'Patient'}</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Tracked Amputation: <strong>{profile?.amputationSide} Hand</strong> ({profile?.amputationLevel || 'Transradial'})
          </p>
        </div>

        {/* Start Game Action */}
        <button 
          className="btn btn-cyan btn-primary" 
          onClick={() => onNavigate('game')}
          style={{ padding: '16px 32px', fontSize: '1.1rem', background: 'linear-gradient(135deg, var(--accent-purple) 0%, #aa3bff 100%)', color: '#fff' }}
        >
          <PlayIcon className="w-6 h-6" /> Start Mirror Session
        </button>
      </section>

      {/* Grid: Stat Summary Blocks */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <div className="glass-panel p-6" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-purple-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
            <ActivityIcon />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>Sessions Run</span>
            <strong style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{totalRuns}</strong>
          </div>
        </div>

        <div className="glass-panel p-6" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <AwardIcon />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>Average Accuracy</span>
            <strong style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{avgAccuracy}%</strong>
          </div>
        </div>

        <div className="glass-panel p-6" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-cyan-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
            <SettingsIcon />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>Peak Range of Motion</span>
            <strong style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{peakROM}°</strong>
          </div>
        </div>
      </section>

      {/* Grid: Calibration & Prescription */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px', marginBottom: '40px' }}>
        
        {/* Prescription Card */}
        <div className="glass-panel p-8" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
          <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', marginBottom: '24px', color: 'var(--accent-cyan)' }}>
            Active Clinician Prescription
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Duration Limit:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {prescription ? Math.round(prescription.prescribedSessionDurationSeconds / 60) : 5} minutes ({prescription?.prescribedSessionDurationSeconds || 300}s)
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Target Spawn Radius:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{prescription?.targetSpawnRadius || 2.0} meters</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Hover Dwell Required:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {prescription ? (prescription.requiredHoverDwellTimeMs / 1000) : 1.0}s ({prescription?.requiredHoverDwellTimeMs || 1000}ms)
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Authorized By:</span>
              <strong>{prescription?.clinicianId?.fullName || 'System Default'}</strong>
            </div>
          </div>
        </div>

        {/* Calibration Settings Card */}
        <div className="glass-panel p-8">
          <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SettingsIcon className="w-5 h-5" /> 3D Ghost Arm Calibration
          </h3>

          <form onSubmit={handleSaveCalibration} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Amputation Side */}
            <div>
              <label htmlFor="calib-side">Amputated Side (Mirrored reflection target)</label>
              <select id="calib-side" value={amputationSide} onChange={e => setAmputationSide(e.target.value)}>
                <option value="LEFT">Left Side (Practice tracking Right Hand)</option>
                <option value="RIGHT">Right Side (Practice tracking Left Hand)</option>
              </select>
            </div>

            {/* Hand size scaling slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ margin: 0 }} htmlFor="calib-scale">3D Ghost Mesh Scale</label>
                <span style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-purple)' }}>
                  {Number(meshScale).toFixed(1)}x
                </span>
              </div>
              <input 
                id="calib-scale"
                type="range" 
                min="0.5" 
                max="2.0" 
                step="0.1" 
                value={meshScale} 
                onChange={e => setMeshScale(e.target.value)} 
                style={{ cursor: 'pointer', accentColor: 'var(--accent-purple)' }}
              />
            </div>

            {/* Custom Mesh Tone Hex color picker */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ margin: 0 }} htmlFor="calib-color">3D Hologram Color</label>
                <span style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: skinToneHex }}>
                  {skinToneHex.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  id="calib-color"
                  type="color" 
                  value={skinToneHex} 
                  onChange={e => setSkinToneHex(e.target.value)} 
                  style={{ width: '50px', height: '40px', padding: '2px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
                <input 
                  id="calib-color-text"
                  type="text" 
                  value={skinToneHex} 
                  onChange={e => setSkinToneHex(e.target.value)}
                  placeholder="#aa3bff"
                  maxLength="7"
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '10px 20px' }} disabled={savingCalib}>
                {savingCalib ? 'Saving...' : 'Save Calibration'}
              </button>
              {calibSuccess && (
                <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', fontWeight: 600 }}>
                  <CheckIcon className="w-5 h-5" /> Settings Saved!
                </span>
              )}
            </div>
          </form>
        </div>

      </section>

      {/* Analytics/Charts Section */}
      <section style={{ marginBottom: '40px' }}>
        <h3 style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)', marginBottom: '20px' }}>
          Therapeutic Progress & Metrics
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '30px' }}>
          <PremiumLineChart 
            data={sessions} 
            yField="accuracyPercentage" 
            title="Target Accuracy History" 
            stroke="var(--accent-purple)" 
            suffix="%"
          />
          <PremiumLineChart 
            data={sessions} 
            yField="peakRangeOfMotionDegrees" 
            title="Peak Range of Motion (ROM)" 
            stroke="var(--accent-cyan)" 
            suffix="°"
          />
        </div>
      </section>

    </div>
  );
};
