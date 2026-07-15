import * as THREE from 'three';

// ─── One-Euro-inspired adaptive low-pass filter for a single scalar ──────────
class AdaptiveFilter1D {
  constructor(minCutoff = 1.0, beta = 0.05, dCutoff = 1.0, hz = 30) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.hz = hz;
    this._x = null;
    this._dx = 0;
  }
  _alpha(cutoff) {
    const te = 1.0 / this.hz;
    const tau = 1.0 / (2 * Math.PI * cutoff);
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

const FINGER_CHAINS = {
  THUMB: [1, 2, 3, 4],
  INDEX: [5, 6, 7, 8],
  MIDDLE: [9, 10, 11, 12],
  RING: [13, 14, 15, 16],
  PINKY: [17, 18, 19, 20],
};

const ALL_FINGERS = Object.keys(FINGER_CHAINS);

function normalizeAmputationLevel(level) {
  switch (level) {
    case 'TRANSHUMERAL':
    case 'ABOVE_ELBOW':
      return 'ABOVE_ELBOW';
    case 'TRANSRADIAL':
    case 'BELOW_ELBOW':
      return 'BELOW_ELBOW';
    case 'WRIST_DISARTICULATION':
    case 'WRIST':
      return 'WRIST';
    case 'FINGER_AMPUTATION':
    case 'FINGERS':
      return 'FINGERS';
    default:
      return 'BELOW_ELBOW';
  }
}

function getMissingFingerList(configured) {
  if (!Array.isArray(configured) || configured.length === 0) return ALL_FINGERS;
  const normalized = configured.map(finger => String(finger).toUpperCase());
  return normalized.filter(finger => FINGER_CHAINS[finger]);
}

function getMissingFingers(configRef, side = null) {
  const current = configRef.current || {};
  const isBilateral = current.amputationSide === 'BILATERAL';
  const configured = isBilateral
    ? (String(side).toUpperCase() === 'RIGHT' ? current.rightMissingFingers : current.leftMissingFingers)
    : current.missingFingers;
  return getMissingFingerList(configured);
}

export function resolveAmputationSettingsForSide(configRef, side = null) {
  const current = configRef.current || {};
  const isBilateral = current.amputationSide === 'BILATERAL';
  const sideName = String(side || '').toUpperCase();
  const levelValue = isBilateral
    ? (sideName === 'RIGHT' ? current.rightAmputationLevel : current.leftAmputationLevel)
    : current.amputationLevel;
  return {
    level: normalizeAmputationLevel(levelValue),
    missingFingers: getMissingFingers(configRef, side),
  };
}

// ─── HandModel3D ─────────────────────────────────────────────────────────────
export class HandModel3D {
  constructor(scene, configRef, color = 0x00ffff, options = {}) {
    this.scene = scene;
    this.configRef = configRef;
    this.options = options;

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.group.visible = this.options.visible !== false;

    this.jointGeo = new THREE.SphereGeometry(0.07, 16, 12);
    this.jointMat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.85 });

    // 21 hand joints + 3 structural nodes (Shoulder=21, Elbow=22, Wrist=23)
    this.jointCount = 24;
    this.jointMesh = new THREE.InstancedMesh(this.jointGeo, this.jointMat, this.jointCount);
    this.jointMesh.frustumCulled = false;
    this.group.add(this.jointMesh);

    this._dummy = new THREE.Object3D();

    this.smoothedPositions = Array.from({ length: this.jointCount }, () => new THREE.Vector3());
    this.filters = Array.from({ length: this.jointCount }, () => new AdaptiveFilter3D(1.2, 0.08));
    this.lastValidMs = new Array(this.jointCount).fill(0);
    this.initialised = new Array(this.jointCount).fill(false);
    this.PERSIST_MS = 450;
    this.JUMP_THRESHOLD = 1.8;
    this.TARGET_Z = 0.0;

    this.connections = [
      [21, 22], [22, 23],
      [23, 0], [23, 5], [23, 17],
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
    ];

    this.linePositionsArray = new Float32Array(this.connections.length * 2 * 3);
    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositionsArray, 3));
    this.lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.75 });
    this.line = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this._ndcVec = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this.VIS_THRESHOLD = 0.45;
    this.renderMask = new Array(this.jointCount).fill(true);
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
    const ndcX = screenX * 2.0 - 1.0;
    const ndcY = 1.0 - vpY * 2.0;

    this._ndcVec.set(ndcX, ndcY, 0.5);
    this._ndcVec.unproject(camera);

    const dir = this._ndcVec.sub(this._camPos).normalize();
    const dist = (this.TARGET_Z - this._camPos.z) / dir.z;
    const wx = this._camPos.x + dir.x * dist;
    const wy = this._camPos.y + dir.y * dist;

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
      this.lastValidMs[idx] = now;
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

  _setRenderMask(mask) {
    this.renderMask.fill(false);
    mask.forEach((idx) => {
      if (idx >= 0 && idx < this.jointCount) this.renderMask[idx] = true;
    });
  }

  _mirrorAroundCenter(lm, centerX) {
    return lm ? { x: 2 * centerX - lm.x, y: lm.y, z: lm.z || 0 } : null;
  }

  _offsetFromAnchor(source, sourceAnchor, targetAnchor, mirrorX = true) {
    if (!source || !sourceAnchor || !targetAnchor) return null;
    const dx = source.x - sourceAnchor.x;
    return {
      x: targetAnchor.x + (mirrorX ? -dx : dx),
      y: targetAnchor.y + (source.y - sourceAnchor.y),
      z: (targetAnchor.z || 0) + ((source.z || 0) - (sourceAnchor.z || 0)),
    };
  }

  _buildHandFromHealthy(rawJoints, healthyHand, targetWrist) {
    if (!healthyHand || !healthyHand[0] || !targetWrist) return;
    rawJoints[0] = targetWrist;
    for (let i = 1; i < 21; i++) {
      rawJoints[i] = this._offsetFromAnchor(healthyHand[i], healthyHand[0], targetWrist, true);
    }
  }

  _buildHandFromTemplate(rawJoints, templateHand, targetWrist, mirrorX = false, anchorHand = null) {
    if (!templateHand || !templateHand[0] || !targetWrist) return;
    const wristAnchor = anchorHand?.[0] || targetWrist;
    rawJoints[0] = wristAnchor;

    Object.values(FINGER_CHAINS).forEach((chain) => {
      const baseIdx = chain[0];
      const templateBase = templateHand[baseIdx] || templateHand[0];
      const targetBase = anchorHand?.[baseIdx]
        || this._offsetFromAnchor(templateBase, templateHand[0], wristAnchor, mirrorX)
        || wristAnchor;

      rawJoints[baseIdx] = targetBase;
      for (let i = 1; i < chain.length; i++) {
        const jointIdx = chain[i];
        rawJoints[jointIdx] = this._offsetFromAnchor(templateHand[jointIdx], templateBase, targetBase, mirrorX);
      }
    });
  }

  _buildMissingFinger(rawJoints, finger, healthyHand, amputatedHand, fallbackWrist, mirrorX = true) {
    const chain = FINGER_CHAINS[finger];
    if (!chain || !healthyHand) return;

    const baseIdx = chain[0];
    const targetBase = amputatedHand?.[baseIdx] || fallbackWrist;
    const sourceBase = healthyHand[baseIdx] || healthyHand[0];
    if (!targetBase || !sourceBase) return;

    rawJoints[baseIdx] = targetBase;
    for (let i = 1; i < chain.length; i++) {
      const jointIdx = chain[i];
      rawJoints[jointIdx] = this._offsetFromAnchor(healthyHand[jointIdx], sourceBase, targetBase, mirrorX);
    }
  }

  _getPhantomRenderMask(level, side = null) {
    if (level === 'ABOVE_ELBOW') {
      return [21, 22, 23, ...Array.from({ length: 21 }, (_, idx) => idx)];
    }
    if (level === 'BELOW_ELBOW') {
      return [22, 23, ...Array.from({ length: 21 }, (_, idx) => idx)];
    }
    if (level === 'WRIST') {
      return [23, ...Array.from({ length: 21 }, (_, idx) => idx)];
    }
    if (level === 'FINGERS') {
      return getMissingFingers(this.configRef, side).flatMap(finger => FINGER_CHAINS[finger]);
    }
    return Array.from({ length: this.jointCount }, (_, idx) => idx);
  }

  update(armData, camera, videoRect = null) {
    if (!armData || !camera) { this.hideAll(); return null; }
    const { pose, hand, amputatedHand, templateHand, recordedArm, indices, isPhantom, isBilateralPhantom, side } = armData;
    if (!pose) { this.hideAll(); return null; }

    this.group.visible = this.options.visible !== false;
    const now = performance.now();

    const rawJoints = new Array(this.jointCount).fill(null);
    this._setRenderMask(Array.from({ length: this.jointCount }, (_, idx) => idx));

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

    } else if (isBilateralPhantom) {
      const aShRaw = pose[indices.sh];
      const aElRaw = pose[indices.el];
      const aWrRaw = pose[indices.wr];
      const { level } = resolveAmputationSettingsForSide(this.configRef, side);
      this._setRenderMask(this._getPhantomRenderMask(level, side));

      const shoulderPoint = this._visible(aShRaw) ? aShRaw : null;
      let elbowPoint = this._visible(aElRaw) ? aElRaw : null;
      let wristPoint = this._visible(aWrRaw) ? aWrRaw : null;

      if (!shoulderPoint) { this.hideAll(); return null; }

      if (level === 'ABOVE_ELBOW' && recordedArm?.shoulder && recordedArm?.elbow && recordedArm?.wrist) {
        elbowPoint = this._offsetFromAnchor(recordedArm.elbow, recordedArm.shoulder, shoulderPoint, false) || elbowPoint;
        wristPoint = this._offsetFromAnchor(recordedArm.wrist, recordedArm.elbow, elbowPoint, false) || wristPoint;
      } else if (level === 'ABOVE_ELBOW') {
        const defaultUpper = side === 'LEFT'
          ? { x: -0.08, y: 0.16, z: 0 }
          : { x: 0.08, y: 0.16, z: 0 };
        elbowPoint = {
          x: shoulderPoint.x + defaultUpper.x,
          y: shoulderPoint.y + defaultUpper.y,
          z: shoulderPoint.z || 0,
        };
        wristPoint = {
          x: elbowPoint.x + defaultUpper.x * 0.9,
          y: elbowPoint.y + defaultUpper.y * 0.95,
          z: elbowPoint.z || 0,
        };
      } else if (level === 'BELOW_ELBOW') {
        if (!elbowPoint) {
          elbowPoint = {
            x: shoulderPoint.x + (side === 'LEFT' ? -0.08 : 0.08),
            y: shoulderPoint.y + 0.16,
            z: shoulderPoint.z || 0,
          };
        }
        wristPoint = recordedArm?.elbow && recordedArm?.wrist
          ? this._offsetFromAnchor(recordedArm.wrist, recordedArm.elbow, elbowPoint, false)
          : null;
        if (!wristPoint) {
          wristPoint = {
            x: elbowPoint.x + (elbowPoint.x - shoulderPoint.x) * 0.85,
            y: elbowPoint.y + (elbowPoint.y - shoulderPoint.y) * 0.85,
            z: elbowPoint.z || 0,
          };
        }
      } else {
        if (!elbowPoint) {
          elbowPoint = {
            x: shoulderPoint.x + (side === 'LEFT' ? -0.07 : 0.07),
            y: shoulderPoint.y + 0.14,
            z: shoulderPoint.z || 0,
          };
        }
        if (!wristPoint) {
          wristPoint = {
            x: elbowPoint.x + (elbowPoint.x - shoulderPoint.x) * 0.85,
            y: elbowPoint.y + (elbowPoint.y - shoulderPoint.y) * 0.85,
            z: elbowPoint.z || 0,
          };
        }
      }

      const livePalmWrist = hand?.[0] || amputatedHand?.[0] || null;
      if (livePalmWrist) wristPoint = livePalmWrist;

      rawJoints[21] = shoulderPoint;
      rawJoints[22] = elbowPoint || shoulderPoint;
      rawJoints[23] = wristPoint || elbowPoint || shoulderPoint;

      if (level === 'FINGERS' && (hand || amputatedHand)) {
        const anchorHand = amputatedHand || hand;
        rawJoints[0] = anchorHand?.[0] || rawJoints[0];
        [1, 5, 9, 13, 17].forEach((baseIdx) => {
          rawJoints[baseIdx] = anchorHand?.[baseIdx] || rawJoints[baseIdx];
        });
        getMissingFingers(this.configRef, side).forEach((finger) => {
          this._buildMissingFinger(rawJoints, finger, templateHand || hand, anchorHand, rawJoints[23], side === 'LEFT');
        });
      } else {
        this._buildHandFromTemplate(rawJoints, templateHand || hand, rawJoints[23], side === 'LEFT', hand || amputatedHand);
      }

    } else {
      const hSh = pose[indices.healthySh];
      const hEl = pose[indices.healthyEl];
      const hWr = pose[indices.healthyWr];
      if (!hSh) { this.hideAll(); return null; }

      const aShRaw = pose[indices.sh];
      const aElRaw = pose[indices.el];
      const aWrRaw = pose[indices.wr];
      const { level } = resolveAmputationSettingsForSide(this.configRef, side);
      this._setRenderMask(this._getPhantomRenderMask(level, side));

      const centerX = this._visible(aShRaw) ? (hSh.x + aShRaw.x) / 2 : 0.5;
      const reflect = (lm) => this._mirrorAroundCenter(lm, centerX);

      const shoulderPoint = this._visible(aShRaw) ? aShRaw : reflect(hSh);
      let elbowPoint = this._visible(aElRaw) ? aElRaw : (hEl ? reflect(hEl) : null);
      let wristPoint = this._visible(aWrRaw) ? aWrRaw : (hWr ? reflect(hWr) : null);

      if (level === 'ABOVE_ELBOW') {
        elbowPoint = this._offsetFromAnchor(hEl, hSh, shoulderPoint, true) || elbowPoint;
        wristPoint = this._offsetFromAnchor(hWr, hEl, elbowPoint, true) || wristPoint;
      } else if (level === 'BELOW_ELBOW') {
        elbowPoint = this._visible(aElRaw) ? aElRaw : elbowPoint;
        wristPoint = this._offsetFromAnchor(hWr, hEl, elbowPoint, true) || wristPoint;
      } else if (level === 'WRIST') {
        wristPoint = amputatedHand?.[0] || wristPoint;
      } else if (level === 'FINGERS') {
        wristPoint = amputatedHand?.[0] || wristPoint;
      }

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

      if (level === 'FINGERS') {
        if (amputatedHand) {
          for (let i = 0; i < 21; i++) rawJoints[i] = amputatedHand[i] || rawJoints[i];
        }
        getMissingFingers(this.configRef, side).forEach((finger) => {
          this._buildMissingFinger(rawJoints, finger, hand, amputatedHand, wristPoint);
        });
      } else {
        this._buildHandFromHealthy(rawJoints, hand, wristPoint);
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
      if (!this.renderMask[idx] || !this.initialised[idx] || (rawJoints[idx] === null && aged(idx))) {
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
      const pE = this.renderMask[start] && this.renderMask[end]
        ? this.smoothedPositions[end]
        : this.smoothedPositions[start];
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
