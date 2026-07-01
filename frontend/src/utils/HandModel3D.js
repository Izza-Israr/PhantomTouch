import * as THREE from 'three';

export class HandModel3D {
  constructor(scene, configRef, color = 0x00ffff, options = {}) {
    this.scene = scene;
    this.configRef = configRef;
    this.options = options;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    const jointRadius = 0.09;
    this.jointGeo = new THREE.SphereGeometry(jointRadius, 16, 12);
    this.jointMat = new THREE.MeshPhongMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.9
    });

    this.jointCount = 24;
    this.jointMesh = new THREE.InstancedMesh(this.jointGeo, this.jointMat, this.jointCount);
    this.jointMesh.frustumCulled = false;
    this.group.add(this.jointMesh);

    this._dummy = new THREE.Object3D();
    this.smoothedPositions = Array.from({ length: this.jointCount }, () => new THREE.Vector3());
    this.targetPositions = Array.from({ length: this.jointCount }, () => new THREE.Vector3());

    this.connections = [
      [21, 22], [22, 23],
      [23, 0], [23, 5], [23, 17],
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20]
    ];

    this.linePositionsArray = new Float32Array(this.connections.length * 2 * 3);
    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute("position", new THREE.BufferAttribute(this.linePositionsArray, 3));
    this.lineMaterial = new THREE.LineBasicMaterial({ color: color, linewidth: 4, transparent: true, opacity: 0.8 });
    this.line = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this.smoothing = 0.22; 
    this.VIS_THRESHOLD = 0.4;
  }

  _visible(lm) {
    return lm && (lm.visibility === undefined || lm.visibility > this.VIS_THRESHOLD);
  }

  update(armData, camera, isPhantom = false) {
    if (!armData || !camera) {
      this.hideAll();
      return null;
    }

    this.group.visible = true;
    const { pose, hand, indices } = armData;
    const rawJoints = new Array(this.jointCount);

    const hSh = pose[indices.healthyShIdx];
    const hEl = pose[indices.healthyElIdx];
    const hWr = pose[indices.healthyWrIdx];
    if (!hSh) { this.hideAll(); return null; }

    // Use shoulders to establish a reliable mirror baseline down the middle
    const aShRaw = pose[indices.shIdx];
    const centerX = this._visible(aShRaw) ? (hSh.x + aShRaw.x) / 2 : 0.5;

    if (!isPhantom) {
      // --- REAL SIDE CONFIGURATION ---
      rawJoints[21] = hSh;
      rawJoints[22] = hEl || hSh;
      rawJoints[23] = hWr || hEl || hSh;

      for (let i = 0; i < 21; i++) {
        rawJoints[i] = (hand && hand[i]) ? hand[i] : rawJoints[23];
      }
    } else {
      // --- PHANTOM MIRRORED KINEMATICS ---
      // Shoulder anchors to the affected side frame point
      rawJoints[21] = this._visible(aShRaw) ? aShRaw : { x: 2 * centerX - hSh.x, y: hSh.y, z: hSh.z || 0 };
      
      // Elbow and wrist follow your active real movements but flipped safely across the center axis
      rawJoints[22] = hEl ? { x: 2 * centerX - hEl.x, y: hEl.y, z: hEl.z || 0 } : rawJoints[21];
      rawJoints[23] = hWr ? { x: 2 * centerX - hWr.x, y: hWr.y, z: hWr.z || 0 } : rawJoints[22];

      for (let i = 0; i < 21; i++) {
        if (hand && hand[i]) {
          rawJoints[i] = {
            x: 2 * centerX - hand[i].x,
            y: hand[i].y,
            z: hand[i].z || 0
          };
        } else {
          rawJoints[i] = rawJoints[23];
        }
      }
    }

    // --- VIEWPORT COORDINATE MAPPING FIX ---
    for (let idx = 0; idx < this.jointCount; idx++) {
      const lm = rawJoints[idx];
      if (!lm) continue;

      // Map raw coordinates directly into a standardized 3D gameplay box
      // MediaPipe X is [0, 1] left to right. Video display is inverted.
      const x = ((1.0 - lm.x) * 8.0) - 4.0;
      const y = ((1.0 - lm.y) * 6.0) - 3.0;
      const z = -(lm.z || 0) * 2.0;

      this.targetPositions[idx].set(x, y, z);
      this.smoothedPositions[idx].lerp(this.targetPositions[idx], this.smoothing);

      this._dummy.position.copy(this.smoothedPositions[idx]);
      this._dummy.updateMatrix();
      this.jointMesh.setMatrixAt(idx, this._dummy.matrix);
    }

    this.jointMesh.instanceMatrix.needsUpdate = true;

    let lIdx = 0;
    this.connections.forEach(([start, end]) => {
      const pStart = this.smoothedPositions[start];
      const pEnd = this.smoothedPositions[end];
      this.linePositionsArray[lIdx++] = pStart.x;
      this.linePositionsArray[lIdx++] = pStart.y;
      this.linePositionsArray[lIdx++] = pStart.z;
      this.linePositionsArray[lIdx++] = pEnd.x;
      this.linePositionsArray[lIdx++] = pEnd.y;
      this.linePositionsArray[lIdx++] = pEnd.z;
    });

    this.lineGeometry.attributes.position.needsUpdate = true;
    this.line.visible = true;

    return this.smoothedPositions.map(p => ({ x: p.x, y: p.y, z: p.z }));
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