import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { HandModel3D } from '../utils/HandModel3D';

export function useMirrorEngine({ configRef, onLandmarksUpdate }) {

  // Three.js core engine hooks
  const sceneRef    = useRef(null);
  const cameraRef   = useRef(null);
  const rendererRef = useRef(null);
  const clockRef    = useRef(null);
  const rafRef      = useRef(null);

  // Standalone 3D Engine Object Reference
  const handModelRef = useRef(null);

  // MediaPipe core drivers
  const handsRef    = useRef(null);
  const mpCamRef    = useRef(null);

  // Throttle for React-facing UI updates (e.g. "Target lock %") so the
  // render loop's per-frame data never forces a React re-render at
  // 30-60fps. ~10fps is plenty for a readout a human is watching.
  const lastUiUpdateRef = useRef(0);
  const UI_UPDATE_INTERVAL_MS = 100;

  // ─── THREE.JS INITIALISATION ───────────────────────────────────────────────

  const initThreeJS = useCallback((canvasEl, containerEl) => {
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0.5, 8); // Base positioning
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    renderer.setSize(w, h);
    // Capped at 1.5 rather than 2 — on high-DPI displays, devicePixelRatio
    // of 2-3 means rendering 4-9x the pixels for a marginal visual gain.
    // Drop to 1 if you're still seeing lag on lower-tier laptops.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    // Lighting Setup
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 4, 5);
    scene.add(dir);

    // Spawn the structural hand object model
    handModelRef.current = new HandModel3D(scene, configRef);

    clockRef.current = new THREE.Clock();

    // Responsive Canvas Resizing Runtime
    const onResize = () => {
      if (!containerEl) return;
      const nw = containerEl.clientWidth;
      const nh = containerEl.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);
    rendererRef.current._resizeHandler = onResize;

    return scene;
  }, [configRef]);

  // ─── RENDER ENGINE LOOP ────────────────────────────────────────────────────

  const startRenderLoop = useCallback((onFrame) => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = clockRef.current ? clockRef.current.getDelta() : 0.016;
      if (onFrame) onFrame(dt);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    loop();
  }, []);

  const stopRenderLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ─── RUNTIME DATA BROADCASTER ──────────────────────────────────────────────

  const applyLandmarks = useCallback((landmarks) => {
    if (!handModelRef.current || !cameraRef.current) return;

    // Pass landmarks and live camera instance down to the 3D model.
    // This update is imperative — it mutates Three.js objects directly
    // and never touches React state, so it doesn't trigger re-renders.
    const smoothedPositions = handModelRef.current.update(landmarks, cameraRef.current);

    if (!onLandmarksUpdate || !smoothedPositions) return;

    // Only push to React state at a throttled rate. Without this, every
    // landmark frame (30-60/sec) would call setState upstream and fight
    // the render loop for the main thread.
    const now = performance.now();
    if (now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
      onLandmarksUpdate(smoothedPositions);
      lastUiUpdateRef.current = now;
    }
  }, [onLandmarksUpdate]);

  const hideArm = useCallback(() => {
    if (handModelRef.current) handModelRef.current.hideAll();
  }, []);

  const sampleSleeveColor = useCallback((videoEl, posePoint) => {
    if (handModelRef.current) {
      handModelRef.current.sampleSleeveColor(videoEl, posePoint);
    }
  }, []);

  // ─── MEDIAPIPE DRIVERS ─────────────────────────────────────────────────────

  const initMediaPipe = useCallback((videoEl) => {
    if (!window.Hands || !window.Camera) {
      console.error('[useMirrorEngine] MediaPipe dependencies are missing.');
      return false;
    }

    const hands = new window.Hands({
      locateFile: (file) => `/mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      // 0 = lite model. Noticeably faster inference than 1 (full model)
      // on lower-tier laptops, at a small cost to landmark precision —
      // a good trade for a real-time mirror-therapy game.
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
      try {
        if (results.multiHandLandmarks?.length > 0) {
          applyLandmarks(results.multiHandLandmarks[0]);
        } else {
          hideArm();
        }
      } catch (err) {
        // If update() throws, MediaPipe's internal call chain can swallow
        // it silently — meaning the mesh stops updating forever, but you'd
        // never see why. This surfaces it instead of failing silently.
        console.error('[useMirrorEngine] Error processing landmarks:', err);
      }
    });
    handsRef.current = hands;

    const mpCam = new window.Camera(videoEl, {
      onFrame: async () => {
        // Heartbeat: confirms the camera's frame loop is still alive at
        // all. If this stops logging entirely, the freeze is upstream of
        // our code (video stream, tab throttling, MediaPipe's own loop) —
        // not in HandModel3D or this hook.
        if (!mpCamRef.current._frameCount) mpCamRef.current._frameCount = 0;
        mpCamRef.current._frameCount++;
        if (mpCamRef.current._frameCount % 60 === 0) {
          console.log('[useMirrorEngine] camera frames processed:', mpCamRef.current._frameCount);
        }
        if (handsRef.current) {
          await handsRef.current.send({ image: videoEl });
        }
      },
      width: 640,
      height: 480,
    });
    mpCamRef.current = mpCam;
    mpCam.start().catch((err) => {
      console.error('[useMirrorEngine] Camera error:', err);
    });

    return true;
  }, [applyLandmarks, hideArm]);

  // ─── DESTRUCTOR PIPELINE ───────────────────────────────────────────────────

  const destroy = useCallback(() => {
    stopRenderLoop();
    if (mpCamRef.current) {
      try { mpCamRef.current.stop(); } catch (_) {}
      mpCamRef.current = null;
    }
    handsRef.current = null;

    if (rendererRef.current) {
      if (rendererRef.current._resizeHandler) {
        window.removeEventListener('resize', rendererRef.current._resizeHandler);
      }
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    if (handModelRef.current) {
      handModelRef.current.destroy();
      handModelRef.current = null;
    }

    sceneRef.current  = null;
    cameraRef.current = null;
  }, [stopRenderLoop]);

  return {
    sceneRef,
    cameraRef,
    initThreeJS,
    startRenderLoop,
    stopRenderLoop,
    initMediaPipe,
    sampleSleeveColor,
    destroy,
  };
}