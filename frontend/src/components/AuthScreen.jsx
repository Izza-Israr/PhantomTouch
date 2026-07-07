import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const FINGER_OPTIONS = ['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'];

// Google logo SVG
const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

// Inline SVG icons for input fields
const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const UserPlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
  </svg>
);

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
);

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const AuthScreen = ({ mode = 'login', onAuthSuccess, onNavigate, onGoogleNeedsProfile }) => {
  const [isLogin, setIsLogin] = useState(mode === 'login');
  const [role, setRole] = useState('PATIENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Clinician extra fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [medicalSpecialty, setMedicalSpecialty] = useState('');

  // Patient extra fields
  const [amputationSide, setAmputationSide] = useState('LEFT');
  const [amputationLevel, setAmputationLevel] = useState('TRANSRADIAL');
  const [missingFingers, setMissingFingers] = useState(['INDEX']);
  const [dob, setDob] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const googleBtnContainerRef = useRef(null);

  useEffect(() => {
    setIsLogin(mode === 'login');
  }, [mode]);

  const handleGoogleResponse = useCallback(async (response) => {
    if (!response?.credential) return;
    setGoogleLoading(true);
    setError('');

    try {
      const payload = {
        credential: response.credential
      };

      // If we are on the register page, pass the profile details along so the account is fully created
      if (!isLogin) {
        payload.role = role;
        payload.fullName = fullName;
        payload.createAccount = true;

        if (role === 'CLINICIAN') {
          payload.licenseNumber = licenseNumber;
          payload.medicalSpecialty = medicalSpecialty;
        } else if (role === 'PATIENT') {
          payload.amputationSide = amputationSide;
          payload.amputationLevel = amputationLevel;
          payload.missingFingers = amputationLevel === 'FINGER_AMPUTATION' ? missingFingers : [];
          if (dob) payload.dateOfBirth = dob;
        }
      }

      const res = await axios.post('http://localhost:5000/api/auth/google', payload);

      if (res.data) {
        if (res.data.needsProfileSetup) {
          localStorage.setItem('token', res.data.token);
          if (onGoogleNeedsProfile) {
            onGoogleNeedsProfile(res.data.token, res.data.user, res.data.googleName);
          }
        } else {
          onAuthSuccess(res.data.token, res.data.user, res.data.profile);
        }
      }
    } catch (err) {
      console.error('Google auth failed:', err);
      const needsRegistration = err.response?.status === 404 || err.response?.data?.needsRegistration;
      if (needsRegistration) {
        setEmail(err.response?.data?.email || '');
        setFullName(err.response?.data?.googleName || fullName || '');
        setIsLogin(false);
        setError(err.response?.data?.message || 'No account found for this Google account. Please create one.');
        return;
      }
      const msg = err.response?.data?.message || 'Google authentication failed. Please try again.';
      setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  }, [
    isLogin, role, fullName, licenseNumber, medicalSpecialty, 
    amputationSide, amputationLevel, missingFingers, dob,
    onAuthSuccess, onGoogleNeedsProfile
  ]);

  // Initialize Google Identity Services and render official button
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const initAndRenderGoogle = () => {
      if (window.google?.accounts?.id && googleBtnContainerRef.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
          theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          width: googleBtnContainerRef.current.offsetWidth || 388,
          shape: 'rectangular',
          text: 'continue_with',
        });
      }
    };

    // If script already loaded
    if (window.google?.accounts?.id) {
      initAndRenderGoogle();
    } else {
      // Wait for script to load
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          initAndRenderGoogle();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [isLogin, handleGoogleResponse]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const baseUrl = 'http://localhost:5000/api/auth';
      if (isLogin) {
        const res = await axios.post(`${baseUrl}/login`, { email, password });
        if (res.data && res.data.token) {
          onAuthSuccess(res.data.token, res.data.user, res.data.profile);
        }
      } else {
        const payload = { email, password, role, fullName };

        if (role === 'CLINICIAN') {
          payload.licenseNumber = licenseNumber;
          payload.medicalSpecialty = medicalSpecialty;
        } else if (role === 'PATIENT') {
          payload.amputationSide = amputationSide;
          payload.amputationLevel = amputationLevel;
          payload.missingFingers = amputationLevel === 'FINGER_AMPUTATION' ? missingFingers : [];
          if (dob) payload.dateOfBirth = dob;
        }

        const res = await axios.post(`${baseUrl}/register`, payload);
        if (res.data && res.data.token) {
          onAuthSuccess(res.data.token, res.data.user, res.data.profile);
        }
      }
    } catch (err) {
      console.error('Authentication request failed:', err);
      const needsRegistration = (err.response?.status === 404 || err.response?.data?.needsRegistration) && isLogin;
      if (needsRegistration) {
        setEmail(err.response?.data?.email || email);
        setIsLogin(false);
        setError(err.response?.data?.message || 'No account found for this email. Please create one.');
        return;
      }
      const msg = err.response?.data?.message || 'Authentication failed. Please check your inputs.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page animate-fade-in">
      {/* Left branding panel */}
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <h1>
            <span style={{ color: '#f8fafc' }}>Phantom</span>
            <span className="brand-gradient-text">Touch</span>
          </h1>
          <p>
            Browser-based 3D mirror therapy powered by AI hand tracking. Alleviate phantom limb pain from anywhere — no VR headset required.
          </p>

          <div className="auth-brand-features">
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon" style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <span><strong style={{ color: '#f8fafc' }}>HIPAA-Friendly Privacy</strong><br/>All camera feeds processed locally in your browser — zero data leaves your device.</span>
            </div>
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon" style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"/><path d="M14 10V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v9"/><path d="M6 14.5V11a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a4 4 0 0 0 4 4h9a4 4 0 0 0 4-4v-3"/>
                </svg>
              </div>
              <span><strong style={{ color: '#f8fafc' }}>Real-Time 3D Mirroring</strong><br/>21-point hand tracking with MediaPipe renders a lifelike mirrored ghost limb via Three.js.</span>
            </div>
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <span><strong style={{ color: '#f8fafc' }}>Clinical Dashboards</strong><br/>Clinicians monitor ROM, session compliance, and prescribe gamified therapy remotely.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-form-card">
            <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            <p className="auth-subtitle">
              {isLogin ? 'Sign in to continue your therapy journey.' : 'Join PhantomTouch and set up your profile.'}
            </p>

            {/* Google Sign-In Button Container */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div ref={googleBtnContainerRef} style={{ width: '100%', minHeight: '44px' }}></div>
            </div>

            {/* Divider */}
            <div className="auth-divider">
              <span>or continue with email</span>
            </div>

            {/* Error */}
            {error && (
              <div className="auth-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Email */}
              <div>
                <label htmlFor="auth-email">Email Address</label>
                <div className="auth-input-group">
                  <span className="auth-input-icon"><MailIcon /></span>
                  <input
                    id="auth-email"
                    type="email"
                    placeholder="name@domain.com"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="auth-password">Password</label>
                <div className="auth-input-group">
                  <span className="auth-input-icon"><LockIcon /></span>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="auth-input-action"
                    onClick={() => setShowPassword(p => !p)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* Registration fields */}
              {!isLogin && (
                <>
                  <div>
                    <label htmlFor="auth-fullname">Full Name</label>
                    <div className="auth-input-group">
                      <span className="auth-input-icon"><UserPlusIcon /></span>
                      <input
                        id="auth-fullname"
                        type="text"
                        placeholder="e.g. John Doe"
                        required
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Role Selector */}
                  <div>
                    <label htmlFor="auth-role">Your Role</label>
                    <select id="auth-role" value={role} onChange={e => setRole(e.target.value)}>
                      <option value="PATIENT">Amputee Patient (Free)</option>
                      <option value="CLINICIAN">Therapist / Clinician</option>
                    </select>
                  </div>

                  {/* Clinician Fields */}
                  {role === 'CLINICIAN' && (
                    <>
                      <div>
                        <label htmlFor="auth-license">Medical License Number</label>
                        <input
                          id="auth-license"
                          type="text"
                          placeholder="e.g. LIC-123456"
                          required
                          value={licenseNumber}
                          onChange={e => setLicenseNumber(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="auth-specialty">Medical Specialty</label>
                        <input
                          id="auth-specialty"
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
                          <label htmlFor="auth-side">Amputation Side</label>
                          <select id="auth-side" value={amputationSide} onChange={e => setAmputationSide(e.target.value)}>
                            <option value="LEFT">Left Arm/Hand</option>
                            <option value="RIGHT">Right Arm/Hand</option>
                            <option value="BILATERAL">Bilateral</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="auth-level">Amputation Level</label>
                          <select id="auth-level" value={amputationLevel} onChange={e => setAmputationLevel(e.target.value)}>
                            <option value="TRANSRADIAL">Transradial (Below Elbow)</option>
                            <option value="TRANSHUMERAL">Transhumeral (Above Elbow)</option>
                            <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                            <option value="FINGER_AMPUTATION">Fingers Only</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="auth-dob">Date of Birth</label>
                        <input
                          id="auth-dob"
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
                </>
              )}

              {/* Submit */}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '4px' }} disabled={loading}>
                {loading ? 'Processing...' : isLogin ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    Sign In
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                    </svg>
                    Create Profile
                  </>
                )}
              </button>
            </form>

            {/* Toggle */}
            <div className="auth-toggle">
              {isLogin ? (
                <>
                  New to PhantomTouch?{' '}
                  <button onClick={() => setIsLogin(false)}>Create an account</button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button onClick={() => setIsLogin(true)}>Sign In</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
