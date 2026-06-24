import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { HandModel3D } from '../utils/HandModel3D';
import { GLBHandModel3D } from '../utils/GLBHandModel3D';

export function useMirrorEngine({ configRef, onLandmarksUpdate }) {

  // THREE CORE
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const clockRef = useRef(null);
  const rafRef = useRef(null);

  // 🔴 TWO HANDS (IMPORTANT FIX)
  const healthyHandRef = useRef(null);
  const phantomHandRef = useRef(null);

  // MEDIA PIPE
  const handsRef = useRef(null);
  const mpCamRef = useRef(null);

  const lastUiUpdateRef = useRef(0);
  const UI_UPDATE_INTERVAL_MS = 100;

  // =========================
  // THREE JS INIT
  // =========================
  const initThreeJS = useCallback((canvasEl, containerEl) => {

    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 🔧 FIXED CAMERA (better visibility)
    const camera = new THREE.PerspectiveCamera(
      72,
      w / h,
      0.1,
      100
    );

    camera.position.set(0, 0, 8);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: true
    });

    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    rendererRef.current = renderer;

    // LIGHTING
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 4, 5);
    scene.add(dir);

    // =========================
    // 🔴 CREATE TWO HANDS
    // =========================

    healthyHandRef.current = new HandModel3D(
      scene,
      configRef,
      0x00ff00   // Green (No arbitrary linear offsets!)
    );
    
    phantomHandRef.current = new GLBHandModel3D(
      scene,
      configRef,
      {
        scaleMultiplier: 1.55,
      }
    );

    clockRef.current = new THREE.Clock();

    // RESIZE
    const onResize = () => {
      const nw = containerEl.clientWidth;
      const nh = containerEl.clientHeight;

      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();

      renderer.setSize(nw, nh);
    };

    window.addEventListener('resize', onResize);
    renderer._resizeHandler = onResize;

    return scene;
  }, [configRef]);

  // =========================
  // RENDER LOOP
  // =========================
  const startRenderLoop = useCallback((onFrame) => {

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      const dt = clockRef.current?.getDelta?.() || 0.016;
      onFrame?.(dt);

      rendererRef.current?.render(
        sceneRef.current,
        cameraRef.current
      );
    };

    loop();
  }, []);

  const stopRenderLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  }, []);

  // =========================
  // APPLY LANDMARKS
  // =========================
  const applyLandmarks = useCallback((landmarks) => {

    if (
      !healthyHandRef.current ||
      !phantomHandRef.current ||
      !cameraRef.current
    ) return;

    // ==========================================
    // APPLY LANDMARKS WITH SCREEN-SPACE MIRRORING
    // ==========================================
    
    // REAL HAND (isPhantom = false: perfectly maps and tracks over your true hand)
    const real = healthyHandRef.current.update(
      landmarks,
      cameraRef.current,
      false
    );
    
    // PHANTOM HAND (isPhantom = true: reflects perfectly to the alternate side)
    const phantom = phantomHandRef.current.update(
      landmarks,
      cameraRef.current,
      true
    );

    const now = performance.now();

    if (
      onLandmarksUpdate &&
      now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS
    ) {
      onLandmarksUpdate({
        real,
        phantom
      });

      lastUiUpdateRef.current = now;
    }

  }, [onLandmarksUpdate]);

  // =========================
  // HIDE HANDS
  // =========================
  const hideArm = useCallback(() => {
    healthyHandRef.current?.hideAll();
    phantomHandRef.current?.hideAll();
  }, []);

  // =========================
  // MEDIA PIPE INIT
  // =========================
  const initMediaPipe = useCallback((videoEl) => {

    if (!window.Hands || !window.Camera) {
      console.error("MediaPipe not loaded");
      return false;
    }

    const hands = new window.Hands({
      locateFile: (file) => `/mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
      if (results.multiHandLandmarks?.length > 0) {
        applyLandmarks(results.multiHandLandmarks[0]);
      } else {
        hideArm();
      }
    });

    handsRef.current = hands;

    const cam = new window.Camera(videoEl, {
      width: 1280,
      height: 720,
      onFrame: async () => {
        await hands.send({ image: videoEl });
      }
    });

    mpCamRef.current = cam;
    cam.start();

    return true;

  }, [applyLandmarks, hideArm]);

  // =========================
  // DESTROY
  // =========================
  const destroy = useCallback(() => {

    stopRenderLoop();

    mpCamRef.current?.stop?.();

    if (rendererRef.current?._resizeHandler) {
      window.removeEventListener(
        'resize',
        rendererRef.current._resizeHandler
      );
    }

    rendererRef.current?.dispose();

    healthyHandRef.current?.destroy();
    phantomHandRef.current?.destroy();

    sceneRef.current = null;
    cameraRef.current = null;

  }, [stopRenderLoop]);

  return {
    sceneRef,
    cameraRef,
    initThreeJS,
    startRenderLoop,
    stopRenderLoop,
    initMediaPipe,
    hideArm,
    destroy
  };
}
