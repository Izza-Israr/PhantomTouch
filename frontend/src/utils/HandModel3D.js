import * as THREE from 'three';

export class HandModel3D {
  constructor(
    scene,
    configRef,
    color = 0x00ffff
  ) {
    this.scene = scene;
    this.configRef = configRef;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // JOINTS - High performance InstancedMesh
    this.jointGeo = new THREE.SphereGeometry(0.07, 8, 8);
    this.jointMat = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });

    this.jointCount = 21;
    this.jointMesh = new THREE.InstancedMesh(
      this.jointGeo,
      this.jointMat,
      this.jointCount
    );
    this.jointMesh.frustumCulled = false;
    this.group.add(this.jointMesh);

    this._dummy = new THREE.Object3D();

    // POSITION BUFFERS
    this.smoothedPositions = [];
    this.targetPositions = [];

    for (let i = 0; i < this.jointCount; i++) {
      this.smoothedPositions.push(new THREE.Vector3());
      this.targetPositions.push(new THREE.Vector3());
    }

    // SKELETON CONNECTIONS MAP
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
    this.lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.linePositionsArray, 3)
    );

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 2
    });

    this.line = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    // OUTPUT BUFFER FOR COLLISION TRACKING
    this._outputPositions = [];
    for (let i = 0; i < this.jointCount; i++) {
      this._outputPositions.push({ x: 0, y: 0, z: 0 });
    }

    this.smoothing = 0.25; 
    
    this._ndcVector = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
  }

  update(landmarks, camera, isPhantom = false) {
    if (!landmarks || landmarks.length === 0 || !camera) {
      this.hideAll();
      return null;
    }

    this.group.visible = true;

    // Adjust this base depth value to scale your hand larger/smaller 
    // to match your camera's physical distance perfectly.
    const BASE_HAND_DEPTH = 5.8;  
    const DEPTH_STRENGTH = 2.0;   

    camera.getWorldPosition(this._camPos);
    const count = Math.min(landmarks.length, this.jointCount);

    for (let index = 0; index < count; index++) {
      const lm = landmarks[index];

      // Clean alignment mapping based on standard mirrored webcam layouts:
      // Real Hand: Invert MediaPipe raw X coordinates to match your mirrored UI screen space
      // Phantom Hand: Use raw X directly, producing a perfect horizontal reflection across the center line
      let screenX = isPhantom ? lm.x : (1 - lm.x);
      
      const ndcX = (screenX * 2) - 1;
      const ndcY = 1 - (lm.y * 2); // Invert Y because MediaPipe starts at top, WebGL at bottom

      // Project precise NDC coordinates through the active camera frustum matrix
      this._ndcVector.set(ndcX, ndcY, 0.5); 
      this._ndcVector.unproject(camera);

      // Extract accurate world direction vector ray running from the camera lens
      const dir = this._ndcVector.sub(this._camPos).normalize();

      // Extrapolate distance along the vector ray path
      const targetDistance = BASE_HAND_DEPTH - (lm.z * DEPTH_STRENGTH);
      
      const x = this._camPos.x + (dir.x * targetDistance);
      const y = this._camPos.y + (dir.y * targetDistance);
      const z = this._camPos.z + (dir.z * targetDistance);

      this.targetPositions[index].set(x, y, z);
      this.smoothedPositions[index].lerp(this.targetPositions[index], this.smoothing);

      const p = this.smoothedPositions[index];
      this._dummy.position.copy(p);
      this._dummy.updateMatrix();
      this.jointMesh.setMatrixAt(index, this._dummy.matrix);

      const out = this._outputPositions[index];
      out.x = p.x;
      out.y = p.y;
      out.z = p.z;
    }

    this.jointMesh.instanceMatrix.needsUpdate = true;

    // Assemble lines
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

  hideAll() {
    this.group.visible = false;
  }

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