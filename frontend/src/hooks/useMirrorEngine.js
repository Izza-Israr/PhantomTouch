import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { HandModel3D } from '../utils/HandModel3D';

// MediaPipe Holistic pose landmark indices
//   11=L shoulder  12=R shoulder
//   13=L elbow     14=R elbow
//   15=L wrist     16=R wrist
function getPoseIdx(side) {
  return side === 'LEFT'
    ? { sh:11, el:13, wr:15 }
    : { sh:12, el:14, wr:16 };
}

const cloneLandmark = (lm) => lm ? { x: lm.x, y: lm.y, z: lm.z || 0, visibility: lm.visibility } : null;
const cloneLandmarks = (landmarks) => Array.isArray(landmarks) ? landmarks.map(cloneLandmark) : null;

const canonicalPoseName = (text) => {
  const value = String(text || '').toLowerCase();
  if (/victory|peace|v sign|two fingers/.test(value)) return 'victory';
  if (/thumb|thumbs up/.test(value)) return 'thumbs_up';
  if (/point|pointing/.test(value)) return 'point';
  if (/pinch|pinching/.test(value)) return 'pinch';
  if (/clench|clinch|fist|close/.test(value)) return 'clench_fist';
  if (/open|relax|flat/.test(value)) return 'open_hand';
  return null;
};

const makeFallbackHand = (wrist, side) => {
  if (!wrist) return null;
  const spread = side === 'LEFT' ? -1 : 1;
  const points = Array.from({ length: 21 }, () => ({ x: wrist.x, y: wrist.y, z: wrist.z || 0 }));
  const bases = [
    [1, -0.045 * spread],
    [5, -0.025 * spread],
    [9, 0],
    [13, 0.025 * spread],
    [17, 0.045 * spread],
  ];
  bases.forEach(([base, xOffset], fingerIndex) => {
    for (let step = 0; step < 4; step++) {
      points[base + step] = {
        x: wrist.x + xOffset + (step * 0.008 * Math.sign(xOffset || spread)),
        y: wrist.y - 0.035 - (step * 0.03) - (fingerIndex === 0 ? step * 0.01 : 0),
        z: wrist.z || 0,
      };
    }
  });
  return points;
};

export function useMirrorEngine({ configRef, onLandmarksUpdate }) {
  const sceneRef    = useRef(null);
  const cameraRef   = useRef(null);
  const rendererRef = useRef(null);
  const clockRef    = useRef(null);
  const rafRef      = useRef(null);

  // renderVisible:false  → track coords, no 3D mesh (real/healthy hand)
  // renderVisible:true   → full 3D render (phantom hand)
  const healthyHandRef = useRef(null);
  const phantomHandRef = useRef(null);
  const bilateralLeftPhantomRef = useRef(null);
  const bilateralRightPhantomRef = useRef(null);
  const activeBilateralPoseRef = useRef('open_hand');

  const holisticRef = useRef(null);
  const mpCamRef    = useRef(null);
  const videoElRef  = useRef(null);  // stored at initMediaPipe time

  const lastPoseRef   = useRef(null);
  const lastPoseMsRef = useRef(0);
  const POSE_PERSIST_MS = 500;

  const lastUiUpdateRef = useRef(0);
  const UI_UPDATE_MS    = 60;

  // ── Video rect: corrects for pillarboxing / letterboxing ─────────────────
  // The <video> uses object-fit:contain inside the Three.js canvas.
  // MediaPipe landmarks are in [0,1] video-space; we must remap them into
  // [0,1] viewport-space before unprojecting, otherwise edge positions are off.
  const getVideoRect = useCallback(() => {
    const v  = videoElRef.current;
    const r  = rendererRef.current;
    if (!v || !r) return null;
    const cW = r.domElement.clientWidth  || window.innerWidth;
    const cH = r.domElement.clientHeight || window.innerHeight;
    if (!cW || !cH) return null;
    const vW = v.videoWidth  || 1280;
    const vH = v.videoHeight || 720;
    if (!vW || !vH) return null;
    const va = vW / vH, ca = cW / cH;
    let rW, rH, oX, oY;
    if (ca > va) { rH=cH; rW=cH*va; oX=(cW-rW)/2; oY=0; }
    else         { rW=cW; rH=cW/va; oX=0; oY=(cH-rH)/2; }
    return { renderedW:rW, renderedH:rH, offsetX:oX, offsetY:oY, containerW:cW, containerH:cH };
  }, []);

  // ── Three.js init ─────────────────────────────────────────────────────────
  const initThreeJS = useCallback((canvasEl, containerEl) => {
    const w = containerEl.clientWidth, h = containerEl.clientHeight;
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(72, w/h, 0.1, 100);
    camera.position.set(0, 0, 8);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2);
    dl.position.set(4, 8, 6); dl.castShadow = true;
    scene.add(dl);

    // Real hand: renderVisible:false  → invisible 3D mesh, still returns coords
    healthyHandRef.current = new HandModel3D(scene, configRef, 0x00ff00, { renderVisible: false });
    // Phantom hand: renderVisible:true (default) → fully visible magenta skeleton
    phantomHandRef.current = new HandModel3D(scene, configRef, 0xff00ff);
    bilateralLeftPhantomRef.current = new HandModel3D(scene, configRef, 0xff00ff);
    bilateralRightPhantomRef.current = new HandModel3D(scene, configRef, 0xff66cc);

    clockRef.current = new THREE.Clock();

    const onResize = () => {
      const nw=containerEl.clientWidth, nh=containerEl.clientHeight;
      camera.aspect = nw/nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);
    renderer._resizeHandler = onResize;
    return scene;
  }, [configRef]);

  // ── Render loop ───────────────────────────────────────────────────────────
  const startRenderLoop = useCallback((onFrame) => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = clockRef.current?.getDelta?.() || 0.016;
      onFrame?.(dt);
      rendererRef.current?.render(sceneRef.current, cameraRef.current);
    };
    loop();
  }, []);

  const stopRenderLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const hideArm = useCallback(() => {
    healthyHandRef.current?.hideAll();
    phantomHandRef.current?.hideAll();
    bilateralLeftPhantomRef.current?.hideAll();
    bilateralRightPhantomRef.current?.hideAll();
  }, []);

  const applyCommandPose = useCallback((event) => {
    const nextPose = canonicalPoseName(event?.detail?.text);
    if (!nextPose) return;
    activeBilateralPoseRef.current = nextPose;
    if (configRef.current) configRef.current.bilateralActivePose = nextPose;
  }, [configRef]);

  useEffect(() => {
    window.addEventListener('phantomtouch:voice-command', applyCommandPose);
    return () => window.removeEventListener('phantomtouch:voice-command', applyCommandPose);
  }, [applyCommandPose]);

  const getRecordedPose = useCallback((side, pose, fallbackHand) => {
    const library = configRef.current?.bilateralPoseLibrary || {};
    const action = configRef.current?.bilateralActivePose || activeBilateralPoseRef.current || 'open_hand';
    const recorded = library[action] || library.open_hand || null;
    const sideKey = side === 'RIGHT' ? 'RIGHT' : 'LEFT';
    const indices = getPoseIdx(sideKey);
    const arm = recorded?.arms?.[sideKey] || null;
    return {
      action,
      hand: cloneLandmarks(recorded?.hand) || fallbackHand,
      arm: arm ? {
        shoulder: cloneLandmark(arm.shoulder) || cloneLandmark(pose?.[indices.sh]),
        elbow: cloneLandmark(arm.elbow) || cloneLandmark(pose?.[indices.el]),
        wrist: cloneLandmark(arm.wrist) || cloneLandmark(pose?.[indices.wr]),
      } : null,
    };
  }, [configRef]);

  // ── Core holistic processor ───────────────────────────────────────────────
  const processHolisticData = useCallback((results) => {
    if (!healthyHandRef.current || !phantomHandRef.current || !cameraRef.current) return;

    const now = performance.now();

    // Pose persistence across brief dropouts
    let pose = results.poseLandmarks;
    if (pose) { lastPoseRef.current = pose; lastPoseMsRef.current = now; }
    else if (lastPoseRef.current && (now - lastPoseMsRef.current) < POSE_PERSIST_MS)
      pose = lastPoseRef.current;
    else { hideArm(); return; }

    const leftHand  = results.leftHandLandmarks  || null;
    const rightHand = results.rightHandLandmarks || null;
    configRef.current.latestTrackingSnapshot = {
      pose: cloneLandmarks(pose),
      leftHand: cloneLandmarks(leftHand),
      rightHand: cloneLandmarks(rightHand),
      capturedAt: now,
    };

    if (configRef.current?.amputationSide === 'BILATERAL' && configRef.current?.bilateralRecordingMode) {
      healthyHandRef.current?.hideAll();
      phantomHandRef.current?.hideAll();

      const videoRect = getVideoRect();
      const leftIdx = getPoseIdx('LEFT');
      const rightIdx = getPoseIdx('RIGHT');
      const liveLeft = bilateralLeftPhantomRef.current?.update(
        { pose, hand: leftHand, indices: leftIdx, isPhantom: false, side: 'LEFT' },
        cameraRef.current,
        videoRect
      );
      const liveRight = bilateralRightPhantomRef.current?.update(
        { pose, hand: rightHand, indices: rightIdx, isPhantom: false, side: 'RIGHT' },
        cameraRef.current,
        videoRect
      );

      if (onLandmarksUpdate && (now - lastUiUpdateRef.current) >= UI_UPDATE_MS) {
        onLandmarksUpdate({
          real: null,
          phantom: null,
          recordingPreview: { left: liveLeft, right: liveRight },
          recordingSnapshot: configRef.current.latestTrackingSnapshot
        });
        lastUiUpdateRef.current = now;
      }
      return;
    }

    if (configRef.current?.amputationSide === 'BILATERAL') {
      healthyHandRef.current?.hideAll();
      phantomHandRef.current?.hideAll();

      const videoRect = getVideoRect();
      const detectedHand = leftHand || rightHand;
      const leftIdx = getPoseIdx('LEFT');
      const rightIdx = getPoseIdx('RIGHT');
      const leftFallback = cloneLandmarks(leftHand || detectedHand) || makeFallbackHand(pose[leftIdx.wr] || pose[leftIdx.el] || pose[leftIdx.sh], 'LEFT');
      const rightFallback = cloneLandmarks(rightHand || detectedHand) || makeFallbackHand(pose[rightIdx.wr] || pose[rightIdx.el] || pose[rightIdx.sh], 'RIGHT');
      const leftRecorded = getRecordedPose('LEFT', pose, leftFallback);
      const rightRecorded = getRecordedPose('RIGHT', pose, rightFallback);

      const leftPhantom = bilateralLeftPhantomRef.current?.update(
        {
          pose,
          hand: leftHand,
          amputatedHand: leftHand,
          templateHand: leftRecorded.hand,
          recordedArm: leftRecorded.arm,
          indices: leftIdx,
          isPhantom: true,
          isBilateralPhantom: true,
          side: 'LEFT',
        },
        cameraRef.current,
        videoRect
      );
      const rightPhantom = bilateralRightPhantomRef.current?.update(
        {
          pose,
          hand: rightHand,
          amputatedHand: rightHand,
          templateHand: rightRecorded.hand,
          recordedArm: rightRecorded.arm,
          indices: rightIdx,
          isPhantom: true,
          isBilateralPhantom: true,
          side: 'RIGHT',
        },
        cameraRef.current,
        videoRect
      );

      if (onLandmarksUpdate && (now - lastUiUpdateRef.current) >= UI_UPDATE_MS) {
        onLandmarksUpdate({ real: null, phantom: { left: leftPhantom, right: rightPhantom, action: leftRecorded.action } });
        lastUiUpdateRef.current = now;
      }
      return;
    }

    // ── Stable side assignment (never re-detected mid-session) ────────────
    // amputationSide = the MISSING limb; healthySide = the one with a real hand
    const ampSide     = configRef.current?.amputationSide === 'RIGHT' ? 'RIGHT' : 'LEFT';
    const healthySide = ampSide === 'RIGHT' ? 'LEFT' : 'RIGHT';

    const healthyIdx = getPoseIdx(healthySide);
    const ampIdx     = getPoseIdx(ampSide);

    // Phantom needs healthy shoulder/elbow/wrist refs for mirroring
    ampIdx.healthySh = healthyIdx.sh;
    ampIdx.healthyEl = healthyIdx.el;
    ampIdx.healthyWr = healthyIdx.wr;

    if (!pose[healthyIdx.sh]) { hideArm(); return; }

    const healthyHand = healthySide === 'LEFT' ? leftHand : rightHand;
    const amputatedHand = ampSide === 'LEFT' ? leftHand : rightHand;

    const videoRect = getVideoRect();

    // Real hand: tracked but NOT rendered (renderVisible:false in constructor)
    const real = healthyHandRef.current.update(
      { pose, hand: healthyHand, indices: healthyIdx, isPhantom: false, side: healthySide },
      cameraRef.current, videoRect
    );

    // Phantom hand: rendered in magenta, fingers mirror the healthy hand.
    // For bilateral users, the same tracking stream is used to drive both phantom limbs,
    // but each limb resolves its own amputation settings (level + missing fingers) from the profile.
    const phantom = phantomHandRef.current.update(
      { pose, hand: healthyHand, amputatedHand, indices: ampIdx, isPhantom: true, side: ampSide },
      cameraRef.current, videoRect
    );

    if (onLandmarksUpdate && (now - lastUiUpdateRef.current) >= UI_UPDATE_MS) {
      // Only pass real & phantom world-space positions.
      // No 2D overlay data — the duplicate canvas phantom is removed.
      onLandmarksUpdate({ real, phantom });
      lastUiUpdateRef.current = now;
    }
  }, [configRef, onLandmarksUpdate, hideArm, getVideoRect, getRecordedPose]);

  // ── MediaPipe init ────────────────────────────────────────────────────────
  const initMediaPipe = useCallback((videoEl) => {
    if (!window.Holistic || !window.Camera) {
      console.error('MediaPipe CDN assets missing.');
      return false;
    }
    videoElRef.current = videoEl;

    const holistic = new window.Holistic({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}`,
    });
    holistic.setOptions({
      modelComplexity: 1, smoothLandmarks: true,
      minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    holistic.onResults((res) => processHolisticData(res));
    holisticRef.current = holistic;

    const triggerCamera = async () => {
      try {
        const cam = new window.Camera(videoEl, {
          width: 1280, height: 720,
          onFrame: async () => {
            if (videoEl && !videoEl.paused && videoEl.readyState >= 2)
              await holistic.send({ image: videoEl }).catch((e) => console.warn('skip', e));
          },
        });
        mpCamRef.current = cam;
        await cam.start();
        return;
      } catch (err) { console.warn('Camera API failed, trying getUserMedia:', err); }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video:{width:1280,height:720}, audio:false });
        videoEl.srcObject = stream;
        await videoEl.play().catch(()=>{});
        let mid = null;
        const loop = async () => {
          if (videoEl && !videoEl.paused && videoEl.readyState >= 2)
            await holistic.send({ image: videoEl }).catch((e) => console.warn('skip', e));
          mid = requestAnimationFrame(loop);
        };
        mpCamRef.current = { stop: () => { stream.getTracks().forEach(t=>t.stop()); if(mid) cancelAnimationFrame(mid); } };
        loop();
      } catch (e) { console.error('Camera fallback failed:', e); }
    };

    triggerCamera();
    videoEl.onloadedmetadata = () => { if (!mpCamRef.current) triggerCamera(); };
    return true;
  }, [processHolisticData]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const destroy = useCallback(() => {
    stopRenderLoop();
    mpCamRef.current?.stop?.();
    if (rendererRef.current?._resizeHandler)
      window.removeEventListener('resize', rendererRef.current._resizeHandler);
    rendererRef.current?.dispose();
    healthyHandRef.current?.destroy();
    phantomHandRef.current?.destroy();
    bilateralLeftPhantomRef.current?.destroy();
    bilateralRightPhantomRef.current?.destroy();
    sceneRef.current = null; cameraRef.current = null;
  }, [stopRenderLoop]);

  return { sceneRef, cameraRef, initThreeJS, startRenderLoop, stopRenderLoop, initMediaPipe, hideArm, destroy };
}
