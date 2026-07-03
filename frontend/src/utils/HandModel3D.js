import * as THREE from 'three';

// ─── One-Euro-inspired adaptive low-pass filter ───────────────────────────────
class AdaptiveFilter1D {
  constructor(minCutoff = 1.0, beta = 0.05, dCutoff = 1.0, hz = 30) {
    this.minCutoff = minCutoff; this.beta = beta;
    this.dCutoff = dCutoff; this.hz = hz;
    this._x = null; this._dx = 0;
  }
  _alpha(cutoff) {
    const te = 1.0 / this.hz, tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }
  filter(x) {
    if (this._x === null) { this._x = x; return x; }
    const dx = (x - this._x) * this.hz;
    this._dx = this._dx + this._alpha(this.dCutoff) * (dx - this._dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this._dx);
    this._x = this._x + this._alpha(cutoff) * (x - this._x);
    return this._x;
  }
  reset() { this._x = null; this._dx = 0; }
}

class AdaptiveFilter3D {
  constructor(minCutoff = 1.0, beta = 0.05) {
    this.fx = new AdaptiveFilter1D(minCutoff, beta);
    this.fy = new AdaptiveFilter1D(minCutoff, beta);
    this.fz = new AdaptiveFilter1D(minCutoff, beta);
  }
  filter(x, y, z) { return [this.fx.filter(x), this.fy.filter(y), this.fz.filter(z)]; }
  reset() { this.fx.reset(); this.fy.reset(); this.fz.reset(); }
}

// ─── Phantom joint visibility per amputation level ────────────────────────────
// Joints:  0-20 = hand landmarks   21 = shoulder   22 = elbow   23 = wrist
//
//  TRANSHUMERAL (Above Elbow):      shoulder + elbow + wrist + hand  [full arm]
//  TRANSRADIAL  (Below Elbow):               elbow + wrist + hand
//  WRIST_DISARTICULATION:                             wrist + hand
//  FINGERS_ONLY:                                              hand   [only digits]
//
const _HAND = Array.from({ length: 21 }, (_, i) => i);  // [0..20]
const PHANTOM_VISIBLE = {
  TRANSHUMERAL:          new Set([21, 22, 23, ..._HAND]),
  TRANSRADIAL:           new Set([    22, 23, ..._HAND]),
  WRIST_DISARTICULATION: new Set([        23, ..._HAND]),
  FINGERS_ONLY:          new Set([            ..._HAND]),
};

// ─── HandModel3D ─────────────────────────────────────────────────────────────
export class HandModel3D {
  constructor(scene, configRef, color = 0x00ffff, options = {}) {
    this.scene     = scene;
    this.configRef = configRef;
    this.options   = options;

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.group.visible = this.options.visible !== false;

    this.jointGeo = new THREE.SphereGeometry(0.07, 16, 12);
    this.jointMat = new THREE.MeshBasicMaterial({
      color, wireframe: true, transparent: true, opacity: 0.85,
    });

    // 21 hand joints + 3 structural nodes (Shoulder=21, Elbow=22, Wrist=23)
    this.jointCount = 24;
    this.jointMesh  = new THREE.InstancedMesh(this.jointGeo, this.jointMat, this.jointCount);
    this.jointMesh.frustumCulled = false;
    this.group.add(this.jointMesh);

    this._dummy = new THREE.Object3D();

    this.smoothedPositions = Array.from({ length: this.jointCount }, () => new THREE.Vector3());
    this.filters    = Array.from({ length: this.jointCount }, () => new AdaptiveFilter3D(1.2, 0.08));
    this.lastValidMs  = new Array(this.jointCount).fill(0);
    this.initialised  = new Array(this.jointCount).fill(false);
    this.PERSIST_MS   = 450;
    this.JUMP_THRESHOLD = 1.8;
    this.TARGET_Z = 0.0;

    // Active phantom visible-joint set (updated each frame for phantom, null for real)
    this._phantomVis = null;

    this.connections = [
      [21, 22], [22, 23],
      [23, 0],  [23, 5],  [23, 17],
      [0, 1],   [1, 2],   [2, 3],   [3, 4],
      [0, 5],   [5, 6],   [6, 7],   [7, 8],
      [5, 9],   [9, 10],  [10, 11], [11, 12],
      [9, 13],  [13, 14], [14, 15], [15, 16],
      [0, 17],  [17, 18], [18, 19], [19, 20],
    ];

    this.linePositionsArray = new Float32Array(this.connections.length * 2 * 3);
    this.lineGeometry       = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositionsArray, 3));
    this.lineMaterial = new THREE.LineBasicMaterial({
      color, linewidth: 2, transparent: true, opacity: 0.75,
    });
    this.line = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this._ndcVec = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this.VIS_THRESHOLD = 0.45;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  _visible(lm) {
    return lm && (lm.visibility === undefined || lm.visibility > this.VIS_THRESHOLD);
  }

  _project(lm, camera, videoRect) {
    camera.getWorldPosition(this._camPos);

    let vpX, vpY;
    if (videoRect && videoRect.renderedW > 0 && videoRect.containerW > 0) {
      vpX = (lm.x * videoRect.renderedW + videoRect.offsetX) / videoRect.containerW;
      vpY = (lm.y * videoRect.renderedH + videoRect.offsetY) / videoRect.containerH;
    } else {
      vpX = lm.x; vpY = lm.y;
    }

    const ndcX = (1.0 - vpX) * 2.0 - 1.0;
    const ndcY = 1.0 - vpY * 2.0;

    this._ndcVec.set(ndcX, ndcY, 0.5);
    this._ndcVec.unproject(camera);

    const dir  = this._ndcVec.sub(this._camPos).normalize();
    const dist = (this.TARGET_Z - this._camPos.z) / dir.z;
    return new THREE.Vector3(
      this._camPos.x + dir.x * dist,
      this._camPos.y + dir.y * dist,
      this.TARGET_Z,
    );
  }

  _applyToJoint(idx, targetWorld, now) {
    const current = this.smoothedPositions[idx];

    if (!this.initialised[idx]) {
      this.filters[idx].fx._x = targetWorld.x;
      this.filters[idx].fy._x = targetWorld.y;
      this.filters[idx].fz._x = targetWorld.z;
      current.copy(targetWorld);
      this.initialised[idx] = true;
      this.lastValidMs[idx]  = now;
      return;
    }

    if (current.distanceTo(targetWorld) > this.JUMP_THRESHOLD) {
      this.filters[idx].reset();
      current.copy(targetWorld);
      this.lastValidMs[idx] = now;
      return;
    }

    const [fx, fy, fz] = this.filters[idx].filter(targetWorld.x, targetWorld.y, targetWorld.z);
    current.set(fx, fy, fz);
    this.lastValidMs[idx] = now;
  }

  // Skip enforcement for levels where shoulder/elbow are real body parts (already in correct place)
  _enforceArmSegments(level = 'TRANSHUMERAL') {
    if (level === 'WRIST_DISARTICULATION' || level === 'FINGERS_ONLY') return;
    const sh = this.smoothedPositions[21];
    const el = this.smoothedPositions[22];
    const wr = this.smoothedPositions[23];
    const MIN_SEG = level === 'TRANSRADIAL' ? 0.3 : 0.5;

    const shElDist = sh.distanceTo(el);
    if (shElDist < MIN_SEG && shElDist > 0) {
      const dir = new THREE.Vector3().subVectors(el, sh).normalize();
      if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);
      el.copy(sh).addScaledVector(dir, MIN_SEG);
    }

    if (level === 'TRANSHUMERAL') {
      const elWrDist = el.distanceTo(wr);
      if (elWrDist < MIN_SEG) {
        const dir = new THREE.Vector3().subVectors(el, sh).normalize();
        if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);
        wr.copy(el).addScaledVector(dir, MIN_SEG);
      }
    }
  }

  // ── Main update ───────────────────────────────────────────────────────────
  update(armData, camera, videoRect = null) {
    if (!armData || !camera) { this.hideAll(); return null; }
    const { pose, hand, indices, isPhantom } = armData;
    if (!pose) { this.hideAll(); return null; }

    this.group.visible = this.options.visible !== false;
    const now = performance.now();

    const rawJoints = new Array(this.jointCount).fill(null);

    // ── Current amputation level ────────────────────────────────────────────
    const level = isPhantom
      ? (this.configRef.current?.amputationLevel || 'TRANSHUMERAL')
      : null;

    // Update phantom visible-joint set (null for real hand = show all)
    this._phantomVis = isPhantom
      ? (PHANTOM_VISIBLE[level] || PHANTOM_VISIBLE.TRANSHUMERAL)
      : null;

    if (!isPhantom) {
      // ── REAL / HEALTHY hand ─────────────────────────────────────────────
      const hSh = pose[indices.sh];
      const hEl = pose[indices.el];
      const hWr = pose[indices.wr];
      if (!hSh) { this.hideAll(); return null; }

      const handWrist = hand && hand[0] ? hand[0] : null;

      rawJoints[21] = hSh;
      rawJoints[22] = hEl || hSh;
      rawJoints[23] = handWrist || hWr || hEl || hSh;

      if (hand) {
        for (let i = 0; i < 21; i++) rawJoints[i] = hand[i] || null;
      }

    } else {
      // ── PHANTOM hand ────────────────────────────────────────────────────
      const hSh = pose[indices.healthySh];
      const hEl = pose[indices.healthyEl];
      const hWr = pose[indices.healthyWr];
      if (!hSh) { this.hideAll(); return null; }

      const aShRaw = pose[indices.sh];
      const aElRaw = pose[indices.el];
      const aWrRaw = pose[indices.wr];

      // Mirror axis = midpoint between the two shoulders in landmark space
      const centerX = this._visible(aShRaw) ? (hSh.x + aShRaw.x) / 2 : 0.5;
      const reflect  = (lm) => lm
        ? { x: 2 * centerX - lm.x, y: lm.y, z: lm.z || 0 }
        : null;

      // ── Structural joints (21 shoulder, 22 elbow, 23 wrist) ─────────────
      // Always compute all three even if hidden — game logic reads them.
      const shoulderPoint = this._visible(aShRaw) ? aShRaw : reflect(hSh);

      let elbowPoint = null;
      let wristPoint = null;

      switch (level) {

        case 'TRANSHUMERAL': {
          // Full arm: mirror healthy side entirely
          elbowPoint = this._visible(aElRaw) ? aElRaw : (hEl ? reflect(hEl) : null);
          wristPoint = this._visible(aWrRaw) ? aWrRaw : (hWr ? reflect(hWr) : null);

          if (!elbowPoint && shoulderPoint && wristPoint) {
            elbowPoint = {
              x: shoulderPoint.x + (wristPoint.x - shoulderPoint.x) * 0.45,
              y: shoulderPoint.y + (wristPoint.y - shoulderPoint.y) * 0.45, z: 0,
            };
          }
          if (!wristPoint && elbowPoint && shoulderPoint) {
            wristPoint = {
              x: elbowPoint.x + (elbowPoint.x - shoulderPoint.x) * 0.85,
              y: elbowPoint.y + (elbowPoint.y - shoulderPoint.y) * 0.85, z: 0,
            };
          }
          if (!wristPoint) wristPoint = elbowPoint || shoulderPoint;
          break;
        }

        case 'TRANSRADIAL': {
          // Below elbow: real amputated elbow is the stump anchor.
          // Phantom wrist = elbow + reflected healthy forearm vector.
          elbowPoint = this._visible(aElRaw) ? aElRaw : (hEl ? reflect(hEl) : shoulderPoint);

          if (hEl && hWr && elbowPoint) {
            // Reflected forearm direction: x-component negated, y unchanged
            wristPoint = {
              x: elbowPoint.x - (hWr.x - hEl.x),
              y: elbowPoint.y + (hWr.y - hEl.y),
              z: 0,
            };
          } else {
            wristPoint = this._visible(aWrRaw) ? aWrRaw : elbowPoint || shoulderPoint;
          }
          break;
        }

        case 'WRIST_DISARTICULATION': {
          // Real elbow + wrist intact; wrist is the stump anchor for hand phantom.
          elbowPoint = this._visible(aElRaw) ? aElRaw : (hEl ? reflect(hEl) : shoulderPoint);
          wristPoint = this._visible(aWrRaw) ? aWrRaw : (hWr ? reflect(hWr) : elbowPoint);
          break;
        }

        case 'FINGERS_ONLY': {
          // Whole arm intact, only fingers phantom.
          // Use real amputated arm landmarks directly.
          elbowPoint = this._visible(aElRaw) ? aElRaw : (hEl ? reflect(hEl) : shoulderPoint);
          wristPoint = this._visible(aWrRaw) ? aWrRaw : (hWr ? reflect(hWr) : elbowPoint);
          break;
        }

        default: {
          elbowPoint = this._visible(aElRaw) ? aElRaw : (hEl ? reflect(hEl) : null);
          wristPoint = this._visible(aWrRaw) ? aWrRaw : (hWr ? reflect(hWr) : elbowPoint);
          break;
        }
      }

      rawJoints[21] = shoulderPoint;
      rawJoints[22] = elbowPoint || shoulderPoint;
      rawJoints[23] = wristPoint  || elbowPoint || shoulderPoint;

      // ── Hand / finger joints (0-20) ──────────────────────────────────────
      // Strategy: reflect healthy hand, then apply an offset so that hand[0]
      // (the MediaPipe wrist landmark) lines up with the phantom structural wrist.
      //
      // For TRANSHUMERAL we skip the offset (pure reflection, legacy behaviour).
      // For all other levels we anchor to rawJoints[23] so fingers attach to
      // wherever the real stump / computed wrist actually sits in camera space.

      if (hand) {
        const idealWristX = hand[0] ? (2 * centerX - hand[0].x) : null;
        const idealWristY = hand[0] ? hand[0].y : null;

        let offX = 0, offY = 0;
        if (level !== 'TRANSHUMERAL' && rawJoints[23] && idealWristX !== null) {
          offX = rawJoints[23].x - idealWristX;
          offY = rawJoints[23].y - idealWristY;
        }

        for (let i = 0; i < 21; i++) {
          if (hand[i]) {
            rawJoints[i] = {
              x: 2 * centerX - hand[i].x + offX,
              y: hand[i].y + offY,
              z: hand[i].z || 0,
            };
          }
        }
      }
    }

    // ── Project all raw landmarks → world space, apply smoothing ──────────
    for (let idx = 0; idx < this.jointCount; idx++) {
      const lm = rawJoints[idx];
      if (lm) {
        const worldPos = this._project(lm, camera, videoRect);
        this._applyToJoint(idx, worldPos, now);
      }
    }

    this._enforceArmSegments(level || 'TRANSHUMERAL');

    // ── Instance mesh: hide joints outside phantom visible set ─────────────
    const aged = (idx) => (now - this.lastValidMs[idx]) > this.PERSIST_MS;

    for (let idx = 0; idx < this.jointCount; idx++) {
      const inVisSet = !this._phantomVis || this._phantomVis.has(idx);
      const show     = inVisSet && this.initialised[idx] &&
                       !(rawJoints[idx] === null && aged(idx));
      if (show) {
        this._dummy.scale.set(1, 1, 1);
        this._dummy.position.copy(this.smoothedPositions[idx]);
      } else {
        this._dummy.scale.set(0, 0, 0);
      }
      this._dummy.updateMatrix();
      this.jointMesh.setMatrixAt(idx, this._dummy.matrix);
    }
    this.jointMesh.instanceMatrix.needsUpdate = true;

    // ── Line segments: collapse lines where either joint is hidden ─────────
    let lIdx = 0;
    this.connections.forEach(([start, end]) => {
      const pS = this.smoothedPositions[start];
      // If either endpoint is outside the visible set, render as a zero-length
      // degenerate line (invisible) rather than drawing across hidden joints.
      const showLine = !this._phantomVis ||
                       (this._phantomVis.has(start) && this._phantomVis.has(end));
      const pE = showLine ? this.smoothedPositions[end] : pS;

      this.linePositionsArray[lIdx++] = pS.x;
      this.linePositionsArray[lIdx++] = pS.y;
      this.linePositionsArray[lIdx++] = pS.z;
      this.linePositionsArray[lIdx++] = pE.x;
      this.linePositionsArray[lIdx++] = pE.y;
      this.linePositionsArray[lIdx++] = pE.z;
    });
    this.lineGeometry.attributes.position.needsUpdate = true;
    this.line.visible = true;

    return this.smoothedPositions.map(p => ({ x: p.x, y: p.y, z: this.TARGET_Z }));
  }

  hideAll() { this.group.visible = false; }

  destroy() {
    this.scene.remove(this.group);
    this.jointGeo.dispose();
    this.jointMat.dispose();
    this.lineMaterial.dispose();
    this.lineGeometry.dispose();
    this.jointMesh.dispose();
  }
}