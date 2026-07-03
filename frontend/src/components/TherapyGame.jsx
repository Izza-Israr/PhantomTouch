import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useMirrorEngine } from '../hooks/useMirrorEngine';
import { PlayIcon } from './Icons';

// ─── Audio ───────────────────────────────────────────────────────────────────
function playSuccessChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx  = new Ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'triangle';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.18);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.start(t); osc.stop(t + 0.3);
  } catch (_) {}
}

// ─── Level metadata ───────────────────────────────────────────────────────────
// xOffset range (world units) and reference joint index for game logic.
// Lower amputations have smaller reach so targets spawn closer.
// Reference joint = the highest real joint at the stump boundary,
// used to anchor the phantom target relative to the real arm target.
const LEVEL_META = {
  TRANSHUMERAL:          { label: 'Transhumeral (Above Elbow)', xMin: 1.2, xMax: 3.2, refJoint: 21 },
  TRANSRADIAL:           { label: 'Transradial (Below Elbow)',  xMin: 0.8, xMax: 2.5, refJoint: 22 },
  WRIST_DISARTICULATION: { label: 'Wrist Disarticulation',      xMin: 0.5, xMax: 1.8, refJoint: 23 },
  FINGERS_ONLY:          { label: 'Fingers Only',               xMin: 0.3, xMax: 1.2, refJoint: 23 },
};
const LEVEL_KEYS = Object.keys(LEVEL_META);

// ─── Three.js helpers ─────────────────────────────────────────────────────────
function makeTargetMesh(scene) {
  const geo  = new THREE.IcosahedronGeometry(0.4, 1);
  const mat  = new THREE.MeshPhongMaterial({
    color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.4,
    wireframe: true, transparent: true, opacity: 0.8,
  });
  const mesh  = new THREE.Mesh(geo, mat);
  const light = new THREE.PointLight(0x00f5ff, 1.8, 6);
  scene.add(mesh); scene.add(light);
  return { mesh, light };
}

function makeDebugPointer(scene) {
  const geo  = new THREE.SphereGeometry(0.12, 16, 16);
  const mat  = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999;
  scene.add(mesh);
  return mesh;
}

function spawnTargetPair(targetA, targetB, configRef) {
  const side  = configRef.current.amputationSide  || 'LEFT';
  const level = configRef.current.amputationLevel || 'TRANSHUMERAL';
  const meta  = LEVEL_META[level] || LEVEL_META.TRANSHUMERAL;

  const xPhantom = side === 'LEFT' ? -1 : 1;
  const xReal    = -xPhantom;
  const xOffset  = meta.xMin + Math.random() * (meta.xMax - meta.xMin);
  const y        = -1.0 + Math.random() * 2.0;

  targetA.mesh.position.set(xReal    * xOffset, y, 0);
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
      color:             i % 2 === 0 ? 0x00f5ff : tone,
      emissive:          i % 2 === 0 ? 0x00f5ff : tone,
      emissiveIntensity: 0.9,
      transparent: true, opacity: 1,
    });
    const p   = new THREE.Mesh(geo, mat);
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

// ─── Component ────────────────────────────────────────────────────────────────
export const TherapyGame = ({ user, profile, onNavigate }) => {
  const [gameState,      setGameState]      = useState('ready');
  const [secondsLeft,    setSecondsLeft]    = useState(120);
  const [targetsHit,     setTargetsHit]     = useState(0);
  const [targetsSpawned, setTargetsSpawned] = useState(0);
  const [peakROM,        setPeakROM]        = useState(0);
  const [accuracy,       setAccuracy]       = useState(0);
  const [hoverPct,       setHoverPct]       = useState(0);

  // Setup wizard steps: null = not chosen yet
  const [amputationSide,  setAmputationSide]  = useState(profile?.amputationSide  || null);
  const [amputationLevel, setAmputationLevel] = useState(profile?.amputationLevel || null);

  // Step: 'side' | 'level' | 'confirm'
  const setupStep = !amputationSide ? 'side' : !amputationLevel ? 'level' : 'confirm';

  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const videoRef     = useRef(null);

  const statsRef = useRef({
    hits: 0, spawned: 0, startTime: null, endTime: null,
    peakROM: 0, telemetry: [], startPos: null,
  });

  const configRef = useRef({
    amputationSide:           profile?.amputationSide      || 'LEFT',
    amputationLevel:          profile?.amputationLevel     || 'TRANSHUMERAL',
    meshScaleMultiplier:      profile?.meshScaleMultiplier || 1.0,
    skinToneSliderHex:        profile?.skinToneSliderHex   || '#aa3bff',
    prescribedDuration:       120,
    targetSpawnRadius:        2.0,
    requiredHoverDwellTimeMs: 800,
    hoverAccumMs:             0,
  });

  const targetPairRef   = useRef(null);
  const debugPointerRef = useRef(null);
  const particlesRef    = useRef([]);
  const gameStateRef    = useRef('ready');
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ── Setup wizard handlers ─────────────────────────────────────────────────
  const selectSide = useCallback((side) => {
    if (side !== null) configRef.current.amputationSide = side;
    setAmputationSide(side);
  }, []);

  const selectLevel = useCallback((lvl) => {
    if (lvl !== null) configRef.current.amputationLevel = lvl;
    setAmputationLevel(lvl);
  }, []);

  const resetSetup = useCallback(() => {
    setAmputationSide(profile?.amputationSide  || null);
    setAmputationLevel(profile?.amputationLevel || null);
  }, [profile]);

  // ── Landmarks relay (stable ref to avoid hook re-init) ────────────────────
  const landmarksHandlerRef = useRef(null);
  const stableRelay = useCallback((data) => {
    landmarksHandlerRef.current?.(data);
  }, []);

  const {
    sceneRef, initThreeJS, startRenderLoop, stopRenderLoop, initMediaPipe, destroy,
  } = useMirrorEngine({ configRef, onLandmarksUpdate: stableRelay });

  // ── Landmark handler (game logic) ─────────────────────────────────────────
  const handleLandmarks = useCallback((real, phantom) => {
    if (!targetPairRef.current || gameStateRef.current !== 'running' || !real || !phantom) return;
    const { a: targetA, b: targetB } = targetPairRef.current;
    if (!targetA || !targetB) return;

    const level = configRef.current.amputationLevel || 'TRANSHUMERAL';
    const meta  = LEVEL_META[level] || LEVEL_META.TRANSHUMERAL;

    // Real-side pinch (healthy hand)
    const indexTip = real[8];
    const thumbTip = real[4];
    if (!indexTip || !thumbTip) return;

    const pinchX = (indexTip.x + thumbTip.x) / 2;
    const pinchY = (indexTip.y + thumbTip.y) / 2;

    // Distance to real target (check against fixed spawn position)
    const basePosA = targetA.userData?.originalPosition || targetA.mesh.position;
    const distA    = Math.hypot(pinchX - basePosA.x, pinchY - basePosA.y);

    // Anchor phantom target relative to the correct reference joint for this level.
    // TRANSHUMERAL → shoulder (21), TRANSRADIAL → elbow (22), others → wrist (23)
    const refJoint = meta.refJoint;
    const realRef  = real[refJoint];
    const phanRef  = phantom[refJoint];

    if (realRef && phanRef && targetB.userData?.originalPosition && targetA.userData?.originalPosition) {
      const dx = targetA.userData.originalPosition.x - realRef.x;
      const dy = targetA.userData.originalPosition.y - realRef.y;
      targetB.mesh.position.x = phanRef.x - dx;
      targetB.mesh.position.y = phanRef.y + dy;
      targetB.light.position.copy(targetB.mesh.position);
    }

    // Phantom pinch (for future bilateral support or visual feedback)
    const phanIndex = phantom[8];
    const phanThumb = phantom[4];
    if (phanIndex && phanThumb && debugPointerRef.current) {
      debugPointerRef.current.position.set(pinchX, pinchY, 0.05);
    }

    // Hover / dwell on real target
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

    // ROM tracking (healthy wrist)
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
  }, [sceneRef]);

  const onLandmarksUpdate = useCallback((data) => {
    if (!data) return;
    const { real, phantom } = data;
    if (real && phantom) handleLandmarks(real, phantom);
  }, [handleLandmarks]);

  useEffect(() => { landmarksHandlerRef.current = onLandmarksUpdate; });

  // ── Render loop frame ──────────────────────────────────────────────────────
  const onFrame = useCallback((dt) => {
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
        p.mesh.geometry.dispose(); p.mesh.material.dispose();
        particlesRef.current.splice(i, 1);
      }
    }
  }, [sceneRef]);

  // ── Session control ────────────────────────────────────────────────────────
  const finishSession = useCallback(async () => {
    setGameState('saving');
    stopRenderLoop(); destroy();
    setAccuracy(
      statsRef.current.spawned > 0
        ? Math.round((statsRef.current.hits / statsRef.current.spawned) * 100)
        : 0,
    );
    setGameState('finished');
  }, [destroy, stopRenderLoop]);

  const startSession = useCallback(() => {
    statsRef.current = {
      hits: 0, spawned: 1, startTime: Date.now(), endTime: null,
      peakROM: 0, telemetry: [], startPos: null,
    };
    configRef.current.hoverAccumMs = 0;
    setTargetsHit(0); setTargetsSpawned(1);
    setSecondsLeft(configRef.current.prescribedDuration || 120);
    setHoverPct(0);
    setGameState('running');
  }, []);

  useEffect(() => {
    if (gameState !== 'running') return;
    const scene = initThreeJS(canvasRef.current, containerRef.current);
    const tA = makeTargetMesh(scene);
    const tB = makeTargetMesh(scene);
    spawnTargetPair(tA, tB, configRef);
    targetPairRef.current   = { a: tA, b: tB };
    debugPointerRef.current = makeDebugPointer(scene);
    particlesRef.current    = [];
    startRenderLoop(onFrame);
    initMediaPipe(videoRef.current);
    return () => {
      stopRenderLoop(); destroy();
      targetPairRef.current = null; debugPointerRef.current = null;
    };
  }, [gameState, initThreeJS, startRenderLoop, onFrame, initMediaPipe, destroy, stopRenderLoop]);

  useEffect(() => {
    if (gameState !== 'running') return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(id); finishSession(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gameState, finishSession]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  // ── Shared card style ──────────────────────────────────────────────────────
  const cardStyle = { maxWidth: 560, margin: '60px auto', textAlign: 'center' };
  const subtitleStyle = { marginTop: 10, opacity: 0.75, fontSize: '0.95rem' };
  const btnRowStyle   = { display: 'flex', gap: 16, justifyContent: 'center', marginTop: 28 };

  return (
    <div
      className={'animate-fade-in ' + (gameState === 'running' ? 'mirror-session-shell' : '')}
      style={{ width: '100%', height: '100%' }}
    >

      {/* ── SETUP WIZARD ─────────────────────────────────────────────────── */}
      {gameState === 'ready' && (
        <>
          {/* Step 1 — pick amputated side */}
          {setupStep === 'side' && (
            <div className="glass-panel p-8" style={cardStyle}>
              <h2>Which side is amputated?</h2>
              <p style={subtitleStyle}>
                Your healthy hand is mirrored to create the phantom on the amputated side.
              </p>
              <div style={btnRowStyle}>
                {[['LEFT', '✋ Left'], ['RIGHT', 'Right ✋']].map(([val, label]) => (
                  <button
                    key={val}
                    className="btn btn-primary"
                    style={{ minWidth: 130, fontSize: '1.1rem', padding: '14px 28px' }}
                    onClick={() => selectSide(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — pick amputation level */}
          {setupStep === 'level' && (
            <div className="glass-panel p-8" style={{ ...cardStyle, maxWidth: 600 }}>
              <h2>What is the amputation level?</h2>
              <p style={subtitleStyle}>
                This controls how much of the phantom arm is rendered.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
                {LEVEL_KEYS.map((key) => (
                  <button
                    key={key}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '14px 20px', fontSize: '1rem', textAlign: 'left' }}
                    onClick={() => selectLevel(key)}
                  >
                    <span style={{ fontWeight: 700 }}>{LEVEL_META[key].label}</span>
                    <span style={{ marginLeft: 10, opacity: 0.65, fontSize: '0.85rem' }}>
                      {key === 'TRANSHUMERAL'          && '— shoulder, elbow, wrist & hand phantom'}
                      {key === 'TRANSRADIAL'           && '— elbow stump: forearm, wrist & hand phantom'}
                      {key === 'WRIST_DISARTICULATION' && '— wrist stump: hand phantom only'}
                      {key === 'FINGERS_ONLY'          && '— wrist intact: finger phantom only'}
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ ...btnRowStyle, marginTop: 20 }}>
                <button className="btn btn-secondary" style={{ padding: '10px 22px' }}
                  onClick={() => selectSide(null)}>
                  ← Change Side
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — confirm & start */}
          {setupStep === 'confirm' && (
            <div className="glass-panel p-8" style={cardStyle}>
              <h2>Ready to Start</h2>

              {/* Summary badges */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
                <span style={badgeStyle('#1a1a3e')}>
                  Side: <strong>{amputationSide}</strong>
                </span>
                <span style={badgeStyle('#1a1a3e')}>
                  Level: <strong>{LEVEL_META[amputationLevel]?.label}</strong>
                </span>
              </div>

              <p style={{ marginTop: 16, opacity: 0.8 }}>
                Show your{' '}
                <strong>{amputationSide === 'LEFT' ? 'right' : 'left'}</strong> hand
                to the camera — the phantom will appear on your{' '}
                <strong>{amputationSide.toLowerCase()}</strong> side.
              </p>

              {/* Level-specific hint */}
              <p style={{ marginTop: 8, opacity: 0.6, fontSize: '0.875rem' }}>
                {amputationLevel === 'TRANSHUMERAL' &&
                  'Full phantom arm (shoulder → elbow → wrist → fingers) will be rendered.'}
                {amputationLevel === 'TRANSRADIAL' &&
                  'Phantom shows from your elbow stump down — forearm, wrist and fingers.'}
                {amputationLevel === 'WRIST_DISARTICULATION' &&
                  'Phantom shows hand only, anchored to your wrist stump.'}
                {amputationLevel === 'FINGERS_ONLY' &&
                  'Only phantom fingers are rendered, anchored to your real wrist.'}
              </p>

              <div style={btnRowStyle}>
                <button className="btn btn-secondary" style={{ padding: '10px 22px' }}
                  onClick={() => selectLevel(null)}>
                  ← Change Level
                </button>
                <button className="btn btn-primary" style={{ padding: '12px 28px' }}
                  onClick={startSession}>
                  <PlayIcon className="w-5 h-5" /> Start Practice
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── RUNNING SESSION ──────────────────────────────────────────────────── */}
      {gameState === 'running' && (
        <div className="mirror-session-stage" style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          overflow: 'hidden', backgroundColor: '#000', zIndex: 99,
        }}>
          <video ref={videoRef} className="mirror-camera-feed" autoPlay playsInline muted
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              objectFit: 'contain', transform: 'scaleX(-1)', zIndex: 1,
            }} />

          <div ref={containerRef} className="mirror-canvas-layer"
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              zIndex: 2, pointerEvents: 'none',
            }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>

          {/* HUD */}
          <div className="mirror-hud mirror-hud-top" style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3,
            display: 'flex', alignItems: 'center', padding: '20px 30px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
          }}>
            <div style={{ color: '#fff', marginRight: 30, fontSize: '1.4rem', fontFamily: 'monospace' }}>
              <strong>{mm}:{ss}</strong>
            </div>
            <div style={{ color: '#00FFCC', fontSize: '1.4rem', fontFamily: 'monospace' }}>
              <strong>Hits: {targetsHit}/{targetsSpawned}</strong>
            </div>
            {hoverPct > 0 && (
              <div className="font-bold animate-pulse"
                style={{ color: '#ffb703', marginLeft: 25, fontSize: '1.2rem' }}>
                Target Lock {hoverPct}%
              </div>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* Level badge in HUD */}
              <span style={badgeStyle('rgba(255,255,255,0.1)')}>
                {LEVEL_META[configRef.current.amputationLevel]?.label}
              </span>
              {peakROM > 0 && (
                <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                  ROM {peakROM}&#xb0;
                </span>
              )}
              <button className="btn btn-secondary" onClick={finishSession}
                style={{ padding: '10px 24px', fontSize: '1rem', cursor: 'pointer' }}>
                End
              </button>
            </div>
          </div>

          {/* Camera debug */}
          <div style={{
            position: 'absolute', right: 18, bottom: 18, zIndex: 4,
            background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '8px 12px',
            borderRadius: 8, fontSize: 12, fontFamily: 'monospace', textAlign: 'left',
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Camera Status</div>
            <div>Stream: {videoRef.current?.srcObject ? 'connected' : 'none'}</div>
            <div>ReadyState: {videoRef.current?.readyState ?? 'n/a'}</div>
            <div>Paused: {videoRef.current ? String(videoRef.current.paused) : 'n/a'}</div>
            <div style={{ marginTop: 6, opacity: 0.9 }}>Check browser permissions if no stream.</div>
          </div>
        </div>
      )}

      {/* ── SAVING ───────────────────────────────────────────────────────────── */}
      {gameState === 'saving' && (
        <div className="glass-panel p-8" style={{ ...cardStyle, marginTop: 40 }}>
          <h2>Saving session&#x2026;</h2>
        </div>
      )}

      {/* ── FINISHED ─────────────────────────────────────────────────────────── */}
      {gameState === 'finished' && (
        <div className="glass-panel p-8" style={{ ...cardStyle, marginTop: 40 }}>
          <h2 className="text-green-400">Session Complete</h2>
          <p style={{ marginTop: 12 }}>Targets Hit: <strong>{targetsHit}</strong></p>
          <p>Accuracy: <strong>{accuracy}%</strong></p>
          {peakROM > 0 && <p>Peak ROM: <strong>{peakROM}&#xb0;</strong></p>}
          <button
            className="btn btn-primary mt-4"
            onClick={() => {
              setGameState('ready');
              setSecondsLeft(configRef.current.prescribedDuration || 120);
              resetSetup(); // go back to the wizard
            }}
          >
            Restart Session
          </button>
        </div>
      )}
    </div>
  );
};

// Small inline badge helper (not a component so no hooks rule applies)
function badgeStyle(bg) {
  return {
    background: bg,
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: '0.85rem',
    color: '#fff',
    whiteSpace: 'nowrap',
  };
}