import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [leftAmputationLevel, setLeftAmputationLevel] = useState('TRANSRADIAL');
  const [rightAmputationLevel, setRightAmputationLevel] = useState('TRANSRADIAL');
  const [leftMissingFingers, setLeftMissingFingers] = useState([]);
  const [rightMissingFingers, setRightMissingFingers] = useState([]);
  const [dob, setDob] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voicePrompt, setVoicePrompt] = useState('');
  const [transcript, setTranscript] = useState('');
  const [voiceStep, setVoiceStep] = useState(fullName ? 'role' : 'fullName');

  // Voice recognition support for profile setup
  const getSpeechRecognition = () => {
    const w = window;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  };
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef(null);
  const voiceActiveRef = useRef(false);
  const processVoiceCommandRef = useRef(null);
  const snapshotRef = useRef({});
  const lastVoiceCommandRef = useRef('');
  const isSpeakingRef = useRef(false);

  const speak = useCallback((text) => {
    setVoicePrompt(text);
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.onend = () => { isSpeakingRef.current = false; };
      utterance.onerror = () => { isSpeakingRef.current = false; };
      window.speechSynthesis.cancel();
      isSpeakingRef.current = true;
      window.speechSynthesis.speak(utterance);
      setTimeout(() => { isSpeakingRef.current = false; }, Math.max(2500, text.length * 85));
    } catch (e) {
      isSpeakingRef.current = false;
      console.warn('SpeechSynthesis not available', e);
    }
  }, []);

  const promptForStep = useCallback((step) => {
    setVoiceStep(step);
    const prompts = {
      fullName: 'Please tell your full name.',
      role: 'Are you a patient or a clinician?',
      clinicianLicense: 'Please say your medical license number.',
      clinicianSpecialty: 'Please say your medical specialty, or say skip.',
      patientSide: 'Which side is affected? Say left, right, or bilateral.',
      patientLevel: 'What is the amputation level? Say below elbow, above elbow, wrist, or fingers only.',
      bilateralLeftLevel: 'For the left side, what is the amputation level? Say below elbow, above elbow, wrist, or fingers only.',
      bilateralRightLevel: 'For the right side, what is the amputation level? Say below elbow, above elbow, wrist, or fingers only.',
      patientDob: 'Please say your date of birth, or say skip.',
      patientFingers: 'Which fingers are missing? Say thumb, index, middle, ring, or pinky. Say done when finished.',
      ready: 'Profile details are ready. Say submit to continue, delete to clear the current field, or go back.',
    };
    speak(prompts[step] || prompts.ready);
  }, [speak]);

  useEffect(() => {
    snapshotRef.current = {
      role,
      fullName,
      licenseNumber,
      medicalSpecialty,
      amputationSide,
      amputationLevel,
      missingFingers,
      leftAmputationLevel,
      rightAmputationLevel,
      leftMissingFingers,
      rightMissingFingers,
      dob,
      voiceStep,
    };
  }, [role, fullName, licenseNumber, medicalSpecialty, amputationSide, amputationLevel, missingFingers, leftAmputationLevel, rightAmputationLevel, leftMissingFingers, rightMissingFingers, dob, voiceStep]);

  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    setVoiceSupported(true);
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      if (isSpeakingRef.current) return;
      const result = e.results[e.results.length - 1];
      const t = (result?.[0]?.transcript || '').trim();
      const lower = t.toLowerCase();
      const isFinal = result?.isFinal !== false;
      setTranscript(t);
      const isChoiceCommand = /patient|clinician|doctor|therapist|left|right|bilateral|below|above|wrist|finger|skip|done|go back|delete|submit|complete/.test(lower);
      if (t && t !== lastVoiceCommandRef.current && (isFinal || isChoiceCommand)) {
        lastVoiceCommandRef.current = t;
        processVoiceCommandRef.current?.(t);
      }
    };

    rec.onerror = (e) => console.warn('Profile speech error', e);
    rec.onstart = () => { setVoiceActive(true); voiceActiveRef.current = true; };
    rec.onend = () => {
      if (voiceActiveRef.current) try { rec.start(); } catch (e) { console.warn('Profile speech restart failed', e); }
      else setVoiceActive(false);
    };
    recognitionRef.current = rec;

    try {
      rec.start();
      voiceActiveRef.current = true;
      speak(`Google account selected. Voice recognition mode is active. ${fullName ? 'Are you a patient or a clinician?' : 'Please tell your full name.'}`);
    } catch (e) {
      console.warn(e);
    }

    return () => {
      voiceActiveRef.current = false;
      try { rec.stop(); } catch (e) { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    setLoading(true);

    try {
      const payload = { role, fullName };

      if (role === 'CLINICIAN') {
        payload.licenseNumber = licenseNumber;
        payload.medicalSpecialty = medicalSpecialty;
      } else if (role === 'PATIENT') {
        payload.amputationSide = amputationSide;
        payload.amputationLevel = amputationSide === 'BILATERAL' ? leftAmputationLevel : amputationLevel;
        payload.missingFingers = amputationSide === 'BILATERAL'
          ? []
          : amputationLevel === 'FINGER_AMPUTATION' ? missingFingers : [];
        payload.leftAmputationLevel = amputationSide === 'BILATERAL' ? leftAmputationLevel : null;
        payload.rightAmputationLevel = amputationSide === 'BILATERAL' ? rightAmputationLevel : null;
        payload.leftMissingFingers = amputationSide === 'BILATERAL' && leftAmputationLevel === 'FINGER_AMPUTATION' ? leftMissingFingers : [];
        payload.rightMissingFingers = amputationSide === 'BILATERAL' && rightAmputationLevel === 'FINGER_AMPUTATION' ? rightMissingFingers : [];
        payload.voiceModePreferred = amputationSide === 'BILATERAL';
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

  const processVoiceCommand = useCallback((spokenText) => {
    const text = spokenText.trim();
    const lower = text.toLowerCase();
    const snapshot = snapshotRef.current;

    if (lower.includes('go back')) {
      const flow = [
        'fullName',
        'role',
        ...(snapshot.role === 'CLINICIAN'
          ? ['clinicianLicense', 'clinicianSpecialty']
          : ['patientSide', ...(snapshot.amputationSide === 'BILATERAL'
            ? ['bilateralLeftLevel', 'bilateralRightLevel']
            : ['patientLevel']), 'patientDob', ...(snapshot.amputationLevel === 'FINGER_AMPUTATION' ? ['patientFingers'] : [])]),
        'ready',
      ];
      const index = flow.indexOf(snapshot.voiceStep);
      promptForStep(flow[Math.max(0, index - 1)]);
      return;
    }

    if (lower.includes('delete')) {
      if (snapshot.voiceStep === 'fullName') setFullName('');
      if (snapshot.voiceStep === 'clinicianLicense') setLicenseNumber('');
      if (snapshot.voiceStep === 'clinicianSpecialty') setMedicalSpecialty('');
      if (snapshot.voiceStep === 'patientDob') setDob('');
      if (snapshot.voiceStep === 'patientFingers') setMissingFingers([]);
      speak('Deleted. Please say the value again.');
      return;
    }

    if (lower.includes('submit') || lower.includes('complete')) {
      handleSubmit();
      return;
    }

    if (snapshot.voiceStep === 'fullName') {
      setFullName(text);
      promptForStep('role');
      return;
    }
    if (snapshot.voiceStep === 'role') {
      const nextRole = /clinician|doctor|therapist|physician/.test(lower) ? 'CLINICIAN' : 'PATIENT';
      setRole(nextRole);
      promptForStep(nextRole === 'CLINICIAN' ? 'clinicianLicense' : 'patientSide');
      return;
    }
    if (snapshot.voiceStep === 'clinicianLicense') {
      setLicenseNumber(text.replace(/\s+/g, '').toUpperCase());
      promptForStep('clinicianSpecialty');
      return;
    }
    if (snapshot.voiceStep === 'clinicianSpecialty') {
      if (!lower.includes('skip')) setMedicalSpecialty(text);
      promptForStep('ready');
      return;
    }
    if (snapshot.voiceStep === 'patientSide') {
      if (lower.includes('right')) setAmputationSide('RIGHT');
      else if (lower.includes('bilateral') || lower.includes('both')) setAmputationSide('BILATERAL');
      else setAmputationSide('LEFT');
      promptForStep((lower.includes('bilateral') || lower.includes('both')) ? 'bilateralLeftLevel' : 'patientLevel');
      return;
    }
    const parseLevel = () => {
      if (lower.includes('above')) return 'TRANSHUMERAL';
      if (lower.includes('wrist')) return 'WRIST_DISARTICULATION';
      if (lower.includes('finger')) return 'FINGER_AMPUTATION';
      return 'TRANSRADIAL';
    };
    if (snapshot.voiceStep === 'patientLevel') {
      const nextLevel = parseLevel();
      setAmputationLevel(nextLevel);
      promptForStep('patientDob');
      return;
    }
    if (snapshot.voiceStep === 'bilateralLeftLevel') {
      const nextLevel = parseLevel();
      setLeftAmputationLevel(nextLevel);
      setAmputationLevel(nextLevel);
      promptForStep('bilateralRightLevel');
      return;
    }
    if (snapshot.voiceStep === 'bilateralRightLevel') {
      setRightAmputationLevel(parseLevel());
      promptForStep('patientDob');
      return;
    }
    if (snapshot.voiceStep === 'patientDob') {
      if (!lower.includes('skip')) {
        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime())) {
          speak('I could not understand that date. Please say it like January first 1990, or say skip.');
          return;
        }
        setDob(parsed.toISOString().slice(0, 10));
      }
      promptForStep(snapshot.amputationLevel === 'FINGER_AMPUTATION' ? 'patientFingers' : 'ready');
      return;
    }
    if (snapshot.voiceStep === 'patientFingers') {
      if (lower.includes('done')) {
        promptForStep('ready');
        return;
      }
      const selected = FINGER_OPTIONS.filter((finger) => lower.includes(finger.toLowerCase()));
      if (selected.length) {
        setMissingFingers((prev) => Array.from(new Set([...prev, ...selected])));
        speak('Finger selection updated. Say another finger, or say done.');
      } else {
        speak('Please say thumb, index, middle, ring, or pinky. Say done when finished.');
      }
    }
  }, [handleSubmit, promptForStep, speak]);

  useEffect(() => {
    processVoiceCommandRef.current = processVoiceCommand;
  }, [processVoiceCommand]);

  const renderFingerOptions = (selected, setSelected) => (
    <div className="finger-checkbox-grid">
      {FINGER_OPTIONS.map((finger) => (
        <label key={finger} className="finger-checkbox">
          <input
            type="checkbox"
            checked={selected.includes(finger)}
            onChange={(e) => {
              setSelected((prev) => e.target.checked
                ? Array.from(new Set([...prev, finger]))
                : prev.filter((item) => item !== finger));
            }}
          />
          <span>{finger.charAt(0) + finger.slice(1).toLowerCase()}</span>
        </label>
      ))}
    </div>
  );

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
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {error && (
          <div className="auth-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {voiceSupported && (
          <div className="voice-preview-panel" style={{ border: '1px solid var(--border-color)', borderRadius: 14, padding: 14, marginBottom: 16, background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700 }}>Voice recognition</span>
              <span style={{ color: voiceActive ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.9rem' }}>
                {voiceActive ? 'Active' : 'Paused'}
              </span>
            </div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: 10 }}>{voicePrompt}</div>
            <div style={{ background: 'var(--surface-muted)', borderRadius: 12, padding: 10, minHeight: 44, color: transcript ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {transcript || 'Waiting for your voice response.'}
            </div>
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
                  <select id="setup-level" value={amputationLevel} onChange={e => setAmputationLevel(e.target.value)} disabled={amputationSide === 'BILATERAL'}>
                    <option value="TRANSRADIAL">Transradial (Below Elbow)</option>
                    <option value="TRANSHUMERAL">Transhumeral (Above Elbow)</option>
                    <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                    <option value="FINGER_AMPUTATION">Fingers Only</option>
                  </select>
                </div>
              </div>
              {amputationSide === 'BILATERAL' && (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 14, padding: 16, background: 'var(--bg-primary)' }}>
                  <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Bilateral Amputation Details</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginBottom: 14 }}>
                    Voice mode will stay enabled by default for bilateral access.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label htmlFor="setup-left-level">Left Side Level</label>
                      <select id="setup-left-level" value={leftAmputationLevel} onChange={e => setLeftAmputationLevel(e.target.value)}>
                        <option value="TRANSRADIAL">Transradial (Below Elbow)</option>
                        <option value="TRANSHUMERAL">Transhumeral (Above Elbow)</option>
                        <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                        <option value="FINGER_AMPUTATION">Fingers Only</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="setup-right-level">Right Side Level</label>
                      <select id="setup-right-level" value={rightAmputationLevel} onChange={e => setRightAmputationLevel(e.target.value)}>
                        <option value="TRANSRADIAL">Transradial (Below Elbow)</option>
                        <option value="TRANSHUMERAL">Transhumeral (Above Elbow)</option>
                        <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                        <option value="FINGER_AMPUTATION">Fingers Only</option>
                      </select>
                    </div>
                  </div>
                  {leftAmputationLevel === 'FINGER_AMPUTATION' && (
                    <div style={{ marginTop: 14 }}>
                      <label>Left Missing Fingers</label>
                      {renderFingerOptions(leftMissingFingers, setLeftMissingFingers)}
                    </div>
                  )}
                  {rightAmputationLevel === 'FINGER_AMPUTATION' && (
                    <div style={{ marginTop: 14 }}>
                      <label>Right Missing Fingers</label>
                      {renderFingerOptions(rightMissingFingers, setRightMissingFingers)}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label htmlFor="setup-dob">Date of Birth</label>
                <input
                  id="setup-dob"
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                />
              </div>
              {amputationSide !== 'BILATERAL' && amputationLevel === 'FINGER_AMPUTATION' && (
                <div>
                  <label>Missing Fingers</label>
                  {renderFingerOptions(missingFingers, setMissingFingers)}
                </div>
              )}
            </>
          )}

          {/* Submit */}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
            {loading ? 'Setting up...' : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
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
