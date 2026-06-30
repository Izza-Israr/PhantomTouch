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
  const UI_UPDATE_INTERVAL_MS = 60;

  const VIS_THRESHOLD = 0.45;
  const isVisible = (lm) => lm && (lm.visibility === undefined || lm.visibility > VIS_THRESHOLD);

  const initThreeJS = useCallback((canvasEl, containerEl) => {
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 100);
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(4, 8, 6);
    dirLight.castShadow = true;
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
    const elbowVisible = isVisible(poseLandmarks[idx.elIdx]);
    const wristVisible = isVisible(poseLandmarks[idx.wrIdx]);
    if (!elbowVisible) return 'ABOVE_ELBOW';
    if (elbowVisible && !wristVisible) return 'BELOW_ELBOW';
    return 'HAND_ONLY';
  };

  // Mirrors a 2D point across the body centerline (midpoint of both shoulders)
  const reflectPoint = (lm, centerX) => lm ? { x: 2 * centerX - lm.x, y: lm.y, z: lm.z || 0 } : null;

  const buildPhantom2D = (poseLandmarks, healthyHand, healthyIndices, phantomIndices) => {
    const hSh = poseLandmarks[healthyIndices.healthyShIdx];
    const hEl = poseLandmarks[healthyIndices.healthyElIdx];
    const hWr = poseLandmarks[healthyIndices.healthyWrIdx];
    const aShRaw = poseLandmarks[phantomIndices.shIdx];
    const aElRaw = poseLandmarks[phantomIndices.elIdx];
    const aWrRaw = poseLandmarks[phantomIndices.wrIdx];

    if (!hSh) {
      return { joints: Array(21).fill(null), shoulder: null, elbow: null, wrist: null };
    }

    const centerX = isVisible(aShRaw) ? (hSh.x + aShRaw.x) / 2 : 0.5;

    let shoulder2D = isVisible(aShRaw) ? { x: aShRaw.x, y: aShRaw.y } : reflectPoint(hSh, centerX);
    let elbow2D = isVisible(aElRaw) ? { x: aElRaw.x, y: aElRaw.y } : (hEl ? reflectPoint(hEl, centerX) : null);
    let wrist2D = isVisible(aWrRaw) ? { x: aWrRaw.x, y: aWrRaw.y } : (hWr ? reflectPoint(hWr, centerX) : null);

    if (!elbow2D && shoulder2D && wrist2D) {
      elbow2D = { x: shoulder2D.x + (wrist2D.x - shoulder2D.x) * 0.45, y: shoulder2D.y + (wrist2D.y - shoulder2D.y) * 0.45 };
    }
    if (!wrist2D && elbow2D && shoulder2D) {
      wrist2D = { x: elbow2D.x + (elbow2D.x - shoulder2D.x) * 0.9, y: elbow2D.y + (elbow2D.y - shoulder2D.y) * 0.9 };
    }

    // Mirror the real hand's finger joints directly onto the phantom wrist anchor
    const healthyWristLm = healthyHand && healthyHand[0] ? healthyHand[0] : null;
    const joints2D = Array.from({ length: 21 }, (_, i) => {
      if (healthyHand && healthyHand[i] && healthyWristLm && wrist2D) {
        const dx = healthyHand[i].x - healthyWristLm.x;
        const dy = healthyHand[i].y - healthyWristLm.y;
        return { x: wrist2D.x - dx, y: wrist2D.y + dy, z: healthyHand[i].z || 0 };
      }
      return wrist2D ? { x: wrist2D.x, y: wrist2D.y, z: 0 } : null;
    });

    return { joints: joints2D, shoulder: shoulder2D, elbow: elbow2D, wrist: wrist2D };
  };

  const processHolisticData = useCallback((results) => {
    if (!healthyHandRef.current || !phantomHandRef.current || !cameraRef.current) return;

    const poseLandmarks = results.poseLandmarks;
    const leftHand = results.leftHandLandmarks || null;
    const rightHand = results.rightHandLandmarks || null;

    if (!poseLandmarks) {
      hideArm();
      return;
    }

    const configuredAmpSide = configRef.current?.amputationSide === 'RIGHT' ? 'RIGHT' : 'LEFT';

    // Detect which side is actually being tracked right now (config = preference, not law)
    const leftHasArm = isVisible(poseLandmarks[15]) && (leftHand || isVisible(poseLandmarks[13]));
    const rightHasArm = isVisible(poseLandmarks[16]) && (rightHand || isVisible(poseLandmarks[14]));
    const preferredHealthy = configuredAmpSide === 'RIGHT' ? 'LEFT' : 'RIGHT';

    let healthySide;
    if (preferredHealthy === 'LEFT' && leftHasArm) healthySide = 'LEFT';
    else if (preferredHealthy === 'RIGHT' && rightHasArm) healthySide = 'RIGHT';
    else if (leftHasArm) healthySide = 'LEFT';
    else if (rightHasArm) healthySide = 'RIGHT';
    else healthySide = preferredHealthy;

    const ampSide = healthySide === 'LEFT' ? 'RIGHT' : 'LEFT';

    const healthyIndices = buildIndices(healthySide);
    const phantomIndices = buildIndices(ampSide);

    healthyIndices.healthyShIdx = healthyIndices.shIdx;
    healthyIndices.healthyElIdx = healthyIndices.elIdx;
    healthyIndices.healthyWrIdx = healthyIndices.wrIdx;
    phantomIndices.healthyShIdx = healthyIndices.shIdx;
    phantomIndices.healthyElIdx = healthyIndices.elIdx;
    phantomIndices.healthyWrIdx = healthyIndices.wrIdx;

    const healthyHand = healthySide === 'LEFT' ? leftHand : rightHand;
    const phantomHandData = ampSide === 'LEFT' ? leftHand : rightHand;

    const healthyPayload = { side: healthySide, pose: poseLandmarks, hand: healthyHand, indices: healthyIndices, level: assessLevel(poseLandmarks, healthyIndices) };
    const phantomPayload = { side: ampSide, pose: poseLandmarks, hand: phantomHandData, indices: phantomIndices, level: assessLevel(poseLandmarks, phantomIndices) };

    const real = healthyHandRef.current.update(healthyPayload, cameraRef.current, false);
    const phantom = phantomHandRef.current.update(phantomPayload, cameraRef.current, true);

    const now = performance.now();
    if (onLandmarksUpdate && now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
      const phantom2D = buildPhantom2D(poseLandmarks, healthyHand, healthyIndices, phantomIndices);
      onLandmarksUpdate({ real, phantom, phantom2D });
      lastUiUpdateRef.current = now;
    }
  }, [configRef, onLandmarksUpdate, hideArm]);

  const initMediaPipe = useCallback((videoEl) => {
    if (!window.Holistic || !window.Camera) {
      console.error("Critical: Global assets CDN components missing.");
      return false;
    }

    const holistic = new window.Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
    });

    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    holistic.onResults((results) => {
      processHolisticData(results);
    });

    holisticRef.current = holistic;

    const triggerCamera = async () => {
      try {
        const cam = new window.Camera(videoEl, {
          width: 1280,
          height: 720,
          onFrame: async () => {
            if (videoEl && !videoEl.paused && videoEl.readyState >= 2) {
              try {
                await holistic.send({ image: videoEl });
              } catch (ex) {
                console.warn("Processing execution pipeline skipped frame", ex);
              }
            }
          }
        });
        mpCamRef.current = cam;
        await cam.start();
        return;
      } catch (err) {
        console.warn("MediaPipe Camera start failed, falling back to navigator.getUserMedia:", err);
      }

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('getUserMedia not available');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});
        console.info('Fallback media stream started', stream);

        const manualLoop = async () => {
          if (videoEl && !videoEl.paused && videoEl.readyState >= 2) {
            try {
              await holistic.send({ image: videoEl });
            } catch (ex) {
              console.warn('Manual pipeline skipped frame', ex);
            }
          }
          const _id = requestAnimationFrame(manualLoop);
          if (mpCamRef.current) mpCamRef.current._manualId = _id;
        };

        mpCamRef.current = { _manualStream: stream, _manualId: null, stop: () => {
          try { stream.getTracks().forEach(t => t.stop()); } catch(_){}
          if (mpCamRef.current && mpCamRef.current._manualId) cancelAnimationFrame(mpCamRef.current._manualId);
        } };
        manualLoop();
      } catch (fallbackErr) {
        console.error('Camera fallback failed:', fallbackErr);
      }
    };

    triggerCamera();
    videoEl.onloadedmetadata = () => {
      if (!mpCamRef.current) {
        triggerCamera();
      }
    };

    return true;
  }, [processHolisticData]);

  const destroy = useCallback(() => {
    stopRenderLoop();
    mpCamRef.current?.stop?.();
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