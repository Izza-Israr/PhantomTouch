import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { HandModel3D } from '../utils/HandModel3D';

export function useMirrorEngine({ configRef, onLandmarksUpdate }) {
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const clockRef = useRef(null);
  const rafRef = useRef(null);

  const healthyHandRef = useRef(null);
  const phantomHandRef = useRef(null);

  const holisticRef = useRef(null);
  const mpCamRef = useRef(null);

  const lastUiUpdateRef = useRef(0);
  const UI_UPDATE_INTERVAL_MS = 33; // 30 FPS update cycle

  // Centerline EMA memory anchor to suppress layout drift
  const stableCenterXRef = useRef(0.5);

  const VIS_THRESHOLD = 0.45;
  const isVisible = (lm) => lm && (lm.visibility === undefined || lm.visibility > VIS_THRESHOLD);

  const initThreeJS = useCallback((canvasEl, containerEl) => {
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 100);
    camera.position.set(0, 0, 7.5);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    sceneRef.current = scene;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(2, 6, 4);
    scene.add(dirLight);

    healthyHandRef.current = new HandModel3D(scene, configRef, 0x00ff00);
    phantomHandRef.current = new HandModel3D(scene, configRef, 0xff00ff);
    clockRef.current = new THREE.Clock();

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

  const buildIndices = (side) => {
    const shIdx = side === 'RIGHT' ? 12 : 11;
    const elIdx = side === 'RIGHT' ? 14 : 13;
    const wrIdx = side === 'RIGHT' ? 16 : 15;
    const healthyShIdx = side === 'RIGHT' ? 11 : 12;
    const healthyElIdx = side === 'RIGHT' ? 13 : 14;
    const healthyWrIdx = side === 'RIGHT' ? 15 : 16;
    return { shIdx, elIdx, wrIdx, healthyShIdx, healthyElIdx, healthyWrIdx };
  };

  const assessLevel = (poseLandmarks, idx) => {
    if (!isVisible(poseLandmarks[idx.elIdx])) return 'ABOVE_ELBOW';
    if (!isVisible(poseLandmarks[idx.wrIdx])) return 'BELOW_ELBOW';
    return 'HAND_ONLY';
  };

  const reflectPoint = (lm, centerX) => lm ? { x: 2 * centerX - lm.x, y: lm.y, z: lm.z || 0 } : null;

  const buildPhantom2D = (poseLandmarks, healthyHand, healthyIndices, phantomIndices, stableCenterX) => {
    const hSh = poseLandmarks[healthyIndices.healthyShIdx];
    const hEl = poseLandmarks[healthyIndices.healthyElIdx];
    const hWr = poseLandmarks[healthyIndices.healthyWrIdx];
    const aShRaw = poseLandmarks[phantomIndices.shIdx];
    const aElRaw = poseLandmarks[phantomIndices.elIdx];
    const aWrRaw = poseLandmarks[phantomIndices.wrIdx];

    if (!hSh) return { joints: Array(21).fill(null), shoulder: null, elbow: null, wrist: null };

    let shoulder2D = isVisible(aShRaw) ? { x: aShRaw.x, y: aShRaw.y } : reflectPoint(hSh, stableCenterX);
    let elbow2D = isVisible(aElRaw) ? { x: aElRaw.x, y: aElRaw.y } : (hEl ? reflectPoint(hEl, stableCenterX) : shoulder2D);
    let wrist2D = isVisible(aWrRaw) ? { x: aWrRaw.x, y: aWrRaw.y } : (hWr ? reflectPoint(hWr, stableCenterX) : elbow2D);

    const joints2D = Array.from({ length: 21 }, (_, i) => {
      if (healthyHand && healthyHand[i] && healthyHand[0] && wrist2D) {
        return {
          x: wrist2D.x - (healthyHand[i].x - healthyHand[0].x),
          y: wrist2D.y + (healthyHand[i].y - healthyHand[0].y),
          z: healthyHand[i].z || 0
        };
      }
      return wrist2D ? { x: wrist2D.x, y: wrist2D.y, z: 0 } : null;
    });

    return { joints: joints2D, shoulder: shoulder2D, elbow: elbow2D, wrist: wrist2D };
  };

  const processHolisticData = useCallback((results) => {
    if (!healthyHandRef.current || !phantomHandRef.current || !cameraRef.current) return;

    const poseLandmarks = results.poseLandmarks;
    if (!poseLandmarks) { hideArm(); return; }

    const leftHand = results.leftHandLandmarks || null;
    const rightHand = results.rightHandLandmarks || null;

    // Determine the active hand being tracked safely
    const leftHasArm = isVisible(poseLandmarks[15]) && (leftHand || isVisible(poseLandmarks[13]));
    const rightHasArm = isVisible(poseLandmarks[16]) && (rightHand || isVisible(poseLandmarks[14]));

    const configuredAmpSide = configRef.current?.amputationSide === 'RIGHT' ? 'RIGHT' : 'LEFT';
    const preferredHealthy = configuredAmpSide === 'RIGHT' ? 'LEFT' : 'RIGHT';

    let healthySide = preferredHealthy;
    if (preferredHealthy === 'LEFT' && !leftHasArm && rightHasArm) healthySide = 'RIGHT';
    if (preferredHealthy === 'RIGHT' && !rightHasArm && leftHasArm) healthySide = 'LEFT';

    const ampSide = healthySide === 'LEFT' ? 'RIGHT' : 'LEFT';

    const healthyIndices = buildIndices(healthySide);
    const phantomIndices = buildIndices(ampSide);

    // Sync sub-index structures
    Object.assign(healthyIndices, { healthyShIdx: healthyIndices.shIdx, healthyElIdx: healthyIndices.elIdx, healthyWrIdx: healthyIndices.wrIdx });
    Object.assign(phantomIndices, { healthyShIdx: healthyIndices.shIdx, healthyElIdx: healthyIndices.elIdx, healthyWrIdx: healthyIndices.wrIdx });

    const healthyHand = healthySide === 'LEFT' ? leftHand : rightHand;
    const phantomHandData = ampSide === 'LEFT' ? leftHand : rightHand;

    // --- CENTERLINE DRIFT FIX: Stabilize centerline via exponential moving average ---
    const hSh = poseLandmarks[healthyIndices.healthyShIdx];
    const aShRaw = poseLandmarks[phantomIndices.shIdx];
    if (hSh) {
      const instantCenter = isVisible(aShRaw) ? (hSh.x + aShRaw.x) / 2 : 0.5;
      stableCenterXRef.current = (stableCenterXRef.current * 0.85) + (instantCenter * 0.15);
    }

    const healthyPayload = { 
      side: healthySide, pose: poseLandmarks, hand: healthyHand, 
      indices: healthyIndices, level: assessLevel(poseLandmarks, healthyIndices),
      stableCenterX: stableCenterXRef.current 
    };
    
    const phantomPayload = { 
      side: ampSide, pose: poseLandmarks, hand: phantomHandData, 
      indices: phantomIndices, level: assessLevel(poseLandmarks, phantomIndices),
      stableCenterX: stableCenterXRef.current 
    };

    const real = healthyHandRef.current.update(healthyPayload, cameraRef.current, false);
    const phantom = phantomHandRef.current.update(phantomPayload, cameraRef.current, true);

    const now = performance.now();
    if (onLandmarksUpdate && now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
      const phantom2D = buildPhantom2D(poseLandmarks, healthyHand, healthyIndices, phantomIndices, stableCenterXRef.current);
      // Append tracking info regarding which hand side holds structural data
      onLandmarksUpdate({ real, phantom, phantom2D, activeSide: healthySide, rawLeftHand: leftHand, rawRightHand: rightHand });
      lastUiUpdateRef.current = now;
    }
  }, [configRef, onLandmarksUpdate, hideArm]);

  const initMediaPipe = useCallback((videoEl) => {
    if (!window.Holistic || !window.Camera) return false;

    const holistic = new window.Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
    });

    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    holistic.onResults(processHolisticData);
    holisticRef.current = holistic;

    const cam = new window.Camera(videoEl, {
      width: 1280, height: 720,
      onFrame: async () => {
        if (videoEl && !videoEl.paused && videoEl.readyState >= 2) {
          await holistic.send({ image: videoEl });
        }
      }
    });
    mpCamRef.current = cam;
    cam.start().catch(() => {});
    return true;
  }, [processHolisticData]);

  const destroy = useCallback(() => {
    stopRenderLoop();
    try { mpCamRef.current?.stop?.(); } catch(_) {}
    if (rendererRef.current?._resizeHandler) {
      window.removeEventListener('resize', rendererRef.current._resizeHandler);
    }
    rendererRef.current?.dispose();
    healthyHandRef.current?.destroy();
    phantomHandRef.current?.destroy();
    sceneRef.current = null;
    cameraRef.current = null;
  }, [stopRenderLoop]);

  return { sceneRef, cameraRef, initThreeJS, startRenderLoop, stopRenderLoop, initMediaPipe, hideArm, destroy };
}