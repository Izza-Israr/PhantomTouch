import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useMirrorEngine } from '../hooks/useMirrorEngine';
import { PlayIcon } from './Icons';

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

function makeTargetMesh(scene) {
  const geo  = new THREE.IcosahedronGeometry(0.4, 1);
  const mat  = new THREE.MeshPhongMaterial({
    color: 0x00f5ff, emissive: 0x00f5ff, emissiveIntensity: 0.6,
    wireframe: true, transparent: true, opacity: 0.85,
  });
  const mesh  = new THREE.Mesh(geo, mat);
  const light = new THREE.PointLight(0x00f5ff, 2.0, 6);
  scene.add(mesh);
  scene.add(light);
  return { mesh, light };
}

function makeDebugPointer(scene) {
  const geo = new THREE.SphereGeometry(0.12, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999; 
  scene.add(mesh);
  return mesh;
}

function spawnTargetPair(targetA, targetB, configRef) {
  const side = configRef.current.amputationSide || 'LEFT';
  const xPhantom = side === 'LEFT' ? -1 : 1;
  const xReal    = -xPhantom;                        

  // Scale target ranges within the exact visible boundaries of the updated HandModel setup
  const xOffset = 1.2 + Math.random() * 1.5;  
  const y       = -1.0 + Math.random() * 2.2; 
  const z       = 0.0; 

  targetA.mesh.position.set(xReal * xOffset, y, z);
  targetA.light.position.set(xReal * xOffset, y, z);

  targetB.mesh.position.set(xPhantom * xOffset, y, z);
  targetB.light.position.set(xPhantom * xOffset, y, z);
}

function burstParticles(scene, pos, toneHex, particlesRef) {
  const tone = new THREE.Color(toneHex);
  for (let i = 0; i < 15; i++) {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const mat = new THREE.MeshPhongMaterial({
      color: i % 2 === 0 ? 0x00f5ff : tone,
      emissive: i % 2 === 0 ? 0x00f5ff : tone,
      emissiveIntensity: 0.8,
      transparent: true, opacity: 1,
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(pos);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.12,
      (Math.random() - 0.5) * 0.12 + 0.04,
      (Math.random() - 0.5) * 0.12,
    );
    scene.add(p);
    particlesRef.current.push({ mesh: p, vel, life: 1.0 });
  }
}

export const TherapyGame = ({ profile, onNavigate }) => {
  const [gameState,       setGameState]       = useState('ready');
  const [secondsLeft,     setSecondsLeft]     = useState(120);
  const [targetsHit,      setTargetsHit]      = useState(0);
  const [targetsSpawned,  setTargetsSpawned]  = useState(0);
  const [peakROM,         setPeakROM]         = useState(0);
  const [hoverPct,        setHoverPct]        = useState(0);

  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const videoRef     = useRef(null);
  const overlayRef   = useRef(null);

  const statsRef = useRef({ hits: 0, spawned: 0, peakROM: 0, startPos: null });
  const configRef = useRef({
    amputationSide:           profile?.amputationSide           || 'LEFT',
    skinToneSliderHex:        profile?.skinToneSliderHex        || '#aa3bff',
    requiredHoverDwellTimeMs: 500, 
    hoverAccumMs:             0,
  });

  const targetPairRef     = useRef(null);
  const debugPointerRef   = useRef(null);
  const particlesRef      = useRef([]);
  const gameStateRef      = useRef('ready');

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const handleLandmarks = (handArray) => {
    if (!targetPairRef.current || gameStateRef.current !== 'running' || !handArray) return;

    const { a: targetA } = targetPairRef.current;
    
    // Index 8 and Index 0 from the returned processed 3D space array
    const indexTip = handArray[8];  
    if (!indexTip) return;

    const calX = indexTip.x;
    const calY = indexTip.y;

    if (debugPointerRef.current) {
      debugPointerRef.current.position.set(calX, calY, 0.05);
    }

    const distA = Math.hypot(calX - targetA.mesh.position.x, calY - targetA.mesh.position.y);

    if (distA < 0.85) { 
      configRef.current.hoverAccumMs += 30; 
      const pct = Math.min(100, (configRef.current.hoverAccumMs / configRef.current.requiredHoverDwellTimeMs) * 100);
      setHoverPct(Math.round(pct));

      if (configRef.current.hoverAccumMs >= configRef.current.requiredHoverDwellTimeMs) {
        playSuccessChime();
        burstParticles(sceneRef.current, targetPairRef.current.a.mesh.position.clone(), configRef.current.skinToneSliderHex, particlesRef);
        burstParticles(sceneRef.current, targetPairRef.current.b.mesh.position.clone(), configRef.current.skinToneSliderHex, particlesRef);

        statsRef.current.hits++;
        setTargetsHit(statsRef.current.hits);

        configRef.current.hoverAccumMs = 0;
        setHoverPct(0);

        spawnTargetPair(targetPairRef.current.a, targetPairRef.current.b, configRef);
        statsRef.current.spawned++;
        setTargetsSpawned(statsRef.current.spawned);
      }
    } else {
      configRef.current.hoverAccumMs = Math.max(0, configRef.current.hoverAccumMs - 15);
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

  const onLandmarksUpdate = useCallback((data) => {
    if (!data) return;
    const { real, phantom2D } = data;

    if (real) {
      handleLandmarks(real);
    }

    if (phantom2D && overlayRef.current && videoRef.current) {
      const canvas = overlayRef.current;
      const ctx = canvas.getContext('2d');
      const vw = canvas.width = videoRef.current.clientWidth || 640;
      const vh = canvas.height = videoRef.current.clientHeight || 480;
      ctx.clearRect(0,0,vw,vh);

      const drawCircle = (x,y,r,color) => {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle = color; ctx.fill();
      };

      const { shoulder, elbow, wrist, joints } = phantom2D;
      const pixelFromPoint = (pt) => ({ x: pt.x * vw, y: pt.y * vh });

      ctx.lineWidth = 4; ctx.strokeStyle = '#FF00FF';
      if (shoulder && elbow) {
        const s = pixelFromPoint(shoulder); const e = pixelFromPoint(elbow);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        drawCircle(s.x,s.y,6,'#FF00FF'); drawCircle(e.x,e.y,6,'#FF00FF');
      }
      if (elbow && wrist) {
        const e = pixelFromPoint(elbow); const w = pixelFromPoint(wrist);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(w.x, w.y); ctx.stroke();
        drawCircle(w.x,w.y,6,'#00FFCC');
      }

      if (Array.isArray(joints)) {
        ctx.strokeStyle = '#00FFCC'; ctx.lineWidth = 2;
        const fingerChains = [
          [0,1,2,3,4], [0,5,6,7,8], [5,9,10,11,12], [9,13,14,15,16], [0,17,18,19,20]
        ];
        fingerChains.forEach(chain => {
          let prev = null;
          chain.forEach(i => {
            const pt = joints[i];
            if (!pt) return;
            const p = pixelFromPoint(pt);
            drawCircle(p.x, p.y, 3, '#00FFCC');
            if (prev) {
              ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            }
            prev = p;
          });
        });
      }
    }
  }, []);

  const { sceneRef, initThreeJS, startRenderLoop, stopRenderLoop, initMediaPipe, destroy } = useMirrorEngine({ configRef, onLandmarksUpdate });

  const onFrame = useCallback((dt) => {
    const pair = targetPairRef.current;
    if (!pair) return;
  
    pair.a.mesh.rotation.y += 1.0 * dt;
    pair.b.mesh.rotation.y += 1.0 * dt;
  
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.mesh.position.add(p.vel);
      p.life -= 1.8 * dt;
      p.mesh.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        sceneRef.current.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        particlesRef.current.splice(i, 1);
      }
    }
  }, [sceneRef]);

  const finishSession = useCallback(() => {
    setGameState('finished');
    stopRenderLoop();
    destroy();
  }, [destroy, stopRenderLoop]);

  const startSession = useCallback(() => {
    statsRef.current = { hits: 0, spawned: 1, peakROM: 0, startPos: null };
    configRef.current.hoverAccumMs = 0;
    setTargetsHit(0);
    setTargetsSpawned(1);
    setHoverPct(0);
    setGameState('running');
  }, []);

  const handleExitGame = useCallback(() => {
    stopRenderLoop();
    destroy();
    if (onNavigate) {
      onNavigate('dashboard');
    } else {
      window.location.reload();
    }
  }, [destroy, stopRenderLoop, onNavigate]);

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

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {gameState === 'ready' && (
        <div style={{ maxWidth: 450, margin: '100px auto', textAlign: 'center', color: '#fff', background: '#222', padding: 32, borderRadius: 12 }}>
          <h3>Mirror Therapy Game</h3>
          <p style={{ opacity: 0.8, fontSize: '0.9rem', marginBottom: 20 }}>Align your hand over the target spheres to lock and destroy them.</p>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button style={{ background: '#00ffcc', padding: '12px 24px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', color: '#111' }} onClick={startSession}>
              <PlayIcon /> Start Practice
            </button>
            <button style={{ background: '#ff3333', padding: '12px 24px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', color: '#fff' }} onClick={handleExitGame}>
              Exit Game
            </button>
          </div>
        </div>
      )}

      {gameState === 'running' && (
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', backgroundColor: '#000', zIndex: 99 }}>
          <video ref={videoRef} className="mirror-camera-feed" autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', transform: 'scaleX(-1)', zIndex: 1 }} />
          
          <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', zIndex: 20 }} />
          </div>

          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, display: 'flex', gap: '30px', padding: '20px', background: 'linear-gradient(rgba(0,0,0,0.8), transparent)', alignItems: 'center' }}>
            <div style={{ color: '#fff', fontFamily: 'monospace', fontSize: '1.3rem' }}>Time: {secondsLeft}s</div>
            <div style={{ color: '#00FFCC', fontFamily: 'monospace', fontSize: '1.3rem' }}>Targets: {targetsHit}</div>
            {hoverPct > 0 && <div style={{ color: '#ffb703', fontWeight: 'bold', fontSize: '1.2rem' }}>Target Lock: {hoverPct}%</div>}
            
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
              <button style={{ background: '#555', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }} onClick={finishSession}>Stop</button>
              <button style={{ background: '#ff3333', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }} onClick={handleExitGame}>Exit</button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'finished' && (
        <div style={{ maxWidth: 400, margin: '100px auto', textAlign: 'center', color: '#fff', background: '#222', padding: 24, borderRadius: 12 }}>
          <h3 style={{ color: '#00ffcc' }}>Session Complete!</h3>
          <p>Total Targets Hit: {targetsHit}</p>
          <p>Max Range of Motion: {peakROM}°</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: 20 }}>
            <button style={{ background: '#00ffcc', padding: '10px 20px', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', color: '#111' }} onClick={() => setGameState('ready')}>Restart</button>
            <button style={{ background: '#555', padding: '10px 20px', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#fff' }} onClick={handleExitGame}>Dashboard</button>
          </div>
        </div>
      )}
    </div>
  );
};