import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { HandModel3D } from '../utils/HandModel3D';
import { GLBHandModel3D } from '../utils/GLBHandModel3D';

export function useMirrorEngine({ configRef, onLandmarksUpdate }) {
  // THREE CORE REFERENCES
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const clockRef = useRef(null);
  const rafRef = useRef(null);

  // MODELS CONTROLLERS
  const healthyHandRef = useRef(null);
  const phantomHandRef = useRef(null);

  // PIPELINE STATE MANAGEMENT
  const holisticRef = useRef(null);
  const mpCamRef = useRef(null);

  const lastUiUpdateRef = useRef(0);
  const UI_UPDATE_INTERVAL_MS = 60; // Fluid updates layout

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

    // Initializing custom joint arrays setup mapping
    healthyHandRef.current = new HandModel3D(scene, configRef, 0x00ff00);
    // Use a wireframe joint model for the phantom as well (2D overlay is the primary visualization)
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

    const buildIndices = (side) => {
      // For Mediapipe pose: left shoulder=11,leftElbow=13,leftWrist=15; right shoulder=12,14,16
      const shIdx = side === 'RIGHT' ? 12 : 11;
      const elIdx = side === 'RIGHT' ? 14 : 13;
      const wrIdx = side === 'RIGHT' ? 16 : 15;

      const healthyShIdx = side === 'RIGHT' ? 11 : 12;
      const healthyElIdx = side === 'RIGHT' ? 13 : 14;
      const healthyWrIdx = side === 'RIGHT' ? 15 : 16;

      return { shIdx, elIdx, wrIdx, healthyShIdx, healthyElIdx, healthyWrIdx };
    };

    const assessLevel = (side) => {
      const idx = buildIndices(side);
      const elbowVisible = poseLandmarks[idx.elIdx] && poseLandmarks[idx.elIdx].visibility > 0.45;
      const wristVisible = poseLandmarks[idx.wrIdx] && poseLandmarks[idx.wrIdx].visibility > 0.45;

      if (!elbowVisible) return 'ABOVE_ELBOW';
      if (elbowVisible && !wristVisible) return 'BELOW_ELBOW';
      return 'HAND_ONLY';
    };

    const leftPayload = {
      side: 'LEFT',
      pose: poseLandmarks,
      hand: leftHand,
      indices: buildIndices('LEFT'),
      level: assessLevel('LEFT'),
    };

    const rightPayload = {
      side: 'RIGHT',
      pose: poseLandmarks,
      hand: rightHand,
      indices: buildIndices('RIGHT'),
      level: assessLevel('RIGHT'),
    };

    // Determine which side is healthy vs amputated
    const ampSide = configuredAmpSide;
    const healthySide = ampSide === 'RIGHT' ? 'LEFT' : 'RIGHT';

    const healthyPayload = healthySide === 'LEFT' ? leftPayload : rightPayload;
    const phantomPayload = ampSide === 'LEFT' ? leftPayload : rightPayload;

    // Ensure the healthy payload's indices.healthy* refer to the healthy side itself
    // (models expect indices.healthyShIdx,.. to point to the real arm landmarks when rendering the real hand)
    healthyPayload.indices.healthyShIdx = healthyPayload.indices.shIdx;
    healthyPayload.indices.healthyElIdx = healthyPayload.indices.elIdx;
    healthyPayload.indices.healthyWrIdx = healthyPayload.indices.wrIdx;

    // For the phantom payload, provide healthy-side reference indices so the phantom model can mirror
    phantomPayload.indices.healthyShIdx = healthyPayload.indices.shIdx;
    phantomPayload.indices.healthyElIdx = healthyPayload.indices.elIdx;
    phantomPayload.indices.healthyWrIdx = healthyPayload.indices.wrIdx;

    // Update both models: real visible arm (healthy) and phantom for amputated side
    const real = healthyHandRef.current.update(healthyPayload, cameraRef.current, false);
    const phantom = phantomHandRef.current.update(phantomPayload, cameraRef.current, true);

    const now = performance.now();
    if (onLandmarksUpdate && now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
      // Build a normalized 2D phantom landmark set for overlay rendering (image-space coords)
      const buildPhantom2D = () => {
        const healthyHand = healthyPayload.hand;
        const healthyPose = poseLandmarks;
        const phantomHand = phantomPayload.hand;

        const joints2D = Array.from({ length: 21 }, (_, i) => {
          // prefer existing phantom hand landmarks, else mirror healthy hand via overlay flip (do NOT pre-flip here)
          const ph = phantomHand && phantomHand[i] ? phantomHand[i] : null;
          if (ph) return { x: ph.x, y: ph.y, z: ph.z ?? 0 };
          const hh = healthyHand && healthyHand[i] ? healthyHand[i] : null;
          if (hh) return { x: hh.x, y: hh.y, z: hh.z ?? 0 };
          // fallback to wrist if nothing else
          const hw = healthyHand && healthyHand[0] ? healthyHand[0] : null;
          if (hw) return { x: hw.x, y: hw.y, z: hw.z ?? 0 };
          return null;
        });

        const healthySh = healthyPose && healthyPose[healthyPayload.indices.healthyShIdx] ? healthyPose[healthyPayload.indices.healthyShIdx] : null;
        const healthyEl = healthyPose && healthyPose[healthyPayload.indices.healthyElIdx] ? healthyPose[healthyPayload.indices.healthyElIdx] : null;
        const healthyWr = healthyPose && healthyPose[healthyPayload.indices.healthyWrIdx] ? healthyPose[healthyPayload.indices.healthyWrIdx] : null;

        const shoulder2D = healthySh ? { x: healthySh.x, y: healthySh.y } : null;
        let elbow2D = healthyEl ? { x: healthyEl.x, y: healthyEl.y } : null;
        let wrist2D = healthyWr ? { x: healthyWr.x, y: healthyWr.y } : null;

        // Synthesize missing elbow/wrist if necessary
        if (!elbow2D && shoulder2D && wrist2D) {
          // estimate elbow as point 0.45 along shoulder->wrist
          elbow2D = {
            x: shoulder2D.x + (wrist2D.x - shoulder2D.x) * 0.45,
            y: shoulder2D.y + (wrist2D.y - shoulder2D.y) * 0.45
          };
        }

        if (!wrist2D && elbow2D && shoulder2D) {
          // estimate wrist as extension from shoulder through elbow
          wrist2D = {
            x: elbow2D.x + (elbow2D.x - shoulder2D.x) * 0.9,
            y: elbow2D.y + (elbow2D.y - shoulder2D.y) * 0.9
          };
        }

        return { joints: joints2D, shoulder: shoulder2D, elbow: elbow2D, wrist: wrist2D };
      };

      const phantom2D = buildPhantom2D();
      console.debug('phantom2D debug', { ampSide, healthySide, phantomHasHand: !!phantomPayload.hand, healthyHasHand: !!healthyPayload.hand, shoulder: phantom2D.shoulder, elbow: phantom2D.elbow, wrist: phantom2D.wrist });
      onLandmarksUpdate({ real, phantom, phantom2D });
      lastUiUpdateRef.current = now;
    }
  }, [configRef, onLandmarksUpdate]);

  const hideArm = useCallback(() => {
    healthyHandRef.current?.hideAll();
    phantomHandRef.current?.hideAll();
  }, []);

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

      // Fallback: explicit getUserMedia + manual frame loop
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('getUserMedia not available');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});
        console.info('Fallback media stream started', stream);

        // Manual loop feeding frames to MediaPipe
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

    // Start camera immediately; if metadata fires later the trigger will be idempotent
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