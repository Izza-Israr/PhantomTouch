import React, { useState } from 'react';
import axios from 'axios';
import { LogInIcon, UserIcon } from './Icons';

export const AuthScreen = ({ mode = 'login', onAuthSuccess, onNavigate }) => {
  const [isLogin, setIsLogin] = useState(mode === 'login');
  const [role, setRole] = useState('PATIENT'); // PATIENT or CLINICIAN
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  // Clinician extra fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [medicalSpecialty, setMedicalSpecialty] = useState('');

  // Patient extra fields
  const [amputationSide, setAmputationSide] = useState('LEFT');
  const [amputationLevel, setAmputationLevel] = useState('TRANSRADIAL');
  const [dob, setDob] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const baseUrl = 'http://localhost:5000/api/auth';
      if (isLogin) {
        // Login
        const res = await axios.post(`${baseUrl}/login`, { email, password });
        if (res.data && res.data.token) {
          onAuthSuccess(res.data.token, res.data.user, res.data.profile);
        }
      } else {
        // Register
        const payload = {
          email,
          password,
          role,
          fullName
        };

        if (role === 'CLINICIAN') {
          payload.licenseNumber = licenseNumber;
          payload.medicalSpecialty = medicalSpecialty;
        } else if (role === 'PATIENT') {
          payload.amputationSide = amputationSide;
          payload.amputationLevel = amputationLevel;
          if (dob) payload.dateOfBirth = dob;
        }

        const res = await axios.post(`${baseUrl}/register`, payload);
        if (res.data && res.data.token) {
          onAuthSuccess(res.data.token, res.data.user, res.data.profile);
        }
      }
    } catch (err) {
      console.error('Authentication request failed:', err);
      const msg = err.response?.data?.message || 'Authentication failed. Please check your inputs.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 180px)', padding: '20px' }}>
      <div className="glass-panel glass-panel-glow-purple p-8" style={{ width: '100%', maxWidth: '480px', textAlign: 'left' }}>
        
        <h2 style={{ fontSize: '2rem', marginBottom: '8px', fontFamily: 'var(--font-display)', textAlign: 'center' }}>
          {isLogin ? 'Sign In' : 'Create Account'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '24px' }}>
          {isLogin ? 'Welcome back. Enter your credentials.' : 'Join PhantomTouch and set up your profile.'}
        </p>

        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--error)', color: '#f43f5e', padding: '12px', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Email input */}
          <div>
            <label htmlFor="auth-email">Email Address</label>
            <input 
              id="auth-email"
              type="email" 
              placeholder="e.g. name@domain.com"
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
          </div>

          {/* Password input */}
          <div>
            <label htmlFor="auth-password">Password</label>
            <input 
              id="auth-password"
              type="password" 
              placeholder="••••••••"
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>

          {/* Registration fields */}
          {!isLogin && (
            <>
              <div>
                <label htmlFor="auth-fullname">Full Name</label>
                <input 
                  id="auth-fullname"
                  type="text" 
                  placeholder="e.g. John Doe"
                  required 
                  value={fullName} 
                  onChange={e => setFullName(e.target.value)} 
                />
              </div>

              {/* Role Selector */}
              <div>
                <label htmlFor="auth-role">Identify Your Role</label>
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
                </>
              )}
            </>
          )}

          {/* Submit Button */}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
            {loading ? (
              'Processing...'
            ) : isLogin ? (
              <>
                <LogInIcon className="w-5 h-5" /> Sign In
              </>
            ) : (
              <>
                <UserIcon className="w-5 h-5" /> Create Profile
              </>
            )}
          </button>
        </form>

        {/* Toggle option */}
        <div style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {isLogin ? (
            <>
              New to PhantomTouch?{' '}
              <button 
                style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                onClick={() => setIsLogin(false)}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button 
                style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                onClick={() => setIsLogin(true)}
              >
                Sign In
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
