import { useRef, useCallback } from 'react';
import * as THREE from 'three';

// MediaPipe bone connectivity — matches the 21-landmark hand model
const BONE_PAIRS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // Index
  [5, 9], [9, 10], [10, 11], [11, 12],     // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // Ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // Pinky
  [0, 17],                                   // Palm arch
];

// Exponential smoothing factors
const SMOOTHING_ALPHA      = 0.42;
const POSE_SMOOTHING_ALPHA = 0.28;

// ─── helpers ─────────────────────────────────────────────────────────────────

function placeSegment(mesh, start, end) {
  const up  = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len <= 0.001) { mesh.visible = false; return; }
  mesh.position.copy(start).add(dir.multiplyScalar(0.5));
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(up, new THREE.Vector3().subVectors(end, start).normalize());
  mesh.visible = true;
}

function smoothVector(current, next, alpha) {
  current.x += (next.x - current.x) * alpha;
  current.y += (next.y - current.y) * alpha;
  current.z += (next.z - current.z) * alpha;
  return current;
}

/**
 * Convert a normalised MediaPipe hand landmark (x ∈ [0,1], y ∈ [0,1])
 * to Three.js world-space, applying a CONTRALATERAL mirror on X so the
 * phantom arm always occupies the opposite side from the real hand.
 *
 * Standard MediaPipe: x=0 is the RIGHT edge of the camera frame.
 * We flip X first (mirroredX = 1 - lm.x) so the ghost wrist ends up on
 * the opposite side, then scale to world coords.
 */
function landmarkToWorldMirrored(lm, scale = 1) {
  const mirroredX = lm.x;                        // <-- contralateral flip
  return new THREE.Vector3(
    (mirroredX - 0.5) * 8.5 * scale,
    (0.5     - lm.y) * 6.5 * scale,
    -(lm.z   || 0)   * 4.5 * scale - 1.5
  );
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useMirrorEngine({ configRef, onLandmarksUpdate }) {

  // Three.js core
  const sceneRef    = useRef(null);
  const cameraRef   = useRef(null);
  const rendererRef = useRef(null);
  const clockRef    = useRef(null);
  const rafRef      = useRef(null);

  // Ghost-arm meshes
  const jointsRef   = useRef([]);
  const bonesRef    = useRef([]);
  const palmRef     = useRef(null);
  const forearmRef  = useRef(null);
  const upperArmRef = useRef(null);
  const shoulderRef = useRef(null);
  const sleeveMaterialRef = useRef(null);

  // Smoothed hand landmark positions (21 joints)
  const smoothedRef = useRef(
    Array.from({ length: 21 }, () => new THREE.Vector3())
  );

  // Stable shoulder anchor — set once from the first good pose frame and then
  // held fixed so the arm never floats away from the body.
  const shoulderAnchorRef  = useRef(null);   // THREE.Vector3 | null
  const shoulderLockedRef  = useRef(false);

  // Current smoothed elbow position (for forearm segment)
  const smoothedElbowRef   = useRef(new THREE.Vector3());
  const elbowReadyRef      = useRef(false);

  // MediaPipe instances
  const handsRef       = useRef(null);
  const mpCamRef       = useRef(null);
  const sampleCanvasRef = useRef(null);

  // ─── THREE.JS INITIALISATION ───────────────────────────────────────────────

  const initThreeJS = useCallback((canvasEl, containerEl) => {
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0.5, 8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 4, 5);
    scene.add(dir);

    const toneHex   = configRef.current.skinToneSliderHex || '#aa3bff';
    const toneColor = new THREE.Color(toneHex);

    // ── Joint spheres ────────────────────────────────────────────────────────
    const jointGeo = new THREE.SphereGeometry(0.095, 16, 16);
    const jointMat = new THREE.MeshPhongMaterial({
      color: toneColor, emissive: toneColor, emissiveIntensity: 0.26,
      shininess: 120, transparent: true, opacity: 0.58,
    });
    jointsRef.current = Array.from({ length: 21 }, () => {
      const m = new THREE.Mesh(jointGeo, jointMat);
      m.visible = false;
      scene.add(m);
      return m;
    });

    // ── Bone cylinders ───────────────────────────────────────────────────────
    const boneMat = new THREE.MeshPhongMaterial({
      color: toneColor, emissive: toneColor, emissiveIntensity: 0.2,
      transparent: true, opacity: 0.5,
    });
    bonesRef.current = BONE_PAIRS.map(pair => {
      const geo = new THREE.CylinderGeometry(0.045, 0.045, 1, 10);
      const m   = new THREE.Mesh(geo, boneMat);
      m.visible = false;
      scene.add(m);
      return { mesh: m, pair };
    });

    // ── Arm segment materials ─────────────────────────────────────────────────
    const limbMat = new THREE.MeshPhongMaterial({
      color: toneColor, emissive: toneColor, emissiveIntensity: 0.08,
      transparent: true, opacity: 0.5, shininess: 65,
    });
    const sleeveMat = new THREE.MeshPhongMaterial({
      color: 0x171922, emissive: 0x080912, emissiveIntensity: 0.05,
      transparent: true, opacity: 0.72, shininess: 35,
    });
    sleeveMaterialRef.current = sleeveMat;

    // Palm blob
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), limbMat.clone());
    palm.scale.set(0.9, 0.58, 0.28);
    palm.visible = false;
    scene.add(palm);
    palmRef.current = palm;

    // Forearm
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.29, 1, 18), sleeveMat.clone());
    forearm.visible = false;
    scene.add(forearm);
    forearmRef.current = forearm;

    // Upper arm
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1, 18), sleeveMat.clone());
    upperArm.visible = false;
    scene.add(upperArm);
    upperArmRef.current = upperArm;

    // Shoulder sphere — rendered at a FIXED anchor; never moves once set
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), sleeveMat.clone());
    shoulder.scale.set(1.0, 0.82, 0.7);
    shoulder.visible = false;
    scene.add(shoulder);
    shoulderRef.current = shoulder;

    // Reset per-session state
    shoulderAnchorRef.current = null;
    shoulderLockedRef.current = false;
    elbowReadyRef.current     = false;

    clockRef.current = new THREE.Clock();

    // Resize handler
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

  // ─── RENDER LOOP ──────────────────────────────────────────────────────────

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

  // ─── COLOUR SAMPLER ───────────────────────────────────────────────────────

  const sampleSleeveColor = useCallback((videoEl, posePoint) => {
    const mat = sleeveMaterialRef.current;
    if (!mat || !videoEl?.videoWidth || !posePoint) return;
    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement('canvas');
      sampleCanvasRef.current.width  = 1;
      sampleCanvasRef.current.height = 1;
    }
    const canvas = sampleCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const sx = Math.max(0, Math.min(videoEl.videoWidth  - 1, posePoint.x * videoEl.videoWidth));
    const sy = Math.max(0, Math.min(videoEl.videoHeight - 1, (posePoint.y + 0.08) * videoEl.videoHeight));
    try {
      ctx.drawImage(videoEl, sx, sy, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const sampled = new THREE.Color(r / 255, g / 255, b / 255);
      mat.color.lerp(sampled, 0.08);
      mat.emissive.copy(mat.color).multiplyScalar(0.18);
    } catch (_) {}
  }, []);

  // ─── LANDMARK → GHOST ARM (core logic) ───────────────────────────────────
  /**
   * amputationLevel values (from DB / configRef):
   *   "ELBOW"  — transhumeral  → show shoulder + upper arm ONLY
   *   "WRIST"  — transradial   → show shoulder + upper arm + forearm
   *   anything else / "FULL"   → show full arm + hand joints
   */
  const applyLandmarks = useCallback((landmarks) => {
    const scale  = configRef.current.meshScaleMultiplier || 1.0;
    const level  = (configRef.current.amputationLevel || 'FULL').toUpperCase();
    const showHand    = level !== 'ELBOW' && level !== 'WRIST';
    const showForearm = level !== 'ELBOW';

    const smoothed = smoothedRef.current;
    const joints   = jointsRef.current;
    const bones    = bonesRef.current;
    const palm     = palmRef.current;
    const forearm  = forearmRef.current;
    const upperArm = upperArmRef.current;
    const shoulder = shoulderRef.current;

    // ── 1. Map each hand landmark to a CONTRALATERAL world position ──────────
    landmarks.forEach((lm, idx) => {
      const target = landmarkToWorldMirrored(lm, scale);
      smoothVector(smoothed[idx], target, SMOOTHING_ALPHA);
      joints[idx].position.copy(smoothed[idx]);
      joints[idx].visible = showHand;
    });

    // ── 2. Bones (only if showing hand) ──────────────────────────────────────
    const up = new THREE.Vector3(0, 1, 0);
    bones.forEach(({ mesh, pair }) => {
      if (!showHand) { mesh.visible = false; return; }
      const [ai, bi] = pair;
      const start = smoothed[ai];
      const end   = smoothed[bi];
      const dir   = new THREE.Vector3().subVectors(end, start);
      const len   = dir.length();
      mesh.position.copy(start).add(dir.clone().multiplyScalar(0.5));
      mesh.scale.set(1, len, 1);
      if (len > 0.001) mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      mesh.visible = true;
    });

    // ── 3. Palm blob ──────────────────────────────────────────────────────────
    if (palm) {
      if (showHand) {
        const wrist    = smoothed[0];
        const mid      = smoothed[9];
        const indexMcp = smoothed[5];
        const pinkyMcp = smoothed[17];
        const palmCenter = new THREE.Vector3()
          .add(wrist).add(mid).add(indexMcp).add(pinkyMcp)
          .multiplyScalar(0.25);
        palm.position.copy(palmCenter);
        palm.lookAt(mid);
        palm.visible = true;
      } else {
        palm.visible = false;
      }
    }

    // ── 4. Stable shoulder anchor ─────────────────────────────────────────────
    // Derive an anatomically correct shoulder position from the wrist landmark.
    // We lock it after the first frame so it never drifts.
    const wrist = smoothed[0];
    const mid   = smoothed[9];

    if (!shoulderLockedRef.current) {
      // Build a first-frame estimate of where the phantom shoulder should be.
      const side     = (configRef.current.amputationSide || 'LEFT').toUpperCase();
      const xSign    = side === 'LEFT' ? -1 : 1;   // phantom is on opposite side
      const anchor   = new THREE.Vector3(
        xSign * 2.35 * scale,   // fixed lateral offset from centre
        1.45  * scale,          // shoulder height
        wrist.z - 0.2           // match rough depth of the scene
      );
      shoulderAnchorRef.current = anchor;
      shoulderLockedRef.current = true;
    }

    const anchoredShoulder = shoulderAnchorRef.current;

    if (shoulder) {
      shoulder.position.copy(anchoredShoulder);
      shoulder.visible = true;
    }

    // ── 5. Elbow position (computed from wrist direction + shoulder anchor) ──
    // We project the elbow along the line from the shoulder toward the wrist,
    // placing it at ~55% of the way — a natural anatomical proportion.
    if (showForearm || !showHand) {
      const toWrist = new THREE.Vector3().subVectors(wrist, anchoredShoulder);
      const toWristLen = toWrist.length();
      const elbowPos = anchoredShoulder.clone().add(
        toWrist.clone().normalize().multiplyScalar(toWristLen * 0.52)
      );
      smoothVector(smoothedElbowRef.current, elbowPos, POSE_SMOOTHING_ALPHA * 2);
      elbowReadyRef.current = true;
    }

    const elbow = smoothedElbowRef.current;

    // ── 6. Upper arm segment ──────────────────────────────────────────────────
    if (upperArm) {
      placeSegment(upperArm, anchoredShoulder, elbow);
    }

    // ── 7. Forearm segment ───────────────────────────────────────────────────
    if (forearm) {
      if (showForearm) {
        placeSegment(forearm, elbow, wrist);
      } else {
        forearm.visible = false;
      }
    }

    // Pass smoothed landmarks up to TherapyGame for collision detection
    if (onLandmarksUpdate) onLandmarksUpdate(smoothed);
  }, [configRef, onLandmarksUpdate]);

  // ─── HIDE ALL ARM PARTS ──────────────────────────────────────────────────

  const hideArm = useCallback(() => {
    jointsRef.current.forEach(j  => { j.visible = false; });
    bonesRef.current.forEach(({ mesh }) => { mesh.visible = false; });
    if (palmRef.current)     palmRef.current.visible     = false;
    if (forearmRef.current)  forearmRef.current.visible  = false;
    if (upperArmRef.current) upperArmRef.current.visible = false;
    if (shoulderRef.current) shoulderRef.current.visible = false;
  }, []);

  // ─── MEDIAPIPE INITIALISATION ─────────────────────────────────────────────

  const initMediaPipe = useCallback((videoEl) => {
    if (!window.Hands || !window.Camera) {
      console.error(
        '[useMirrorEngine] window.Hands / window.Camera not found. ' +
        'Make sure index.html loads /mediapipe/hands/hands.js and ' +
        '/mediapipe/camera_utils/camera_utils.js BEFORE the React bundle.'
      );
      return false;
    }

    const hands = new window.Hands({
      locateFile: (file) => `/mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    hands.onResults((results) => {
      if (results.multiHandLandmarks?.length > 0) {
        applyLandmarks(results.multiHandLandmarks[0]);
      } else {
        hideArm();
      }
    });
    handsRef.current = hands;

    const mpCam = new window.Camera(videoEl, {
      onFrame: async () => {
        if (handsRef.current) {
          await handsRef.current.send({ image: videoEl });
        }
      },
      width: 640,
      height: 480,
    });
    mpCamRef.current = mpCam;
    mpCam.start().catch((err) => {
      console.error('[useMirrorEngine] Camera start failed:', err);
    });

    return true;
  }, [applyLandmarks, hideArm]);

  // ─── CLEANUP ──────────────────────────────────────────────────────────────

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
    sceneRef.current  = null;
    cameraRef.current = null;
    // Reset session-specific state
    shoulderAnchorRef.current = null;
    shoulderLockedRef.current = false;
    elbowReadyRef.current     = false;
  }, [stopRenderLoop]);

  return {
    sceneRef,
    cameraRef,
    smoothedRef,
    initThreeJS,
    startRenderLoop,
    stopRenderLoop,
    initMediaPipe,
    destroy,
  };
}
