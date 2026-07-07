import React, { useState } from 'react';
import axios from 'axios';

const FINGER_OPTIONS = ['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'];

export const ProfileSetupScreen = ({ user, googleName, token, onProfileComplete }) => {
  const [role, setRole] = useState('PATIENT');
  const [fullName, setFullName] = useState(googleName || '');

  // Clinician fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [medicalSpecialty, setMedicalSpecialty] = useState('');

  // Patient fields
  const [amputationSide, setAmputationSide] = useState('LEFT');
  const [amputationLevel, setAmputationLevel] = useState('TRANSRADIAL');
  const [missingFingers, setMissingFingers] = useState(['INDEX']);
  const [dob, setDob] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = { role, fullName };

      if (role === 'CLINICIAN') {
        payload.licenseNumber = licenseNumber;
        payload.medicalSpecialty = medicalSpecialty;
      } else if (role === 'PATIENT') {
        payload.amputationSide = amputationSide;
        payload.amputationLevel = amputationLevel;
        payload.missingFingers = amputationLevel === 'FINGER_AMPUTATION' ? missingFingers : [];
        if (dob) payload.dateOfBirth = dob;
      }

      const res = await axios.post('http://localhost:5000/api/auth/complete-profile', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data) {
        onProfileComplete(res.data.user, res.data.profile);
      }
    } catch (err) {
      console.error('Profile setup failed:', err);
      const msg = err.response?.data?.message || 'Failed to complete profile setup.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const initials = (fullName || user?.email || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="profile-setup-page animate-fade-in">
      <div className="profile-setup-card">
        <h2>Complete Your Profile</h2>
        <p className="setup-subtitle">
          One more step — tell us about yourself so we can personalize your experience.
        </p>

        {/* User info from Google */}
        <div className="setup-user-info">
          <div className="avatar">{initials}</div>
          <div className="info">
            <strong>{googleName || 'Google User'}</strong>
            <span>{user?.email}</span>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        {error && (
          <div className="auth-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Full Name */}
          <div>
            <label htmlFor="setup-fullname">Full Name</label>
            <input
              id="setup-fullname"
              type="text"
              placeholder="e.g. John Doe"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          </div>

          {/* Role */}
          <div>
            <label htmlFor="setup-role">I am a</label>
            <select id="setup-role" value={role} onChange={e => setRole(e.target.value)}>
              <option value="PATIENT">Amputee Patient (Free)</option>
              <option value="CLINICIAN">Therapist / Clinician</option>
            </select>
          </div>

          {/* Clinician Fields */}
          {role === 'CLINICIAN' && (
            <>
              <div>
                <label htmlFor="setup-license">Medical License Number</label>
                <input
                  id="setup-license"
                  type="text"
                  placeholder="e.g. LIC-123456"
                  required
                  value={licenseNumber}
                  onChange={e => setLicenseNumber(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="setup-specialty">Medical Specialty</label>
                <input
                  id="setup-specialty"
                  type="text"
                  placeholder="e.g. Hand Physiotherapy"
                  value={medicalSpecialty}
                  onChange={e => setMedicalSpecialty(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Patient Fields */}
          {role === 'PATIENT' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label htmlFor="setup-side">Amputation Side</label>
                  <select id="setup-side" value={amputationSide} onChange={e => setAmputationSide(e.target.value)}>
                    <option value="LEFT">Left Arm/Hand</option>
                    <option value="RIGHT">Right Arm/Hand</option>
                    <option value="BILATERAL">Bilateral</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="setup-level">Amputation Level</label>
                  <select id="setup-level" value={amputationLevel} onChange={e => setAmputationLevel(e.target.value)}>
                    <option value="TRANSRADIAL">Transradial (Below Elbow)</option>
                    <option value="TRANSHUMERAL">Transhumeral (Above Elbow)</option>
                    <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                    <option value="FINGER_AMPUTATION">Fingers Only</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="setup-dob">Date of Birth</label>
                <input
                  id="setup-dob"
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                />
              </div>
              {amputationLevel === 'FINGER_AMPUTATION' && (
                <div>
                  <label>Missing Fingers</label>
                  <div className="finger-checkbox-grid">
                    {FINGER_OPTIONS.map((finger) => (
                      <label key={finger} className="finger-checkbox">
                        <input
                          type="checkbox"
                          checked={missingFingers.includes(finger)}
                          onChange={(e) => {
                            setMissingFingers((prev) => e.target.checked
                              ? Array.from(new Set([...prev, finger]))
                              : prev.filter((item) => item !== finger));
                          }}
                        />
                        <span>{finger.charAt(0) + finger.slice(1).toLowerCase()}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Submit */}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
            {loading ? 'Setting up...' : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Complete Setup & Start
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
