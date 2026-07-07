import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { LandingScreen } from './components/LandingScreen';
import { AuthScreen } from './components/AuthScreen';
import { ProfileSetupScreen } from './components/ProfileSetupScreen';
import { PatientDashboard } from './components/PatientDashboard';
import { ClinicianDashboard } from './components/ClinicianDashboard';
import { TherapyGame } from './components/TherapyGame';
import { AnalyticsIcon, DashboardIcon, LogOutIcon, ProfileIcon, SessionIcon, ThemeIcon } from './components/Icons';

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
  const [screen, setScreen] = useState('landing'); // landing, login, register, dashboard, game, profileSetup
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [googleName, setGoogleName] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [dashboardView, setDashboardView] = useState('overview');
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleLogout = useCallback(async () => {
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
  }, []);

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
          if (res.data.needsProfileSetup) {
            setScreen('profileSetup');
          } else {
            setScreen('dashboard');
          }
        }
      } catch (err) {
        console.warn('Saved token validation failed. Logging out.', err);
        handleLogout();
      } finally {
        setCheckingAuth(false);
      }
    };

    initializeAuth();
  }, [handleLogout]);

  const handleAuthSuccess = (newToken, newUser, newProfile) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    setProfile(newProfile);
    setScreen('dashboard');
  };

  const handleGoogleNeedsProfile = (newToken, newUser, name) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
    setGoogleName(name || '');
    setScreen('profileSetup');
  };

  const handleProfileComplete = (updatedUser, newProfile) => {
    setUser(updatedUser);
    setProfile(newProfile);
    setScreen('dashboard');
  };

  const fetchNotifications = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/notifications');
      setNotifications(res.data || []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const toggleNotifications = async () => {
    const next = !showNotifications;
    setShowNotifications(next);
    if (next) {
      await fetchNotifications();
    }
  };

  const markNotificationRead = async (id) => {
    try {
      await axios.post(`http://localhost:5000/api/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
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
    if (targetScreen === 'dashboard') setDashboardView('overview');
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
      <header className={`nav-header ${token && screen === 'dashboard' ? 'nav-header-dashboard' : ''}`} style={{ transition: 'var(--transition-smooth)' }}>
        <div
          onClick={() => handleNavigate(token ? 'dashboard' : 'landing')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(6, 182, 212, 0.25)'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
              <path d="M14 10V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v9" />
              <path d="M6 14.5V11a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a4 4 0 0 0 4 4h9a4 4 0 0 0 4-4v-3" />
            </svg>
          </div>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.35rem',
            display: 'inline-flex',
            gap: '0px'
          }}>
            <span style={{ color: 'var(--text-primary)' }}>Phantom</span>
            <span style={{ color: 'var(--accent-cyan)' }}>Touch</span>
          </span>
        </div>

        <nav className="nav-actions" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '20px' }}>
          {token ? (
            <>
              <div className="nav-links hidden-mobile" style={{ display: 'flex', gap: '8px' }}>
                {[
                  { id: 'overview', label: 'Dashboard' },
                  { id: 'sessions', label: 'Therapy Sessions' },
                  { id: 'statistics', label: 'Progress' },
                  { id: 'reports', label: 'Reports' },
                  { id: 'profile', label: 'Profile' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    className="nav-link"
                    style={{
                      color: dashboardView === tab.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      background: dashboardView === tab.id ? 'var(--accent-cyan-dim)' : 'transparent',
                      padding: '8px 16px',
                      fontWeight: dashboardView === tab.id ? '700' : '600',
                      borderRadius: '99px',
                      fontSize: '0.92rem'
                    }}
                    onClick={() => setDashboardView(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="header-user-block" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Theme Toggle Button */}
                <button
                  type="button"
                  onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                  title="Toggle Theme"
                >
                  {theme === 'dark' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 3v1" />
                      <path d="M12 20v1" />
                      <path d="M3 12h1" />
                      <path d="M20 12h1" />
                      <path d="M18.364 5.636l-.707.707" />
                      <path d="M6.343 17.657l-.707.707" />
                      <path d="M5.636 5.636l.707.707" />
                      <path d="M17.657 17.657l.707.707" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                  )}
                </button>

                {/* Notifications Bell */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={toggleNotifications}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      position: 'relative',
                      color: 'var(--text-secondary)',
                      padding: '8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    title="Notifications"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    {notifications.filter(n => !n.is_read).length > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        minWidth: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-cyan)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        padding: '0 4px'
                      }}>{notifications.filter(n => !n.is_read).length}</span>
                    )}
                  </button>

                  {showNotifications && (
                    <div style={{ position: 'absolute', right: 0, top: '40px', width: 360, maxHeight: 420, overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', zIndex: 40 }}>
                      <div style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}><strong>Notifications</strong></div>
                      {notifications.length === 0 && <div style={{ padding: 14, color: 'var(--text-muted)' }}>No notifications</div>}
                      {notifications.map(n => (
                        <div key={n.id} style={{ padding: 12, borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{n.type}</div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{n.message}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleString('en-US', { timeZone: 'Asia/Karachi', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {!n.is_read && <button onClick={() => markNotificationRead(n.id)} style={{ border: 'none', background: 'transparent', color: 'var(--accent-cyan)', cursor: 'pointer' }}>Mark read</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* User Avatar & Name block */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--accent-cyan-dim)',
                  padding: '6px 14px',
                  borderRadius: '99px'
                }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-cyan)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <span style={{
                    fontWeight: '700',
                    fontSize: '0.88rem',
                    color: 'var(--accent-cyan)',
                    fontFamily: 'var(--font-sans)'
                  }}>
                    {profile?.fullName || user?.email?.split('@')[0]}
                  </span>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                  title="Log Out"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
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
        @media (max-width: 820px) {
          .hidden-mobile { display: none !important; }
        }
      `}</style>

      {/* Main Content Router */}
      <main className={token && screen === 'dashboard' ? 'app-main' : ''} style={{ flexGrow: 1 }}>
        <div className={token && screen === 'dashboard' ? 'dashboard-page' : ''}>
          {screen === 'landing' && <LandingScreen onNavigate={handleNavigate} />}

          {(screen === 'login' || screen === 'register') && (
            <AuthScreen
              mode={screen}
              onAuthSuccess={handleAuthSuccess}
              onNavigate={handleNavigate}
              onGoogleNeedsProfile={handleGoogleNeedsProfile}
            />
          )}

          {screen === 'profileSetup' && (
            <ProfileSetupScreen
              user={user}
              googleName={googleName}
              token={token}
              onProfileComplete={handleProfileComplete}
            />
          )}

          {screen === 'dashboard' && (
            user?.role === 'PATIENT' ? (
              <PatientDashboard
                user={user}
                profile={profile}
                onUpdateProfile={handleUpdateProfile}
                onNavigate={handleNavigate}
                theme={theme}
                onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                view={dashboardView}
                onSetDashboardView={setDashboardView}
              />
            ) : (
              <ClinicianDashboard
                user={user}
                profile={profile}
                theme={theme}
                onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                view={dashboardView}
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
        </div>
      </main>
    </>
  );
}

export default App;
