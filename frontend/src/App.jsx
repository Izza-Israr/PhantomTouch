import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LandingScreen } from './components/LandingScreen';
import { AuthScreen } from './components/AuthScreen';
import { PatientDashboard } from './components/PatientDashboard';
import { ClinicianDashboard } from './components/ClinicianDashboard';
import { TherapyGame } from './components/TherapyGame';
import { HospitalIcon, LogOutIcon } from './components/Icons';

// Add this right below your import statements to clean up your network calls
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

function App() {
  const [screen, setScreen] = useState('landing'); // landing, login, register, dashboard, game
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Authenticate user on startup if a token exists
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        setCheckingAuth(false);
        return;
      }

      try {
        const res = await axios.get('http://localhost:5000/api/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        });

        if (res.data) {
          setToken(storedToken);
          setUser(res.data.user);
          setProfile(res.data.profile);
          setScreen('dashboard');
        }
      } catch (err) {
        console.warn('Saved token validation failed. Logging out.', err);
        handleLogout();
      } finally {
        setCheckingAuth(false);
      }
    };

    initializeAuth();
  }, []);

  const handleAuthSuccess = (newToken, newUser, newProfile) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    setProfile(newProfile);
    setScreen('dashboard');
  };

  const handleLogout = async () => {
    try {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        await axios.post('http://localhost:5000/api/auth/logout', {}, {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
      }
    } catch (e) {
      console.warn('Server logout call failed:', e);
    } finally {
      localStorage.removeItem('token');
      setToken('');
      setUser(null);
      setProfile(null);
      setScreen('landing');
    }
  };

  const handleUpdateProfile = (updatedProfile) => {
    setProfile(updatedProfile);
  };

  const handleNavigate = (targetScreen) => {
    // If not authenticated, restrict dashboard and game screens
    if (!token && (targetScreen === 'dashboard' || targetScreen === 'game')) {
      setScreen('landing');
      return;
    }
    setScreen(targetScreen);
  };

  if (checkingAuth) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Verifying active session credentials...</p>
      </div>
    );
  }

  return (
    <>
      {/* Navigation Header */}
      <header className="nav-header">
        <div
          onClick={() => handleNavigate(token ? 'dashboard' : 'landing')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <HospitalIcon className="w-6 h-6" style={{ color: 'var(--accent-purple)' }} />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.4rem',
            background: 'linear-gradient(135deg, #fff 0%, var(--accent-purple) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            PhantomTouch
          </span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {token ? (
            <>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }} className="hidden-mobile">
                Signed in as: <strong style={{ color: '#fff' }}>{profile?.fullName || user?.email}</strong>
                <span style={{
                  marginLeft: '8px',
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '50px',
                  background: 'var(--accent-purple-dim)',
                  color: 'var(--accent-purple)',
                  fontWeight: 600,
                  textTransform: 'capitalize'
                }}>
                  {user?.role.toLowerCase()}
                </span>
              </span>
              <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                <LogOutIcon className="w-4 h-4" /> Log Out
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              {screen !== 'login' && (
                <button className="btn btn-secondary" onClick={() => handleNavigate('login')} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  Sign In
                </button>
              )}
              {screen !== 'register' && (
                <button className="btn btn-primary" onClick={() => handleNavigate('register')} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  Register
                </button>
              )}
            </div>
          )}
        </nav>
      </header>

      {/* Embedded style helper for hiding elements on mobile headers */}
      <style>{`
        @media (max-width: 600px) {
          .hidden-mobile { display: none !important; }
        }
      `}</style>

      {/* Main Content Router */}
      <main style={{ flexGrow: 1 }}>
        {screen === 'landing' && <LandingScreen onNavigate={handleNavigate} />}

        {(screen === 'login' || screen === 'register') && (
          <AuthScreen
            mode={screen}
            onAuthSuccess={handleAuthSuccess}
            onNavigate={handleNavigate}
          />
        )}

        {screen === 'dashboard' && (
          user?.role === 'PATIENT' ? (
            <PatientDashboard
              user={user}
              profile={profile}
              onUpdateProfile={handleUpdateProfile}
              onNavigate={handleNavigate}
            />
          ) : (
            <ClinicianDashboard
              user={user}
              profile={profile}
            />
          )
        )}

        {screen === 'game' && user?.role === 'PATIENT' && (
          <TherapyGame
            user={user}
            profile={profile}
            onNavigate={handleNavigate}
          />
        )}
      </main>
    </>
  );
}

export default App;