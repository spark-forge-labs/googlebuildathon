import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Real car model: Ferrari 458 Italia by vicent091036 (CC-BY 4.0),
 * shipped with the three.js examples. Loaded once, cloned per racer with its
 * own paint, brake lights and wheel pivots that plug into the existing rig.
 */
const BASE = import.meta.env.BASE_URL || '/';
const TARGET_LENGTH = 4.9; // game units (procedural cars are ~5)

let template = null;
let aoTexture = null;
let loading = null;

// Interior parts are hidden on AI cars / phones (tinted glass hides them anyway)
const INTERIOR = new Set([
  'interior_light',
  'interior_dark',
  'leather',
  'carpet',
  'trim',
  'steering_wheel',
]);

export function isCarModelReady() {
  return template !== null;
}

export function preloadCarModel() {
  if (loading) return loading;
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${BASE}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  aoTexture = new THREE.TextureLoader().load(`${BASE}models/ferrari_ao.png`);
  aoTexture.colorSpace = THREE.SRGBColorSpace;

  loading = new Promise((resolve) => {
    loader.load(
      `${BASE}models/ferrari.glb`,
      (gltf) => {
        const model = gltf.scene.children[0];
        const box = new THREE.Box3().setFromObject(model);
        const len = box.getSize(new THREE.Vector3()).z;
        model.userData.scale = TARGET_LENGTH / len;

        // Shared, upgraded PBR materials
        const shared = {
          tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, metalness: 0 }),
          rim: new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.28, metalness: 1 }),
          chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 1 }),
          glass: new THREE.MeshPhysicalMaterial({
            color: 0x0d1117,
            roughness: 0.02,
            metalness: 0.1,
            transparent: true,
            opacity: 0.82,
            clearcoat: 1,
            envMapIntensity: 2.2,
          }),
          headlight: new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.05,
            metalness: 0.2,
            emissive: 0xfff4e0,
            emissiveIntensity: 0.6,
          }),
        };

        model.traverse((o) => {
          if (!o.isMesh) return;
          const n = o.name;
          if (n.startsWith('tire')) o.material = shared.tire;
          else if (n.startsWith('rim') || n.startsWith('wheel')) o.material = shared.rim;
          else if (n === 'chrome') o.material = shared.chrome;
          else if (n === 'glass') o.material = shared.glass;
          else if (n === 'lights') o.material = shared.headlight;
          o.castShadow = n === 'body' || n === 'glass' || n.startsWith('tire');
          o.receiveShadow = false;
        });

        template = model;
        resolve(template);
      },
      undefined,
      (err) => {
        console.warn('Car model failed to load, using built-in cars', err);
        resolve(null);
      }
    );
  });
  return loading;
}

/**
 * Builds a rig compatible with Racer.syncVisual():
 * { root, bodyGroup, frontWheelPivots, wheelMeshes, tailLightMat, nitroFlames }
 */
export function buildRealCar({ bodyColor, isPlayer = false, lite = false }) {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Model faces -Z; the game's cars face +Z
  const holder = new THREE.Group();
  holder.rotation.y = Math.PI;
  const s = template.userData.scale;
  holder.scale.setScalar(s);
  bodyGroup.add(holder);

  const car = template.clone(true);
  holder.add(car);

  // Factory-style paint: metallic flake + glossy clearcoat
  const paint = new THREE.MeshPhysicalMaterial({
    color: bodyColor,
    metalness: 0.85,
    roughness: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.4,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0x7a0a0a,
    roughness: 0.1,
    emissive: 0xff1a1a,
    emissiveIntensity: 0.9,
  });

  const hideInterior = lite || !isPlayer;
  car.traverse((o) => {
    if (o.name === 'body') o.material = paint;
    if (o.name === 'brakes' || o.name === 'lights_red') o.material = tailLightMat;
    if (hideInterior && INTERIOR.has(o.name)) o.visible = false;
  });

  const frontWheelPivots = [];
  const wheelMeshes = [];
  for (const name of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
    const w = car.getObjectByName(name);
    if (!w) continue;
    w.rotation.order = 'YXZ'; // spin about the axle first, then steer
    w.userData.spinSign = -1; // model is mounted backwards inside the rig
    wheelMeshes.push(w);
    if (name === 'wheel_fl' || name === 'wheel_fr') frontWheelPivots.push(w);
  }

  // Baked ambient-occlusion contact shadow under the car
  const ao = new THREE.Mesh(
    new THREE.PlaneGeometry(0.655 * 4 * s, 1.3 * 4 * s),
    new THREE.MeshBasicMaterial({
      map: aoTexture,
      blending: THREE.MultiplyBlending,
      toneMapped: false,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    })
  );
  ao.rotation.x = -Math.PI / 2;
  ao.position.y = 0.02;
  ao.renderOrder = 2;
  root.add(ao);

  // Exhaust nitro flames (hidden until boosting)
  const nitroFlames = [];
  const flameGeo = new THREE.ConeGeometry(0.16, 1.2, 10);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x6ab8ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const sx of [-0.32, 0.32]) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(sx, 0.48, -TARGET_LENGTH / 2 - 0.55);
    flame.visible = false;
    bodyGroup.add(flame);
    nitroFlames.push(flame);
  }

  return { root, bodyGroup, frontWheelPivots, wheelMeshes, tailLightMat, nitroFlames, isRealModel: true };
}
