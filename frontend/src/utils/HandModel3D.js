import * as THREE from 'three';

export class HandModel3D {
  constructor(scene, configRef) {
    this.scene = scene;
    this.configRef = configRef;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // ─── JOINTS: single InstancedMesh instead of 21 separate meshes ──────────
    // Lower segment count (8,8) — at this on-screen size the extra geometry
    // from (16,16) is invisible but costs real GPU time across 21 instances.
    this.jointGeo = new THREE.SphereGeometry(0.08, 8, 8);
    this.jointMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });

    this.jointCount = 21;
    this.jointMesh = new THREE.InstancedMesh(this.jointGeo, this.jointMat, this.jointCount);
    this.jointMesh.frustumCulled = false; // skip per-frame bounding-sphere recompute
    this.group.add(this.jointMesh);

    this._dummy = new THREE.Object3D();

    // Smoothed positions we lerp toward each frame, and the raw target
    // positions computed from the latest landmarks. Reused every frame —
    // never reallocated.
    this.smoothedPositions = [];
    this.targetPositions = [];
    for (let i = 0; i < this.jointCount; i++) {
      this.smoothedPositions.push(new THREE.Vector3());
      this.targetPositions.push(new THREE.Vector3());
    }

    // ─── LINES: persistent GPU buffer, overwritten in place each frame ───────
    this.connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [13, 17]
    ];

    this.linePositionsArray = new Float32Array(this.connections.length * 2 * 3);
    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.linePositionsArray, 3)
    );

    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    this.line = new THREE.LineSegments(this.lineGeometry, lineMat);
    this.line.frustumCulled = false;
    this.group.add(this.line);

    // Reused output array so update() doesn't allocate a new array every frame
    this._outputPositions = [];
    for (let i = 0; i < this.jointCount; i++) {
      this._outputPositions.push({ x: 0, y: 0, z: 0 });
    }

    // Smoothing factor: higher = snappier/more jitter, lower = smoother/more lag.
    // 0.4-0.6 is a good starting range — tune to taste.
    this.smoothing = 0.5;
  }

  update(landmarks, camera) {
    if (!landmarks || landmarks.length === 0) {
      this.hideAll();
      return null;
    }

    this.group.visible = true;

    // 🌟 ANTI-CLUMPING FALLBACK PROTECTION
    // Prevents calculations from breaking if the camera values are zero during initial mounting
    let aspect = 1.333;
    let cameraY = 0.5;
    let fov = 50;
    let distance = 8;

    if (camera) {
      if (camera.aspect && !isNaN(camera.aspect) && camera.aspect !== 0) {
        aspect = camera.aspect;
      } else if (window.innerWidth && window.innerHeight) {
        aspect = window.innerWidth / window.innerHeight;
      }
      cameraY = camera.position.y !== undefined ? camera.position.y : 0.5;
      fov = camera.fov !== undefined ? camera.fov : 50;
      distance = camera.position.z !== undefined ? camera.position.z : 8;
    }

    // Calculate exact viewport dimensions visible to the camera perspective
    const vHeight = 2 * Math.tan((fov * Math.PI) / 360) * distance;
    const vWidth = vHeight * aspect;

    const count = Math.min(landmarks.length, this.jointCount);

    for (let index = 0; index < count; index++) {
      const lm = landmarks[index];

      // 🌟 TRUE HORIZONTAL MIRRORING:
      // (0.5 - lm.x) reflects positions to match your CSS-mirrored camera layer
      const x = (0.5 - lm.x) * vWidth;

      // Map normalized Y cleanly to world viewport heights
      const y = (0.5 - lm.y) * vHeight + cameraY;

      // Proportional depth matching coordinates size
      const z = -lm.z * (vWidth * 0.3);

      this.targetPositions[index].set(x, y, z);

      // Smooth toward the target instead of snapping — removes per-frame
      // jitter from raw MediaPipe landmarks without adding noticeable lag.
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

    // Build the structural lines connecting the joints, writing directly
    // into the existing typed array — no new allocation, no GPU buffer
    // re-creation.
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
    this.jointMesh.dispose();
    this.lineGeometry.dispose();
  }
}