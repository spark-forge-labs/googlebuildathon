import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Q } from './quality.js';
import { WORLD_ATMOS } from './worldCities.js';

/**
 * Real-world look for every city: physical sky + sun, real HDRI reflections,
 * terrain, city-specific skyline with Indian rooftops, EZ-Tree trees
 * (full 3D near the circuit, baked impostors in the distance), flyover piers,
 * grandstand and realistic water.
 */
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';

// skyline: share of tall towers, height ranges, facade style weights [glass, office, residential, heritage]
// trees: weights for [oak, ash, aspen, oakSmall, bush]
export const REAL_ATMOS = {
  hyderabad:   { elev: 22, azim: 200, turbidity: 6,  rayleigh: 1.6, ground: 'deccan', coast: null,   haze: 0xc9b8a0, hdri: 'quarry_01_1k.hdr',
                 skyline: { tall: 0.28, maxH: 120, styles: [0.45, 0.2, 0.35, 0] }, trees: [3, 2, 1, 2, 1] },
  bangalore:   { elev: 38, azim: 160, turbidity: 3,  rayleigh: 1.9, ground: 'garden', coast: null,   haze: 0xb7c9cf, hdri: 'pedestrian_overpass_1k.hdr',
                 skyline: { tall: 0.25, maxH: 110, styles: [0.45, 0.25, 0.3, 0] }, trees: [4, 2, 1, 2, 2] },
  mumbai:      { elev: 9,  azim: 250, turbidity: 9,  rayleigh: 2.4, ground: 'urban',  coast: 'west', haze: 0xe0a982, hdri: 'venice_sunset_1k.hdr',
                 skyline: { tall: 0.42, maxH: 150, styles: [0.45, 0.2, 0.35, 0] }, trees: [2, 1, 3, 1, 1] },
  kolkata:     { elev: 28, azim: 140, turbidity: 8,  rayleigh: 1.4, ground: 'delta',  coast: null,   haze: 0xc8bfa8, hdri: 'pedestrian_overpass_1k.hdr',
                 skyline: { tall: 0.12, maxH: 90,  styles: [0.15, 0.25, 0.4, 0.2] }, trees: [3, 2, 1, 2, 2] },
  delhi:       { elev: 16, azim: 225, turbidity: 12, rayleigh: 1.2, ground: 'dry',    coast: null,   haze: 0xd1b48e, hdri: 'venice_sunset_1k.hdr',
                 skyline: { tall: 0.1,  maxH: 80,  styles: [0.2, 0.35, 0.3, 0.15] }, trees: [2, 3, 1, 2, 2] },
  chennai:     { elev: 45, azim: 120, turbidity: 4,  rayleigh: 2.0, ground: 'sandy',  coast: 'east', haze: 0xc3d4dc, hdri: 'blouberg_sunrise_2_1k.hdr',
                 skyline: { tall: 0.15, maxH: 95,  styles: [0.3, 0.25, 0.4, 0.05] }, trees: [2, 1, 3, 2, 1] },
  pondicherry: { elev: 12, azim: 105, turbidity: 5,  rayleigh: 2.6, ground: 'sandy',  coast: 'east', haze: 0xe6c3a3, hdri: 'blouberg_sunrise_2_1k.hdr',
                 skyline: { tall: 0.0,  maxH: 30,  styles: [0.0, 0.1, 0.4, 0.5] }, trees: [2, 1, 3, 2, 2] },
  vijayawada:  { elev: 30, azim: 210, turbidity: 7,  rayleigh: 1.5, ground: 'deccan', coast: null,   haze: 0xcdbca2, hdri: 'quarry_01_1k.hdr',
                 skyline: { tall: 0.12, maxH: 85,  styles: [0.25, 0.25, 0.5, 0] }, trees: [3, 2, 1, 2, 1] },
  vizag:       { elev: 34, azim: 110, turbidity: 3,  rayleigh: 2.2, ground: 'garden', coast: 'east', haze: 0xb9d0dc, hdri: 'blouberg_sunrise_2_1k.hdr',
                 skyline: { tall: 0.18, maxH: 100, styles: [0.35, 0.2, 0.45, 0] }, trees: [3, 1, 2, 2, 1] },
  warangal:    { elev: 26, azim: 205, turbidity: 7,  rayleigh: 1.6, ground: 'deccan', coast: null,   haze: 0xcbb99c, hdri: 'quarry_01_1k.hdr',
                 skyline: { tall: 0.04, maxH: 45,  styles: [0.1, 0.3, 0.6, 0] }, trees: [3, 2, 1, 2, 1] },
  kochi:       { elev: 20, azim: 255, turbidity: 6,  rayleigh: 2.3, ground: 'tropical', coast: 'west', haze: 0xc4d3c8, hdri: 'venice_sunset_1k.hdr',
                 skyline: { tall: 0.14, maxH: 90,  styles: [0.3, 0.2, 0.5, 0] }, trees: [2, 1, 3, 2, 2] },
  goa:         { elev: 12, azim: 255, turbidity: 5,  rayleigh: 2.6, ground: 'sandy', coast: 'west', haze: 0xe8c2a0, hdri: 'venice_sunset_1k.hdr',
                 skyline: { tall: 0.0,  maxH: 26,  styles: [0.0, 0.1, 0.35, 0.55] }, trees: [2, 1, 3, 2, 2] },
  pune:        { elev: 32, azim: 190, turbidity: 6,  rayleigh: 1.7, ground: 'deccan', coast: null,   haze: 0xc2c4c8, hdri: 'quarry_01_1k.hdr',
                 skyline: { tall: 0.22, maxH: 100, styles: [0.4, 0.25, 0.35, 0] }, trees: [3, 2, 1, 2, 1] },
  ahmedabad:   { elev: 24, azim: 230, turbidity: 11, rayleigh: 1.3, ground: 'dry',    coast: null,   haze: 0xd4b892, hdri: 'quarry_01_1k.hdr',
                 skyline: { tall: 0.15, maxH: 95,  styles: [0.3, 0.3, 0.3, 0.1] }, trees: [2, 3, 1, 2, 2] },
  srinagar:    { elev: 30, azim: 160, turbidity: 2,  rayleigh: 1.4, ground: 'alpine', coast: null,   haze: 0xc8d6e4, hdri: 'blouberg_sunrise_2_1k.hdr',
                 skyline: { tall: 0.0,  maxH: 22,  styles: [0.0, 0.05, 0.45, 0.5] }, trees: [3, 2, 1, 3, 1], mountains: true, autumn: true },
};

Object.assign(REAL_ATMOS, WORLD_ATMOS);

const GROUND_PALETTE = {
  temperate: ['#4f7d3a', '#5c8a40', '#47703a', '#6a8a48'],
  deccan: ['#7d6a45', '#6b7a3c', '#8a6b4a', '#5f6e37'],
  garden: ['#4f7a35', '#3f6b2c', '#5c8a3d', '#6a7d3e'],
  urban: ['#6d6a5e', '#5a6b45', '#7a7466', '#56603f'],
  delta: ['#4d7a3a', '#5e8a42', '#6b7f45', '#4a6e33'],
  dry: ['#9a8460', '#86774f', '#a38f68', '#7d7a4e'],
  sandy: ['#b9a27a', '#a8946a', '#7f8a4c', '#c4ae86'],
  tropical: ['#3f7a2c', '#2f6b25', '#4f8a35', '#5a7d2e'],
  alpine: ['#5e8a42', '#6b9a4a', '#7a8f4a', '#4f7a3a'],
};

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickWeighted(weights, r) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

/** Mark resources that are shared across cities so DeskWorld.dispose() keeps them. */
function keep(obj) {
  obj.userData.shared = true;
  return obj;
}

export function getAtmos(city) {
  return REAL_ATMOS[city.id] || REAL_ATMOS.hyderabad;
}

/* ================= SKY, SUN, HDRI ================= */
const hdriCache = new Map();

/** Loads a real-world HDRI and turns it into a PBR environment map (cached per file). */
export function loadHdriEnvironment(renderer, file) {
  if (hdriCache.has(file)) return hdriCache.get(file);
  const p = new Promise((resolve) => {
    new RGBELoader().load(
      `${BASE}hdri/${file}`,
      (tex) => {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const rt = pmrem.fromEquirectangular(tex);
        tex.dispose();
        pmrem.dispose();
        resolve(rt);
      },
      undefined,
      () => resolve(null)
    );
  });
  hdriCache.set(file, p);
  return p;
}

export function buildRealSky(renderer, city) {
  const a = getAtmos(city);
  const sky = new Sky();
  sky.scale.setScalar(1800);
  const u = sky.material.uniforms;
  u.turbidity.value = a.turbidity;
  u.rayleigh.value = a.rayleigh;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.8;

  const phi = THREE.MathUtils.degToRad(90 - a.elev);
  const theta = THREE.MathUtils.degToRad(a.azim);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunDir);

  // Immediate environment from the procedural sky; the HDRI replaces it once loaded
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(100);
  envSky.material.uniforms.turbidity.value = a.turbidity;
  envSky.material.uniforms.rayleigh.value = a.rayleigh;
  envSky.material.uniforms.mieCoefficient.value = 0.005;
  envSky.material.uniforms.mieDirectionalG.value = 0.8;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(envSky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: 0x3a3a32 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  envScene.add(ground);
  const envRT = pmrem.fromScene(envScene, 0.02);
  pmrem.dispose();

  const t = THREE.MathUtils.clamp(a.elev / 50, 0, 1);
  const sunColor = new THREE.Color(0xff9a52).lerp(new THREE.Color(0xfff6e8), t);
  const sunIntensity = 1.6 + t * 1.6;

  return { sky, envRT, sunDir, sunColor, sunIntensity, haze: new THREE.Color(a.haze), elev: a.elev, hdri: a.hdri };
}

/* ================= TEXTURES ================= */
const groundCache = new Map();
function groundTexture(kind) {
  if (groundCache.has(kind)) return groundCache.get(kind);
  const pal = GROUND_PALETTE[kind] || GROUND_PALETTE.garden;
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = pal[0];
  g.fillRect(0, 0, 1024, 1024);
  const r = rand(kind.length * 977);
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = 0.05 + r() * 0.12;
    g.fillStyle = pal[(r() * pal.length) | 0];
    const s = 8 + r() * 90;
    g.beginPath();
    g.ellipse(r() * 1024, r() * 1024, s, s * (0.4 + r()), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 70000; i++) {
    g.globalAlpha = 0.18 + r() * 0.25;
    g.fillStyle = r() > 0.5 ? 'rgba(20,30,10,1)' : 'rgba(220,210,170,1)';
    g.fillRect(r() * 1024, r() * 1024, 1 + r() * 1.5, 1 + r() * 2.5);
  }
  g.globalAlpha = 1;
  const tex = keep(new THREE.CanvasTexture(c));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  groundCache.set(kind, tex);
  return tex;
}

/**
 * Facade textures. Each tile = 4 bays x 4 floors (~14 x 14 game units).
 * Returns { map, rough } canvases per style.
 */
let facadeCache = null;
function buildFacades() {
  const W = 256;
  const H = 256;
  const bays = 4;
  const floors = 4;
  const bw = W / bays;
  const fh = H / floors;
  const out = {};

  const mk = (style) => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    const rc = document.createElement('canvas');
    rc.width = W;
    rc.height = H;
    const rg = rc.getContext('2d');
    const r = rand(style.length * 131 + 7);

    if (style === 'glass') {
      // Curtain wall: reflective tinted glass, thin aluminium mullions, spandrel bands
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#6f8ea3');
      sky.addColorStop(1, '#3e5566');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(18,18,18)';
      rg.fillRect(0, 0, W, H);
      for (let f = 0; f < floors; f++) {
        for (let b = 0; b < bays * 2; b++) {
          const v = r() * 18 - 9;
          g.fillStyle = `rgba(${120 + v},${150 + v},${170 + v},${0.12 + r() * 0.12})`;
          g.fillRect(b * (bw / 2), f * fh, bw / 2, fh);
        }
        g.fillStyle = '#2b3640';
        g.fillRect(0, f * fh + fh - 7, W, 7);
        rg.fillStyle = 'rgb(120,120,120)';
        rg.fillRect(0, f * fh + fh - 7, W, 7);
      }
      g.fillStyle = '#9aa3aa';
      rg.fillStyle = 'rgb(90,90,90)';
      for (let b = 0; b <= bays * 2; b++) {
        g.fillRect(b * (bw / 2) - 1, 0, 2, H);
        rg.fillRect(b * (bw / 2) - 1, 0, 2, H);
      }
    } else if (style === 'office') {
      // Concrete office: ribbon windows between precast bands
      g.fillStyle = '#b9b3a8';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(225,225,225)';
      rg.fillRect(0, 0, W, H);
      for (let f = 0; f < floors; f++) {
        const y = f * fh + fh * 0.28;
        const h = fh * 0.5;
        g.fillStyle = '#34414b';
        g.fillRect(4, y, W - 8, h);
        rg.fillStyle = 'rgb(25,25,25)';
        rg.fillRect(4, y, W - 8, h);
        for (let b = 0; b < bays * 2; b++) {
          const v = r();
          g.fillStyle = v > 0.7 ? 'rgba(210,205,190,0.55)' : `rgba(110,135,150,${0.15 + r() * 0.2})`;
          g.fillRect(4 + b * ((W - 8) / (bays * 2)) + 2, y + 2, (W - 8) / (bays * 2) - 4, h - 4);
        }
      }
    } else if (style === 'residential') {
      // Indian apartment block: painted plaster, grilled windows, balconies, AC units
      g.fillStyle = '#e9e3d6';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(240,240,240)';
      rg.fillRect(0, 0, W, H);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(80,70,50,${r() * 0.06})`;
        g.fillRect(r() * W, r() * H, 2 + r() * 20, 2 + r() * 30);
      }
      for (let f = 0; f < floors; f++) {
        for (let b = 0; b < bays; b++) {
          const x = b * bw;
          const y = f * fh;
          const balcony = (b + f) % 2 === 0;
          // window
          g.fillStyle = '#2d3238';
          g.fillRect(x + 12, y + 14, bw - 24, fh * 0.48);
          rg.fillStyle = 'rgb(40,40,40)';
          rg.fillRect(x + 12, y + 14, bw - 24, fh * 0.48);
          const curtain = ['#c9b38a', '#8aa0b8', '#b97a6a', '#d8d2c4'][(r() * 4) | 0];
          g.fillStyle = curtain;
          g.globalAlpha = 0.55;
          g.fillRect(x + 14, y + 16, (bw - 28) * (0.3 + r() * 0.5), fh * 0.44);
          g.globalAlpha = 1;
          // grill
          g.strokeStyle = 'rgba(30,30,30,0.7)';
          g.lineWidth = 1;
          for (let k = 1; k < 5; k++) {
            g.beginPath();
            g.moveTo(x + 12 + (k * (bw - 24)) / 5, y + 14);
            g.lineTo(x + 12 + (k * (bw - 24)) / 5, y + 14 + fh * 0.48);
            g.stroke();
          }
          if (balcony) {
            g.fillStyle = '#d6cfc0';
            g.fillRect(x + 6, y + fh * 0.62, bw - 12, fh * 0.2);
            g.fillStyle = 'rgba(0,0,0,0.25)';
            g.fillRect(x + 6, y + fh * 0.82, bw - 12, 3);
          } else if (r() > 0.4) {
            // split-AC outdoor unit
            g.fillStyle = '#f2f2ee';
            g.fillRect(x + bw * 0.55, y + fh * 0.66, bw * 0.32, fh * 0.17);
            g.fillStyle = '#9a9a96';
            g.beginPath();
            g.arc(x + bw * 0.71, y + fh * 0.745, fh * 0.06, 0, Math.PI * 2);
            g.fill();
          }
          // rain stain under window
          const st = g.createLinearGradient(0, y + 14 + fh * 0.48, 0, y + fh);
          st.addColorStop(0, 'rgba(60,55,45,0.18)');
          st.addColorStop(1, 'rgba(60,55,45,0)');
          g.fillStyle = st;
          g.fillRect(x + 14, y + 14 + fh * 0.48, bw - 28, fh * 0.4);
        }
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(0, f * fh + fh - 3, W, 3);
      }
    } else if (style === 'brick') {
      // London / New York brick: stretcher-bond brick, white sash windows, stone lintels and sills
      g.fillStyle = '#8a4a36';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(235,235,235)';
      rg.fillRect(0, 0, W, H);
      const bh = 6;
      for (let y = 0, row = 0; y < H; y += bh, row++) {
        for (let x = -((row % 2) * 8); x < W; x += 16) {
          const v = r() * 26 - 13;
          g.fillStyle = `rgb(${138 + v},${74 + v * 0.6},${54 + v * 0.4})`;
          g.fillRect(x + 1, y + 1, 14, bh - 1);
        }
      }
      for (let f = 0; f < floors; f++) {
        for (let b = 0; b < bays; b++) {
          const x = b * bw + bw * 0.24;
          const y = f * fh + fh * 0.2;
          const w = bw * 0.52;
          const h = fh * 0.56;
          g.fillStyle = '#d9d4c7'; // stone lintel + sill
          g.fillRect(x - 3, y - 5, w + 6, 5);
          g.fillRect(x - 2, y + h, w + 4, 4);
          g.fillStyle = '#f2f0ea'; // white frame
          g.fillRect(x, y, w, h);
          g.fillStyle = r() > 0.75 ? '#c9b98f' : '#2b3138';
          g.fillRect(x + 3, y + 3, w - 6, h / 2 - 4);
          g.fillStyle = r() > 0.8 ? '#c9b98f' : '#262b31';
          g.fillRect(x + 3, y + h / 2 + 1, w - 6, h / 2 - 4);
          rg.fillStyle = 'rgb(40,40,40)';
          rg.fillRect(x + 3, y + 3, w - 6, h - 6);
          g.fillStyle = '#f2f0ea';
          g.fillRect(x + w / 2 - 1, y, 2, h); // glazing bar
        }
      }
    } else if (style === 'stone') {
      // Haussmann limestone: rusticated base lines, tall French windows, wrought-iron balconies
      g.fillStyle = '#e4d9c2';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(225,225,225)';
      rg.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(90,80,60,${r() * 0.05})`;
        g.fillRect(r() * W, r() * H, 3 + r() * 30, 2 + r() * 10);
      }
      for (let y = 0; y < H; y += 10) {
        g.fillStyle = 'rgba(120,105,80,0.18)';
        g.fillRect(0, y, W, 1);
      }
      for (let f = 0; f < floors; f++) {
        const balconyFloor = f === 1;
        for (let b = 0; b < bays; b++) {
          const x = b * bw + bw * 0.27;
          const y = f * fh + fh * 0.14;
          const w = bw * 0.46;
          const h = fh * 0.66;
          g.fillStyle = '#d3c6aa'; // carved surround
          g.fillRect(x - 3, y - 3, w + 6, h + 4);
          if (f === 2) {
            g.beginPath(); // small pediment
            g.moveTo(x - 5, y - 3);
            g.lineTo(x + w / 2, y - 11);
            g.lineTo(x + w + 5, y - 3);
            g.closePath();
            g.fill();
          }
          g.fillStyle = '#2f343a';
          g.fillRect(x, y, w, h);
          rg.fillStyle = 'rgb(35,35,35)';
          rg.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(210,215,220,0.18)';
          g.fillRect(x + 2, y + 2, w / 2 - 3, h - 4);
          g.fillStyle = '#efe7d6';
          g.fillRect(x + w / 2 - 1, y, 2, h);
          if (!balconyFloor) {
            // individual Juliet balcony rail
            g.fillStyle = '#1d1f22';
            g.fillRect(x - 2, y + h * 0.62, w + 4, 2);
            for (let k = 0; k <= 6; k++) g.fillRect(x - 2 + (k * (w + 4)) / 6, y + h * 0.62, 1, h * 0.38);
          }
        }
        if (balconyFloor) {
          // continuous wrought-iron balcony along the whole floor
          const y = f * fh + fh * 0.62;
          g.fillStyle = '#cfc2a6';
          g.fillRect(0, y + fh * 0.18, W, 5);
          g.fillStyle = '#1d1f22';
          g.fillRect(0, y - 2, W, 2);
          for (let x = 0; x < W; x += 5) g.fillRect(x, y - 2, 1, fh * 0.2);
        }
        g.fillStyle = '#d6c9ad';
        g.fillRect(0, f * fh + fh - 5, W, 5); // string course
      }
    } else {
      // Heritage / colonial: lime-washed walls, tall arched shuttered windows, cornices
      g.fillStyle = '#efe6cf';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(245,245,245)';
      rg.fillRect(0, 0, W, H);
      for (let f = 0; f < floors; f++) {
        for (let b = 0; b < bays; b++) {
          const x = b * bw + bw * 0.25;
          const y = f * fh + fh * 0.18;
          const w = bw * 0.5;
          const h = fh * 0.62;
          g.fillStyle = '#5c7a5a';
          g.beginPath();
          g.moveTo(x, y + h);
          g.lineTo(x, y + w / 2);
          g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
          g.lineTo(x + w, y + h);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          for (let k = 1; k < 6; k++) {
            g.beginPath();
            g.moveTo(x + 2, y + w / 2 + (k * (h - w / 2)) / 6);
            g.lineTo(x + w - 2, y + w / 2 + (k * (h - w / 2)) / 6);
            g.stroke();
          }
        }
        g.fillStyle = '#d9cdb0';
        g.fillRect(0, f * fh + fh - 8, W, 8);
      }
    }

    const map = keep(new THREE.CanvasTexture(cv));
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const rough = keep(new THREE.CanvasTexture(rc));
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    return { map, rough };
  };

  for (const s of ['glass', 'office', 'residential', 'heritage', 'brick', 'stone']) out[s] = mk(s);
  return out;
}

/** Back-compat for landmark towers: { glass, concrete } colour maps. */
export function facadeTextures() {
  if (!facadeCache) facadeCache = buildFacades();
  return { glass: facadeCache.glass.map, concrete: facadeCache.office.map, all: facadeCache };
}

/** Weathered plaster/stone grain so hand-built landmarks read as real surfaces. */
let grainCache = null;
export function getSurfaceGrain() {
  if (grainCache) return grainCache;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ededed';
  g.fillRect(0, 0, 512, 512);
  const r = rand(4242);
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.03 + r() * 0.07;
    g.fillStyle = r() > 0.5 ? '#9a9286' : '#ffffff';
    const s = 6 + r() * 60;
    g.beginPath();
    g.ellipse(r() * 512, r() * 512, s, s * (0.3 + r()), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 40000; i++) {
    const v = 170 + r() * 85;
    g.fillStyle = `rgba(${v | 0},${(v - 4) | 0},${(v - 10) | 0},0.5)`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  // vertical rain streaks
  for (let i = 0; i < 70; i++) {
    const x = r() * 512;
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, 'rgba(90,85,75,0.12)');
    grd.addColorStop(1, 'rgba(90,85,75,0)');
    g.fillStyle = grd;
    g.fillRect(x, r() * 200, 2 + r() * 6, 120 + r() * 300);
  }
  const map = keep(new THREE.CanvasTexture(c));
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  grainCache = map;
  return map;
}

/** Adds the grain to plain (untextured, non-glowing, non-metal) landmark materials. */
export function weatherLandmarkMaterials(root) {
  const grain = getSurfaceGrain();
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (done.has(m)) continue;
      done.add(m);
      if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) continue;
      if (m.map || m.metalness > 0.5 || m.transparent) continue;
      if (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0.3) continue;
      m.map = grain;
      m.bumpMap = grain;
      m.bumpScale = 0.4;
      m.roughness = Math.max(m.roughness, 0.7);
      m.needsUpdate = true;
    }
  });
}

function waterNormalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const fx = (x / 256) * Math.PI * 2;
      const fy = (y / 256) * Math.PI * 2;
      const nx = Math.sin(fx * 3 + Math.cos(fy * 2)) * 0.5 + Math.sin(fx * 7 + fy * 5) * 0.25;
      const ny = Math.cos(fy * 4 + Math.sin(fx * 3)) * 0.5 + Math.cos(fy * 9 - fx * 4) * 0.25;
      const i = (y * 256 + x) * 4;
      img.data[i] = 128 + nx * 90;
      img.data[i + 1] = 128 + ny * 90;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

let waterNormals = null;
export function makeRealWaterMaterial(colorHex = 0x1f5f6b) {
  if (!waterNormals) waterNormals = waterNormalTexture();
  const n = waterNormals.clone();
  n.needsUpdate = true;
  n.repeat.set(4, 4);
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colorHex).multiplyScalar(0.55),
    roughness: 0.06,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    normalMap: n,
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.4,
  });
  m.userData.isRealWater = true;
  return m;
}

/* ================= TREES (EZ-Tree) ================= */
let ezTreeModule = null;
let treeLibPromise = null;
let treeVariants = null; // [{ branchGeo, leafGeo, branchMat, leafMat, impostor }]
const windUniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3(0.1, 0, 0.07) } };

const VARIANT_SPECS = [
  { preset: 'Oak Medium', height: 14, seed: 11 },
  { preset: 'Ash Medium', height: 15, seed: 23 },
  { preset: 'Oak Medium', height: 12, seed: 37 },
  { preset: 'Oak Small', height: 10, seed: 41 },
  { preset: 'Bush 1', height: 4.5, seed: 53 },
];

/** Lazy-load EZ-Tree (it is large) after the menu is on screen. */
export function loadTreeLibrary() {
  if (!treeLibPromise) {
    treeLibPromise = import('@dgreenheck/ez-tree')
      .then((m) => {
        ezTreeModule = m;
        return m;
      })
      .catch((e) => {
        console.warn('EZ-Tree failed to load, using simple trees', e);
        return null;
      });
  }
  return treeLibPromise;
}

export function updateTreeWind(time) {
  windUniforms.uTime.value = time;
}

function makeLeafMaterial(src, grayscale = false) {
  const m = new THREE.MeshStandardMaterial({
    map: src.map,
    color: src.color.clone(),
    side: THREE.DoubleSide,
    alphaTest: src.alphaTest || 0.5,
    roughness: 0.75,
    metalness: 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWind;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wp = modelMatrix * mvPosition;
        float wo = 6.2831 * sin(dot(wp.xz, vec2(0.071, 0.053)));
        mvPosition.xyz += uv.y * uWind * (0.6 * sin(uTime * 1.3 + wo) + 0.4 * sin(uTime * 3.1 + 1.7 * wo));
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`
      );
    if (grayscale) {
      // Autumn variant: luminance-only leaves, the hue comes from per-instance colour
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))) * 2.4;'
      );
    }
  };
  m.customProgramCacheKey = () => (grayscale ? 'ezleaf-wind-gray' : 'ezleaf-wind');
  if (grayscale) m.color.set(0xffffff);
  return keep(m);
}

function renderImpostor(renderer, branchGeo, leafGeo, branchSrc, leafSrc) {
  const box = new THREE.Box3();
  box.expandByObject(new THREE.Mesh(branchGeo));
  box.expandByObject(new THREE.Mesh(leafGeo));
  const size = box.getSize(new THREE.Vector3());
  const w = Math.max(size.x, size.z);
  const h = size.y;
  const texW = 256;
  const texH = Math.min(512, Math.max(128, Math.round((256 * h) / w / 32) * 32));

  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(branchGeo, new THREE.MeshBasicMaterial({ map: branchSrc.map, color: branchSrc.color })));
  scene.add(
    new THREE.Mesh(
      leafGeo,
      new THREE.MeshBasicMaterial({ map: leafSrc.map, color: leafSrc.color, side: THREE.DoubleSide, alphaTest: 0.5 })
    )
  );
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, box.max.y, box.min.y, -500, 500);
  cam.position.set((box.min.x + box.max.x) / 2, 0, 100);
  cam.lookAt((box.min.x + box.max.x) / 2, 0, 0);

  const rt = new THREE.WebGLRenderTarget(texW, texH, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const prevRT = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x3d4a2c, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevColor, prevAlpha);
  keep(rt.texture);

  // Two crossed quads, normals pointing up so they light like a canopy
  const quad = new THREE.PlaneGeometry(w, h);
  quad.translate(0, h / 2 + box.min.y, 0);
  const q2 = quad.clone();
  q2.rotateY(Math.PI / 2);
  const pos = new Float32Array([...quad.attributes.position.array, ...q2.attributes.position.array]);
  const uv = new Float32Array([...quad.attributes.uv.array, ...q2.attributes.uv.array]);
  const idx = [...quad.index.array, ...Array.from(q2.index.array).map((i) => i + 4)];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  keep(geo);
  const mat = keep(
    new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 })
  );
  return { geo, mat };
}

/** Generates the shared tree variants once (needs the renderer for impostors). */
export function ensureTreeVariants(renderer) {
  if (treeVariants || !ezTreeModule) return treeVariants;
  const { Tree } = ezTreeModule;
  treeVariants = [];
  for (const spec of VARIANT_SPECS) {
    try {
      const t = new Tree();
      t.loadPreset(spec.preset);
      t.options.seed = spec.seed;
      // Lush tropical canopies: bigger, denser leaves than the temperate presets
      t.options.leaves.size *= 1.45;
      t.options.leaves.count = Math.round(t.options.leaves.count * 1.25);
      t.generate();
      const bGeo = t.branchesMesh.geometry;
      const lGeo = t.leavesMesh.geometry;
      bGeo.computeBoundingBox();
      lGeo.computeBoundingBox();
      const h = Math.max(bGeo.boundingBox.max.y, lGeo.boundingBox.max.y);
      const scale = spec.height / h;
      bGeo.scale(scale, scale, scale);
      lGeo.scale(scale, scale, scale);
      bGeo.computeBoundingSphere();
      lGeo.computeBoundingSphere();
      keep(bGeo);
      keep(lGeo);

      const bSrc = t.branchesMesh.material;
      const lSrc = t.leavesMesh.material;
      const branchMat = keep(
        new THREE.MeshStandardMaterial({
          map: bSrc.map || null,
          normalMap: bSrc.normalMap || null,
          roughnessMap: bSrc.roughnessMap || null,
          aoMap: bSrc.aoMap || null,
          color: bSrc.color.clone(),
          roughness: 1,
          metalness: 0,
        })
      );
      const leafMat = makeLeafMaterial(lSrc);
      const leafMatAutumn = makeLeafMaterial(lSrc, true);
      const impostor = renderImpostor(renderer, bGeo, lGeo, bSrc, lSrc);
      const canopy = new THREE.Box3().setFromBufferAttribute(lGeo.attributes.position);
      treeVariants.push({
        branchGeo: bGeo,
        leafGeo: lGeo,
        branchMat,
        leafMat,
        leafMatAutumn,
        impostor,
        radius: Math.max(canopy.max.x - canopy.min.x, canopy.max.z - canopy.min.z) / 2,
        height: spec.height,
      });
    } catch (e) {
      console.warn('Tree variant failed', spec.preset, e);
    }
  }
  if (!treeVariants.length) treeVariants = null;
  return treeVariants;
}

/* ================= WORLD ================= */
/**
 * @param avoid  [{x, z, r}] footprints to keep clear (landmarks, water, stands)
 */
export function buildRealWorld(group, city, track, avoid = []) {
  const a = getAtmos(city);
  const r = rand(city.id.split('').reduce((s, ch) => s + ch.charCodeAt(0) * 31, 7));
  const anim = { water: [] };

  const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(a.ground), roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // Paved infield with grass islands
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(196, 128),
    new THREE.MeshStandardMaterial({ color: 0x77746d, roughness: 0.9 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.01;
  plaza.receiveShadow = true;
  group.add(plaza);
  for (const [x, z, w, d] of [[18, 4, 62, 50], [-40, 4, 30, 34], [96, 10, 18, 70], [0, 60, 150, 12], [0, -60, 150, 10]]) {
    const isl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), groundMat);
    isl.rotation.x = -Math.PI / 2;
    isl.position.set(x, 0.0, z);
    isl.receiveShadow = true;
    group.add(isl);
  }

  if (a.coast) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1100), makeRealWaterMaterial(0x1d5c78));
    sea.material.normalMap.repeat.set(60, 30);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.03, -720);
    group.add(sea);
    anim.water.push(sea);
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(2400, 40), new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 1 }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 0.01, -160);
    group.add(beach);
  }

  buildFlyoverPiers(group, track);
  const standFootprint = buildCrowdStands(group, track);
  const fullAvoid = [...avoid, standFootprint];
  buildSkyline(group, r, a);
  buildHills(group, r, a);
  buildTrees(group, r, a, track, fullAvoid);

  return anim;
}

function buildFlyoverPiers(group, track) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8f8b83, roughness: 0.8 });
  const n = track.samples.length;
  const step = Math.max(1, Math.floor(n / 70));
  for (let i = 0; i < n; i += step) {
    const s = track.samples[i];
    const h = s.point.y;
    if (h < 0.9) continue;
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, h, 12), mat);
    pier.position.set(s.point.x, h / 2 - 0.25, s.point.z);
    pier.castShadow = true;
    pier.receiveShadow = true;
    group.add(pier);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.6, 1.6), capMat);
    cap.position.set(s.point.x, h - 0.5, s.point.z);
    cap.lookAt(s.point.x + s.right.x, h - 0.5, s.point.z + s.right.z);
    cap.rotateY(Math.PI / 2);
    group.add(cap);
  }
}

/* ---------- Skyline ---------- */
const STYLE_NAMES = ['glass', 'office', 'residential', 'heritage', 'brick', 'stone'];
const PAINTS = {
  brick: [0xffffff, 0xe8d6cc, 0xd9c2b8, 0xc9b1a6, 0xf0e2d4],
  stone: [0xffffff, 0xf6efe2, 0xefe6d2, 0xfaf4e8],
  glass: [0xffffff, 0xdfe9f0, 0xcfe0dc, 0xe8e2d6],
  office: [0xffffff, 0xeae2d2, 0xd8d8d8, 0xe6d8c4],
  residential: [0xffffff, 0xf3e3b8, 0xe9c9b3, 0xd9e4cf, 0xf1d1a0, 0xd8d0e6, 0xbfd8dc],
  heritage: [0xffffff, 0xf4d58d, 0xf2c98a, 0xe8b4a0],
};

function buildSkyline(group, r, a) {
  const facades = facadeTextures().all;
  const prof = a.skyline;
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8c8a85, roughness: 0.95 });

  // Height classes: [minH, maxH, typical width] — texture repeat matched per class
  const classes = [
    { minH: 9, maxH: 20, w: 16 },
    { minH: 22, maxH: 48, w: 20 },
    { minH: 55, maxH: Math.max(60, prof.maxH), w: 24 },
  ];
  const meshes = {};
  const getMesh = (style, ci) => {
    const key = `${style}-${ci}`;
    if (meshes[key]) return meshes[key];
    const c = classes[ci];
    const midH = (c.minH + c.maxH) / 2;
    const f = facades[style];
    const map = f.map.clone();
    map.repeat.set(c.w / 14, midH / 14);
    map.needsUpdate = true;
    const rough = f.rough.clone();
    rough.repeat.copy(map.repeat);
    rough.needsUpdate = true;
    map.userData = {}; // per-city clones get disposed with the city
    rough.userData = {};
    const side = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rough,
      roughness: 1,
      metalness: style === 'glass' ? 0.55 : 0.02,
      envMapIntensity: style === 'glass' ? 1.4 : 0.6,
    });
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    // BoxGeometry groups: +x, -x, +y, -y, +z, -z
    const mats = [side, side, roofMat, roofMat, side, side];
    const m = new THREE.InstancedMesh(box, mats, Q.buildings);
    m.count = 0;
    m.receiveShadow = true;
    m.castShadow = false;
    meshes[key] = m;
    group.add(m);
    return m;
  };

  const roofs = a.roofs || 'indian';
  let tanks;
  if (roofs === 'water-tower') {
    // New York timber water towers on steel stilts with conical caps
    const barrel = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 12);
    barrel.translate(0, 2.6, 0);
    const cap = new THREE.ConeGeometry(1.25, 1.1, 12);
    cap.translate(0, 4.25, 0);
    const stilts = new THREE.CylinderGeometry(0.75, 0.9, 1.5, 4);
    stilts.translate(0, 0.75, 0);
    const towerGeo = mergeGeometries([barrel, cap, stilts], true);
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0x6b4c34, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.7, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.5 }),
    ];
    tanks = new THREE.InstancedMesh(towerGeo, mats, Q.buildings * 2);
  } else {
    const tankGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12);
    tankGeo.translate(0, 0.9, 0);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55 }); // black rooftop water tanks
    tanks = new THREE.InstancedMesh(tankGeo, tankMat, Q.buildings * 2);
  }
  tanks.count = 0;
  // Paris: zinc mansard roof on every stone block
  const mansardGeo = new THREE.CylinderGeometry(0.5, 0.707, 1, 4, 1);
  mansardGeo.rotateY(Math.PI / 4);
  mansardGeo.translate(0, 0.5, 0);
  const mansards = new THREE.InstancedMesh(
    mansardGeo,
    new THREE.MeshStandardMaterial({ color: 0x5d6672, roughness: 0.45, metalness: 0.45, flatShading: true }),
    roofs === 'mansard' ? Q.buildings : 1
  );
  mansards.count = 0;
  const parapetGeo = new THREE.BoxGeometry(1, 1, 1);
  parapetGeo.translate(0, 0.5, 0);
  const acMat = new THREE.MeshStandardMaterial({ color: 0xbdbdb8, roughness: 0.6, metalness: 0.4 });
  const acUnits = new THREE.InstancedMesh(parapetGeo, acMat, Q.buildings * 2);
  acUnits.count = 0;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let placed = 0;
  for (let tries = 0; tries < Q.buildings * 4 && placed < Q.buildings; tries++) {
    const ang = r() * Math.PI * 2;
    if (a.coast && Math.sin(ang) < -0.25) continue;
    const t = Math.pow(r(), 0.8);
    const rx = 120 + t * 300;
    const rz = 84 + t * 300;
    const x = Math.cos(ang) * rx;
    const z = Math.sin(ang) * rz;

    const tall = r() < prof.tall;
    let ci;
    if (tall) ci = 2;
    else ci = r() < 0.55 ? 0 : 1;
    if (prof.maxH < 40 && ci > 0) ci = 0;
    const c = classes[ci];
    const h = c.minH + r() * (c.maxH - c.minH);
    const w = c.w * (0.8 + r() * 0.4);
    const d = c.w * (0.7 + r() * 0.5);
    let styleIdx = pickWeighted(prof.styles, r);
    if (ci === 2 && styleIdx >= 2) styleIdx = r() < 0.6 ? 0 : 1; // towers are glass/office
    const style = STYLE_NAMES[styleIdx];
    const mesh = getMesh(style, ci);
    if (mesh.count >= Q.buildings) continue;

    const rotY = Math.round(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.3;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count, dummy.matrix);
    const paints = PAINTS[style];
    col.setHex(paints[(r() * paints.length) | 0]);
    mesh.setColorAt(mesh.count, col);
    mesh.count++;
    placed++;

    if (roofs === 'mansard' && style === 'stone' && mansards.count < mansards.instanceMatrix.count) {
      dummy.position.set(x, h, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(w, 3 + r() * 1.5, d);
      dummy.updateMatrix();
      mansards.setMatrixAt(mansards.count++, dummy.matrix);
      continue;
    }

    // Rooftop clutter: water tanks on homes (black PVC in India, timber towers in New York), AC plant on offices
    const tankStyle = roofs === 'water-tower' ? style === 'brick' || style === 'heritage' : roofs === 'indian' && (style === 'residential' || style === 'heritage');
    const roofItems = tankStyle ? (roofs === 'water-tower' ? (r() < 0.6 ? 1 : 0) : 1 + ((r() * 2) | 0)) : r() < 0.5 ? 1 : 0;
    for (let k = 0; k < roofItems; k++) {
      const ox = (r() - 0.5) * w * 0.6;
      const oz = (r() - 0.5) * d * 0.6;
      const cs = Math.cos(rotY);
      const sn = Math.sin(rotY);
      const px = x + ox * cs + oz * sn;
      const pz = z - ox * sn + oz * cs;
      if (tankStyle) {
        if (tanks.count < tanks.instanceMatrix.count) {
          dummy.position.set(px, h, pz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.9 + r() * 0.5);
          dummy.updateMatrix();
          tanks.setMatrixAt(tanks.count++, dummy.matrix);
        }
      } else if (acUnits.count < acUnits.instanceMatrix.count) {
        dummy.position.set(px, h, pz);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(2.5 + r() * 2, 1.2 + r(), 2 + r() * 2);
        dummy.updateMatrix();
        acUnits.setMatrixAt(acUnits.count++, dummy.matrix);
      }
    }
  }
  group.add(tanks, acUnits, mansards);
}

function buildMountains(group, r) {
  // Snow-capped Himalayan ridge (Zabarwan / Pir Panjal) ringing the valley
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
  const rock = new THREE.Color(0x6b6a62);
  const grass = new THREE.Color(0x4f6b3a);
  const snow = new THREE.Color(0xf4f7fb);
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + r() * 0.3;
    const rad = 620 + r() * 220;
    const geo = new THREE.ConeGeometry(1, 1, 24, 8, false);
    geo.translate(0, 0.5, 0);
    const pos = geo.attributes.position;
    const cols = [];
    const seed = r() * 10;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      let y = pos.getY(v);
      const n = 1 + 0.18 * Math.sin(x * 9 + seed) * Math.cos(z * 7 - seed) + 0.08 * Math.sin(x * 23 + z * 19);
      pos.setX(v, x * n);
      pos.setZ(v, z * n);
      y = y * (0.92 + 0.12 * Math.sin(x * 5 + z * 4 + seed));
      pos.setY(v, y);
      const c = y > 0.62 ? snow : y > 0.3 ? rock.clone().lerp(snow, Math.max(0, (y - 0.5) * 3)) : grass.clone().lerp(rock, y / 0.3);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(ang) * rad, -4, Math.sin(ang) * rad);
    m.scale.set(170 + r() * 140, 160 + r() * 140, 150 + r() * 120);
    group.add(m);
  }
}

function buildHills(group, r, a) {
  if (a.mountains) {
    buildMountains(group, r);
    return;
  }
  const mat = new THREE.MeshStandardMaterial({ color: a.ground === 'dry' ? 0x8a7a5a : 0x55704a, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const ang = r() * Math.PI * 2;
    if (a.coast && Math.sin(ang) < -0.2) continue;
    const rad = 560 + r() * 200;
    const geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = geo.attributes.position;
    const seedA = r() * 10;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      const y = pos.getY(v);
      const n = 0.8 + 0.2 * Math.sin(x * 5 + seedA) * Math.cos(z * 4 - seedA) + 0.08 * Math.sin(x * 13 + z * 11);
      pos.setY(v, y * n);
    }
    geo.computeVertexNormals();
    const hill = new THREE.Mesh(geo, mat);
    hill.position.set(Math.cos(ang) * rad, -2, Math.sin(ang) * rad);
    hill.scale.set(90 + r() * 120, 30 + r() * 60, 70 + r() * 100);
    group.add(hill);
  }
}

/* ---------- Trees ---------- */
function distToTrackSq(track, x, z) {
  let best = Infinity;
  const n = track.samples.length;
  for (let i = 0; i < n; i += 4) {
    const p = track.samples[i].point;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) best = d;
  }
  return best;
}

function blocked(avoid, x, z, pad) {
  for (const o of avoid) {
    const rr = o.r + pad;
    if ((o.x - x) ** 2 + (o.z - z) ** 2 < rr * rr) return true;
  }
  return false;
}

function buildTrees(group, r, a, track, avoid) {
  if (!treeVariants) {
    buildSimpleTrees(group, r, a, track, avoid);
    return;
  }
  const weights = a.trees;
  const dryTint = a.ground === 'dry' ? new THREE.Color(0x9a9a6a) : null;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  // --- Hero (full 3D) trees lining the circuit and in the infield parks ---
  const heroPlacements = treeVariants.map(() => []);
  const N = track.samples.length;
  let attempts = 0;
  let placed = 0;
  while (placed < Q.heroTrees && attempts < Q.heroTrees * 30) {
    attempts++;
    const vi = pickWeighted(weights, r);
    const v = treeVariants[vi];
    let x;
    let z;
    if (attempts % 3 !== 0) {
      // avenue: either side of the road
      const s = track.samples[(r() * N) | 0];
      if (s.point.y > 1.0) continue;
      const side = r() < 0.5 ? -1 : 1;
      const off = 9.5 + v.radius * 0.8 + r() * 6;
      x = s.point.x + s.right.x * side * off;
      z = s.point.z + s.right.z * side * off;
    } else {
      x = (r() - 0.5) * 200;
      z = (r() - 0.5) * 140;
    }
    const clear = 8.5 + v.radius * 0.75;
    if (distToTrackSq(track, x, z) < clear * clear) continue;
    if (blocked(avoid, x, z, v.radius * 0.6)) continue;
    heroPlacements[vi].push({ x, z, s: 0.8 + r() * 0.45, rot: r() * Math.PI * 2 });
    placed++;
  }

  treeVariants.forEach((v, vi) => {
    const list = heroPlacements[vi];
    if (!list.length) return;
    const branches = new THREE.InstancedMesh(v.branchGeo, v.branchMat, list.length);
    const leaves = new THREE.InstancedMesh(v.leafGeo, a.autumn ? v.leafMatAutumn : v.leafMat, list.length);
    list.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      branches.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
      if (a.autumn) {
        // Kashmir chinar in autumn: flame orange, crimson and gold, with some still green
        if (r() < 0.75) col.setHSL(0.015 + r() * 0.1, 0.9, 0.42 + r() * 0.1);
        else col.setHSL(0.26, 0.6, 0.32);
      } else {
        col.setHSL(0.25 + (r() - 0.5) * 0.06, 0.55 + r() * 0.2, 0.42 + r() * 0.14);
        col.lerp(new THREE.Color(1, 1, 1), 0.55);
      }
      if (dryTint) col.multiply(dryTint);
      leaves.setColorAt(i, col);
    });
    branches.castShadow = leaves.castShadow = Q.treeShadows;
    branches.receiveShadow = leaves.receiveShadow = true;
    branches.computeBoundingSphere();
    leaves.computeBoundingSphere();
    group.add(branches, leaves);
  });

  // --- Distant impostor trees in a ring around the city ---
  const farLists = treeVariants.map(() => []);
  let far = 0;
  for (let tries = 0; tries < Q.impostorTrees * 3 && far < Q.impostorTrees; tries++) {
    const ang = r() * Math.PI * 2;
    if (a.coast && Math.sin(ang) < -0.3) continue;
    const t = r();
    const x = Math.cos(ang) * (112 + t * 200) * 1.15;
    const z = Math.sin(ang) * (80 + t * 200);
    const vi = pickWeighted(weights.slice(0, 4), r);
    farLists[vi].push({ x, z, s: 0.8 + r() * 0.6, rot: r() * Math.PI });
    far++;
  }
  treeVariants.forEach((v, vi) => {
    const list = farLists[vi];
    if (!list.length) return;
    const m = new THREE.InstancedMesh(v.impostor.geo, v.impostor.mat, list.length);
    list.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (a.autumn && r() < 0.5) col.setHSL(0.05 + r() * 0.06, 0.6, 0.8);
      else col.setHSL(0.25, 0.2, 0.75 + r() * 0.25);
      if (dryTint) col.multiply(dryTint);
      m.setColorAt(i, col);
    });
    m.computeBoundingSphere();
    group.add(m);
  });
}

/** Fallback while EZ-Tree is still loading (or if it fails). */
function buildSimpleTrees(group, r, a, track, avoid) {
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 6);
  trunkGeo.translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.2, 1);
  crownGeo.translate(0, 4.4, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const NMAX = 500;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, NMAX);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, NMAX);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const greens = [0x2f5d2a, 0x3d6b2f, 0x4a7a34, 0x355e2b, 0x5a7d32];
  let k = 0;
  for (let tries = 0; tries < NMAX * 3 && k < NMAX; tries++) {
    const ang = r() * Math.PI * 2;
    if (a.coast && Math.sin(ang) < -0.3) continue;
    const rad = 115 + r() * 120;
    const x = Math.cos(ang) * rad * 1.2;
    const z = Math.sin(ang) * rad;
    if (distToTrackSq(track, x, z) < 17 * 17 || blocked(avoid, x, z, 2)) continue;
    const s = 0.7 + r() * 0.8;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = r() * 6.28;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunks.setMatrixAt(k, dummy.matrix);
    crowns.setMatrixAt(k, dummy.matrix);
    col.setHex(greens[(r() * greens.length) | 0]);
    crowns.setColorAt(k, col);
    k++;
  }
  trunks.count = crowns.count = k;
  group.add(trunks, crowns);
}

/* ---------- Grandstand ---------- */
function buildCrowdStands(group, track) {
  const f = track.getFrameAt(0.04);
  const stand = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.4, metalness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(40, 0.8, 2), concrete);
    step.position.set(0, 0.4 + i * 0.8, -i * 2);
    step.castShadow = step.receiveShadow = true;
    stand.add(step);
  }
  // Stadium seats + seated spectators (capsule torsos, varied skin and clothing)
  const seatGeo = new THREE.BoxGeometry(0.5, 0.42, 0.45);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f4e8c, roughness: 0.55 });
  const torso = new THREE.CapsuleGeometry(0.2, 0.42, 2, 6);
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const head = new THREE.SphereGeometry(0.15, 7, 5);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const MAXP = 6 * 66;
  const seats = new THREE.InstancedMesh(seatGeo, seatMat, MAXP);
  const crowd = new THREE.InstancedMesh(torso, clothMat, MAXP);
  const heads = new THREE.InstancedMesh(head, skinMat, MAXP);
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  const shirts = [0xe8e6e1, 0x2b2f36, 0x3b5b8a, 0x8a2f2f, 0xc9a227, 0x4f6b3a, 0x6d4c7d, 0xd9d2c3, 0x1f1f1f, 0xb85c38, 0x5d7a99];
  const skins = [0x8d5524, 0xc68642, 0xa0662f, 0x6b4423, 0xe0ac69, 0x7a4a2a];
  let ns = 0;
  let np = 0;
  for (let row = 0; row < 6; row++) {
    for (let j = 0; j < 66; j++) {
      const jx = -19.5 + j * 0.6;
      const y = 0.8 + row * 0.8;
      const z = -row * 2 - 0.4;
      dummy.position.set(jx, y + 0.21, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      seats.setMatrixAt(ns++, dummy.matrix);
      if (Math.random() < 0.1) continue; // empty seat
      const lean = (Math.random() - 0.5) * 0.25;
      dummy.position.set(jx + (Math.random() - 0.5) * 0.08, y + 0.82, z + 0.05);
      dummy.rotation.set(lean * 0.4, (Math.random() - 0.5) * 0.5, lean);
      dummy.scale.set(1, 0.9 + Math.random() * 0.2, 0.85);
      dummy.updateMatrix();
      crowd.setMatrixAt(np, dummy.matrix);
      c.setHex(shirts[(Math.random() * shirts.length) | 0]);
      crowd.setColorAt(np, c);
      dummy.position.y += 0.56;
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      heads.setMatrixAt(np, dummy.matrix);
      c.setHex(skins[(Math.random() * skins.length) | 0]);
      heads.setColorAt(np, c);
      np++;
    }
  }
  seats.count = ns;
  crowd.count = heads.count = np;
  crowd.castShadow = true;
  stand.add(seats, crowd, heads);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(42, 0.3, 14), roof);
  canopy.position.set(0, 9, -5);
  canopy.castShadow = true;
  stand.add(canopy);
  for (const x of [-20, 0, 20]) {
    const colm = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 8), roof);
    colm.position.set(x, 4.5, -11);
    stand.add(colm);
  }
  const pos = f.point.clone().addScaledVector(f.right, 14);
  stand.position.set(pos.x, 0, pos.z);
  stand.lookAt(f.point.x, 0, f.point.z);
  group.add(stand);
  return { x: pos.x, z: pos.z, r: 24 };
}
