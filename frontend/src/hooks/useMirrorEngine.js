import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { HandModel3D } from '../utils/HandModel3D';

function getPoseIdx(side) {
  return side === 'LEFT'
    ? { sh: 11, el: 13, wr: 15 }
    : { sh: 12, el: 14, wr: 16 };
}

export function useMirrorEngine({ configRef, onLandmarksUpdate }) {
  const sceneRef    = useRef(null);
  const cameraRef   = useRef(null);
  const rendererRef = useRef(null);
  const clockRef    = useRef(null);
  const rafRef      = useRef(null);

  const healthyHandRef = useRef(null);
  const phantomHandRef = useRef(null);

  const holisticRef = useRef(null);
  const mpCamRef    = useRef(null);
  const videoElRef = useRef(null);

  const lastPoseRef   = useRef(null);
  const lastPoseMsRef = useRef(0);
  const POSE_PERSIST_MS = 500;

  const lastUiUpdateRef = useRef(0);
  const UI_UPDATE_INTERVAL_MS = 60;

  const getVideoRect = useCallback(() => {
    const videoEl  = videoElRef.current;
    const renderer = rendererRef.current;
    if (!videoEl || !renderer) return null;

    const cW = renderer.domElement.clientWidth  || window.innerWidth;
    const cH = renderer.domElement.clientHeight || window.innerHeight;
    if (!cW || !cH) return null;

    const vW = videoEl.videoWidth  || 1280;
    const vH = videoEl.videoHeight || 720;
    if (!vW || !vH) return null;

    const vAspect = vW / vH;
    const cAspect = cW / cH;

    let rW, rH, oX, oY;
    if (cAspect > vAspect) {
      rH = cH; rW = cH * vAspect;
      oX = (cW - rW) / 2; oY = 0;
    } else {
      rW = cW; rH = cW / vAspect;
      oX = 0; oY = (cH - rH) / 2;
    }

    return { renderedW: rW, renderedH: rH, offsetX: oX, offsetY: oY, containerW: cW, containerH: cH };
  }, []);

  const initThreeJS = useCallback((canvasEl, containerEl) => {
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 100);
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
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(4, 8, 6);
    dirLight.castShadow = true;
    scene.add(dirLight);

    healthyHandRef.current = new HandModel3D(scene, configRef, 0x00ff00, { visible: false });
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

  const processHolisticData = useCallback((results) => {
    if (!healthyHandRef.current || !phantomHandRef.current || !cameraRef.current) return;

    const now = performance.now();
    let poseLandmarks = results.poseLandmarks;
    if (poseLandmarks) {
      lastPoseRef.current   = poseLandmarks;
      lastPoseMsRef.current = now;
    } else if (lastPoseRef.current && (now - lastPoseMsRef.current) < POSE_PERSIST_MS) {
      poseLandmarks = lastPoseRef.current;
    } else {
      hideArm();
      return;
    }

    const leftHand  = results.leftHandLandmarks  || null;
    const rightHand = results.rightHandLandmarks || null;

    const ampSide     = configRef.current?.amputationSide === 'RIGHT' ? 'RIGHT' : 'LEFT';
    const healthySide = ampSide === 'RIGHT' ? 'LEFT' : 'RIGHT';

    const healthyIdx = getPoseIdx(healthySide);
    const ampIdx     = getPoseIdx(ampSide);

    ampIdx.healthySh = healthyIdx.sh;
    ampIdx.healthyEl = healthyIdx.el;
    ampIdx.healthyWr = healthyIdx.wr;

    const healthyHand = healthySide === 'LEFT' ? leftHand : rightHand;

    if (!poseLandmarks[healthyIdx.sh]) { hideArm(); return; }

    const videoRect = getVideoRect();

    const realPayload = {
      pose:      poseLandmarks,
      hand:      healthyHand,
      indices:   healthyIdx,
      isPhantom: false,
    };
    const phantomPayload = {
      pose:      poseLandmarks,
      hand:      healthyHand,
      indices:   ampIdx,
      isPhantom: true,
    };

    const real    = healthyHandRef.current.update(realPayload,    cameraRef.current, videoRect);
    const phantom = phantomHandRef.current.update(phantomPayload, cameraRef.current, videoRect);

    if (onLandmarksUpdate && (now - lastUiUpdateRef.current) >= UI_UPDATE_INTERVAL_MS) {
      onLandmarksUpdate({ real, phantom, videoRect });
      lastUiUpdateRef.current = now;
    }
  }, [configRef, onLandmarksUpdate, hideArm, getVideoRect]);

  const initMediaPipe = useCallback((videoEl) => {
    if (!window.Holistic || !window.Camera) {
      console.error('MediaPipe CDN assets missing.');
      return false;
    }

    videoElRef.current = videoEl;

    const holistic = new window.Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    });

    holistic.setOptions({
      modelComplexity:        1,
      smoothLandmarks:        true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence:  0.5,
    });

    holistic.onResults((results) => processHolisticData(results));
    holisticRef.current = holistic;

    const triggerCamera = async () => {
      try {
        const cam = new window.Camera(videoEl, {
          width: 1280, height: 720,
          onFrame: async () => {
            if (videoEl && !videoEl.paused && videoEl.readyState >= 2) {
              try { await holistic.send({ image: videoEl }); }
              catch (ex) { console.warn('Holistic skipped frame', ex); }
            }
          },
        });
        mpCamRef.current = cam;
        await cam.start();
        return;
      } catch (err) {
        console.warn('MediaPipe Camera API failed, trying getUserMedia:', err);
      }

      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia unavailable');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 }, audio: false,
        });
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});

        let _manualId = null;
        const manualLoop = async () => {
          if (videoEl && !videoEl.paused && videoEl.readyState >= 2) {
            try { await holistic.send({ image: videoEl }); }
            catch (ex) { console.warn('Manual loop skipped frame', ex); }
          }
          _manualId = requestAnimationFrame(manualLoop);
        };
        mpCamRef.current = {
          stop: () => {
            stream.getTracks().forEach(t => t.stop());
            if (_manualId) cancelAnimationFrame(_manualId);
          },
        };
        manualLoop();
      } catch (fbErr) {
        console.error('Camera fallback failed:', fbErr);
      }
    };

    triggerCamera();
    videoEl.onloadedmetadata = () => { if (!mpCamRef.current) triggerCamera(); };
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
    sceneRef.current  = null;
    cameraRef.current = null;
  }, [stopRenderLoop]);

  return { sceneRef, cameraRef, initThreeJS, startRenderLoop, stopRenderLoop, initMediaPipe, hideArm, destroy };
}