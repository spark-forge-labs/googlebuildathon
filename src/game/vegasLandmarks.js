import * as THREE from 'three';
import { mat, box, cyl, finish, facadeMaterial } from './worldKit.js';
import { makeRealWaterMaterial } from './realWorld.js';
import { nightClock } from './nightCity.js';
import { coconutPalm } from './newCityLandmarks.js';

/**
 * Las Vegas night circuit (all names fictional):
 *  (44,12)  a giant LED sphere showing animated content
 *  (-5,11)  fountain lake with a dancing water show, crescent resort tower behind
 *  (78,-52) gold slab tower and twin towers with neon crowns, an observation wheel to the east
 *  plus neon pylon signs and palms along the Strip.
 */
export function buildVegasLandmarks(group, animTargets, addCol) {
  const animated = animTargets.animated || [];
  buildLedSphere(group, 44, 12);
  addCol(44, 12, 18);
  buildFountainLake(group, animTargets.waterMeshes, animated, -5, 13);
  buildCrescentResort(group, -5, -9, 'DESERT STAR');
  addCol(-5, 6, 22);
  buildGoldTower(group, 78, -58, 'AURUM');
  buildTwinTowers(group, 108, -30, 'ROYAL FLUSH');
  addCol(78, -58, 16);
  addCol(108, -30, 14);
  buildObservationWheel(group, animated, 124, 14);
  addCol(124, 14, 12);
  const signs = [
    ['LUCKY 7', 'RESORT • CASINO', '#ff2fb4', '#ffd84d'],
    ['NEON NIGHTS', 'LIVE SHOWS NIGHTLY', '#29e0ff', '#ff5ad1'],
    ['JACKPOT PALACE', 'BUFFET • SLOTS • SPA', '#ffc23d', '#ff3b3b'],
    ['STARLIGHT', 'HOTEL & ARENA', '#a855f7', '#7cf7ff'],
  ];
  const signSpots = [[-62, 72], [30, 76], [-104, -6], [42, -70]];
  signs.forEach((s, i) => {
    const [x, z] = signSpots[i];
    buildNeonPylon(group, x, z, Math.atan2(-x, -z), ...s);
    addCol(x, z, 5);
  });
  // palms along the Strip median and infield promenades
  const palms = [
    [-30, 31], [-14, 31], [2, 31], [18, 31], [34, 31], [-46, 31],
    [20, -4], [64, 26], [64, 0], [24, 28], [-50, -2], [-50, 14], [36, -14],
  ];
  palms.forEach(([x, z], i) => coconutPalm(group, x, z, 9 + (i % 3), 0.18 + (i % 4) * 0.05, i * 1.7));
  return true;
}

/* ---------------- LED sphere ---------------- */
const SPHERE_FRAG = /* glsl */ `
uniform float time;
varying vec2 vUv;
varying vec3 vPos;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0 + i.z * 113.0;
  vec4 h = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
  vec4 h2 = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 a = mix(h, h2, f.z);
  return mix(mix(a.x, a.y, f.x), mix(a.z, a.w, f.x), f.y);
}
float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
vec3 globe(vec3 p) {
  float c = cos(time * 0.25), s = sin(time * 0.25);
  p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  float land = fbm(p * 2.2 + 3.0);
  vec3 ocean = mix(vec3(0.02, 0.12, 0.45), vec3(0.05, 0.35, 0.8), fbm(p * 6.0));
  vec3 ground = mix(vec3(0.1, 0.45, 0.12), vec3(0.6, 0.45, 0.2), fbm(p * 5.0 + 9.0));
  vec3 col = mix(ocean, ground, smoothstep(0.52, 0.56, land));
  col = mix(col, vec3(1.0), smoothstep(0.82, 0.9, abs(p.y)));
  float cloud = smoothstep(0.55, 0.75, fbm(p * 3.0 + vec3(time * 0.05, 0.0, 0.0)));
  return mix(col, vec3(1.0), cloud * 0.6);
}
vec3 flag(vec2 uv) {
  float wave = sin(uv.x * 12.0 - time * 3.0) * 0.04;
  vec2 g = floor(vec2(uv.x * 24.0, (uv.y + wave) * 12.0));
  float chk = mod(g.x + g.y, 2.0);
  float shade = 0.75 + 0.25 * sin(uv.x * 12.0 - time * 3.0 + 1.2);
  return vec3(chk) * shade + vec3(0.02);
}
vec3 plasma(vec2 uv) {
  float v = sin(uv.x * 18.0 + time) + sin(uv.y * 14.0 - time * 1.3) + sin((uv.x + uv.y) * 10.0 + time * 0.7);
  return 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + v + time * 0.5);
}
void main() {
  float cycle = mod(time, 30.0);
  vec3 a = globe(normalize(vPos));
  vec3 b = flag(vUv);
  vec3 c = plasma(vUv);
  float wa = 1.0 - smoothstep(9.0, 10.0, cycle) + smoothstep(29.0, 30.0, cycle);
  float wb = smoothstep(9.0, 10.0, cycle) * (1.0 - smoothstep(19.0, 20.0, cycle));
  float wc = smoothstep(19.0, 20.0, cycle) * (1.0 - smoothstep(29.0, 30.0, cycle));
  vec3 col = a * wa + b * wb + c * wc;
  // LED pixel grid
  vec2 px = fract(vUv * vec2(420.0, 210.0)) - 0.5;
  col *= 0.55 + 0.45 * smoothstep(0.5, 0.2, length(px));
  gl_FragColor = vec4(col * 1.35, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function buildLedSphere(group, x, z) {
  const R = 15;
  const m = new THREE.ShaderMaterial({
    uniforms: { time: nightClock },
    vertexShader: 'varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SPHERE_FRAG,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32), m);
  ball.position.set(x, R + 2.2, z);
  ball.userData.noMerge = true;
  group.add(ball);
  const plinth = finish(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.65, 3, 32), mat(0x2b2d33, 0.6, 0.4)));
  plinth.position.set(x, 1.5, z);
  group.add(plinth);
  // ring of up-lights round the base
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9ad8ff, emissiveIntensity: 3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.66, 0.18, 6, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 3.05, z);
  group.add(ring);
}

/* ---------------- fountain lake ---------------- */
function buildFountainLake(group, waterMeshes, animated, x, z) {
  const W = 40;
  const D = 17;
  const rim = finish(new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 0.7, D + 1.6), mat(0xc9bfae, 0.7)));
  rim.position.set(x, 0.3, z);
  group.add(rim);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W, D), makeRealWaterMaterial(0x1b4a6b));
  water.material.normalMap.repeat.set(6, 3);
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.68, z);
  group.add(water);
  waterMeshes.push(water);

  // dancing jets: additive glowing water columns that rise and fall to the "music"
  // water columns: dense at the nozzle, dissolving into spray towards the top
  const fade = document.createElement('canvas');
  fade.width = 4;
  fade.height = 64;
  const fg = fade.getContext('2d');
  const grd = fg.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,1)');
  fg.fillStyle = grd;
  fg.fillRect(0, 0, 4, 64);
  const jetMat = new THREE.MeshBasicMaterial({
    color: 0xd6ecff,
    alphaMap: new THREE.CanvasTexture(fade),
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jetGeo = new THREE.CylinderGeometry(0.03, 0.24, 1, 8, 1, true);
  jetGeo.translate(0, 0.5, 0);
  const N = 22;
  const jets = new THREE.InstancedMesh(jetGeo, jetMat, N);
  const mistGeo = new THREE.SphereGeometry(1, 10, 6);
  const mist = new THREE.InstancedMesh(mistGeo, new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }), N);
  const base = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // a gentle arc across the lake
    base.push(new THREE.Vector3(x - W * 0.42 + t * W * 0.84, 0.7, z + Math.sin(t * Math.PI) * -3.5 + 2));
  }
  const dummy = new THREE.Object3D();
  const holder = new THREE.Group();
  holder.add(jets, mist);
  holder.userData.animate = (time) => {
    const cyc = time % 24;
    const show = cyc < 13 ? Math.min(1, cyc / 1.2) * Math.min(1, (13 - cyc) / 1.2) : 0;
    for (let i = 0; i < N; i++) {
      const wave = Math.max(0, Math.sin(time * 2.2 - i * 0.55));
      const pulse = Math.pow(wave, 2) * (0.55 + 0.45 * Math.sin(time * 0.7 + i));
      const h = 1.2 + show * (4 + 16 * pulse);
      dummy.position.copy(base[i]);
      dummy.rotation.set(0, 0, Math.sin(time * 0.9 + i * 0.4) * 0.12 * show);
      dummy.scale.set(1 + show * 0.4, h, 1 + show * 0.4);
      dummy.updateMatrix();
      jets.setMatrixAt(i, dummy.matrix);
      dummy.position.y = base[i].y + h;
      dummy.rotation.set(0, 0, 0);
      const s = 0.4 + show * pulse * 2.6;
      dummy.scale.set(s, s * 0.45, s);
      dummy.updateMatrix();
      mist.setMatrixAt(i, dummy.matrix);
    }
    jets.instanceMatrix.needsUpdate = true;
    mist.instanceMatrix.needsUpdate = true;
  };
  holder.userData.animate(0);
  group.add(holder);
  animated.push(holder);
}

/* ---------------- resorts ---------------- */
function neonSignTexture(text, sub, color, accent, w = 1024, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#05040a';
  g.fillRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 28;
  g.fillStyle = color;
  let size = Math.round(h * (sub ? 0.5 : 0.62));
  g.font = `italic 900 ${size}px system-ui, sans-serif`;
  while (g.measureText(text).width > w * 0.9 && size > 20) g.font = `italic 900 ${(size -= 4)}px system-ui, sans-serif`;
  g.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
  g.fillStyle = '#ffffff';
  g.shadowBlur = 8;
  g.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
  if (sub) {
    g.shadowColor = accent;
    g.shadowBlur = 16;
    g.fillStyle = accent;
    g.font = `800 ${Math.round(h * 0.17)}px system-ui, sans-serif`;
    g.fillText(sub, w / 2, h * 0.8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function neonMaterial(tex, intensity = 2.4) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.6 });
}

/** Neon name sign; planes centred on (x,y,z) facing yaw ry (and the back too), pushed out by depth. */
function crown(group, x, y, z, ry, w, text, color, depth = 0.6, twoSided = true) {
  const tex = neonSignTexture(text, null, color, color, 1024, 192);
  const m = neonMaterial(tex, 2.6);
  for (const s of twoSided ? [1, -1] : [1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19), m);
    p.position.set(x, y, z);
    p.rotation.y = ry + (s < 0 ? Math.PI : 0);
    p.translateZ(depth);
    group.add(p);
  }
}

/** Curved slab tower: arc in plan (radii r0..r1, half-angle ha), its middle at (x,z), bowing towards yaw. */
function arcTower(group, x, z, yaw, r0, r1, ha, H, material) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r1, -ha, ha, false);
  shape.absarc(0, 0, r0, ha, -ha, true);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  const t = finish(new THREE.Mesh(geo, material), false);
  t.receiveShadow = true;
  const rm = (r0 + r1) / 2;
  t.rotation.y = -Math.PI / 2 + yaw; // local +x (the arc) now points along yaw
  t.position.set(x - Math.sin(yaw) * rm, 0, z - Math.cos(yaw) * rm);
  group.add(t);
  return t;
}

function buildCrescentResort(group, x, z, name) {
  // a gently curved hotel slab bowing towards the lake (+z)
  const H = 58;
  arcTower(group, x, z, 0, 46, 53, 0.42, H, facadeMaterial('glass', 0xe8d7b0, 1 / 14, 1 / 14));
  box(group, 64, 7, 14, mat(0xd9ccb2, 0.8), x, 3.5, z - 2);
  crown(group, x, H + 3.4, z, 0, 34, name, '#ffd36b', 3.9);
}

function buildGoldTower(group, x, z, name) {
  const yaw = Math.atan2(-x, -z); // bow towards the circuit
  const H = 118;
  arcTower(group, x, z, yaw, 33, 40, 0.3, H, facadeMaterial('glass', 0xd9a441, 1 / 14, 1 / 14));
  crown(group, x, H + 4, z, yaw, 22, name, '#ffcf5a', 3.9);
}

function buildTwinTowers(group, x, z, name) {
  for (const dz of [-9, 9]) {
    const tw = finish(new THREE.Mesh(new THREE.BoxGeometry(13, 84, 13), facadeMaterial('glass', 0xc9d6e8, 1, 6)), false);
    tw.position.set(x, 42, z + dz);
    group.add(tw);
    const cap = finish(new THREE.Mesh(new THREE.ConeGeometry(7.5, 10, 4), mat(0x9fb4c8, 0.3, 0.8)), false);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(x, 89, z + dz);
    group.add(cap);
  }
  box(group, 18, 10, 34, mat(0x2a2f3a, 0.6, 0.4), x, 5, z);
  // sky-bridge sign across both towers, facing the circuit (west)
  crown(group, x, 64, z, -Math.PI / 2, 30, name, '#ff4fd8', 6.7, false);
}

/* ---------------- observation wheel ---------------- */
function buildObservationWheel(group, animated, x, z) {
  const R = 26;
  const hub = new THREE.Vector3(x, R + 4, z);
  const legMat = mat(0xd8dde4, 0.4, 0.7);
  for (const s of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const a = new THREE.Vector3(x + s * 14, 0, z + dz * 3.5);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, a.distanceTo(hub), 8), legMat);
      leg.position.copy(a).add(hub).multiplyScalar(0.5);
      leg.lookAt(hub);
      leg.rotateX(Math.PI / 2);
      finish(leg);
      group.add(leg);
    }
  }
  const wheel = new THREE.Group();
  wheel.position.copy(hub);
  wheel.rotation.y = Math.PI / 2; // faces the circuit (west)
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2f6d, emissiveIntensity: 2.6 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 8, 96), rimMat));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.96, 0.18, 6, 96), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 1.6 })));
  const spokeMat = mat(0xcfd6de, 0.4, 0.8);
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, R, 4), spokeMat);
    sp.position.set(Math.cos((i / 16) * Math.PI * 2) * R * 0.5, Math.sin((i / 16) * Math.PI * 2) * R * 0.5, 0);
    sp.rotation.z = (i / 16) * Math.PI * 2 - Math.PI / 2;
    wheel.add(sp);
  }
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x7cc8ff, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.3 });
  const cabs = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 12, 8), cabMat, 28);
  const d = new THREE.Object3D();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    d.position.set(Math.cos(a) * (R + 1.6), Math.sin(a) * (R + 1.6), 0);
    d.scale.set(1, 1, 1.5);
    d.updateMatrix();
    cabs.setMatrixAt(i, d.matrix);
  }
  wheel.add(cabs);
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 4, 16).rotateX(Math.PI / 2), legMat));
  wheel.userData.animate = (time) => {
    wheel.rotation.z = time * 0.035;
    rimMat.emissive.setHSL((time * 0.05) % 1, 0.9, 0.55);
  };
  group.add(wheel);
  animated.push(wheel);
}

/* ---------------- neon pylon signs (marquee bulbs chase round the border) ---------------- */
const PYLON_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float time;
uniform vec3 bulb;
varying vec2 vUv;
void main() {
  vec3 col = texture2D(map, vUv).rgb * 2.2;
  vec2 uv = vUv;
  float edge = min(min(uv.x, 1.0 - uv.x) * 4.0, min(uv.y, 1.0 - uv.y));
  if (edge < 0.07) {
    float t = uv.y < 0.07 ? uv.x : uv.y > 0.93 ? 2.0 - uv.x : uv.x > 0.5 ? 1.0 + (1.0 - uv.y) * 0.25 : 3.0 + uv.y * 0.25;
    float k = fract(t * 22.0);
    float on = step(0.5, fract(t * 22.0 / 3.0 - time * 1.6));
    float dotm = smoothstep(0.5, 0.15, abs(k - 0.5)) * smoothstep(0.07, 0.02, abs(edge - 0.035));
    col = mix(vec3(0.03), bulb * (0.35 + 2.4 * on), dotm);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function buildNeonPylon(group, x, z, ry, title, sub, color, accent) {
  const tex = neonSignTexture(title, sub, color, accent, 1024, 256);
  const face = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, time: nightClock, bulb: { value: new THREE.Color(0xffd27a) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: PYLON_FRAG,
  });
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const postMat = mat(0x3b3f47, 0.5, 0.6);
  for (const dx of [-4.2, 4.2]) {
    const p = finish(new THREE.Mesh(new THREE.BoxGeometry(1.1, 22, 1.1), postMat));
    p.position.set(dx, 11, 0);
    g.add(p);
  }
  const board = finish(new THREE.Mesh(new THREE.BoxGeometry(17.6, 5.2, 0.9), mat(0x14161c, 0.5, 0.4)));
  board.position.y = 17.4;
  g.add(board);
  for (const s of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(17, 4.6), face);
    pl.userData.noMerge = true;
    pl.position.set(0, 17.4, s * 0.47);
    if (s < 0) pl.rotation.y = Math.PI;
    g.add(pl);
  }
  group.add(g);
}
