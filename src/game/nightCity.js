import * as THREE from 'three';
import { facadeTextures } from './realWorld.js';

/**
 * Night races (Las Vegas): floodlit circuit under a black desert sky.
 * - a star-field sky dome with the city's light glow on the horizon
 * - a neon/floodlight environment map so car paint picks up the lights
 * - every skyline/frontage facade gets lit windows, signs and LED boards glow
 * - floodlight masts along the circuit throw pools of light onto the asphalt
 */
export const nightClock = { value: 0 };

/* ---------------- sky + reflections ---------------- */
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 glow;
uniform float stars;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, top, smoothstep(-0.05, 0.5, h));
  col += glow * exp(-max(h, 0.0) * 7.0);
  vec3 cell = floor(d * 380.0);
  float n = hash(cell);
  float tw = 0.6 + 0.4 * sin(n * 80.0);
  col += vec3(0.9, 0.95, 1.0) * step(0.9972, n) * smoothstep(0.12, 0.35, h) * tw * stars;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function skyMaterial(starAmount = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(0x020309) },
      horizon: { value: new THREE.Color(0x1b1230) },
      glow: { value: new THREE.Color(0x5a2a3c) },
      stars: { value: starAmount },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

export function buildNightSky(renderer) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial(1));
  sky.scale.setScalar(1700);
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  // Reflection environment: dark sky, warm/neon signage around the horizon and white floodlight banks above
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), skyMaterial(0));
  dome.scale.setScalar(100);
  env.add(dome);
  const panel = (color, intensity, w, h, az, el, dist = 70) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.setFromSphericalCoords(dist, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  const neon = [0xff2fb4, 0x29e0ff, 0xffc23d, 0xa855f7, 0xff5a36, 0x34ffa0];
  for (let i = 0; i < 14; i++) panel(neon[i % neon.length], 2.2, 10 + (i % 3) * 5, 5 + (i % 2) * 6, i * 25.7, 4 + (i % 4) * 3);
  for (let i = 0; i < 6; i++) panel(0xfff6e6, 6, 20, 4, i * 60 + 15, 48, 60);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: 0x0c0b10 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  env.add(ground);
  const envRT = pmrem.fromScene(env, 0.03);
  pmrem.dispose();
  env.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return { sky, envRT };
}

/* ---------------- lit windows ---------------- */
const windowCache = new Map();

/** Emissive window pattern matching the facade grid (2 tiles wide, 4 tiles tall so it repeats less). */
function nightWindowTexture(style) {
  if (windowCache.has(style)) return windowCache.get(style);
  const W = 512;
  const H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  let s = style.length * 977 + 13;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const cols = 16;
  const floors = 16;
  const cw = W / cols;
  const fh = H / floors;
  const warm = ['255,206,140', '255,224,170', '255,186,110', '235,240,255', '205,225,255'];
  for (let f = 0; f < floors; f++) {
    // whole floors on or off, like offices and hotel corridors; most rooms dim or dark
    const floorOn = r();
    const tint = warm[(r() * warm.length) | 0];
    for (let c = 0; c < cols; c++) {
      const lit = r() < (floorOn > 0.85 ? 0.85 : floorOn < 0.3 ? 0.06 : 0.32);
      const a = lit ? (r() < 0.35 ? 0.85 + r() * 0.15 : 0.25 + r() * 0.35) : 0.03;
      g.fillStyle = lit ? `rgba(${r() < 0.8 ? tint : warm[(r() * warm.length) | 0]},${a})` : 'rgba(40,60,90,0.1)';
      if (style === 'glass') g.fillRect(c * cw + 3, f * fh + 6, cw - 6, fh - 16);
      else if (style === 'office') g.fillRect(c * cw + 5, f * fh + fh * 0.32, cw - 10, fh * 0.4);
      else g.fillRect(c * cw + 9, f * fh + fh * 0.26, cw - 18, fh * 0.42);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  windowCache.set(style, tex);
  return tex;
}

/**
 * Turns the built city into its night version. Materials marked shared are cloned first so day
 * cities keep their look. Textures tagged userData.nightGlow (shop signs, banners, billboards)
 * light up; lamp lenses (material.userData.nightLamp) blaze.
 */
export function applyNightCity(root) {
  const facadeSrc = new Map();
  for (const [style, f] of Object.entries(facadeTextures().all)) facadeSrc.set(f.map.source, style);
  const done = new Map();

  const nightify = (m) => {
    if (!m || !m.isMeshStandardMaterial) return m;
    if (done.has(m)) return done.get(m);
    let out = m;
    const own = () => {
      if (out !== m) return out;
      if (m.userData.shared) {
        out = m.clone();
        out.userData = {};
      }
      return out;
    };
    const style = m.map && facadeSrc.get(m.map.source);
    if (style) {
      const res = own();
      const win = nightWindowTexture(style).clone();
      win.userData = {};
      win.repeat.set(m.map.repeat.x / 2, m.map.repeat.y / 4);
      win.offset.copy(m.map.offset);
      win.needsUpdate = true;
      res.emissive = new THREE.Color(0xffffff);
      res.emissiveMap = win;
      res.emissiveIntensity = 0.95;
      res.color = res.color.clone().multiplyScalar(0.36);
      res.envMapIntensity = (res.envMapIntensity ?? 1) * 0.7;
    } else if (m.map && m.map.userData.nightGlow) {
      const res = own();
      res.emissive = new THREE.Color(0xffffff);
      res.emissiveMap = m.map;
      res.emissiveIntensity = m.map.userData.nightGlow;
    } else if (m.userData.nightLamp) {
      const res = own();
      res.emissiveIntensity = m.userData.nightLamp;
    } else if (m.userData.nightDim) {
      const res = own();
      res.color = res.color.clone().multiplyScalar(m.userData.nightDim);
    }
    done.set(m, out);
    return out;
  };

  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (Array.isArray(o.material)) {
      const next = o.material.map(nightify);
      if (next.some((m, i) => m !== o.material[i])) o.material = next;
    } else {
      const next = nightify(o.material);
      if (next !== o.material) o.material = next;
    }
  });
}

/* ---------------- floodlights ---------------- */
let poolTex = null;
function lightPoolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c);
  poolTex.userData.shared = true;
  return poolTex;
}

/**
 * Floodlight masts both sides of the track (staggered) with LED banks aimed at the racing line,
 * plus soft additive pools of light on the asphalt under each one.
 * @param {(p: THREE.Vector3, pad: number) => boolean} blocked  true where a grandstand stands
 */
export function buildFloodlights(group, track, blocked) {
  const per = 20;
  const spots = [];
  for (let i = 0; i < per * 2; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const u = (i / (per * 2) + 0.004) % 1;
    const f = track.getFrameAt(u);
    if (f.point.y > 1.2) continue; // flyover: lit by its own rail lights
    const base = f.point.clone().addScaledVector(f.right, side * 14.4);
    if (blocked(base, 2.5)) continue;
    spots.push({ f, side, base });
  }
  const n = spots.length;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6f747b, roughness: 0.5, metalness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.6, metalness: 0.5 });
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f6ff, emissiveIntensity: 4.2, roughness: 0.3 });
  const poleGeo = new THREE.CylinderGeometry(0.16, 0.3, 17, 8);
  poleGeo.translate(0, 8.5, 0);
  const headGeo = new THREE.BoxGeometry(3.4, 1.5, 0.45);
  const ledGeo = new THREE.PlaneGeometry(3.0, 1.15);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, n);
  const heads = new THREE.InstancedMesh(headGeo, headMat, n);
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, n);
  poles.castShadow = true;

  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: lightPoolTexture(),
      color: 0xfff0d8,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    n
  );
  pools.renderOrder = 2;

  const dummy = new THREE.Object3D();
  spots.forEach(({ f, side, base }, i) => {
    dummy.position.set(base.x, 0, base.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    // head: at the top, leaning out over the barrier, tilted down at the track
    const aim = f.point.clone().addScaledVector(f.right, side * 2);
    const top = base.clone().addScaledVector(f.right, -side * 1.1);
    top.y = 17.2;
    dummy.position.copy(top);
    dummy.lookAt(aim.x, f.point.y, aim.z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    dummy.translateZ(0.24);
    dummy.updateMatrix();
    leds.setMatrixAt(i, dummy.matrix);
    // pool of light on the asphalt between the kerb and the racing line
    const c = f.point.clone().addScaledVector(f.right, side * 5.5);
    dummy.position.set(c.x, f.point.y + 0.07, c.z);
    dummy.rotation.set(0, Math.atan2(f.tangent.x, f.tangent.z), 0);
    dummy.scale.set(19, 1, 26);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });
  group.add(poles, heads, leds, pools);
  return { count: n };
}

/* ---------------- cars ---------------- */
/** Headlights and tail lights brighter at night (bloom does the glow). */
export function setCarNightLights(rigRoot, night) {
  rigRoot.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.emissive) continue;
      const e = m.emissive;
      if (e.r > 0.9 && e.g > 0.85 && e.b > 0.7) {
        if (m.userData.dayEmissive === undefined) m.userData.dayEmissive = m.emissiveIntensity;
        m.emissiveIntensity = night ? Math.max(3.2, m.userData.dayEmissive) : m.userData.dayEmissive;
      }
    }
  });
}
