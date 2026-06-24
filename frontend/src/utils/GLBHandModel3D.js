import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const HAND_MODEL_PATHS = {
  LEFT: '/models/left.glb',
  RIGHT: '/models/right.glb',
};

const BONE_LANDMARK_MAP = {
  'wrist': 0,
  'thumb-metacarpal': 1,
  'thumb-phalanx-proximal': 2,
  'thumb-phalanx-distal': 3,
  'thumb-tip': 4,
  'index-finger-metacarpal': 5,
  'index-finger-phalanx-proximal': 6,
  'index-finger-phalanx-intermediate': 7,
  'index-finger-phalanx-distal': 8,
  'index-finger-tip': 8,
  'middle-finger-metacarpal': 9,
  'middle-finger-phalanx-proximal': 10,
  'middle-finger-phalanx-intermediate': 11,
  'middle-finger-phalanx-distal': 12,
  'middle-finger-tip': 12,
  'ring-finger-metacarpal': 13,
  'ring-finger-phalanx-proximal': 14,
  'ring-finger-phalanx-intermediate': 15,
  'ring-finger-phalanx-distal': 16,
  'ring-finger-tip': 16,
  'pinky-finger-metacarpal': 17,
  'pinky-finger-phalanx-proximal': 18,
  'pinky-finger-phalanx-intermediate': 19,
  'pinky-finger-phalanx-distal': 20,
  'pinky-finger-tip': 20,
};

export class GLBHandModel3D {
  constructor(scene, configRef, options = {}) {
    this.scene = scene;
    this.configRef = configRef;
    this.options = options;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.loader = new GLTFLoader();
    this.currentSide = null;
    this.loadToken = 0;
    this.modelRoot = null;
    this.bonesByName = new Map();
    this.boneBindPositions = new Map();

    this.jointCount = 21;
    this.smoothedPositions = [];
    this.targetPositions = [];
    this._outputPositions = [];

    for (let i = 0; i < this.jointCount; i++) {
      this.smoothedPositions.push(new THREE.Vector3());
      this.targetPositions.push(new THREE.Vector3());
      this._outputPositions.push({ x: 0, y: 0, z: 0 });
    }

    this.smoothing = options.smoothing ?? 0.22;
    this.scaleSmoothing = options.scaleSmoothing ?? 0.18;
    this.rotationSmoothing = options.rotationSmoothing ?? 0.2;
    this.currentScale = 1;
    this.currentRotationZ = 0;

    this._ndcVector = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._size = new THREE.Vector3();
    this._center = new THREE.Vector3();
    this._palmCenter = new THREE.Vector3();
    this._tmpWorld = new THREE.Vector3();
    this._tmpLocal = new THREE.Vector3();
  }

  update(landmarks, camera, isPhantom = false) {
    if (!landmarks || landmarks.length === 0 || !camera) {
      this.hideAll();
      return null;
    }

    this.loadSide(this.getConfiguredSide());
    this.group.visible = true;

    const targetGamePlaneZ = 0.0;
    const fingerDepthSpread = 1.2;

    camera.getWorldPosition(this._camPos);
    const count = Math.min(landmarks.length, this.jointCount);

    for (let index = 0; index < count; index++) {
      const lm = landmarks[index];
      const screenX = isPhantom ? lm.x : (1 - lm.x);
      const ndcX = (screenX * 2) - 1;
      const ndcY = 1 - (lm.y * 2);

      this._ndcVector.set(ndcX, ndcY, 0.5);
      this._ndcVector.unproject(camera);

      const dir = this._ndcVector.sub(this._camPos).normalize();
      const distanceToPlane = (targetGamePlaneZ - this._camPos.z) / dir.z;

      const x = this._camPos.x + (dir.x * distanceToPlane);
      const y = this._camPos.y + (dir.y * distanceToPlane);
      const z = targetGamePlaneZ - (lm.z * fingerDepthSpread);

      this.targetPositions[index].set(x, y, z);
      this.smoothedPositions[index].lerp(this.targetPositions[index], this.smoothing);

      const p = this.smoothedPositions[index];
      const out = this._outputPositions[index];
      out.x = p.x;
      out.y = p.y;
      out.z = targetGamePlaneZ;
    }

    this.placeModelFromPalm();
    this.updateBonePose();

    return this._outputPositions;
  }

  getConfiguredSide() {
    return this.configRef.current?.amputationSide === 'RIGHT' ? 'RIGHT' : 'LEFT';
  }

  loadSide(side) {
    if (this.currentSide === side) return;

    this.currentSide = side;
    this.loadToken += 1;
    const token = this.loadToken;

    this.clearModel();

    this.loader.load(
      HAND_MODEL_PATHS[side],
      (gltf) => {
        if (token !== this.loadToken) {
          this.disposeObject(gltf.scene);
          return;
        }

        const root = gltf.scene;
        this.normalizeModel(root);
        this.cacheBones(root);

        root.traverse((child) => {
          if (!child.isMesh) return;
          child.frustumCulled = false;
          child.castShadow = false;
          child.receiveShadow = false;

          if (child.material) {
            child.material = child.material.clone();
            child.material.side = THREE.DoubleSide;
            child.material.needsUpdate = true;
          }
        });

        this.modelRoot = root;
        this.group.add(root);
      },
      undefined,
      (error) => {
        console.error(`Failed to load ${HAND_MODEL_PATHS[side]}`, error);
      }
    );
  }

  normalizeModel(root) {
    this._box.setFromObject(root);
    this._box.getSize(this._size);
    this._box.getCenter(this._center);

    root.position.sub(this._center);

    const maxDimension = Math.max(this._size.x, this._size.y, this._size.z);
    if (maxDimension > 0) {
      root.scale.setScalar(1 / maxDimension);
    }
  }

  cacheBones(root) {
    this.bonesByName.clear();
    this.boneBindPositions.clear();

    root.traverse((child) => {
      if (!Object.prototype.hasOwnProperty.call(BONE_LANDMARK_MAP, child.name)) return;

      this.bonesByName.set(child.name, child);
      this.boneBindPositions.set(child, child.position.clone());
    });
  }

  placeModelFromPalm() {
    const wrist = this.smoothedPositions[0];
    const indexBase = this.smoothedPositions[5];
    const middleBase = this.smoothedPositions[9];
    const ringBase = this.smoothedPositions[13];
    const pinkyBase = this.smoothedPositions[17];

    this._palmCenter
      .copy(wrist)
      .add(indexBase)
      .add(middleBase)
      .add(ringBase)
      .add(pinkyBase)
      .multiplyScalar(0.2);

    this.group.position.set(this._palmCenter.x, this._palmCenter.y, 0.08);

    const fingerDirection = middleBase.clone().sub(wrist);
    if (fingerDirection.lengthSq() > 0.0001) {
      const targetRotationZ = Math.atan2(fingerDirection.y, fingerDirection.x) - Math.PI / 2;
      let delta = targetRotationZ - this.currentRotationZ;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.currentRotationZ += delta * this.rotationSmoothing;
      this.group.rotation.z = this.currentRotationZ;
    }

    const palmWidth = indexBase.distanceTo(pinkyBase);
    const fallbackPalmLength = wrist.distanceTo(middleBase);
    const trackedSize = Math.max(palmWidth, fallbackPalmLength * 0.8, 0.15);
    const profileScale = this.configRef.current?.meshScaleMultiplier || 1;
    const targetScale = trackedSize * (this.options.scaleMultiplier ?? 1.55) * profileScale;

    this.currentScale = THREE.MathUtils.lerp(this.currentScale, targetScale, this.scaleSmoothing);
    this.group.scale.setScalar(this.currentScale);
  }

  updateBonePose() {
    if (!this.modelRoot || this.bonesByName.size === 0) return;

    this.group.updateMatrixWorld(true);
    this.modelRoot.updateMatrixWorld(true);

    for (const [boneName, landmarkIndex] of Object.entries(BONE_LANDMARK_MAP)) {
      const bone = this.bonesByName.get(boneName);
      const target = this.smoothedPositions[landmarkIndex];
      if (!bone || !target || !bone.parent) continue;

      this._tmpWorld.copy(target);
      bone.parent.worldToLocal(this._tmpLocal.copy(this._tmpWorld));
      bone.position.lerp(this._tmpLocal, 0.58);
    }

    this.modelRoot.updateMatrixWorld(true);
  }

  hideAll() {
    this.group.visible = false;
  }

  clearModel() {
    if (!this.modelRoot) return;
    this.group.remove(this.modelRoot);
    this.disposeObject(this.modelRoot);
    this.modelRoot = null;
    this.bonesByName.clear();
    this.boneBindPositions.clear();
  }

  disposeObject(object) {
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }

  destroy() {
    this.loadToken += 1;
    this.clearModel();
    this.scene.remove(this.group);
  }
}
