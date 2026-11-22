import * as THREE from 'three';
import { isCarModelReady, buildRealCar } from './carModels.js';

export const CAR_CATALOG = [
  {
    id: 'deccan-gt',
    name: 'Deccan GT',
    tag: 'Balanced Supercar',
    bodyColor: 0xff6b1a,
    accentColor: 0xf7c948,
    swatch: 'linear-gradient(90deg, #ff6b1a, #f7c948)',
    stats: { speed: 88, accel: 86, handling: 88 },
    maxSpeed: 56,
    accel: 35,
    turnRate: 2.38,
    type: 'sports',
  },
  {
    id: 'nizam-apex',
    name: 'Nizam Apex',
    tag: 'Top-Speed Hypercar',
    bodyColor: 0x0ea5a4,
    accentColor: 0xf4d35e,
    swatch: 'linear-gradient(90deg, #0ea5a4, #f4d35e)',
    stats: { speed: 97, accel: 82, handling: 84 },
    maxSpeed: 59.5,
    accel: 33.5,
    turnRate: 2.24,
    type: 'sports',
  },
  {
    id: 'cyber-drift',
    name: 'Cyber Drift',
    tag: 'Razor Corner King',
    bodyColor: 0x2563eb,
    accentColor: 0x18d6c4,
    swatch: 'linear-gradient(90deg, #2563eb, #18d6c4)',
    stats: { speed: 85, accel: 93, handling: 97 },
    maxSpeed: 54.5,
    accel: 38.5,
    turnRate: 2.62,
    type: 'sports',
  },
  {
    id: 'turbo-auto',
    name: 'Turbo Auto',
    tag: 'Auto-Rickshaw GT!',
    bodyColor: 0xfacc15,
    accentColor: 0x16a34a,
    swatch: 'linear-gradient(90deg, #facc15, #18181b 55%, #16a34a)',
    stats: { speed: 87, accel: 96, handling: 95 },
    maxSpeed: 55.5,
    accel: 39.5,
    turnRate: 2.58,
    type: 'auto',
  },
  {
    id: 'kaali-peeli',
    name: 'Kaali-Peeli GT',
    tag: 'Widebody Retro Cab',
    bodyColor: 0x18181b,
    accentColor: 0xfacc15,
    swatch: 'linear-gradient(90deg, #18181b 45%, #facc15 55%)',
    stats: { speed: 91, accel: 90, handling: 91 },
    maxSpeed: 57,
    accel: 36.5,
    turnRate: 2.46,
    type: 'taxi',
  },
];

// Rival grid in real factory paint colours
export const AI_COLORS = [
  { bodyColor: 0xa30d12, accentColor: 0xffffff, type: 'sports', skill: 0.96 }, // rosso corsa
  { bodyColor: 0xc7ccd1, accentColor: 0x38bdf8, type: 'sports', skill: 0.93 }, // argento silver
  { bodyColor: 0x0d2a6b, accentColor: 0xfef08a, type: 'sports', skill: 0.9 }, // deep blue
  { bodyColor: 0xf2c200, accentColor: 0x111827, type: 'sports', skill: 0.88 }, // giallo modena
  { bodyColor: 0x0b0b0c, accentColor: 0xfacc15, type: 'sports', skill: 0.86 }, // nero black
];

function createWheel(radius = 0.44, width = 0.36) {
  const wheelGroup = new THREE.Group();
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.86, metalness: 0.12 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.16, metalness: 0.92 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.4 });

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  wheelGroup.add(tire);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, width + 0.03, 14), rimMat);
  rim.rotation.z = Math.PI / 2;
  wheelGroup.add(rim);

  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.35, metalness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(width + 0.05, radius * 1.15, 0.06), spokeMat);
    spoke.rotation.x = (i * Math.PI) / 3;
    wheelGroup.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width + 0.06, 10), caliperMat);
  hub.rotation.z = Math.PI / 2;
  wheelGroup.add(hub);

  return wheelGroup;
}

/**
 * World-class clearcoat vehicle builder facing +Z locally.
 * Separates chassis into `bodyGroup` so physics can apply realistic suspension pitch & roll!
 */
export function buildVehicleMesh({ bodyColor, accentColor, type = 'sports', isPlayer = false, lite = false }) {
  // Real 3D model for sports cars once it has loaded; built-in models otherwise
  if (type === 'sports' && isCarModelReady()) {
    return buildRealCar({ bodyColor, isPlayer, lite });
  }
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Automotive metallic clearcoat paint!
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyColor,
    roughness: 0.22,
    metalness: 0.52,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
  });
  const accentMat = new THREE.MeshPhysicalMaterial({
    color: accentColor,
    roughness: 0.28,
    metalness: 0.5,
    clearcoat: 0.9,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x13161f, roughness: 0.58, metalness: 0.35 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1628,
    roughness: 0.06,
    metalness: 0.92,
    clearcoat: 1.0,
  });
  const headLightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfff5d6,
    emissiveIntensity: 2.1,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xff2233,
    emissive: 0xff1122,
    emissiveIntensity: 1.0,
  });

  // Soft ground contact shadow
  const shadowBlob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.75, 5.05),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.46, depthWrite: false })
  );
  shadowBlob.rotation.x = -Math.PI / 2;
  shadowBlob.position.y = 0.05;
  root.add(shadowBlob);

  const frontWheelPivots = [];
  const wheelMeshes = [];
  const nitroFlames = [];

  if (type === 'auto') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 3.6), darkMat);
    base.position.set(0, 0.62, 0);
    base.castShadow = true;
    bodyGroup.add(base);

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.58, 3.45), bodyMat);
    lowerBody.position.set(0, 0.95, -0.05);
    lowerBody.castShadow = true;
    bodyGroup.add(lowerBody);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.85, 1.0), bodyMat);
    nose.position.set(0, 1.0, 1.48);
    nose.rotation.x = 0.16;
    nose.castShadow = true;
    bodyGroup.add(nose);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.78, 2.5), darkMat);
    roof.position.set(0, 1.72, -0.25);
    roof.castShadow = true;
    bodyGroup.add(roof);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.15, 3.48), accentMat);
    stripe.position.set(0, 0.92, -0.05);
    bodyGroup.add(stripe);

    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.62, 0.12), glassMat);
    shield.position.set(0, 1.62, 1.02);
    shield.rotation.x = -0.2;
    bodyGroup.add(shield);

    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.55), bodyMat);
    wingBlade.position.set(0, 2.28, -1.52);
    wingBlade.rotation.x = 0.14;
    wingBlade.castShadow = true;
    bodyGroup.add(wingBlade);

    for (const sx of [-0.72, 0.72]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.22), darkMat);
      strut.position.set(sx, 1.98, -1.45);
      bodyGroup.add(strut);
    }

    const mainLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), headLightMat);
    mainLamp.rotation.x = Math.PI / 2;
    mainLamp.position.set(0, 0.95, 1.98);
    bodyGroup.add(mainLamp);

    for (const sx of [-0.68, 0.68]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.1), tailLightMat);
      tl.position.set(sx, 0.95, -1.8);
      bodyGroup.add(tl);
    }

    const fPivot = new THREE.Group();
    fPivot.position.set(0, 0.42, 1.48);
    const fWheel = createWheel(0.42, 0.3);
    fPivot.add(fWheel);
    root.add(fPivot);
    frontWheelPivots.push(fPivot);
    wheelMeshes.push(fWheel);

    for (const sx of [-0.95, 0.95]) {
      const rw = createWheel(0.48, 0.42);
      rw.position.set(sx, 0.48, -1.15);
      root.add(rw);
      wheelMeshes.push(rw);
    }
  } else if (type === 'taxi') {
    // Iconic Widebody Kaali-Peeli Indian Retro Cab GT!
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.65, 4.2), bodyMat);
    chassis.position.set(0, 0.66, 0);
    chassis.castShadow = true;
    bodyGroup.add(chassis);

    const yellowTop = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.62, 2.2), accentMat);
    yellowTop.position.set(0, 1.25, -0.15);
    yellowTop.castShadow = true;
    bodyGroup.add(yellowTop);

    const glassBand = new THREE.Mesh(new THREE.BoxGeometry(1.79, 0.44, 2.02), glassMat);
    glassBand.position.set(0, 1.22, -0.15);
    bodyGroup.add(glassBand);

    // Classic glowing "TAXI" roof sign
    const taxiSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.26, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1.4 })
    );
    taxiSign.position.set(0, 1.66, 0.1);
    bodyGroup.add(taxiSign);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.14, 0.55), accentMat);
    splitter.position.set(0, 0.36, 1.98);
    bodyGroup.add(splitter);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.1, 0.48), accentMat);
    wing.position.set(0, 1.38, -1.92);
    bodyGroup.add(wing);

    for (const sx of [-0.72, 0.72]) {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), headLightMat);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(sx, 0.72, 2.1);
      bodyGroup.add(hl);
    }

    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.18, 0.1), tailLightMat);
    tailBar.position.set(0, 0.72, -2.12);
    bodyGroup.add(tailBar);

    for (const wp of [
      { x: -1.06, z: 1.32, front: true },
      { x: 1.06, z: 1.32, front: true },
      { x: -1.08, z: -1.28, front: false },
      { x: 1.08, z: -1.28, front: false },
    ]) {
      const wheel = createWheel(0.45, 0.38);
      if (wp.front) {
        const pivot = new THREE.Group();
        pivot.position.set(wp.x, 0.45, wp.z);
        pivot.add(wheel);
        root.add(pivot);
        frontWheelPivots.push(pivot);
      } else {
        wheel.position.set(wp.x, 0.45, wp.z);
        root.add(wheel);
      }
      wheelMeshes.push(wheel);
    }
  } else {
    // Sleek Low-Slung Clearcoat Hypercar
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.5, 4.4), bodyMat);
    chassis.position.set(0, 0.56, 0);
    chassis.castShadow = true;
    bodyGroup.add(chassis);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.34, 1.7), bodyMat);
    hood.position.set(0, 0.76, 1.25);
    hood.rotation.x = 0.13;
    hood.castShadow = true;
    bodyGroup.add(hood);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 4.44), accentMat);
    stripe.position.set(0, 0.85, 0.0);
    bodyGroup.add(stripe);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.55, 1.9), glassMat);
    cabin.position.set(0, 1.04, -0.2);
    cabin.castShadow = true;
    bodyGroup.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.12, 1.28), bodyMat);
    roof.position.set(0, 1.34, -0.26);
    bodyGroup.add(roof);

    // Side mirrors
    for (const sx of [-1.05, 1.05]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.22), bodyMat);
      mirror.position.set(sx, 0.96, 0.42);
      bodyGroup.add(mirror);
    }

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.12, 0.56), darkMat);
    splitter.position.set(0, 0.32, 2.06);
    bodyGroup.add(splitter);

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.24, 0.46), darkMat);
    diffuser.position.set(0, 0.36, -2.08);
    bodyGroup.add(diffuser);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.5), accentMat);
    wing.position.set(0, 1.28, -1.96);
    wing.rotation.x = 0.12;
    wing.castShadow = true;
    bodyGroup.add(wing);

    for (const sx of [-0.74, 0.74]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.26), darkMat);
      strut.position.set(sx, 1.04, -1.92);
      bodyGroup.add(strut);
    }

    for (const sx of [-0.74, 0.74]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.14), headLightMat);
      hl.position.set(sx, 0.62, 2.18);
      bodyGroup.add(hl);
    }

    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.15, 0.1), tailLightMat);
    tailBar.position.set(0, 0.72, -2.21);
    bodyGroup.add(tailBar);

    for (const wp of [
      { x: -1.06, z: 1.38, front: true },
      { x: 1.06, z: 1.38, front: true },
      { x: -1.08, z: -1.34, front: false },
      { x: 1.08, z: -1.34, front: false },
    ]) {
      const wheel = createWheel(wp.front ? 0.43 : 0.46, wp.front ? 0.35 : 0.42);
      if (wp.front) {
        const pivot = new THREE.Group();
        pivot.position.set(wp.x, 0.43, wp.z);
        pivot.add(wheel);
        root.add(pivot);
        frontWheelPivots.push(pivot);
      } else {
        wheel.position.set(wp.x, 0.46, wp.z);
        root.add(wheel);
      }
      wheelMeshes.push(wheel);
    }
  }

  // Twin Nitro Exhaust Flame Cones
  const flameGeo = new THREE.ConeGeometry(0.24, 1.5, 8);
  flameGeo.rotateX(-Math.PI / 2);
  for (const sx of [-0.46, 0.46]) {
    const flame = new THREE.Mesh(
      flameGeo,
      new THREE.MeshBasicMaterial({ color: 0x18d6c4, transparent: true, opacity: 0.92 })
    );
    flame.position.set(sx, 0.46, type === 'auto' ? -2.38 : -2.72);
    flame.visible = false;
    bodyGroup.add(flame);
    nitroFlames.push(flame);
  }

  return {
    root,
    bodyGroup,
    frontWheelPivots,
    wheelMeshes,
    tailLightMat,
    nitroFlames,
  };
}
