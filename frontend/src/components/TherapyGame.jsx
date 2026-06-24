import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useMirrorEngine } from '../hooks/useMirrorEngine';
import { PlayIcon } from './Icons';

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
  const geo  = new THREE.IcosahedronGeometry(0.4, 1);
  const mat  = new THREE.MeshPhongMaterial({
    color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.4,
    wireframe: true, transparent: true, opacity: 0.8,
  });
  const mesh  = new THREE.Mesh(geo, mat);
  const light = new THREE.PointLight(0x00f5ff, 1.8, 6);
  scene.add(mesh);
  scene.add(light);
  return { mesh, light };
}

// ─── VISUAL DEBUG POINTER FACTORY ───────────────────────────────────────────
function makeDebugPointer(scene) {
  const geo = new THREE.SphereGeometry(0.12, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999; 
  scene.add(mesh);
  return mesh;
}

function spawnTargetPair(targetA, targetB, configRef) {
  const side      = configRef.current.amputationSide    || 'LEFT';
  const xPhantom = side === 'LEFT' ? -1 : 1;
  const xReal    = -xPhantom;                        

  const xOffset = 0.7 + Math.random() * 0.9;  
  const y       = -0.3 + Math.random() * 0.6; 
  const z       = 0.0; 

  targetA.mesh.position.set(xReal * xOffset, y, z);
  targetA.light.position.set(xReal * xOffset, y, z);
  targetA.mesh.scale.set(1, 1, 1);

  targetB.mesh.position.set(xPhantom * xOffset, y, z);
  targetB.light.position.set(xPhantom * xOffset, y, z);
  targetB.mesh.scale.set(1, 1, 1);
}

function burstParticles(scene, pos, toneHex, particlesRef) {
  const tone = new THREE.Color(toneHex);
  for (let i = 0; i < 20; i++) {
    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const mat = new THREE.MeshPhongMaterial({
      color:            i % 2 === 0 ? 0x00f5ff : tone,
      emissive:         i % 2 === 0 ? 0x00f5ff : tone,
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

export const TherapyGame = ({ user, profile, onNavigate }) => {
  const [gameState,       setGameState]       = useState('ready');
  const [secondsLeft,     setSecondsLeft]     = useState(120);
  const [targetsHit,      setTargetsHit]      = useState(0);
  const [targetsSpawned,  setTargetsSpawned]  = useState(0);
  const [peakROM,         setPeakROM]         = useState(0);
  const [accuracy,        setAccuracy]        = useState(0);
  const [hoverPct,        setHoverPct]        = useState(0);

  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const videoRef     = useRef(null);

  const statsRef = useRef({
    hits: 0, spawned: 0, startTime: null, endTime: null,
    peakROM: 0, telemetry: [], startPos: null,
  });

  const configRef = useRef({
    amputationSide:           profile?.amputationSide           || 'LEFT',
    amputationLevel:          profile?.amputationLevel          || 'FULL',
    meshScaleMultiplier:      profile?.meshScaleMultiplier      || 1.0,
    skinToneSliderHex:        profile?.skinToneSliderHex        || '#aa3bff',
    prescribedDuration:       120,
    targetSpawnRadius:        2.0,
    requiredHoverDwellTimeMs: 800, 
    hoverAccumMs:             0,
  });

  const targetPairRef     = useRef(null);
  const debugPointerRef   = useRef(null);
  const particlesRef      = useRef([]);
  const gameStateRef      = useRef('ready');

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const onLandmarksUpdate = useCallback((landmarksData) => {
    if (!landmarksData) return;
    const targetHand = configRef.current.amputationSide === 'LEFT' ? landmarksData.real : landmarksData.phantom;
    if (targetHand) {
      handleLandmarks(targetHand);
    }
  }, []);

  const {
    sceneRef,
    initThreeJS,
    startRenderLoop,
    stopRenderLoop,
    initMediaPipe,
    destroy,
  } = useMirrorEngine({ configRef, onLandmarksUpdate });

  const handleLandmarks = (handArray) => {
    if (!targetPairRef.current || gameStateRef.current !== 'running' || !handArray) return;

    const { a: targetA, b: targetB } = targetPairRef.current;
    
    const indexTip = handArray[8];  
    const thumbTip = handArray[4];  
    if (!indexTip || !thumbTip) return;

    const calX = (indexTip.x + thumbTip.x) / 2;
    const calY = (indexTip.y + thumbTip.y) / 2;

    if (debugPointerRef.current) {
      debugPointerRef.current.position.set(calX, calY, 0.05);
    }

    const distA = Math.hypot(
      calX - targetA.mesh.position.x,
      calY - targetA.mesh.position.y
    );

    if (distA < 0.65) {
      configRef.current.hoverAccumMs += 25; 
      const pct = Math.min(100, (configRef.current.hoverAccumMs / configRef.current.requiredHoverDwellTimeMs) * 100);
      setHoverPct(Math.round(pct));

      if (configRef.current.hoverAccumMs >= configRef.current.requiredHoverDwellTimeMs) {
        playSuccessChime();
        burstParticles(sceneRef.current, targetA.mesh.position.clone(), configRef.current.skinToneSliderHex, particlesRef);
        burstParticles(sceneRef.current, targetB.mesh.position.clone(), configRef.current.skinToneSliderHex, particlesRef);

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
      setHoverPct(Math.round((configRef.current.hoverAccumMs / configRef.current.requiredHoverDwellTimeMs) * 100));
    }

    const wrist = handArray[0];
    if (wrist && !statsRef.current.startPos) {
      statsRef.current.startPos = new THREE.Vector3(wrist.x, wrist.y, wrist.z);
    } else if (wrist) {
      const currentPos = new THREE.Vector3(wrist.x, wrist.y, wrist.z);
      const deg = Math.min(120, Math.round(currentPos.distanceTo(statsRef.current.startPos) * 15));
      if (deg > statsRef.current.peakROM) {
        statsRef.current.peakROM = deg;
        setPeakROM(deg);
      }
    }
  };

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
        sceneRef.current.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        particlesRef.current.splice(i, 1);
      }
    }
  }, [sceneRef]);

  const finishSession = useCallback(async () => {
    setGameState('saving');
    stopRenderLoop();
    destroy();
    setAccuracy(statsRef.current.spawned > 0 ? Math.round((statsRef.current.hits / statsRef.current.spawned) * 100) : 0);
    setGameState('finished');
  }, [destroy, stopRenderLoop]);

  const startSession = useCallback(() => {
    statsRef.current = { hits: 0, spawned: 1, startTime: Date.now(), endTime: null, peakROM: 0, telemetry: [], startPos: null };
    configRef.current.hoverAccumMs = 0;
    setTargetsHit(0);
    setTargetsSpawned(1);
    setHoverPct(0);
    setGameState('running');
  }, []);

  // Handle window resizing to keep the camera and canvas perfectly scaled
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
  }, [gameState, initThreeJS, startRenderLoop, onFrame, initMediaPipe, destroy]);

  useEffect(() => {
    if (gameState !== 'running') return;
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(id); finishSession(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gameState, finishSession]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className={`animate-fade-in ${gameState === 'running' ? 'mirror-session-shell' : ''}`} style={{ width: '100%', height: '100%' }}>
      {gameState === 'ready' && (
        <div className="glass-panel p-8" style={{ maxWidth: 580, margin: '60px auto', textAlign: 'center' }}>
          <h2>Calibration Complete</h2>
          <button className="btn btn-primary mt-4" onClick={startSession}>
            <PlayIcon className="w-5 h-5" /> Start Practice
          </button>
        </div>
      )}

      {gameState === 'running' && (
        <div className="mirror-session-stage" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000', zIndex: 99 }}>
          {/* Layer 1: True Full Screen Video Feed (Mirrored) */}
          <video 
            ref={videoRef} 
            className="mirror-camera-feed" 
            autoPlay 
            playsInline 
            muted 
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', transform: 'scaleX(-1)', zIndex: 1 }} 
          />
          
          {/* Layer 2: 3D Graphics Alignment Overlay matching the viewport size */}
          <div 
            ref={containerRef} 
            className="mirror-canvas-layer" 
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }}
          >
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>

          {/* Layer 3: Dynamic HUD Controller Top Bar */}
          <div className="mirror-hud mirror-hud-top" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, display: 'flex', alignItems: 'center', padding: '20px 30px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}>
            <div className="mirror-stat" style={{ color: '#fff', marginRight: '30px', fontSize: '1.4rem', fontFamily: 'monospace' }}><strong>{mm}:{ss}</strong></div>
            <div className="mirror-stat" style={{ color: '#00FFCC', fontSize: '1.4rem', fontFamily: 'monospace' }}><strong>Hits: {targetsHit}/{targetsSpawned}</strong></div>
            {hoverPct > 0 && <div className="font-bold animate-pulse" style={{ color: '#ffb703', marginLeft: '25px', fontSize: '1.2rem' }}>Target Lock {hoverPct}%</div>}
            <button className="btn btn-secondary" onClick={finishSession} style={{ marginLeft: 'auto', padding: '10px 24px', fontSize: '1rem', cursor: 'pointer' }}>End</button>
          </div>
        </div>
      )}

      {gameState === 'finished' && (
        <div className="glass-panel p-8" style={{ maxWidth: 580, margin: '40px auto', textAlign: 'center' }}>
          <h2 className="text-green-400">Complete</h2>
          <p>Accuracy: {accuracy}%</p>
          <button className="btn btn-primary mt-4" onClick={() => setGameState('ready')}>Restart Session</button>
        </div>
      )}
    </div>
  );
};
