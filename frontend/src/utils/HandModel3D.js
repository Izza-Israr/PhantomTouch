import * as THREE from 'three';

export class HandModel3D {
  constructor(scene, configRef, color = 0x00ffff) {
    this.scene = scene;
    this.configRef = configRef;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.jointGeo = new THREE.SphereGeometry(0.08, 8, 8);
    this.jointMat = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });

    this.jointCount = 21;
    this.jointMesh = new THREE.InstancedMesh(this.jointGeo, this.jointMat, this.jointCount);
    this.jointMesh.frustumCulled = false;
    this.group.add(this.jointMesh);

    this._dummy = new THREE.Object3D();
    this.smoothedPositions = [];
    this.targetPositions = [];

    for (let i = 0; i < this.jointCount; i++) {
      this.smoothedPositions.push(new THREE.Vector3());
      this.targetPositions.push(new THREE.Vector3());
    }

    this.connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],     // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],     // Index
      [5, 9], [9, 10], [10, 11], [11, 12], // Middle
      [9, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [13, 17]
    ];

    this.linePositionsArray = new Float32Array(this.connections.length * 2 * 3);
    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute("position", new THREE.BufferAttribute(this.linePositionsArray, 3));
    this.lineMaterial = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
    this.line = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this._outputPositions = [];
    for (let i = 0; i < this.jointCount; i++) {
      this._outputPositions.push({ x: 0, y: 0, z: 0 });
    }

    this.smoothing = 0.2; // Quick response tracking
    this._ndcVector = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
  }

  update(landmarks, camera, isPhantom = false) {
    if (!landmarks || landmarks.length === 0 || !camera) {
      this.hideAll();
      return null;
    }

    this.group.visible = true;

    // 🎯 CRITICAL FIX: Match this to the Z position of your game targets
    const TARGET_GAME_PLANE_Z = 0.0; 
    const FINGER_DEPTH_SPREAD = 1.2; // Gives fingers slight 3D depth separation relative to palm

    camera.getWorldPosition(this._camPos);
    const count = Math.min(landmarks.length, this.jointCount);

    for (let index = 0; index < count; index++) {
      const lm = landmarks[index];

      // Screen space assignment mirroring layout rules
      let screenX = isPhantom ? lm.x : (1 - lm.x);
      
      const ndcX = (screenX * 2) - 1;
      const ndcY = 1 - (lm.y * 2);

      // Cast project out into world space direction vector
      this._ndcVector.set(ndcX, ndcY, 0.5); 
      this._ndcVector.unproject(camera);

      const dir = this._ndcVector.sub(this._camPos).normalize();

      // Math Ray-to-Plane intersection equation: 
      // Solves exactly where the camera tracking line hits the target game plane
      const distanceToPlane = (TARGET_GAME_PLANE_Z - this._camPos.z) / dir.z;

      const x = this._camPos.x + (dir.x * distanceToPlane);
      const y = this._camPos.y + (dir.y * distanceToPlane);
      // Keep base collision at flat plane, but let fingers express depth visually
      const z = TARGET_GAME_PLANE_Z - (lm.z * FINGER_DEPTH_SPREAD);

      this.targetPositions[index].set(x, y, z);
      this.smoothedPositions[index].lerp(this.targetPositions[index], this.smoothing);

      const p = this.smoothedPositions[index];
      this._dummy.position.copy(p);
      this._dummy.updateMatrix();
      this.jointMesh.setMatrixAt(index, this._dummy.matrix);

      // Expose to collision detection logic
      const out = this._outputPositions[index];
      out.x = p.x;
      out.y = p.y;
      out.z = TARGET_GAME_PLANE_Z; // Force exact flat collision registration coordinate
    }

    this.jointMesh.instanceMatrix.needsUpdate = true;

    let i = 0;
    this.connections.forEach(([start, end]) => {
      const pStart = this.smoothedPositions[start];
      const pEnd = this.smoothedPositions[end];
      this.linePositionsArray[i++] = pStart.x;
      this.linePositionsArray[i++] = pStart.y;
      this.linePositionsArray[i++] = pStart.z;
      this.linePositionsArray[i++] = pEnd.x;
      this.linePositionsArray[i++] = pEnd.y;
      this.linePositionsArray[i++] = pEnd.z;
    });

    this.lineGeometry.attributes.position.needsUpdate = true;
    this.line.visible = true;

    return this._outputPositions;
  }

  hideAll() { this.group.visible = false; }
  sampleSleeveColor(videoEl, posePoint) {}
  destroy() {
    this.scene.remove(this.group);
    this.jointGeo.dispose();
    this.jointMat.dispose();
    this.lineMaterial.dispose();
    this.lineGeometry.dispose();
    this.jointMesh.dispose();
  }
}