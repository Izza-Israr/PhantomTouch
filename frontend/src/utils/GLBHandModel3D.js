import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const HAND_MODEL_PATHS = {
  LEFT: '../../public/models/left.glb',
  RIGHT: '../../public/models/right.glb',
};

const REALISTIC_HAND_PATH = '../../public/models/rigged_hand_-_game_model.glb';
const DEFAULT_SKIN_HEX = '#c98f6f';

const REALISTIC_FINGER_BONES = {
  thumb: {
    bones: ['Bone.003_014', 'Bone.004_015', 'Bone.005_016'],
    landmarks: [1, 2, 3, 4],
    axis: new THREE.Vector3(0, 0, 1),
    curlSign: 1,
  },
  index: {
    bones: ['Bone.009_02', 'Bone.010_03', 'Bone.011_04'],
    landmarks: [5, 6, 7, 8],
    axis: new THREE.Vector3(1, 0, 0),
    curlSign: -1,
  },
  middle: {
    bones: ['Bone.012_05', 'Bone.013_06', 'Bone.014_07'],
    landmarks: [9, 10, 11, 12],
    axis: new THREE.Vector3(1, 0, 0),
    curlSign: -1,
  },
  ring: {
    bones: ['Bone.015_08', 'Bone.016_09', 'Bone.017_010'],
    landmarks: [13, 14, 15, 16],
    axis: new THREE.Vector3(1, 0, 0),
    curlSign: -1,
  },
  pinky: {
    bones: ['Bone.018_011', 'Bone.019_012', 'Bone.020_013'],
    landmarks: [17, 18, 19, 20],
    axis: new THREE.Vector3(1, 0, 0),
    curlSign: -1,
  },
};

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 17], [5, 9], [9, 13], [13, 17],
];

const PALM_TRIANGLES = [
  0, 5, 9,
  0, 9, 13,
  0, 13, 17,
  5, 17, 13,
  5, 13, 9,
];

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

    this.surfaceGroup = new THREE.Group();
    this.group.add(this.surfaceGroup);

    this.modelGroup = new THREE.Group();
    this.group.add(this.modelGroup);

    this.jointCount = 21;

    this.skinMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(DEFAULT_SKIN_HEX),
      roughness: 0.74,
      metalness: 0.0,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
    });
    this.shadowMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f4b3d,
      roughness: 0.86,
      metalness: 0.0,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
    });

    this.jointMeshes = [];
    this.segmentMeshes = [];
    this.palmMesh = null;
    this.createSurfaceHand();

    this.loader = new GLTFLoader();
    this.currentSide = null;
    this.loadToken = 0;
    this.modelRoot = null;
    this.bonesByName = new Map();
    this.boneBindPositions = new Map();
    this.realisticModelLoaded = false;
    this.realisticBones = new Map();
    this.realisticBindQuaternions = new Map();

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
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
    this._tmpAxisQuat = new THREE.Quaternion();
  }

  update(landmarks, camera, isPhantom = false) {
    if (!landmarks || landmarks.length === 0 || !camera) {
      this.hideAll();
      return null;
    }

    if (this.options.visualMode !== 'surface') {
      this.loadRealisticModel();
    } else if (this.options.useGlbRig) {
      this.loadSide(this.getConfiguredSide());
    }

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

    const useGlbRig = this.options.visualMode === 'surface' && this.options.useGlbRig;
    const showRealistic = this.options.visualMode !== 'surface' && this.realisticModelLoaded;

    this.updateSkinTone();

    if (useGlbRig) {
      this.surfaceGroup.visible = false;
      this.modelGroup.visible = true;
      this.loadSide(this.getConfiguredSide());
    } else {
      this.surfaceGroup.visible = true;
      this.modelGroup.visible = true;
      this.setSurfaceOpacity(showRealistic ? 0.32 : 0.96);
      this.updateSurfaceHand();
    }

    if (showRealistic) {
      this.updateRealisticHand();
    }

    if (useGlbRig) {
      this.placeModelFromPalm();
      this.updateBonePose();
    }

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
        this.modelGroup.add(root);
      },
      undefined,
      (error) => {
        console.error(`Failed to load ${HAND_MODEL_PATHS[side]}`, error);
      }
    );
  }

  loadRealisticModel() {
    if (this.currentSide === 'REALISTIC') return;

    this.currentSide = 'REALISTIC';
    this.loadToken += 1;
    const token = this.loadToken;

    this.clearModel();

    this.loader.load(
      REALISTIC_HAND_PATH,
      (gltf) => {
        if (token !== this.loadToken) {
          this.disposeObject(gltf.scene);
          return;
        }

        const root = gltf.scene;
        this.normalizeModel(root);
        this.cacheRealisticBones(root);

        root.traverse((child) => {
          if (!child.isMesh) return;
          child.frustumCulled = false;
          child.castShadow = false;
          child.receiveShadow = false;

          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const clonedMaterials = materials.map((material) => {
            const clone = material.clone();
            clone.side = THREE.DoubleSide;
            clone.roughness = Math.max(clone.roughness ?? 0.55, 0.62);
            clone.metalness = 0.0;

            if (!clone.map && clone.color) {
              clone.color.set(this.getSkinToneHex());
            }

            clone.needsUpdate = true;
            return clone;
          });

          child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
        });

        this.modelRoot = root;
        this.realisticModelLoaded = true;
        this.modelGroup.add(root);
      },
      undefined,
      (error) => {
        console.error(`Failed to load ${REALISTIC_HAND_PATH}`, error);
        this.currentSide = null;
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

  createSurfaceHand() {
    const sphereGeometry = new THREE.SphereGeometry(1, 20, 14);
    const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
    const palmGeometry = new THREE.BufferGeometry();
    const palmPositions = new Float32Array(PALM_TRIANGLES.length * 3);

    palmGeometry.setAttribute('position', new THREE.BufferAttribute(palmPositions, 3));
    palmGeometry.computeVertexNormals();

    this.palmMesh = new THREE.Mesh(palmGeometry, this.skinMaterial);
    this.palmMesh.frustumCulled = false;
    this.surfaceGroup.add(this.palmMesh);

    for (let i = 0; i < this.jointCount; i++) {
      const mesh = new THREE.Mesh(sphereGeometry, this.skinMaterial);
      mesh.frustumCulled = false;
      this.jointMeshes.push(mesh);
      this.surfaceGroup.add(mesh);
    }

    HAND_CONNECTIONS.forEach(() => {
      const mesh = new THREE.Mesh(cylinderGeometry, this.skinMaterial);
      mesh.frustumCulled = false;
      this.segmentMeshes.push(mesh);
      this.surfaceGroup.add(mesh);
    });

    const shadowPalm = this.palmMesh.clone();
    shadowPalm.material = this.shadowMaterial;
    shadowPalm.position.z = -0.03;
    shadowPalm.scale.setScalar(1.04);
    this.surfaceGroup.add(shadowPalm);
  }

  updateSkinTone() {
    const nextHex = this.getSkinToneHex();
    if (this.currentSkinHex === nextHex) return;

    this.currentSkinHex = nextHex;
    this.skinMaterial.color.set(nextHex);
    this.skinMaterial.needsUpdate = true;
  }

  setSurfaceOpacity(opacity) {
    if (this.skinMaterial.opacity === opacity) return;

    this.skinMaterial.opacity = opacity;
    this.skinMaterial.depthWrite = opacity > 0.8;
    this.skinMaterial.needsUpdate = true;
  }

  getSkinToneHex() {
    const configured = this.configRef.current?.skinToneSliderHex;
    if (!configured || configured.toLowerCase() === '#aa3bff') {
      return DEFAULT_SKIN_HEX;
    }

    return configured;
  }

  updateSurfaceHand() {
    this.surfaceGroup.visible = true;

    this.updatePalmMesh();

    for (let i = 0; i < this.jointMeshes.length; i++) {
      const mesh = this.jointMeshes[i];
      const point = this.smoothedPositions[i];
      const radius = this.getJointRadius(i);

      mesh.position.copy(point);
      mesh.scale.setScalar(radius);
    }

    HAND_CONNECTIONS.forEach(([startIndex, endIndex], index) => {
      this.updateSegmentMesh(
        this.segmentMeshes[index],
        this.smoothedPositions[startIndex],
        this.smoothedPositions[endIndex],
        this.getSegmentRadius(startIndex, endIndex)
      );
    });
  }

  updatePalmMesh() {
    const positionAttribute = this.palmMesh.geometry.attributes.position;
    const positions = positionAttribute.array;

    for (let i = 0; i < PALM_TRIANGLES.length; i++) {
      const point = this.smoothedPositions[PALM_TRIANGLES[i]];
      const offset = i * 3;
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = point.z - 0.015;
    }

    positionAttribute.needsUpdate = true;
    this.palmMesh.geometry.computeVertexNormals();
  }

  updateSegmentMesh(mesh, start, end, radius) {
    const distance = start.distanceTo(end);
    if (distance < 0.001) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.scale.set(radius, distance, radius);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3().subVectors(end, start).normalize()
    );
  }

  getJointRadius(index) {
    if (index === 0) return 0.12;
    if ([5, 9, 13, 17].includes(index)) return 0.105;
    if ([4, 8, 12, 16, 20].includes(index)) return 0.068;
    return 0.082;
  }

  getSegmentRadius(startIndex, endIndex) {
    if (startIndex === 0 || [5, 9, 13, 17].includes(startIndex)) return 0.062;
    if ([4, 8, 12, 16, 20].includes(endIndex)) return 0.044;
    return 0.052;
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

  cacheRealisticBones(root) {
    this.realisticBones.clear();
    this.realisticBindQuaternions.clear();

    const wantedNames = new Set([
      'Bone_00',
      'Bone.001_01',
      ...Object.values(REALISTIC_FINGER_BONES).flatMap((finger) => finger.bones),
    ]);

    root.traverse((child) => {
      if (!wantedNames.has(child.name)) return;

      this.realisticBones.set(child.name, child);
      this.realisticBindQuaternions.set(child.name, child.quaternion.clone());
    });
  }

  updateRealisticHand() {
    if (!this.modelRoot) return;

    this.surfaceGroup.visible = true;
    this.modelRoot.visible = true;
    this.placeRealisticModelFromPalm();
    this.curlRealisticFingers();
  }

  placeRealisticModelFromPalm() {
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

    this.modelGroup.position.lerp(this._palmCenter, 0.45);

    this._tmpA.subVectors(middleBase, wrist);
    if (this._tmpA.lengthSq() > 0.0001) {
      const targetRotationZ = Math.atan2(this._tmpA.y, this._tmpA.x) - Math.PI / 2;
      let delta = targetRotationZ - this.currentRotationZ;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.currentRotationZ += delta * this.rotationSmoothing;
      this.modelGroup.rotation.set(0, 0, this.currentRotationZ);
    }

    const palmWidth = indexBase.distanceTo(pinkyBase);
    const palmLength = wrist.distanceTo(middleBase);
    const trackedSize = Math.max(palmWidth * 1.18, palmLength * 0.78, 0.18);
    const profileScale = this.configRef.current?.meshScaleMultiplier || 1;
    const targetScale = trackedSize * (this.options.realisticScaleMultiplier ?? 1.9) * profileScale;

    this.currentScale = THREE.MathUtils.lerp(this.currentScale, targetScale, this.scaleSmoothing);

    const sideScale = this.getConfiguredSide() === 'RIGHT' ? -this.currentScale : this.currentScale;
    this.modelGroup.scale.set(sideScale, this.currentScale, this.currentScale);
  }

  curlRealisticFingers() {
    for (const finger of Object.values(REALISTIC_FINGER_BONES)) {
      const curl = this.getFingerCurl(finger.landmarks);

      finger.bones.forEach((boneName, index) => {
        const bone = this.realisticBones.get(boneName);
        const bindQuaternion = this.realisticBindQuaternions.get(boneName);
        if (!bone || !bindQuaternion) return;

        const curlWeight = index === 0 ? 0.55 : index === 1 ? 0.82 : 0.65;
        const curlAngle = curl * curlWeight * finger.curlSign;

        this._tmpAxisQuat.setFromAxisAngle(finger.axis, curlAngle);
        this._tmpQuat.copy(bindQuaternion).multiply(this._tmpAxisQuat);
        bone.quaternion.slerp(this._tmpQuat, 0.28);
      });
    }
  }

  getFingerCurl([baseIndex, midIndex, distalIndex, tipIndex]) {
    const base = this.smoothedPositions[baseIndex];
    const mid = this.smoothedPositions[midIndex];
    const distal = this.smoothedPositions[distalIndex];
    const tip = this.smoothedPositions[tipIndex];

    const firstBend = this.getJointBend(base, mid, distal);
    const secondBend = this.getJointBend(mid, distal, tip);
    const averageBend = (firstBend * 0.62) + (secondBend * 0.38);

    return THREE.MathUtils.clamp(averageBend * 0.9, 0, 1.05);
  }

  getJointBend(a, b, c) {
    this._tmpA.subVectors(a, b).normalize();
    this._tmpB.subVectors(c, b).normalize();

    const angle = this._tmpA.angleTo(this._tmpB);
    const straightAngle = Math.PI;

    return THREE.MathUtils.clamp(straightAngle - angle, 0, 1.35);
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
    if (this.modelRoot) {
      this.modelGroup.remove(this.modelRoot);
      this.disposeObject(this.modelRoot);
    }

    this.modelRoot = null;
    this.modelGroup.position.set(0, 0, 0);
    this.modelGroup.rotation.set(0, 0, 0);
    this.modelGroup.scale.set(1, 1, 1);
    this.bonesByName.clear();
    this.boneBindPositions.clear();
    this.realisticBones.clear();
    this.realisticBindQuaternions.clear();
    this.realisticModelLoaded = false;
  }

  disposeObject(object) {
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }

  disposeSurfaceHand() {
    const geometries = new Set();
    this.surfaceGroup.traverse((child) => {
      if (child.isMesh && child.geometry) {
        geometries.add(child.geometry);
      }
    });

    geometries.forEach((geometry) => geometry.dispose());
    this.skinMaterial.dispose();
    this.shadowMaterial.dispose();
  }

  destroy() {
    this.loadToken += 1;
    this.clearModel();
    this.disposeSurfaceHand();
    this.scene.remove(this.group);
  }
}
