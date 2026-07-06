import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import * as THREE from 'three';
import { useMirrorEngine } from '../hooks/useMirrorEngine';
import { PlayIcon } from './Icons';

function playSuccessChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.18);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.start(t);
    osc.stop(t + 0.3);
  } catch (error) {
    console.debug('Success chime unavailable:', error);
  }
}

function makeTargetMesh(scene) {
  const geo = new THREE.IcosahedronGeometry(0.4, 1);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.4,
    wireframe: true, transparent: true, opacity: 0.8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const light = new THREE.PointLight(0x00f5ff, 1.8, 6);
  scene.add(mesh);
  scene.add(light);
  return { mesh, light };
}

function makeDebugPointer(scene) {
  const geo = new THREE.SphereGeometry(0.12, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999;
  scene.add(mesh);
  return mesh;
}

function spawnTargetPair(targetA, targetB, configRef) {
  const side = configRef.current.amputationSide || 'LEFT';
  const xPhantom = side === 'LEFT' ? -1 : 1;
  const xReal = -xPhantom;
  const xOffset = 1.2 + Math.random() * 2.0;
  const y = -1.2 + Math.random() * 2.4;

  targetA.mesh.position.set(xReal * xOffset, y, 0);
  targetA.light.position.copy(targetA.mesh.position);
  targetA.mesh.scale.set(1, 1, 1);
  targetA.userData = { originalPosition: targetA.mesh.position.clone() };

  targetB.mesh.position.set(xPhantom * xOffset, y, 0);
  targetB.light.position.copy(targetB.mesh.position);
  targetB.mesh.scale.set(1, 1, 1);
  targetB.userData = { originalPosition: targetB.mesh.position.clone() };
}

function burstParticles(scene, pos, toneHex, particlesRef) {
  const tone = new THREE.Color(toneHex);
  for (let i = 0; i < 20; i++) {
    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const mat = new THREE.MeshPhongMaterial({
      color: i % 2 === 0 ? 0x00f5ff : tone,
      emissive: i % 2 === 0 ? 0x00f5ff : tone,
      emissiveIntensity: 0.9,
      transparent: true, opacity: 1,
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(pos);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.15,
      (Math.random() - 0.5) * 0.15 + 0.05,
      (Math.random() - 0.5) * 0.15,
    );
    scene.add(p);
    particlesRef.current.push({ mesh: p, vel, life: 1.0 });
  }
}

export const TherapyGame = ({ profile, onNavigate }) => {
  const [gameState, setGameState] = useState('ready');
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [targetsHit, setTargetsHit] = useState(0);
  const [targetsSpawned, setTargetsSpawned] = useState(0);
  const [peakROM, setPeakROM] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [hoverPct, setHoverPct] = useState(0);
  const [sessionSaved, setSessionSaved] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [painScore, setPainScore] = useState(4);

  // null = not yet chosen; 'LEFT' or 'RIGHT' = amputated side selected by user
  const [amputationSide, setAmputationSide] = useState(profile?.amputationSide || null);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  const statsRef = useRef({
    hits: 0, spawned: 0, startTime: null, endTime: null,
    peakROM: 0, telemetry: [], startPos: null,
  });

  const configRef = useRef({
    amputationSide: profile?.amputationSide || 'LEFT', // overwritten by selectSide before session
    amputationLevel: profile?.amputationLevel || 'FULL',
    missingFingers: profile?.missingFingers || [],
    meshScaleMultiplier: profile?.meshScaleMultiplier || 1.0,
    skinToneSliderHex: profile?.skinToneSliderHex || '#aa3bff',
    prescribedDuration: 120,
    targetSpawnRadius: 2.0,
    requiredHoverDwellTimeMs: 800,
    hoverAccumMs: 0,
  });

  useEffect(() => {
    configRef.current.amputationSide = amputationSide || profile?.amputationSide || 'LEFT';
    configRef.current.amputationLevel = profile?.amputationLevel || 'TRANSRADIAL';
    configRef.current.missingFingers = profile?.missingFingers || [];
    configRef.current.meshScaleMultiplier = profile?.meshScaleMultiplier || 1.0;
    configRef.current.skinToneSliderHex = profile?.skinToneSliderHex || '#aa3bff';
  }, [amputationSide, profile]);

  const targetPairRef = useRef(null);
  const debugPointerRef = useRef(null);
  const particlesRef = useRef([]);
  const gameStateRef = useRef('ready');
  const sessionEndInProgressRef = useRef(false);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const landmarksHandlerRef = useRef(null);
  const stableRelay = useCallback((data) => {
    landmarksHandlerRef.current?.(data);
  }, []);

  const {
    sceneRef,
    initThreeJS,
    startRenderLoop,
    stopRenderLoop,
    initMediaPipe,
    destroy,
  } = useMirrorEngine({ configRef, onLandmarksUpdate: stableRelay });

  useEffect(() => {
    const loadPrescription = async () => {
      const patientId = profile?._id || profile?.id;
      const token = localStorage.getItem('token');
      if (!patientId || !token) return;

      try {
        const res = await axios.get(`http://localhost:5000/api/prescriptions/patient/${patientId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data) {
          configRef.current.prescribedDuration = res.data.prescribedSessionDurationSeconds || configRef.current.prescribedDuration;
          configRef.current.targetSpawnRadius = res.data.targetSpawnRadius || configRef.current.targetSpawnRadius;
          configRef.current.requiredHoverDwellTimeMs = res.data.requiredHoverDwellTimeMs || configRef.current.requiredHoverDwellTimeMs;
          configRef.current.prescriptionId = res.data.id || res.data._id || null;
          setSecondsLeft(configRef.current.prescribedDuration || 120);
        }
      } catch (error) {
        console.warn('Using default session prescription settings:', error.response?.data || error.message);
      }
    };

    loadPrescription();
  }, [profile?._id, profile?.id]);

  const handleLandmarks = useCallback((real, phantom) => {
    if (isPaused) return;
    if (!targetPairRef.current || gameStateRef.current !== 'running' || !real || !phantom) return;
    const { a: targetA, b: targetB } = targetPairRef.current;
    if (!targetA || !targetB) return;

    const indexTip = real[8];
    const thumbTip = real[4];
    if (!indexTip || !thumbTip) return;

    const pinchX = (indexTip.x + thumbTip.x) / 2;
    const pinchY = (indexTip.y + thumbTip.y) / 2;

    const basePosA = targetA.userData?.originalPosition || targetA.mesh.position;
    const distA = Math.hypot(
      pinchX - basePosA.x,
      pinchY - basePosA.y,
    );

    const realSh = real[21];
    const phanSh = phantom[21];
    if (realSh && phanSh && targetB.userData?.originalPosition && targetA.userData?.originalPosition) {
      const dx = targetA.userData.originalPosition.x - realSh.x;
      const dy = targetA.userData.originalPosition.y - realSh.y;

      targetB.mesh.position.x = phanSh.x - dx;
      targetB.mesh.position.y = phanSh.y + dy;
      targetB.light.position.copy(targetB.mesh.position);
    }

    if (debugPointerRef.current) {
      debugPointerRef.current.position.set(pinchX, pinchY, 0.05);
    }

    if (distA < 0.70) {
      configRef.current.hoverAccumMs += 25;
      const pct = Math.min(100,
        (configRef.current.hoverAccumMs / configRef.current.requiredHoverDwellTimeMs) * 100);
      setHoverPct(Math.round(pct));

      if (configRef.current.hoverAccumMs >= configRef.current.requiredHoverDwellTimeMs) {
        playSuccessChime();
        if (sceneRef.current) {
          burstParticles(sceneRef.current, targetA.mesh.position.clone(),
            configRef.current.skinToneSliderHex, particlesRef);
          burstParticles(sceneRef.current, targetB.mesh.position.clone(),
            configRef.current.skinToneSliderHex, particlesRef);
        }
        statsRef.current.hits++;
        setTargetsHit(statsRef.current.hits);
        configRef.current.hoverAccumMs = 0;
        setHoverPct(0);
        spawnTargetPair(targetA, targetB, configRef);
        statsRef.current.spawned++;
        setTargetsSpawned(statsRef.current.spawned);
      }
    } else {
      configRef.current.hoverAccumMs = Math.max(0, configRef.current.hoverAccumMs - 12);
      setHoverPct(Math.round(
        (configRef.current.hoverAccumMs / configRef.current.requiredHoverDwellTimeMs) * 100));
    }

    const wrist = real[0];
    if (wrist) {
      const currentPos = new THREE.Vector3(wrist.x, wrist.y, wrist.z);
      if (!statsRef.current.startPos) {
        statsRef.current.startPos = currentPos.clone();
      } else {
        const deg = Math.min(120, Math.round(currentPos.distanceTo(statsRef.current.startPos) * 15));
        if (deg > statsRef.current.peakROM) {
          statsRef.current.peakROM = deg;
          setPeakROM(deg);
        }
      }
    }
  }, [sceneRef, isPaused]);

  const selectSide = useCallback((side) => {
    if (side !== null) configRef.current.amputationSide = side;
    setAmputationSide(side);
  }, []);

  const onLandmarksUpdate = useCallback((data) => {
    if (!data) return;
    const { real, phantom } = data;
    if (real && phantom) handleLandmarks(real, phantom);
  }, [handleLandmarks]);

  useEffect(() => { landmarksHandlerRef.current = onLandmarksUpdate; });

  const onFrame = useCallback((dt) => {
    if (isPaused) return;
    const pair = targetPairRef.current;
    if (!pair) return;
    for (const target of [pair.a, pair.b]) {
      target.mesh.rotation.y += 1.0 * dt;
      target.mesh.rotation.x += 0.4 * dt;
    }
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.mesh.position.add(p.vel);
      p.life -= 1.6 * dt;
      p.mesh.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        sceneRef.current?.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        particlesRef.current.splice(i, 1);
      }
    }
  }, [sceneRef, isPaused]);

  const formatToPakistanIso = useCallback((date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset'
    }).formatToParts(date).reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});

    const offsetMatch = (parts.timeZoneName || '').match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    let offset = 'Z';
    if (offsetMatch) {
      const sign = offsetMatch[1];
      const hours = offsetMatch[2].padStart(2, '0');
      const minutes = offsetMatch[3] || '00';
      offset = `${sign}${hours}:${minutes}`;
    }

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
  }, []);

  const saveSession = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const patientId = profile?._id || profile?.id || null;
      const prescriptionId = configRef.current.prescriptionId || profile?.currentPrescriptionId || profile?.prescriptionId || null;

      const payload = {
        patientId,
        prescriptionId,
        startTime: formatToPakistanIso(new Date(statsRef.current.startTime)),
        endTime: formatToPakistanIso(new Date()),
        targetsSpawned: statsRef.current.spawned,
        targetsHit: statsRef.current.hits,
        peakRangeOfMotionDegrees: statsRef.current.peakROM,
        painLevel: painScore,
        telemetryStream: statsRef.current.telemetry
      };

      if (!patientId) {
        console.error('Cannot save therapy session: missing patientId in profile', profile);
        return false;
      }
      if (!token) {
        console.error('Cannot save therapy session: missing auth token in localStorage');
        return false;
      }

      console.log('Saving therapy session payload:', payload);
      const res = await axios.post('http://localhost:5000/api/sessions', payload, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      console.log('Therapy session saved successfully', res.data);
      return true;
    } catch (error) {
      console.error('Failed to save therapy session:', error.response ? error.response.data : error.message || error);
      return false;
    }
  }, [formatToPakistanIso, painScore, profile]);

  const finishSession = useCallback(async () => {
    if (sessionEndInProgressRef.current) return;
    if (gameStateRef.current === 'saving' || gameStateRef.current === 'finished') return;
    sessionEndInProgressRef.current = true;

    setGameState('saving');
    stopRenderLoop();
    destroy();
    setAccuracy(
      statsRef.current.spawned > 0
        ? Math.round((statsRef.current.hits / statsRef.current.spawned) * 100)
        : 0,
    );
    const saved = await saveSession();
    setSessionSaved(saved);
    setGameState('finished');
  }, [destroy, stopRenderLoop, saveSession]);

  const startSession = useCallback(() => {
    sessionEndInProgressRef.current = false;
    statsRef.current = { hits: 0, spawned: 1, startTime: Date.now(), endTime: null, peakROM: 0, telemetry: [], startPos: null };
    configRef.current.hoverAccumMs = 0;
    setTargetsHit(0);
    setTargetsSpawned(1);
    setSecondsLeft(configRef.current.prescribedDuration || 120);
    setHoverPct(0);
    setSessionSaved(null);
    setIsPaused(false);
    setGameState('running');
  }, []);

  useEffect(() => {
    if (gameState !== 'running') return;
    const scene = initThreeJS(canvasRef.current, containerRef.current);
    const tA = makeTargetMesh(scene);
    const tB = makeTargetMesh(scene);
    spawnTargetPair(tA, tB, configRef);
    targetPairRef.current = { a: tA, b: tB };
    debugPointerRef.current = makeDebugPointer(scene);
    particlesRef.current = [];
    startRenderLoop(onFrame);
    initMediaPipe(videoRef.current);
    return () => {
      stopRenderLoop();
      destroy();
      targetPairRef.current = null;
      debugPointerRef.current = null;
    };
  }, [gameState, initThreeJS, startRenderLoop, onFrame, initMediaPipe, destroy, stopRenderLoop]);

  useEffect(() => {
    if (gameState !== 'running' || isPaused) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(id); finishSession(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gameState, isPaused, finishSession]);

  return (
    <div className={'animate-fade-in ' + (gameState === 'running' ? 'mirror-session-shell' : '')}
      style={{ width: '100%', height: '100%' }}>

      {gameState === 'ready' && !amputationSide && (
        <div className="glass-panel p-8" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
          <h2>Which side is amputated?</h2>
          <p style={{ marginTop: 10, opacity: 0.75, fontSize: '0.95rem' }}>
            We'll mirror your healthy hand to create the phantom on the amputated side.
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 28 }}>
            {['LEFT', 'RIGHT'].map((side) => (
              <button
                key={side}
                className="btn btn-primary"
                style={{ minWidth: 130, fontSize: '1.1rem', padding: '14px 28px' }}
                onClick={() => selectSide(side)}
              >
                {side === 'LEFT' ? '✋ Left' : 'Right ✋'}
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState === 'ready' && amputationSide && (
        <div className="glass-panel p-8" style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
          <h2>Ready to Start</h2>
          <p style={{ marginTop: 10, opacity: 0.75, fontSize: '0.95rem' }}>
            Amputated side: <strong>{amputationSide}</strong>
          </p>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Show your <strong>{amputationSide === 'LEFT' ? 'right' : 'left'}</strong> hand
            to the camera — the phantom will appear on your <strong>{amputationSide.toLowerCase()}</strong> side.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 28 }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '10px 22px' }}
              onClick={() => selectSide(null)}
            >
              ← Change Side
            </button>
            <button className="btn btn-primary" style={{ padding: '12px 28px' }} onClick={startSession}>
              <PlayIcon className="w-5 h-5" /> Start Practice
            </button>
          </div>
        </div>
      )}

      {gameState === 'running' && (() => {
        const totalDuration = configRef.current.prescribedDuration || 120;
        const elapsedSeconds = totalDuration - secondsLeft;

        const formatMinSec = (sec) => {
          const m = String(Math.floor(sec / 60)).padStart(2, '0');
          const s = String(sec % 60).padStart(2, '0');
          return `${m}:${s}`;
        };

        const elapsedStr = formatMinSec(elapsedSeconds);
        const remainingStr = formatMinSec(secondsLeft);
        const progressPercent = Math.min(100, Math.round((elapsedSeconds / totalDuration) * 100));

        const radiusHUD = 22;
        const strokeWidthHUD = 4;
        const circumferenceHUD = 2 * Math.PI * radiusHUD;
        const offsetHUD = circumferenceHUD - (progressPercent / 100) * circumferenceHUD;

        return (
          <div className="game-split-layout mirror-session-shell">
            {/* Left Column: Vertical HUD Sidebar */}
            <div className="game-hud-panel">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-cyan)' }} />
                Active Therapy
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600 }}>
                Session in progress
              </p>

              {/* SESSION TIMER CARD */}
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Session Timer</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{elapsedStr}</strong>
                    <span style={{ fontSize: '0.82rem', color: 'var(--accent-cyan)', fontWeight: 700, marginTop: '2px' }}>
                      Remaining: {remainingStr}
                    </span>
                  </div>

                  {/* Circular timer indicator */}
                  <div style={{ position: 'relative', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
                      <circle
                        cx="28"
                        cy="28"
                        r={radiusHUD}
                        fill="transparent"
                        stroke="var(--border-color)"
                        strokeWidth={strokeWidthHUD}
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r={radiusHUD}
                        fill="transparent"
                        stroke="var(--accent-cyan)"
                        strokeWidth={strokeWidthHUD}
                        strokeDasharray={circumferenceHUD}
                        strokeDashoffset={offsetHUD}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', fontSize: '0.78rem', fontWeight: '800', color: 'var(--accent-cyan)' }}>
                      {progressPercent}%
                    </div>
                  </div>
                </div>

                {/* Linear timer indicator */}
                <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                  <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: 'var(--accent-cyan)', transition: 'width 0.3s ease' }} />
                </div>
              </div>

              {/* PAIN SCALE CARD */}
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pain Scale</span>
                  <strong style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--warning)' }}>{painScore} / 10</strong>
                </div>

                {/* Slider */}
                <div className="pain-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={painScore}
                    onChange={(e) => setPainScore(Number(e.target.value))}
                    className="pain-slider"
                  />
                  <div className="pain-labels">
                    <span>No pain</span>
                    <span>Moderate</span>
                    <span>Severe</span>
                  </div>
                </div>

                {/* Circle Buttons */}
                <div className="pain-number-row">
                  {Array.from({ length: 11 }).map((_, val) => {
                    const isActive = painScore === val;
                    let btnColorStyle = {
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      border: 'none',
                      cursor: 'pointer',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-secondary)',
                      transition: 'var(--transition-smooth)'
                    };

                    if (val <= 3) {
                      btnColorStyle.background = isActive ? '#10b981' : '#e6fdf5';
                      btnColorStyle.color = isActive ? '#ffffff' : '#10b981';
                    } else if (isActive) {
                      btnColorStyle.background = 'var(--warning)';
                      btnColorStyle.color = '#ffffff';
                      btnColorStyle.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.4)';
                    }

                    return (
                      <button
                        key={val}
                        type="button"
                        style={btnColorStyle}
                        onClick={() => setPainScore(val)}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CONTROLS CARD */}
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Controls</span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setIsPaused(false)}
                    style={{
                      flex: 1,
                      borderRadius: '14px',
                      background: 'var(--accent-cyan)',
                      color: '#ffffff',
                      padding: '10px 16px',
                      fontSize: '0.9rem',
                      opacity: !isPaused ? 0.6 : 1,
                      cursor: !isPaused ? 'default' : 'pointer'
                    }}
                    disabled={!isPaused}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Start
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setIsPaused(true)}
                    style={{
                      flex: 1,
                      borderRadius: '14px',
                      background: '#fff5f5',
                      color: '#ef4444',
                      border: '1px solid #fee2e2',
                      padding: '10px 16px',
                      fontSize: '0.9rem',
                      opacity: isPaused ? 0.6 : 1,
                      cursor: isPaused ? 'default' : 'pointer'
                    }}
                    disabled={isPaused}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="4" width="16" height="16" />
                    </svg>
                    Stop
                  </button>
                </div>

                {/* Status Indicator */}
                <div className={`hud-alert-banner ${isPaused ? 'alert-warning' : 'alert-success'}`}>
                  <span className="bullet-dot" />
                  {isPaused ? 'Session paused' : 'Active tracking'}
                </div>
              </div>

              {/* Game Stats Info card */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Targets Spawned:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{targetsSpawned}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Targets Hit:</span>
                  <strong style={{ color: 'var(--accent-cyan)' }}>{targetsHit}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Range of Motion:</span>
                  <strong style={{ color: 'var(--warning)' }}>{peakROM}&deg;</strong>
                </div>
                {hoverPct > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Target Lock:</span>
                    <strong style={{ color: 'var(--success)' }}>{hoverPct}%</strong>
                  </div>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={finishSession}
                  style={{ width: '100%', padding: '10px', borderRadius: '12px', marginTop: '10px' }}
                >
                  End Session
                </button>
              </div>
            </div>

            {/* Right Column: ThreeJS Stage & Camera Video */}
            <div className="game-stage-panel">
              <video ref={videoRef} className="mirror-camera-feed" autoPlay playsInline muted
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  objectFit: 'contain', transform: 'scaleX(-1)', zIndex: 1
                }} />

              <div ref={containerRef} className="mirror-canvas-layer"
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  zIndex: 2, pointerEvents: 'none'
                }}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              </div>

              <div className="mirror-vignette" />
            </div>
          </div>
        );
      })()}

      {gameState === 'saving' && (
        <div className="glass-panel p-8" style={{ maxWidth: 580, margin: '40px auto', textAlign: 'center' }}>
          <h2>Saving session&#x2026;</h2>
        </div>
      )}

      {gameState === 'finished' && (
        <div className="glass-panel clinical-card session-summary">
          <span className="clinical-eyebrow">Practice summary</span>
          <h2 style={{ marginTop: 8 }}>Session Complete</h2>
          <p style={{ marginTop: 10, color: 'var(--text-secondary)' }}>
            {sessionSaved === false
              ? 'The session ended, but the dashboard could not save this attempt. Please check your connection and backend.'
              : 'This session has been recorded and will appear on the patient and clinician dashboards.'}
          </p>
          <div className="metric-grid" style={{ marginTop: 22, marginBottom: 0 }}>
            <div className="glass-panel metric-card" style={{ minHeight: 110 }}>
              <span>Targets Hit</span>
              <strong>{targetsHit}/{targetsSpawned}</strong>
            </div>
            <div className="glass-panel metric-card" style={{ minHeight: 110 }}>
              <span>Accuracy</span>
              <strong>{accuracy}%</strong>
            </div>
            <div className="glass-panel metric-card" style={{ minHeight: 110 }}>
              <span>Peak ROM</span>
              <strong>{peakROM}&deg;</strong>
            </div>
          </div>
          <div className="session-actions">
            <button className="btn btn-secondary" onClick={() => onNavigate('dashboard')}>
              Go to Dashboard
            </button>
            <button className="btn btn-primary"
              onClick={() => {
                setGameState('ready');
                setSecondsLeft(configRef.current.prescribedDuration || 120);
                setAmputationSide(profile?.amputationSide || null);
                setSessionSaved(null);
              }}>
              <PlayIcon className="w-5 h-5" /> Practice Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
