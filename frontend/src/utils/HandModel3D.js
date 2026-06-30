import * as THREE from 'three';

export class HandModel3D {
  constructor(scene, configRef, color = 0x00ffff, options = {}) {
    this.scene = scene;
    this.configRef = configRef;
    this.options = options;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    const jointRadius = 0.07;
    this.jointGeo = new THREE.SphereGeometry(jointRadius, 16, 12);
    this.jointMat = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });

    // 21 hand joints + 3 structural nodes (Shoulder, Elbow, Wrist) = 24 points
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
    this.lineMaterial = new THREE.LineBasicMaterial({ color: color, linewidth: 2, transparent: true, opacity: 0.75 });
    this.line = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this.smoothing = 0.2;
    this.VIS_THRESHOLD = 0.45;
    this._ndcVector = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
  }

  _visible(lm) {
    return lm && (lm.visibility === undefined || lm.visibility > this.VIS_THRESHOLD);
  }

  // Mirrors a healthy-side landmark across the body centerline (midpoint of both shoulders)
  _reflect(lm, centerX) {
    if (!lm) return null;
    return { x: 2 * centerX - lm.x, y: lm.y, z: lm.z || 0 };
  }

  update(armData, camera, isPhantom = false) {
    if (!armData || !camera) {
      this.hideAll();
      return null;
    }

    this.group.visible = true;
    const TARGET_GAME_PLANE_Z = 0.0;
    camera.getWorldPosition(this._camPos);

    const { pose, hand, indices } = armData;
    const rawJoints = new Array(this.jointCount);

    if (!isPhantom) {
      // REAL (healthy) arm — actual tracked landmarks
      const hSh = pose[indices.healthyShIdx];
      const hEl = pose[indices.healthyElIdx];
      const hWr = pose[indices.healthyWrIdx];
      if (!hSh) { this.hideAll(); return null; }

      rawJoints[21] = hSh;
      rawJoints[22] = hEl || hSh;
      rawJoints[23] = hWr || hEl || hSh;

      for (let i = 0; i < 21; i++) {
        rawJoints[i] = (hand && hand[i]) ? hand[i] : rawJoints[23];
      }
    } else {
      // PHANTOM arm — mirror the healthy side across the body centerline
      const hSh = pose[indices.healthyShIdx];
      const hEl = pose[indices.healthyElIdx];
      const hWr = pose[indices.healthyWrIdx];
      if (!hSh) { this.hideAll(); return null; }

      const aShRaw = pose[indices.shIdx];
      const aElRaw = pose[indices.elIdx];
      const aWrRaw = pose[indices.wrIdx];

      const centerX = this._visible(aShRaw) ? (hSh.x + aShRaw.x) / 2 : 0.5;

      const shoulderPoint = this._visible(aShRaw) ? aShRaw : this._reflect(hSh, centerX);
      const elbowPoint = this._visible(aElRaw) ? aElRaw : (hEl ? this._reflect(hEl, centerX) : shoulderPoint);
      const wristPoint = this._visible(aWrRaw) ? aWrRaw : (hWr ? this._reflect(hWr, centerX) : elbowPoint);

      rawJoints[21] = shoulderPoint;
      rawJoints[22] = elbowPoint;
      rawJoints[23] = wristPoint;

      const hWristLm = hand && hand[0] ? hand[0] : null;
      for (let i = 0; i < 21; i++) {
        if (hand && hand[i] && hWristLm) {
          // mirror finger offsets relative to wrist (flip x, keep y/z) and anchor to wristPoint
          rawJoints[i] = {
            x: wristPoint.x - (hand[i].x - hWristLm.x),
            y: wristPoint.y + (hand[i].y - hWristLm.y),
            z: (wristPoint.z || 0) + ((hand[i].z || 0) - (hWristLm.z || 0))
          };
        } else {
          rawJoints[i] = wristPoint;
        }
      }
    }

    for (let idx = 0; idx < this.jointCount; idx++) {
      const lm = rawJoints[idx];
      if (!lm) continue;

      // Un-mirror once here (raw landmark x is mirrored-camera space -> flip to real-world space)
      const screenX = 1 - lm.x;
      const ndcX = (screenX * 2) - 1;
      const ndcY = 1 - (lm.y * 2);

      this._ndcVector.set(ndcX, ndcY, 0.5);
      this._ndcVector.unproject(camera);
      const dir = this._ndcVector.sub(this._camPos).normalize();
      const distanceToPlane = (TARGET_GAME_PLANE_Z - this._camPos.z) / dir.z;

      const x = this._camPos.x + (dir.x * distanceToPlane);
      const y = this._camPos.y + (dir.y * distanceToPlane);
      const z = TARGET_GAME_PLANE_Z - ((lm.z || 0) * 1.2);

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

    return this.smoothedPositions.map(p => ({ x: p.x, y: p.y, z: TARGET_GAME_PLANE_Z }));
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