import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const FINGER_OPTIONS = ['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'];

// Google logo SVG
const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

// Inline SVG icons for input fields
const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UserPlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
  </svg>
);

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const EMAIL_WORDS = {
  at: '@',
  dot: '.',
  period: '.',
  point: '.',
  underscore: '_',
  dash: '-',
  hyphen: '-',
  minus: '-',
  plus: '+',
  space: '',
  blank: '',
};

const LETTER_WORDS = {
  a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f', g: 'g', h: 'h', i: 'i', j: 'j', k: 'k', l: 'l', m: 'm',
  n: 'n', o: 'o', p: 'p', q: 'q', r: 'r', s: 's', t: 't', u: 'u', v: 'v', w: 'w', x: 'x', y: 'y', z: 'z',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

const cleanSpokenText = (text) => text
  .replace(/\b(confirm|submit|next|continue|enter|my|is|it is|please|field)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeSpokenEmail = (text) => {
  const raw = text
    .toLowerCase()
    .replace(/@/g, ' at ')
    .replace(/\./g, ' dot ')
    .replace(/-/g, ' dash ')
    .replace(/_/g, ' underscore ');

  return raw
    .split(/\s+/)
    .map((word) => EMAIL_WORDS[word] ?? LETTER_WORDS[word] ?? word.replace(/[^a-z0-9]/g, ''))
    .join('')
    .replace(/\.{2,}/g, '.')
    .replace(/@{2,}/g, '@');
};

const normalizeDate = (text) => {
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

export const AuthScreen = ({ mode = 'login', onAuthSuccess, onNavigate, onGoogleNeedsProfile }) => {
  const [isLogin, setIsLogin] = useState(mode === 'login');
  const [role, setRole] = useState('PATIENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Lightweight Web Speech API support (window.SpeechRecognition)
  const getSpeechRecognition = () => {
    const w = window;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  };
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voicePreference, setVoicePreference] = useState('voice');
  const [transcript, setTranscript] = useState('');
  const [transcriptReady, setTranscriptReady] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voicePrompt, setVoicePrompt] = useState('');
  const [voiceStep, setVoiceStep] = useState(mode === 'login' ? 'loginEmail' : 'registerName');
  const voiceTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceActiveRef = useRef(false);
  const processVoiceCommandRef = useRef(null);
  const formSnapshotRef = useRef({});
  const googleBtnContainerRef = useRef(null);
  const googleInitializedRef = useRef(false);
  const lastVoiceCommandRef = useRef('');
  const isSpeakingRef = useRef(false);

  // Clinician extra fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [medicalSpecialty, setMedicalSpecialty] = useState('');

  // Patient extra fields
  const [amputationSide, setAmputationSide] = useState('LEFT');
  const [amputationLevel, setAmputationLevel] = useState('TRANSRADIAL');
  const [missingFingers, setMissingFingers] = useState(['INDEX']);
  const [leftAmputationLevel, setLeftAmputationLevel] = useState('TRANSRADIAL');
  const [rightAmputationLevel, setRightAmputationLevel] = useState('TRANSRADIAL');
  const [leftMissingFingers, setLeftMissingFingers] = useState([]);
  const [rightMissingFingers, setRightMissingFingers] = useState([]);
  const [dob, setDob] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

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
      console.warn('Speech synthesis unavailable', e);
    }
  }, []);

  const promptForStep = useCallback((step) => {
    const prompts = {
      loginEmail: 'Please say your email address. You can spell it character by character, for example j o h n at gmail dot com.',
      loginPassword: 'Please say your password, or say submit when it is already entered.',
      registerName: 'Can you please tell your full name?',
      registerEmail: 'Please say your email address. You can spell every character, and say at and dot for symbols.',
      registerPassword: 'Please say a password for your account.',
      registerRole: 'Are you registering as a patient or as a clinician?',
      clinicianLicense: 'Please say your medical license number.',
      clinicianSpecialty: 'Please say your medical specialty, or say skip.',
      patientSide: 'Which side is affected? Say left, right, or bilateral.',
      patientLevel: 'What is the amputation level? Say below elbow, above elbow, wrist, or fingers only.',
      bilateralLeftLevel: 'For the left side, what is the amputation level? Say below elbow, above elbow, wrist, or fingers only.',
      bilateralRightLevel: 'For the right side, what is the amputation level? Say below elbow, above elbow, wrist, or fingers only.',
      patientDob: 'Please say your date of birth, or say skip.',
      patientFingers: 'Which fingers are missing? Say thumb, index, middle, ring, or pinky. Say done when finished.',
      ready: 'All required fields are ready. Say submit to continue, delete to clear the current field, or go back.',
    };
    const nextPrompt = prompts[step] || prompts.ready;
    speak(nextPrompt);
    setVoiceStep(step);
  }, [speak]);

  useEffect(() => {
    setIsLogin(mode === 'login');
    setVoiceStep(mode === 'login' ? 'loginEmail' : 'registerName');
  }, [mode]);

  useEffect(() => {
    formSnapshotRef.current = {
      isLogin,
      role,
      email,
      password,
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
  }, [
    isLogin, role, email, password, fullName, licenseNumber, medicalSpecialty,
    amputationSide, amputationLevel, missingFingers, leftAmputationLevel,
    rightAmputationLevel, leftMissingFingers, rightMissingFingers, dob, voiceStep
  ]);

  // Initialize voice recognition for login/register pages
  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setVoiceSupported(false);
      return;
    }
    setVoiceSupported(true);

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (isSpeakingRef.current) return;
      const result = event.results[event.results.length - 1];
      const latest = (result?.[0]?.transcript || '').trim();
      const lower = latest.toLowerCase();
      const isFinal = result?.isFinal !== false;
      setTranscript(latest);
      setTranscriptReady(Boolean(latest));
      setVoiceError('');

      const isNavigationCommand = /login|log in|sign in|register|sign up|create account|google|go back|delete|clear field|submit|complete/.test(lower);
      if (latest && latest !== lastVoiceCommandRef.current && (isFinal || isNavigationCommand)) {
        lastVoiceCommandRef.current = latest;
        processVoiceCommandRef.current?.(latest);
      }

      // Keep the mic session live even when using manual input.
      if (voiceTimerRef.current) {
        clearTimeout(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
    };

    recognition.onerror = (e) => {
      console.warn('Speech recognition error', e);
      setVoiceError(e.error || 'Voice recognition failed');
      setVoiceActive(false);
      voiceActiveRef.current = false;
      if (voiceTimerRef.current) {
        clearTimeout(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
    };

    recognition.onstart = () => {
      setVoiceError('');
      setVoiceActive(true);
      voiceActiveRef.current = true;
    };

    recognition.onend = () => {
      if (voiceActiveRef.current && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) { console.warn('Could not restart recognition', e); }
      } else {
        setVoiceActive(false);
      }
    };

    recognitionRef.current = recognition;

    // Start recognition by default for login/register (both modes active requirement)
    try {
      recognition.start();
      voiceActiveRef.current = true;
      speak(`Voice recognition mode is active. ${mode === 'login'
        ? 'Please say your email address, say register if you are new, or say Google to use Google sign in.'
        : 'Can you please tell your full name, say login if you already have an account, or say Google to register with Google.'}`);
    } catch (e) {
      console.warn('Could not start speech recognition', e);
      setVoiceError('Voice recognition unavailable or blocked');
      setVoiceActive(false);
      voiceActiveRef.current = false;
    }

    return () => {
      if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
      try { recognition.stop(); } catch (e) { }
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, speak]);

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
      }

      const res = await axios.post('/api/auth/google', payload);

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
    amputationSide, amputationLevel, missingFingers, leftAmputationLevel,
    rightAmputationLevel, leftMissingFingers, rightMissingFingers, dob,
    onAuthSuccess, onGoogleNeedsProfile
  ]);

  // Initialize Google Identity Services and render official button
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || googleInitializedRef.current) return;

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

        googleInitializedRef.current = true;
      }
    };

    if (window.google?.accounts?.id) {
      initAndRenderGoogle();
      return;
    }

    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        initAndRenderGoogle();
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [GOOGLE_CLIENT_ID, handleGoogleResponse]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError('');
    setLoading(true);

    try {
      const baseUrl = '/api/auth';
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

  const clearCurrentVoiceField = useCallback((step) => {
    const target = step || voiceStep;
    if (target.includes('Email')) setEmail('');
    else if (target.includes('Password')) setPassword('');
    else if (target === 'registerName') setFullName('');
    else if (target === 'clinicianLicense') setLicenseNumber('');
    else if (target === 'clinicianSpecialty') setMedicalSpecialty('');
    else if (target === 'patientDob') setDob('');
    else if (target === 'patientFingers') setMissingFingers([]);
    speak('Deleted. Please say the value again.');
  }, [speak, voiceStep]);

  const goBackVoiceStep = useCallback(() => {
    const snapshot = formSnapshotRef.current;
    const flow = snapshot.isLogin
      ? ['loginEmail', 'loginPassword', 'ready']
      : [
        'registerName',
        'registerEmail',
        'registerPassword',
        'registerRole',
        ...(snapshot.role === 'CLINICIAN'
          ? ['clinicianLicense', 'clinicianSpecialty']
          : ['patientSide', ...(snapshot.amputationSide === 'BILATERAL'
            ? ['bilateralLeftLevel', 'bilateralRightLevel']
            : ['patientLevel']), 'patientDob', ...(snapshot.amputationLevel === 'FINGER_AMPUTATION' ? ['patientFingers'] : [])]),
        'ready',
      ];
    const index = flow.indexOf(snapshot.voiceStep);
    if (index <= 0) {
      onNavigate?.('landing');
      return;
    }
    promptForStep(flow[index - 1], snapshot.role, snapshot.amputationLevel);
  }, [onNavigate, promptForStep]);

  const startGoogleByVoice = useCallback(() => {
    speak('Opening Google sign in. Please choose the account from the Google account window.');
    try {
      window.google?.accounts?.id?.prompt();
    } catch (e) {
      console.warn('Could not open Google account chooser', e);
      setError('Google sign-in is not ready yet. Please use the Google button.');
    }
  }, [speak]);

  const processVoiceCommand = useCallback((spokenText) => {
    const text = spokenText.trim();
    const lower = text.toLowerCase();
    const snapshot = formSnapshotRef.current;
    const step = snapshot.voiceStep;

    setTranscript(text);
    setTranscriptReady(true);
    setVoiceError('');

    if (!text) return;
    if (lower.includes('go back')) {
      goBackVoiceStep();
      return;
    }
    if (lower.includes('delete') || lower.includes('clear field')) {
      clearCurrentVoiceField(step);
      return;
    }
    if (lower.includes('google')) {
      startGoogleByVoice();
      return;
    }
    if (lower.includes('login') || lower.includes('sign in')) {
      setIsLogin(true);
      onNavigate?.('login');
      promptForStep('loginEmail');
      return;
    }
    if (lower.includes('register') || lower.includes('sign up') || lower.includes('create account')) {
      setIsLogin(false);
      onNavigate?.('register');
      promptForStep('registerName');
      return;
    }
    if (lower.includes('submit') || lower.includes('complete') || lower.includes('create profile')) {
      handleSubmit();
      return;
    }

    if (step === 'loginEmail' || step === 'registerEmail') {
      setEmail(normalizeSpokenEmail(text));
      promptForStep(snapshot.isLogin ? 'loginPassword' : 'registerPassword');
      return;
    }
    if (step === 'loginPassword' || step === 'registerPassword') {
      setPassword(cleanSpokenText(text).replace(/\s+/g, ''));
      promptForStep(snapshot.isLogin ? 'ready' : 'registerRole');
      return;
    }
    if (step === 'registerName') {
      setFullName(cleanSpokenText(text));
      promptForStep('registerEmail');
      return;
    }
    if (step === 'registerRole') {
      const nextRole = /clinician|doctor|therapist|physician/.test(lower) ? 'CLINICIAN' : 'PATIENT';
      setRole(nextRole);
      promptForStep(nextRole === 'CLINICIAN' ? 'clinicianLicense' : 'patientSide', nextRole, snapshot.amputationLevel);
      return;
    }
    if (step === 'clinicianLicense') {
      setLicenseNumber(cleanSpokenText(text).replace(/\s+/g, '').toUpperCase());
      promptForStep('clinicianSpecialty');
      return;
    }
    if (step === 'clinicianSpecialty') {
      if (!lower.includes('skip')) setMedicalSpecialty(cleanSpokenText(text));
      promptForStep('ready');
      return;
    }
    if (step === 'patientSide') {
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
    if (step === 'patientLevel') {
      const nextLevel = parseLevel();
      setAmputationLevel(nextLevel);
      promptForStep('patientDob', snapshot.role, nextLevel);
      return;
    }
    if (step === 'bilateralLeftLevel') {
      setLeftAmputationLevel(parseLevel());
      setAmputationLevel(parseLevel());
      promptForStep('bilateralRightLevel');
      return;
    }
    if (step === 'bilateralRightLevel') {
      setRightAmputationLevel(parseLevel());
      promptForStep('patientDob');
      return;
    }
    if (step === 'patientDob') {
      if (!lower.includes('skip')) {
        const parsedDob = normalizeDate(text);
        if (parsedDob) setDob(parsedDob);
        else {
          speak('I could not understand that date. Please say it like January first 1990, or say skip.');
          return;
        }
      }
      promptForStep(snapshot.amputationLevel === 'FINGER_AMPUTATION' ? 'patientFingers' : 'ready', snapshot.role, snapshot.amputationLevel);
      return;
    }
    if (step === 'patientFingers') {
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
      return;
    }

    speak('I heard you, but I am not sure where to put that. Please answer the current prompt.');
  }, [
    clearCurrentVoiceField, goBackVoiceStep, handleSubmit, onNavigate,
    promptForStep, speak, startGoogleByVoice
  ]);

  useEffect(() => {
    processVoiceCommandRef.current = processVoiceCommand;
  }, [processVoiceCommand]);

  const acceptTranscript = () => {
    if (!transcript) return;
    processVoiceCommand(transcript);
    setTranscript('');
    setTranscriptReady(false);
  };

  const clearTranscript = () => {
    setTranscript('');
    setTranscriptReady(false);
  };

  const toggleVoice = () => {
    if (!voiceSupported) return;
    const rec = recognitionRef.current;
    if (!rec) return;
    if (voiceActive) {
      try { rec.stop(); } catch (e) { }
      setVoiceActive(false);
      voiceActiveRef.current = false;
      if (voiceTimerRef.current) { clearTimeout(voiceTimerRef.current); voiceTimerRef.current = null; }
    } else {
      try { rec.start(); } catch (e) { console.warn('Could not start recognition', e); setVoiceError('Unable to start microphone'); return; }
      setVoiceActive(true);
      voiceActiveRef.current = true;
    }
  };

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
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span><strong style={{ color: '#f8fafc' }}>HIPAA-Friendly Privacy</strong><br />All camera feeds processed locally in your browser — zero data leaves your device.</span>
            </div>
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon" style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" /><path d="M14 10V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" /><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v9" /><path d="M6 14.5V11a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a4 4 0 0 0 4 4h9a4 4 0 0 0 4-4v-3" />
                </svg>
              </div>
              <span><strong style={{ color: '#f8fafc' }}>Real-Time 3D Mirroring</strong><br />21-point hand tracking with MediaPipe renders a lifelike mirrored ghost limb via Three.js.</span>
            </div>
            <div className="auth-brand-feature">
              <div className="auth-brand-feature-icon" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <span><strong style={{ color: '#f8fafc' }}>Clinical Dashboards</strong><br />Clinicians monitor ROM, session compliance, and prescribe gamified therapy remotely.</span>
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

            {/* Voice Preview Panel */}
            {voiceSupported && (
              <div className="voice-preview-panel" style={{ border: '1px solid var(--border-color)', borderRadius: 14, padding: 14, marginBottom: 16, background: 'var(--bg-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700 }}>Voice recognition</span>
                  <button type="button" onClick={toggleVoice} style={{ border: 'none', background: 'transparent', color: 'var(--accent-cyan)', cursor: 'pointer' }}>
                    {voiceActive ? 'Pause mic' : 'Resume mic'}
                  </button>
                </div>
                <div style={{ color: voiceActive ? 'var(--text-primary)' : 'var(--text-muted)', marginBottom: 10 }}>
                  {voiceActive ? 'Listening for spoken input...' : 'Microphone is paused.'}
                </div>
                {voicePrompt && (
                  <div style={{ color: 'var(--text-secondary)', marginBottom: 10 }}>
                    {voicePrompt}
                  </div>
                )}
                <div style={{ background: 'var(--surface-muted)', borderRadius: 12, padding: 10, minHeight: 48, color: transcript ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {transcript || 'Speak now to preview your input.'}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: 10 }}>
                  <button type="button" className="btn btn-secondary" onClick={acceptTranscript} disabled={!transcriptReady} style={{ flex: 1 }}>
                    Accept Transcript
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={clearTranscript} disabled={!transcriptReady} style={{ flex: 1 }}>
                    Clear
                  </button>
                </div>
                {voiceError && <div style={{ marginTop: 8, color: 'var(--error)' }}>{voiceError}</div>}
              </div>
            )}

            {/* Divider */}
            <div className="auth-divider">
              <span>or continue with email</span>
            </div>

            {/* Error */}
            {error && (
              <div className="auth-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
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
                        {amputationSide !== 'BILATERAL' && (
                          <div>
                            <label htmlFor="auth-level">Amputation Level</label>
                            <select id="auth-level" value={amputationLevel} onChange={e => setAmputationLevel(e.target.value)}>
                              <option value="TRANSRADIAL">Transradial (Below Elbow)</option>
                              <option value="TRANSHUMERAL">Transhumeral (Above Elbow)</option>
                              <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                              <option value="FINGER_AMPUTATION">Fingers Only</option>
                            </select>
                          </div>
                        )}
                      </div>
                      {amputationSide === 'BILATERAL' && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 14, padding: 16, background: 'var(--bg-primary)' }}>
                          <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Bilateral Amputation Details</h3>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginBottom: 14 }}>
                            Voice mode will be enabled by default. Tell us each side separately so the therapy screen can show the right available-part guidance.
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label htmlFor="auth-left-level">Left Side Level</label>
                              <select id="auth-left-level" value={leftAmputationLevel} onChange={e => setLeftAmputationLevel(e.target.value)}>
                                <option value="TRANSRADIAL">Transradial (Below Elbow)</option>
                                <option value="TRANSHUMERAL">Transhumeral (Above Elbow)</option>
                                <option value="WRIST_DISARTICULATION">Wrist Disarticulation</option>
                                <option value="FINGER_AMPUTATION">Fingers Only</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="auth-right-level">Right Side Level</label>
                              <select id="auth-right-level" value={rightAmputationLevel} onChange={e => setRightAmputationLevel(e.target.value)}>
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
                        <label htmlFor="auth-dob">Date of Birth</label>
                        <input
                          id="auth-dob"
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
                </>
              )}

              {/* Submit */}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '4px' }} disabled={loading}>
                {loading ? 'Processing...' : isLogin ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    Sign In
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
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
                  <button onClick={() => {
                    setIsLogin(false);
                    onNavigate?.('register');
                    promptForStep('registerName');
                  }}>Create an account</button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button onClick={() => {
                    setIsLogin(true);
                    onNavigate?.('login');
                    promptForStep('loginEmail');
                  }}>Sign In</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
