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

    // 21 hand joints + 3 physical key structural nodes (Shoulder, Elbow, Wrist proxy) = 24 points
    this.jointCount = 24; 
    this.jointMesh = new THREE.InstancedMesh(this.jointGeo, this.jointMat, this.jointCount);
    this.jointMesh.frustumCulled = false;
    this.group.add(this.jointMesh);

    this._dummy = new THREE.Object3D();
    this.smoothedPositions = Array.from({ length: this.jointCount }, () => new THREE.Vector3());
    this.targetPositions = Array.from({ length: this.jointCount }, () => new THREE.Vector3());

    // Connection paths assignment layout mapping
    this.connections = [
      [21, 22], [22, 23],           // Upper arm, Lower arm tracks
      [23, 0], [23, 5], [23, 17],    // Wrist joints branching layout
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
    this._ndcVector = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
  }

  update(armData, camera, isPhantom = false) {
    if (!armData || !camera || isPhantom) {
      this.hideAll();
      return null;
    }

    this.group.visible = true;
    const TARGET_GAME_PLANE_Z = 0.0;
    camera.getWorldPosition(this._camPos);

    const { pose, hand, indices } = armData;
    const rawJoints = new Array(this.jointCount);

    // Capture physical key index links data structures safely
    rawJoints[21] = pose[indices.healthyShIdx];
    rawJoints[22] = pose[indices.healthyElIdx];
    rawJoints[23] = pose[indices.healthyWrIdx];

    for (let i = 0; i < 21; i++) {
      rawJoints[i] = (hand && hand[i]) ? hand[i] : pose[indices.healthyWrIdx];
    }

    for (let idx = 0; idx < this.jointCount; idx++) {
      const lm = rawJoints[idx];
      if (!lm) continue;

      let screenX = 1 - lm.x; // Un-mirror processing parameters tracking
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