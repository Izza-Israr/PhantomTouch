import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import axios from 'axios';
import { useMirrorEngine } from '../hooks/useMirrorEngine';
import { AwardIcon, ClockIcon, ActivityIcon, PlayIcon } from './Icons';

// ─── WEB AUDIO CHIME ────────────────────────────────────────────────────────
function playSuccessChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx  = new Ctx();
    const osc  = ctx.createOscillator();
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
  } catch (_) {}
}

// ─── TARGET MESH FACTORY ─────────────────────────────────────────────────────
function makeTargetMesh(scene) {
  const geo  = new THREE.IcosahedronGeometry(0.5, 1);
  const mat  = new THREE.MeshPhongMaterial({
    color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.35,
    wireframe: true, transparent: true, opacity: 0.75,
  });
  const mesh  = new THREE.Mesh(geo, mat);
  const light = new THREE.PointLight(0x00f5ff, 1.6, 5);
  scene.add(mesh);
  scene.add(light);
  return { mesh, light };
}

/**
 * Spawn BOTH target balls at the same Y, separated symmetrically on X.
 *
 * Ball A  — sits on the REAL hand's side (same side as the healthy arm).
 * Ball B  — sits on the PHANTOM arm's side (opposite / amputated side).
 *
 * The patient moves their real hand toward Ball A; the 3-D phantom arm
 * (mirrored contralaterally) moves toward Ball B simultaneously.
 */
function spawnTargetPair(targetA, targetB, configRef) {
  const r        = configRef.current.targetSpawnRadius || 2.0;
  const side     = configRef.current.amputationSide    || 'LEFT';
  // xPhantom: the side where the phantom arm lives
  const xPhantom = side === 'LEFT' ? -1 : 1;
  const xReal    = -xPhantom;                        // real hand is on the opposite side

  const xOffset = 0.7 + Math.random() * (r * 0.8);  // lateral offset from centre
  const y       = -0.5 + Math.random() * (r * 0.9); // shared Y for both balls
  const z       = -1.7;

  // Real-hand ball
  targetA.mesh.position.set(xReal    * xOffset, y, z);
  targetA.light.position.set(xReal   * xOffset, y, z);
  targetA.mesh.scale.set(0.05, 0.05, 0.05);

  // Phantom-arm ball
  targetB.mesh.position.set(xPhantom * xOffset, y, z);
  targetB.light.position.set(xPhantom * xOffset, y, z);
  targetB.mesh.scale.set(0.05, 0.05, 0.05);
}

// ─── PARTICLES ───────────────────────────────────────────────────────────────
function burstParticles(scene, pos, toneHex, particlesRef) {
  const tone = new THREE.Color(toneHex);
  for (let i = 0; i < 28; i++) {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const mat = new THREE.MeshPhongMaterial({
      color:            i % 2 === 0 ? 0x00f5ff : tone,
      emissive:         i % 2 === 0 ? 0x00f5ff : tone,
      emissiveIntensity: 0.9,
      transparent: true, opacity: 1,
    });
    const p   = new THREE.Mesh(geo, mat);
    p.position.copy(pos);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.18,
      (Math.random() - 0.5) * 0.18 + 0.06,
      (Math.random() - 0.5) * 0.18,
    );
    scene.add(p);
    particlesRef.current.push({ mesh: p, vel, life: 1.0 });
  }
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export const TherapyGame = ({ user, profile, onNavigate }) => {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [gameState,       setGameState]       = useState('ready');
  const [secondsLeft,     setSecondsLeft]     = useState(120);
  const [targetsHit,      setTargetsHit]      = useState(0);
  const [targetsSpawned,  setTargetsSpawned]  = useState(0);
  const [peakROM,         setPeakROM]         = useState(0);
  const [accuracy,        setAccuracy]        = useState(0);
  const [hoverPct,        setHoverPct]        = useState(0);
  const [mpReady,         setMpReady]         = useState(false);
  const [mpError,         setMpError]         = useState('');

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const videoRef     = useRef(null);

  // ── Live game stats ────────────────────────────────────────────────────────
  const statsRef = useRef({
    hits: 0, spawned: 0, startTime: null, endTime: null,
    peakROM: 0, telemetry: [], startPos: null,
  });

  // ── Config ─────────────────────────────────────────────────────────────────
  const configRef = useRef({
    amputationSide:           profile?.amputationSide           || 'LEFT',
    amputationLevel:          profile?.amputationLevel          || 'FULL',
    meshScaleMultiplier:      profile?.meshScaleMultiplier      || 1.0,
    skinToneSliderHex:        profile?.skinToneSliderHex        || '#aa3bff',
    prescribedDuration:       120,
    targetSpawnRadius:        2.0,
    requiredHoverDwellTimeMs: 1000,
    hoverAccumMs:             0,
  });

  // ── Target pair refs  ──────────────────────────────────────────────────────
  // targetPairRef.current = { a: {mesh,light}, b: {mesh,light} }
  // "a" is the real-hand target, "b" is the phantom-arm target.
  // Collision is checked on "a" (real index finger tip) and "b" (phantom tip).
  const targetPairRef = useRef(null);
  const particlesRef  = useRef([]);

  // ── Mirror engine hook ─────────────────────────────────────────────────────
  const onLandmarksUpdate = useCallback((smoothed) => {
    handleLandmarks(smoothed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    sceneRef,
    initThreeJS,
    startRenderLoop,
    stopRenderLoop,
    initMediaPipe,
    destroy,
  } = useMirrorEngine({ configRef, onLandmarksUpdate });

  // ─── Load prescription ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!profile?._id) return;
      try {
        const token = localStorage.getItem('token');
        const res   = await axios.get(
          `http://localhost:5000/api/prescriptions/patient/${profile._id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const rx = res.data;
        configRef.current.prescribedDuration       = rx.prescribedSessionDurationSeconds || 120;
        configRef.current.targetSpawnRadius        = rx.targetSpawnRadius                || 2.0;
        configRef.current.requiredHoverDwellTimeMs = rx.requiredHoverDwellTimeMs         || 1000;
        setSecondsLeft(configRef.current.prescribedDuration);
      } catch (e) {
        console.warn('No active prescription found, using defaults.', e);
      }
    };
    load();
  }, [profile]);

  // ─── Check MediaPipe globals ─────────────────────────────────────────────
  useEffect(() => {
    if (window.Hands && window.Camera) {
      setMpReady(true);
    } else {
      setMpError(
        'MediaPipe scripts did not load. ' +
        'Check that /mediapipe/hands/hands.js and ' +
        '/mediapipe/camera_utils/camera_utils.js are present in /public.'
      );
    }
  }, []);

  // ─── Landmark → game logic ────────────────────────────────────────────────
  const handleLandmarks = (smoothed) => {
    if (!targetPairRef.current || gameStateRef.current !== 'running') return;

    const { a: targetA, b: targetB } = targetPairRef.current;
    const fingerTip  = smoothed[8];  // index finger tip — follows real hand
    if (!fingerTip) return;

    const dwellMs = configRef.current.requiredHoverDwellTimeMs;

    /**
     * Collision check:
     *  - The real hand (fingerTip) hits targetA (real-hand ball).
     *  - The phantom arm copies the motion so targetB is hit simultaneously,
     *    but we drive the game purely from the real hand's position to keep
     *    physics deterministic.
     */
    const distA = Math.hypot(
      fingerTip.x - targetA.mesh.position.x,
      fingerTip.y - targetA.mesh.position.y
    );

    if (distA < 1.05) {
      configRef.current.hoverAccumMs += 16;
      const pct = Math.min(100, (configRef.current.hoverAccumMs / dwellMs) * 100);
      setHoverPct(Math.round(pct));

      if (configRef.current.hoverAccumMs >= dwellMs) {
        // ── HIT ────────────────────────────────────────────────────────────
        playSuccessChime();
        // Burst particles on BOTH balls for visual reinforcement
        burstParticles(sceneRef.current, targetA.mesh.position.clone(),
          configRef.current.skinToneSliderHex, particlesRef);
        burstParticles(sceneRef.current, targetB.mesh.position.clone(),
          configRef.current.skinToneSliderHex, particlesRef);

        statsRef.current.hits++;
        setTargetsHit(statsRef.current.hits);

        configRef.current.hoverAccumMs = 0;
        setHoverPct(0);

        // Respawn both balls
        spawnTargetPair(targetA, targetB, configRef);
        statsRef.current.spawned++;
        setTargetsSpawned(statsRef.current.spawned);
      }
    } else {
      configRef.current.hoverAccumMs = Math.max(
        0, configRef.current.hoverAccumMs - 32
      );
      setHoverPct(Math.round(
        (configRef.current.hoverAccumMs / dwellMs) * 100
      ));
    }

    // ── Range of Motion ──────────────────────────────────────────────────────
    const wrist = smoothed[0];
    if (!statsRef.current.startPos) {
      statsRef.current.startPos = wrist.clone();
    } else {
      const deg = Math.min(120, Math.round(wrist.distanceTo(statsRef.current.startPos) * 35));
      if (deg > statsRef.current.peakROM) {
        statsRef.current.peakROM = deg;
        setPeakROM(deg);
      }
    }

    // ── Telemetry snapshot every ~200 ms ─────────────────────────────────────
    const elapsed = Date.now() - statsRef.current.startTime;
    const last    = statsRef.current.telemetry[statsRef.current.telemetry.length - 1];
    if (!last || elapsed - last.timestamp > 200) {
      statsRef.current.telemetry.push({
        timestamp: elapsed,
        joints: smoothed.map((v, i) => ({ name: `j${i}`, x: v.x, y: v.y, z: v.z })),
      });
    }
  };

  const gameStateRef = useRef('ready');
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ─── Per-frame render callback ─────────────────────────────────────────────
  const onFrame = useCallback((dt) => {
    const pair  = targetPairRef.current;
    const scene = sceneRef.current;
    if (!pair || !scene) return;

    // Animate each ball
    for (const target of [pair.a, pair.b]) {
      target.mesh.rotation.y += 1.1  * dt;
      target.mesh.rotation.x += 0.45 * dt;
      if (target.mesh.scale.x < 1) {
        const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.07;
        target.mesh.scale.lerp(new THREE.Vector3(pulse, pulse, pulse), 0.12);
      } else {
        const p = 1 + Math.sin(Date.now() * 0.005) * 0.07;
        target.mesh.scale.set(p, p, p);
      }
    }

    // Particle decay
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.mesh.position.add(p.vel);
      p.vel.y -= 0.003;
      p.life  -= 1.8 * dt;
      p.mesh.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        particlesRef.current.splice(i, 1);
      }
    }
  }, [sceneRef]);

  // ─── Start session ─────────────────────────────────────────────────────────
  const startSession = useCallback(() => {
    const dur = configRef.current.prescribedDuration;
    statsRef.current = {
      hits: 0, spawned: 1,
      startTime: Date.now(), endTime: null,
      peakROM: 0, telemetry: [], startPos: null,
    };
    configRef.current.hoverAccumMs = 0;
    setTargetsHit(0);
    setTargetsSpawned(1);
    setPeakROM(0);
    setAccuracy(0);
    setHoverPct(0);
    setSecondsLeft(dur);
    setGameState('running');
  }, []);

  // ─── Engine init (fires when running state mounts) ─────────────────────────
  useEffect(() => {
    if (gameState !== 'running') return;
    if (!canvasRef.current || !videoRef.current || !containerRef.current) return;

    const scene = initThreeJS(canvasRef.current, containerRef.current);

    // Create BOTH target balls
    const tA = makeTargetMesh(scene);
    const tB = makeTargetMesh(scene);
    spawnTargetPair(tA, tB, configRef);
    targetPairRef.current = { a: tA, b: tB };
    particlesRef.current  = [];

    startRenderLoop(onFrame);

    const ok = initMediaPipe(videoRef.current);
    if (!ok) setMpError('MediaPipe tracking hardware initialization failed.');

    return () => {
      stopRenderLoop();
      destroy();
      targetPairRef.current = null;
      particlesRef.current  = [];
    };
  }, [destroy, gameState, initMediaPipe, initThreeJS, onFrame, startRenderLoop, stopRenderLoop]);

  // ─── Countdown timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (gameState !== 'running') return;
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(id); finishSession(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // ─── Finish session ───────────────────────────────────────────────────────
  const finishSession = useCallback(async () => {
    setGameState('saving');
    statsRef.current.endTime = Date.now();
    stopRenderLoop();
    destroy();

    const { hits, spawned, startTime, endTime, peakROM: rom, telemetry } = statsRef.current;
    const dur = Math.round((endTime - startTime) / 1000);
    const acc = spawned > 0 ? Math.round((hits / spawned) * 100) : 0;
    setAccuracy(acc);

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        'http://localhost:5000/api/sessions',
        {
          patientId:                 profile._id,
          startTime:                 new Date(startTime),
          endTime:                   new Date(endTime),
          targetsSpawned:            spawned,
          targetsHit:                hits,
          peakRangeOfMotionDegrees:  rom,
          telemetryStream:           telemetry,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      console.error('Session save failed:', e);
    }

    setGameState('finished');
  }, [destroy, profile, stopRenderLoop]);

  const exitToBoard = () => { destroy(); onNavigate('dashboard'); };

  // ─── Render ───────────────────────────────────────────────────────────────
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div
      className={`animate-fade-in ${gameState === 'running' ? 'mirror-session-shell' : ''}`}
      style={gameState === 'running' ? undefined : { padding: '20px', maxWidth: '1200px', margin: '0 auto' }}
    >

      {/* ── READY STATE ───────────────────────────────────────────────────── */}
      {gameState === 'ready' && (
        <div className="glass-panel p-8 animate-fade-in"
          style={{ maxWidth: 580, margin: '60px auto', textAlign: 'center' }}>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', marginBottom: 12 }}>
            Mirror Session
          </h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
            Position yourself in a well-lit space and hold your healthy hand in front of the camera.
            The engine will mirror it and project a 3D ghost arm in real time.
          </p>

          {/* Prescription summary */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 12, padding: 16, textAlign: 'left', marginBottom: 28, fontSize: '0.9rem'
          }}>
            <strong style={{ color: 'var(--accent-purple)', display: 'block', marginBottom: 8 }}>
              Active Prescription
            </strong>
            <ul style={{ listStyle: 'disc', paddingLeft: 20, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <li>Duration: {Math.round(configRef.current.prescribedDuration / 60)} min
                ({configRef.current.prescribedDuration}s)</li>
              <li>Hover dwell: {(configRef.current.requiredHoverDwellTimeMs / 1000).toFixed(1)}s per target</li>
              <li>Amputated side: <strong>{configRef.current.amputationSide}</strong></li>
              <li>Amputation level: <strong>{configRef.current.amputationLevel}</strong></li>
            </ul>
          </div>

          {mpError ? (
            <div style={{
              color: 'var(--error)', marginBottom: 20, fontSize: '0.9rem',
              border: '1px solid var(--error)', padding: 12, borderRadius: 8
            }}>
              ⚠ {mpError}
            </div>
          ) : !mpReady ? (
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
              Verifying MediaPipe availability…
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={startSession} disabled={!mpReady || !!mpError}>
              <PlayIcon className="w-5 h-5" /> Start Practice
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('dashboard')}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── RUNNING STATE ─────────────────────────────────────────────────── */}
      {gameState === 'running' && (
        <div className="mirror-session-stage">
          <video ref={videoRef} className="mirror-camera-feed" autoPlay playsInline muted />

          <div ref={containerRef} className="mirror-canvas-layer">
            <canvas ref={canvasRef} />
          </div>

          <div className="mirror-vignette" aria-hidden="true" />

          <div className="mirror-hud mirror-hud-top">
            <div className="mirror-session-title">
              <span>Mirror Session</span>
              <strong>{configRef.current.amputationSide} side projection</strong>
            </div>

            <div className="mirror-stat-strip" aria-label="Live session metrics">
              <div className="mirror-stat">
                <ClockIcon className="w-5 h-5" />
                <strong>{mm}:{ss}</strong>
                <span>time</span>
              </div>
              <div className="mirror-stat">
                <AwardIcon className="w-5 h-5" />
                <strong>{targetsHit}/{targetsSpawned}</strong>
                <span>targets</span>
              </div>
              <div className="mirror-stat">
                <ActivityIcon className="w-5 h-5" />
                <strong>{peakROM} deg</strong>
                <span>peak ROM</span>
              </div>
            </div>

            <button className="btn btn-secondary mirror-end-button" onClick={finishSession}>
              End
            </button>
          </div>

          <div className="mirror-guidance">
            <strong>Keep your healthy hand in frame</strong>
            <span>Move toward your ball — the phantom arm mirrors toward its ball simultaneously.</span>
          </div>

          {hoverPct > 0 && (
            <div className="mirror-lock-indicator">
              <span className="mirror-lock-spinner" />
              <strong>Target lock {hoverPct}%</strong>
            </div>
          )}
        </div>
      )}

      {/* ── SAVING STATE ──────────────────────────────────────────────────── */}
      {gameState === 'saving' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 400, color: 'var(--text-secondary)'
        }}>
          Uploading session telemetry to MongoDB Atlas…
        </div>
      )}

      {/* ── FINISHED STATE ────────────────────────────────────────────────── */}
      {gameState === 'finished' && (
        <div className="glass-panel p-8 animate-fade-in"
          style={{ maxWidth: 580, margin: '40px auto', textAlign: 'center' }}>

          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: '2rem',
            color: 'var(--success)', marginBottom: 8
          }}>
            Session Complete!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            Great work. Your telemetry has been saved. Here is your session summary:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 40 }}>
            <div className="glass-panel p-5"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <AwardIcon style={{ color: 'var(--accent-cyan)', width: 36, height: 36 }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Accuracy</span>
              <strong style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{accuracy}%</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {targetsHit} / {targetsSpawned} targets
              </span>
            </div>
            <div className="glass-panel p-5"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ActivityIcon style={{ color: 'var(--accent-purple)', width: 36, height: 36 }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Peak ROM</span>
              <strong style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{peakROM}°</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Range of motion</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={startSession}>
              Practice Again
            </button>
            <button className="btn btn-secondary" onClick={exitToBoard}>
              Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </div>
  );
};
