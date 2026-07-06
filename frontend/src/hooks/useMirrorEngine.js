import { useRef, useCallback } from 'react';
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

  const holisticRef = useRef(null);
  const mpCamRef    = useRef(null);
  const videoElRef  = useRef(null);  // stored at initMediaPipe time

  const lastPoseRef   = useRef(null);
  const lastPoseMsRef = useRef(0);
  const POSE_PERSIST_MS = 500;

  const lastUiUpdateRef = useRef(0);
  const UI_UPDATE_MS    = 60;

  const VIS_THRESHOLD = 0.45;
  const isVis = (lm) => lm && (lm.visibility === undefined || lm.visibility > VIS_THRESHOLD);

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
  }, []);

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
      { pose, hand: healthyHand, indices: healthyIdx, isPhantom: false },
      cameraRef.current, videoRect
    );

    // Phantom hand: rendered in magenta, fingers mirror the healthy hand
    const phantom = phantomHandRef.current.update(
      { pose, hand: healthyHand, amputatedHand, indices: ampIdx, isPhantom: true },
      cameraRef.current, videoRect
    );

    if (onLandmarksUpdate && (now - lastUiUpdateRef.current) >= UI_UPDATE_MS) {
      // Only pass real & phantom world-space positions.
      // No 2D overlay data — the duplicate canvas phantom is removed.
      onLandmarksUpdate({ real, phantom });
      lastUiUpdateRef.current = now;
    }
  }, [configRef, onLandmarksUpdate, hideArm, getVideoRect]);

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
    sceneRef.current = null; cameraRef.current = null;
  }, [stopRenderLoop]);

  return { sceneRef, cameraRef, initThreeJS, startRenderLoop, stopRenderLoop, initMediaPipe, hideArm, destroy };
}
