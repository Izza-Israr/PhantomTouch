import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const HAND_MODEL_PATHS = { LEFT: '/models/left.glb', RIGHT: '/models/right.glb' };
const BONE_LANDMARK_MAP = {
  'wrist': 0, 'thumb-metacarpal': 1, 'thumb-phalanx-proximal': 2, 'thumb-phalanx-distal': 3, 'thumb-tip': 4,
  'index-finger-metacarpal': 5, 'index-finger-phalanx-proximal': 6, 'index-finger-phalanx-intermediate': 7, 'index-finger-phalanx-distal': 8, 'index-finger-tip': 8,
  'middle-finger-metacarpal': 9, 'middle-finger-phalanx-proximal': 10, 'middle-finger-phalanx-intermediate': 11, 'middle-finger-phalanx-distal': 12, 'middle-finger-tip': 12,
  'ring-finger-metacarpal': 13, 'ring-finger-phalanx-proximal': 14, 'ring-finger-phalanx-intermediate': 15, 'ring-finger-phalanx-distal': 16, 'ring-finger-tip': 16,
  'pinky-finger-metacarpal': 17, 'pinky-finger-phalanx-proximal': 18, 'pinky-finger-phalanx-intermediate': 19, 'pinky-finger-phalanx-distal': 20, 'pinky-finger-tip': 20,
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

    this.jointCount = 21;
    this.smoothedPositions = Array.from({ length: this.jointCount }, () => new THREE.Vector3());
    this.targetPositions = Array.from({ length: this.jointCount }, () => new THREE.Vector3());
    this._outputPositions = Array.from({ length: this.jointCount }, () => ({ x: 0, y: 0, z: 0 }));

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
  }

  update(armData, camera, isPhantom = false) {
    if (!armData || !camera || !isPhantom) {
      this.hideAll();
      return null;
    }

    // Ensure the correct model is queued for loading and only show group once model exists
    this.loadSide(this.getConfiguredSide());
    if (this.modelRoot) this.group.visible = true; else this.group.visible = false;

    console.info('GLBHandModel3D.update()', { side: this.getConfiguredSide(), level: armData.level, hasModel: !!this.modelRoot, handPresent: !!armData.hand });

    const TARGET_GAME_PLANE_Z = 0.0;
    camera.getWorldPosition(this._camPos);

    const { level, pose, hand, indices } = armData;

    // Safety checks: require pose and healthy reference landmarks to compute mirrored vectors
    if (!pose || !indices) {
      this.hideAll();
      return null;
    }

    const safeGet = (arr, idx) => (arr && arr[idx] ? arr[idx] : null);

    const hShLm = safeGet(pose, indices.healthyShIdx);
    const hElLm = safeGet(pose, indices.healthyElIdx);
    const hWrLm = safeGet(pose, indices.healthyWrIdx);
    const aShLm = safeGet(pose, indices.shIdx);

    if (!hShLm || !hElLm || !hWrLm) {
      // Without healthy references we cannot reliably mirror; hide phantom
      this.hideAll();
      return null;
    }

    // Spatial Vectors Reconstruction Engine (using healthy-side vectors as mirror source)
    const hSh = new THREE.Vector3(hShLm.x, hShLm.y, hShLm.z);
    const hEl = new THREE.Vector3(hElLm.x, hElLm.y, hElLm.z);
    const hWr = new THREE.Vector3(hWrLm.x, hWrLm.y, hWrLm.z);
    const aSh = aShLm ? new THREE.Vector3(aShLm.x, aShLm.y, aShLm.z) : null;

    let virtualWrist = new THREE.Vector3();

    if (level === 'ABOVE_ELBOW') {
      const upperArmVec = new THREE.Vector3().subVectors(hEl, hSh);
      const forearmVec = new THREE.Vector3().subVectors(hWr, hEl);
      
      upperArmVec.x *= -1; // Symmetric horizontal flipping axis 
      forearmVec.x *= -1;

      if (aSh) {
        const virtualElbow = new THREE.Vector3().addVectors(aSh, upperArmVec);
        virtualWrist.addVectors(virtualElbow, forearmVec);
      } else {
        // If amputated shoulder not present, mirror shoulder-relative vectors around origin
        virtualWrist.addVectors(hSh.clone().multiplyScalar(-1), forearmVec);
      }
    } 
    else if (level === 'BELOW_ELBOW') {
      const aElLm = safeGet(pose, indices.elIdx);
      const aEl = aElLm ? new THREE.Vector3(aElLm.x, aElLm.y, aElLm.z) : null;
      const forearmVec = new THREE.Vector3().subVectors(hWr, hEl);
      forearmVec.x *= -1;
      if (aEl) {
        virtualWrist.addVectors(aEl, forearmVec);
      } else if (aSh) {
        // fallback: use shoulder + mirrored upperArm+forearm
        const upperArmVec = new THREE.Vector3().subVectors(hEl, hSh);
        upperArmVec.x *= -1;
        const virtualElbow = new THREE.Vector3().addVectors(aSh, upperArmVec);
        virtualWrist.addVectors(virtualElbow, forearmVec);
      } else {
        this.hideAll();
        return null;
      }
    } 
    else {
      const wrLm = safeGet(pose, indices.wrIdx);
      if (wrLm) {
        virtualWrist.set(wrLm.x, wrLm.y, wrLm.z);
      } else {
        // If wrist absent, derive from healthy-side mirrored wrist
        virtualWrist.copy(hWr).multiplyScalar(-1);
      }
    }

    for (let index = 0; index < this.jointCount; index++) {
      let lm = (hand && hand[index]) ? hand[index] : null;

      // Extract raw inputs or shift to calculated virtual wrist base offsets tracking loop
      let finalRawX = lm ? lm.x : (virtualWrist.x + ((hand ? hand[index].x - hand[0].x : 0) * -1));
      let finalRawY = lm ? lm.y : (virtualWrist.y + (hand ? hand[index].y - hand[0].y : 0));
      let finalRawZ = lm ? lm.z : (virtualWrist.z + (hand ? hand[index].z - hand[0].z : 0));

      let screenX = finalRawX; // Force correct mirror spatial assignment matrix rules
      const ndcX = (screenX * 2) - 1;
      const ndcY = 1 - (finalRawY * 2);

      this._ndcVector.set(ndcX, ndcY, 0.5);
      this._ndcVector.unproject(camera);
      const dir = this._ndcVector.sub(this._camPos).normalize();
      const distanceToPlane = (TARGET_GAME_PLANE_Z - this._camPos.z) / dir.z;

      const x = this._camPos.x + (dir.x * distanceToPlane);
      const y = this._camPos.y + (dir.y * distanceToPlane);
      const z = TARGET_GAME_PLANE_Z - (finalRawZ * 1.2);

      this.targetPositions[index].set(x, y, z);
      this.smoothedPositions[index].lerp(this.targetPositions[index], this.smoothing);

      const out = this._outputPositions[index];
      out.x = this.smoothedPositions[index].x;
      out.y = this.smoothedPositions[index].y;
      out.z = TARGET_GAME_PLANE_Z;
    }

    this.placeModelFromPalm();
    this.updateBonePose();

    if (!this.modelRoot) {
      // If model not loaded yet, still return computed positions so caller can inspect
      console.debug('GLB model not yet loaded; returning positions array length', this._outputPositions.length);
    }

    return this._outputPositions;
  }

  getConfiguredSide() { return this.configRef.current?.amputationSide === 'RIGHT' ? 'RIGHT' : 'LEFT'; }

  loadSide(side) {
    if (this.currentSide === side) return;
    this.currentSide = side;
    this.loadToken += 1;
    const token = this.loadToken;

    this.clearModel();
    this.loader.load(HAND_MODEL_PATHS[side], (gltf) => {
      if (token !== this.loadToken) { this.disposeObject(gltf.scene); return; }
      const root = gltf.scene;
      this.normalizeModel(root);
      this.cacheBones(root);
      console.info('GLBHandModel3D: model loaded', side, 'bones:', this.bonesByName.size);
      // add a small origin marker so we can visually confirm the phantom model is placed
      const markerGeo = new THREE.SphereGeometry(0.02, 8, 8);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
      const originMarker = new THREE.Mesh(markerGeo, markerMat);
      originMarker.name = '__origin_marker__';
      originMarker.position.set(0, 0, 0.06);
      root.add(originMarker);
      root.traverse((child) => {
        if (!child.isMesh) return;
        child.frustumCulled = false;
        if (child.material) {
          child.material = child.material.clone();
          child.material.side = THREE.DoubleSide;
          child.material.needsUpdate = true;
        }
      });
      this.modelRoot = root;
      this.group.add(root);
      this.group.visible = true;
    });
  }

  normalizeModel(root) {
    this._box.setFromObject(root);
    this._box.getSize(this._size);
    this._box.getCenter(this._center);
    root.position.sub(this._center);
    const maxDimension = Math.max(this._size.x, this._size.y, this._size.z);
    if (maxDimension > 0) root.scale.setScalar(1 / maxDimension);
  }

  cacheBones(root) {
    this.bonesByName.clear();
    root.traverse((child) => {
      if (!Object.prototype.hasOwnProperty.call(BONE_LANDMARK_MAP, child.name)) return;
      this.bonesByName.set(child.name, child);
    });
  }

  placeModelFromPalm() {
    const wrist = this.smoothedPositions[0];
    const indexBase = this.smoothedPositions[5];
    const middleBase = this.smoothedPositions[9];
    const ringBase = this.smoothedPositions[13];
    const pinkyBase = this.smoothedPositions[17];

    this._palmCenter.copy(wrist).add(indexBase).add(middleBase).add(ringBase).add(pinkyBase).multiplyScalar(0.2);
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
    const targetScale = trackedSize * (this.options.scaleMultiplier ?? 1.55) * (this.configRef.current?.meshScaleMultiplier || 1);
    this.currentScale = THREE.MathUtils.lerp(this.currentScale, targetScale, this.scaleSmoothing);
    this.group.scale.setScalar(this.currentScale);
  }

  updateBonePose() {
    if (!this.modelRoot || this.bonesByName.size === 0) return;
    this.group.updateMatrixWorld(true);
    this.modelRoot.updateMatrixWorld(true);

    const tmpWorld = new THREE.Vector3();
    const tmpLocal = new THREE.Vector3();

    for (const [boneName, landmarkIndex] of Object.entries(BONE_LANDMARK_MAP)) {
      const bone = this.bonesByName.get(boneName);
      const target = this.smoothedPositions[landmarkIndex];
      if (!bone || !target || !bone.parent) continue;

      tmpWorld.copy(target);
      bone.parent.worldToLocal(tmpLocal.copy(tmpWorld));
      bone.position.lerp(tmpLocal, 0.58);
    }
    this.modelRoot.updateMatrixWorld(true);
  }

  hideAll() { this.group.visible = false; }
  clearModel() { if (!this.modelRoot) return; this.group.remove(this.modelRoot); this.disposeObject(this.modelRoot); this.modelRoot = null; }
  disposeObject(object) { object.traverse((child) => { if (!child.isMesh) return; child.geometry?.dispose?.(); const mats = Array.isArray(child.material) ? child.material : [child.material]; mats.forEach(m => m?.dispose?.()); }); }
  destroy() { this.loadToken += 1; this.clearModel(); this.scene.remove(this.group); }
}