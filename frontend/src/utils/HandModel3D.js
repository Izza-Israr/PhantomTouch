import * as THREE from 'three';

// ─── One-Euro-inspired adaptive low-pass filter for a single scalar ──────────
class AdaptiveFilter1D {
  constructor(minCutoff = 1.0, beta = 0.05, dCutoff = 1.0, hz = 30) {
    this.minCutoff = minCutoff;
    this.beta      = beta;
    this.dCutoff   = dCutoff;
    this.hz        = hz;
    this._x        = null;
    this._dx       = 0;
  }
  _alpha(cutoff) {
    const te  = 1.0 / this.hz;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }
  filter(x) {
    if (this._x === null) { this._x = x; return x; }
    const dx   = (x - this._x) * this.hz;
    this._dx   = this._dx + this._alpha(this.dCutoff) * (dx - this._dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this._dx);
    this._x    = this._x + this._alpha(cutoff) * (x - this._x);
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
    this.jointMat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 });

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
    this.lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.75 });
    this.line         = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this._ndcVec = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this.VIS_THRESHOLD = 0.45;
  }

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
      vpX = lm.x;
      vpY = lm.y;
    }

    const screenX = 1.0 - vpX;
    const ndcX    = screenX * 2.0 - 1.0;
    const ndcY    = 1.0 - vpY * 2.0;

    this._ndcVec.set(ndcX, ndcY, 0.5);
    this._ndcVec.unproject(camera);

    const dir  = this._ndcVec.sub(this._camPos).normalize();
    const dist = (this.TARGET_Z - this._camPos.z) / dir.z;
    const wx   = this._camPos.x + dir.x * dist;
    const wy   = this._camPos.y + dir.y * dist;

    return new THREE.Vector3(wx, wy, this.TARGET_Z);
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

    // Snaps cleanly to new configurations instead of locking the tracking stream
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

  _enforceArmSegments() {
    const sh = this.smoothedPositions[21];
    const el = this.smoothedPositions[22];
    const wr = this.smoothedPositions[23];
    const MIN_SEG = 0.5;

    const shElDist = sh.distanceTo(el);
    if (shElDist < MIN_SEG && shElDist > 0) {
      const dir = new THREE.Vector3().subVectors(el, sh).normalize();
      if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);
      el.copy(sh).addScaledVector(dir, MIN_SEG);
    }

    const elWrDist = el.distanceTo(wr);
    if (elWrDist < MIN_SEG) {
      const dir = new THREE.Vector3().subVectors(el, sh).normalize();
      if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);
      wr.copy(el).addScaledVector(dir, MIN_SEG);
    }
  }

  update(armData, camera, videoRect = null) {
    if (!armData || !camera) { this.hideAll(); return null; }
    const { pose, hand, indices, isPhantom } = armData;
    if (!pose) { this.hideAll(); return null; }

    this.group.visible = this.options.visible !== false;
    const now = performance.now();

    const rawJoints = new Array(this.jointCount).fill(null);

    if (!isPhantom) {
      const hSh = pose[indices.sh];
      const hEl = pose[indices.el];
      const hWr = pose[indices.wr];
      if (!hSh) { this.hideAll(); return null; }

      const handWrist = (hand && hand[0]) ? hand[0] : null;

      rawJoints[21] = hSh;
      rawJoints[22] = hEl || hSh;
      rawJoints[23] = handWrist || hWr || hEl || hSh;

      if (hand) {
        for (let i = 0; i < 21; i++) {
          rawJoints[i] = hand[i] || null;
        }
      }

    } else {
      const hSh = pose[indices.healthySh];
      const hEl = pose[indices.healthyEl];
      const hWr = pose[indices.healthyWr];
      if (!hSh) { this.hideAll(); return null; }

      const aShRaw = pose[indices.sh];
      const aElRaw = pose[indices.el];
      const aWrRaw = pose[indices.wr];

      const centerX = this._visible(aShRaw) ? (hSh.x + aShRaw.x) / 2 : 0.5;
      const reflect  = (lm) => lm ? { x: 2 * centerX - lm.x, y: lm.y, z: lm.z || 0 } : null;

      const shoulderPoint = this._visible(aShRaw) ? aShRaw : reflect(hSh);
      let   elbowPoint    = this._visible(aElRaw) ? aElRaw : (hEl ? reflect(hEl) : null);
      let   wristPoint    = this._visible(aWrRaw) ? aWrRaw : (hWr ? reflect(hWr) : null);

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

      rawJoints[21] = shoulderPoint;
      rawJoints[22] = elbowPoint || shoulderPoint;
      rawJoints[23] = wristPoint;

      // Clean, mirror projection mapping across alignment plane
      for (let i = 0; i < 21; i++) {
        if (hand && hand[i]) {
          rawJoints[i] = {
            x: 2 * centerX - hand[i].x,
            y: hand[i].y,
            z: hand[i].z || 0,
          };
        }
      }
    }

    for (let idx = 0; idx < this.jointCount; idx++) {
      const lm = rawJoints[idx];
      if (lm) {
        const worldPos = this._project(lm, camera, videoRect);
        this._applyToJoint(idx, worldPos, now);
      }
    }

    this._enforceArmSegments();

    const aged = (idx) => (now - this.lastValidMs[idx]) > this.PERSIST_MS;

    for (let idx = 0; idx < this.jointCount; idx++) {
      if (!this.initialised[idx] || (rawJoints[idx] === null && aged(idx))) {
        this._dummy.scale.set(0, 0, 0);
      } else {
        this._dummy.scale.set(1, 1, 1);
        this._dummy.position.copy(this.smoothedPositions[idx]);
      }
      this._dummy.updateMatrix();
      this.jointMesh.setMatrixAt(idx, this._dummy.matrix);
    }
    this.jointMesh.instanceMatrix.needsUpdate = true;

    let lIdx = 0;
    this.connections.forEach(([start, end]) => {
      const pS = this.smoothedPositions[start];
      const pE = this.smoothedPositions[end];
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