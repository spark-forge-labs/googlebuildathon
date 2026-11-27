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
  const gImg = g.getImageData(0, 0, 1024, 1024);
  const gData = gImg.data;
  for (let i = 0; i < 70000; i++) {
    const a = 0.18 + r() * 0.25;
    const inv = 1 - a;
    const dark = r() > 0.5;
    const tr = dark ? 20 : 220;
    const tg = dark ? 30 : 210;
    const tb = dark ? 10 : 170;
    const x = (r() * 1024) | 0;
    const y = (r() * 1024) | 0;
    const w = 1 + ((r() * 1.5) | 0);
    const h = 1 + ((r() * 2.5) | 0);
    const maxY = y + h < 1024 ? y + h : 1024;
    const maxX = x + w < 1024 ? x + w : 1024;
    for (let py = y; py < maxY; py++) {
      let idx = (py * 1024 + x) << 2;
      for (let px = x; px < maxX; px++) {
        gData[idx] = (gData[idx] * inv + tr * a) | 0;
        gData[idx + 1] = (gData[idx + 1] * inv + tg * a) | 0;
        gData[idx + 2] = (gData[idx + 2] * inv + tb * a) | 0;
        idx += 4;
      }
    }
  }
  g.putImageData(gImg, 0, 0);
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
  const W = 512;
  const H = 512;
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
    const bc = document.createElement('canvas');
    bc.width = W;
    bc.height = H;
    const bg = bc.getContext('2d');
    const r = rand(style.length * 131 + 17);

    // Neutral mid-height bump base
    bg.fillStyle = 'rgb(140,140,140)';
    bg.fillRect(0, 0, W, H);

    if (style === 'glass') {
      // World-class architectural curtain wall: sky-reflected low-E glass, recessed office depth,
      // Venetian blinds, anodized aluminum mullions, and brushed structural spandrels
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#7ea8c4');
      sky.addColorStop(0.45, '#4b708b');
      sky.addColorStop(1, '#2a4357');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      rg.fillStyle = 'rgb(16,16,16)';
      rg.fillRect(0, 0, W, H);
      bg.fillStyle = 'rgb(85,85,85)';
      bg.fillRect(0, 0, W, H);

      // Subtle diagonal atmospheric Fresnel cloud sheen across glass facade
      const sheen = g.createLinearGradient(0, 0, W, H);
      sheen.addColorStop(0, 'rgba(220,242,255,0.16)');
      sheen.addColorStop(0.35, 'rgba(255,255,255,0.03)');
      sheen.addColorStop(0.55, 'rgba(205,235,255,0.22)');
      sheen.addColorStop(0.75, 'rgba(18,32,48,0.1)');
      sheen.addColorStop(1, 'rgba(195,228,248,0.14)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, W, H);

      const paneCols = bays * 2;
      const pw = W / paneCols;
      for (let f = 0; f < floors; f++) {
        const fy = f * fh;
        const glassH = fh - 22;

        for (let b = 0; b < paneCols; b++) {
          const px = b * pw;
          const roomType = r();

          // Deep interior office room tint behind glass
          if (roomType > 0.72) {
            // Warm sunlit / illuminated executive office interior
            const wg = g.createLinearGradient(0, fy + 4, 0, fy + glassH);
            wg.addColorStop(0, 'rgba(254,232,175,0.48)');
            wg.addColorStop(0.5, 'rgba(218,195,152,0.34)');
            wg.addColorStop(1, 'rgba(72,68,62,0.38)');
            g.fillStyle = wg;
            g.fillRect(px + 3, fy + 3, pw - 6, glassH - 4);
          } else if (roomType > 0.45) {
            // Cool daylight open-plan office with subtle interior ceiling strip
            const cg = g.createLinearGradient(0, fy + 4, 0, fy + glassH);
            cg.addColorStop(0, 'rgba(198,228,248,0.34)');
            cg.addColorStop(0.6, 'rgba(65,98,124,0.26)');
            cg.addColorStop(1, 'rgba(24,42,58,0.45)');
            g.fillStyle = cg;
            g.fillRect(px + 3, fy + 3, pw - 6, glassH - 4);
          } else {
            // Deep mirrored architectural slate glass
            const dg = g.createLinearGradient(0, fy + 4, 0, fy + glassH);
            dg.addColorStop(0, 'rgba(145,186,214,0.24)');
            dg.addColorStop(1, 'rgba(16,30,44,0.52)');
            g.fillStyle = dg;
            g.fillRect(px + 3, fy + 3, pw - 6, glassH - 4);
          }

          // Subtle Venetian blind lines in upper third of selected panes
          if (roomType > 0.55) {
            const blindDrop = glassH * (0.22 + r() * 0.25);
            g.fillStyle = 'rgba(235,240,245,0.16)';
            g.fillRect(px + 4, fy + 4, pw - 8, blindDrop);
            g.fillStyle = 'rgba(20,30,42,0.14)';
            for (let by = fy + 6; by < fy + blindDrop; by += 5) {
              g.fillRect(px + 4, by, pw - 8, 1.5);
            }
          }

          // Top shadow cast by transom bar onto glass
          g.fillStyle = 'rgba(8,14,22,0.32)';
          g.fillRect(px + 3, fy + 2, pw - 6, 5);
        }

        // Brushed aluminum & dark-glass spandrel band between floors
        const spGrad = g.createLinearGradient(0, fy + glassH, 0, fy + fh);
        spGrad.addColorStop(0, '#5a6b7a');
        spGrad.addColorStop(0.18, '#23303d');
        spGrad.addColorStop(0.82, '#1a2530');
        spGrad.addColorStop(1, '#4b5a68');
        g.fillStyle = spGrad;
        g.fillRect(0, fy + glassH, W, 22);
        rg.fillStyle = 'rgb(138,138,138)';
        rg.fillRect(0, fy + glassH, W, 22);
        bg.fillStyle = 'rgb(205,205,205)';
        bg.fillRect(0, fy + glassH, W, 22);
      }

      // Vertical extruded aluminum mullions (primary structural + secondary transom)
      for (let b = 0; b <= paneCols; b++) {
        const mx = Math.round(b * pw);
        const primary = b % 2 === 0;
        const mw = primary ? 6 : 3;
        g.fillStyle = primary ? '#aeb9c4' : '#7a8894';
        g.fillRect(mx - mw / 2, 0, mw, H);
        g.fillStyle = 'rgba(10,16,24,0.45)';
        g.fillRect(mx + mw / 2, 0, 2, H);
        rg.fillStyle = primary ? 'rgb(92,92,92)' : 'rgb(112,112,112)';
        rg.fillRect(mx - mw / 2, 0, mw, H);
        bg.fillStyle = primary ? 'rgb(245,245,245)' : 'rgb(200,200,200)';
        bg.fillRect(mx - mw / 2, 0, mw, H);
      }
    } else if (style === 'office') {
      // Architectural precast travertine & granite corporate tower with recessed ribbon glass + sun louvers
      g.fillStyle = '#c8c0b4';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(218,218,218)';
      rg.fillRect(0, 0, W, H);
      bg.fillStyle = 'rgb(195,195,195)';
      bg.fillRect(0, 0, W, H);

      // Subtle architectural precast panel grain & joints
      for (let i = 0; i < 600; i++) {
        g.fillStyle = r() > 0.5 ? `rgba(255,252,245,${r() * 0.08})` : `rgba(80,74,64,${r() * 0.07})`;
        g.fillRect(r() * W, r() * H, 4 + r() * 34, 2 + r() * 14);
      }
      g.fillStyle = 'rgba(70,64,56,0.22)';
      for (let b = 0; b < bays * 2; b++) {
        g.fillRect(b * (bw / 2), 0, 2, H);
        bg.fillStyle = 'rgb(145,145,145)';
        bg.fillRect(b * (bw / 2), 0, 2, H);
      }

      for (let f = 0; f < floors; f++) {
        const fy = f * fh;
        const winY = fy + fh * 0.24;
        const winH = fh * 0.54;

        // Projecting stone sill & lintel bevel
        g.fillStyle = '#dfd8cc';
        g.fillRect(0, winY - 5, W, 5);
        g.fillStyle = '#8b8378';
        g.fillRect(0, winY + winH, W, 4);
        bg.fillStyle = 'rgb(235,235,235)';
        bg.fillRect(0, winY - 5, W, 5);
        bg.fillRect(0, winY + winH, W, 4);

        // Recessed ribbon glazing
        const wg = g.createLinearGradient(0, winY, 0, winY + winH);
        wg.addColorStop(0, '#20303d');
        wg.addColorStop(0.3, '#415d73');
        wg.addColorStop(1, '#263947');
        g.fillStyle = wg;
        g.fillRect(8, winY, W - 16, winH);
        rg.fillStyle = 'rgb(22,22,22)';
        rg.fillRect(8, winY, W - 16, winH);
        bg.fillStyle = 'rgb(60,60,60)';
        bg.fillRect(8, winY, W - 16, winH);

        // Interior office illumination + vertical architectural aluminum fins
        const paneCount = bays * 2;
        const pw = (W - 16) / paneCount;
        for (let b = 0; b < paneCount; b++) {
          const px = 8 + b * pw;
          const v = r();
          if (v > 0.66) {
            g.fillStyle = 'rgba(248,228,184,0.48)';
            g.fillRect(px + 4, winY + 6, pw - 8, winH - 10);
          } else {
            g.fillStyle = `rgba(150,192,220,${0.16 + r() * 0.22})`;
            g.fillRect(px + 4, winY + 5, pw - 8, winH - 9);
          }
          // Vertical sun-shading fin
          g.fillStyle = '#9b958b';
          g.fillRect(px - 2, winY - 2, 5, winH + 4);
          rg.fillStyle = 'rgb(140,140,140)';
          rg.fillRect(px - 2, winY - 2, 5, winH + 4);
          bg.fillStyle = 'rgb(225,225,225)';
          bg.fillRect(px - 2, winY - 2, 5, winH + 4);
        }

        // Deep lintel shadow inside window recess
        const sh = g.createLinearGradient(0, winY, 0, winY + 14);
        sh.addColorStop(0, 'rgba(6,10,16,0.58)');
        sh.addColorStop(1, 'rgba(6,10,16,0)');
        g.fillStyle = sh;
        g.fillRect(8, winY, W - 16, 14);
      }
    } else if (style === 'residential') {
      // Luxury contemporary urban & Indian apartment towers: warm stucco, recessed glass balconies, interior depth
      g.fillStyle = '#ebe4d6';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(232,232,232)';
      rg.fillRect(0, 0, W, H);
      bg.fillStyle = 'rgb(175,175,175)';
      bg.fillRect(0, 0, W, H);

      for (let i = 0; i < 750; i++) {
        g.fillStyle = r() > 0.5 ? `rgba(255,252,245,${r() * 0.08})` : `rgba(88,76,58,${r() * 0.06})`;
        g.fillRect(r() * W, r() * H, 4 + r() * 26, 3 + r() * 24);
      }

      for (let f = 0; f < floors; f++) {
        const fy = f * fh;
        for (let b = 0; b < bays; b++) {
          const x = b * bw;
          const hasBalcony = (b + f) % 2 === 0;

          // Recessed window / balcony alcove
          const rx = x + 16;
          const ry = fy + 18;
          const rw = bw - 32;
          const rh = fh * 0.58;

          // Deep interior shadow
          const alc = g.createLinearGradient(0, ry, 0, ry + rh);
          alc.addColorStop(0, '#1f262e');
          alc.addColorStop(1, '#313b46');
          g.fillStyle = alc;
          g.fillRect(rx, ry, rw, rh);
          rg.fillStyle = 'rgb(28,28,28)';
          rg.fillRect(rx, ry, rw, rh);
          bg.fillStyle = 'rgb(55,55,55)';
          bg.fillRect(rx, ry, rw, rh);

          // Warm lit curtains / interior depth
          const curtainCols = ['#e6cfa3', '#9db4cc', '#d49a89', '#efe7d4', '#f8d99a'];
          const lit = r() > 0.42;
          g.fillStyle = curtainCols[(r() * curtainCols.length) | 0];
          g.globalAlpha = lit ? 0.62 : 0.34;
          g.fillRect(rx + 4, ry + 4, rw * (0.35 + r() * 0.45), rh - 8);
          g.globalAlpha = 1;

          // Crisp dark aluminum window frame & center sliding mullion
          g.strokeStyle = '#1b222a';
          g.lineWidth = 3;
          g.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);
          g.fillStyle = '#1b222a';
          g.fillRect(rx + rw * 0.5 - 1.5, ry, 3, rh);

          if (hasBalcony) {
            // Frameless tinted glass balcony balustrade + projecting slab shadow
            const balY = fy + fh * 0.54;
            const balH = fh * 0.28;
            g.fillStyle = 'rgba(130,175,205,0.42)';
            g.fillRect(x + 10, balY, bw - 20, balH);
            rg.fillStyle = 'rgb(24,24,24)';
            rg.fillRect(x + 10, balY, bw - 20, balH);
            // Brushed aluminum top handrail
            g.fillStyle = '#d4dce3';
            g.fillRect(x + 9, balY - 2, bw - 18, 4);
            // Concrete balcony floor slab + deep under-slab shadow
            g.fillStyle = '#dbd2c1';
            g.fillRect(x + 8, balY + balH, bw - 16, 8);
            bg.fillStyle = 'rgb(240,240,240)';
            bg.fillRect(x + 8, balY + balH, bw - 16, 8);
            g.fillStyle = 'rgba(15,18,24,0.34)';
            g.fillRect(x + 8, balY + balH + 8, bw - 16, 7);
          } else {
            // Stone window sill + subtle under-sill shadow
            g.fillStyle = '#d8cebc';
            g.fillRect(rx - 4, ry + rh, rw + 8, 6);
            bg.fillStyle = 'rgb(225,225,225)';
            bg.fillRect(rx - 4, ry + rh, rw + 8, 6);
            g.fillStyle = 'rgba(20,20,24,0.22)';
            g.fillRect(rx - 3, ry + rh + 6, rw + 6, 5);
          }
        }
        // Horizontal architectural floor band
        g.fillStyle = '#d4cab6';
        g.fillRect(0, fy + fh - 7, W, 7);
        g.fillStyle = 'rgba(18,16,14,0.18)';
        g.fillRect(0, fy + fh - 2, W, 2);
        bg.fillStyle = 'rgb(215,215,215)';
        bg.fillRect(0, fy + fh - 7, W, 7);
      }
    } else if (style === 'brick') {
      // London / New York heritage stretcher-bond brickwork with stone lintels & recessed sash windows
      g.fillStyle = '#8f4d38';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(235,235,235)';
      rg.fillRect(0, 0, W, H);
      bg.fillStyle = 'rgb(165,165,165)';
      bg.fillRect(0, 0, W, H);

      const bh = 10;
      for (let y = 0, row = 0; y < H; y += bh, row++) {
        for (let x = -((row % 2) * 14); x < W; x += 28) {
          const v = r() * 28 - 14;
          g.fillStyle = `rgb(${142 + v},${76 + v * 0.6},${55 + v * 0.4})`;
          g.fillRect(x + 1.5, y + 1.5, 25, bh - 2);
          bg.fillStyle = `rgb(${175 + v * 0.5},${175 + v * 0.5},${175 + v * 0.5})`;
          bg.fillRect(x + 1.5, y + 1.5, 25, bh - 2);
        }
      }

      for (let f = 0; f < floors; f++) {
        for (let b = 0; b < bays; b++) {
          const x = b * bw + bw * 0.22;
          const y = f * fh + fh * 0.18;
          const w = bw * 0.56;
          const h = fh * 0.6;
          // Carved limestone lintel + keystone + projecting sill
          g.fillStyle = '#e0d9cb';
          g.fillRect(x - 6, y - 11, w + 12, 11);
          g.fillStyle = '#ece6da';
          g.fillRect(x + w * 0.5 - 7, y - 14, 14, 15);
          g.fillStyle = '#d6cfc0';
          g.fillRect(x - 5, y + h, w + 10, 8);
          bg.fillStyle = 'rgb(245,245,245)';
          bg.fillRect(x - 6, y - 11, w + 12, 11);
          bg.fillRect(x - 5, y + h, w + 10, 8);

          // Recessed white wooden sash frame
          g.fillStyle = '#f5f2eb';
          g.fillRect(x, y, w, h);
          bg.fillStyle = 'rgb(65,65,65)';
          bg.fillRect(x + 5, y + 5, w - 10, h - 10);
          rg.fillStyle = 'rgb(26,26,26)';
          rg.fillRect(x + 5, y + 5, w - 10, h - 10);

          // Reflective upper & lower sash panes
          const litTop = r() > 0.68;
          const litBot = r() > 0.72;
          g.fillStyle = litTop ? '#d9c596' : '#26323d';
          g.fillRect(x + 5, y + 5, w - 10, h / 2 - 7);
          g.fillStyle = litBot ? '#e3cb94' : '#1e2730';
          g.fillRect(x + 5, y + h / 2 + 2, w - 10, h / 2 - 7);

          // Sky glint across glass
          g.fillStyle = 'rgba(186,225,250,0.16)';
          g.fillRect(x + 6, y + 6, (w - 12) * 0.45, h - 12);

          // Crisp Georgian glazing bars
          g.fillStyle = '#f5f2eb';
          g.fillRect(x + w / 2 - 2, y, 4, h);
          g.fillRect(x, y + h / 2 - 2, w, 4);
        }
      }
    } else if (style === 'stone') {
      // Haussmann Parisian / European dressed limestone with French windows & ornate wrought-iron balconies
      g.fillStyle = '#e7ddc8';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(220,220,220)';
      rg.fillRect(0, 0, W, H);
      bg.fillStyle = 'rgb(185,185,185)';
      bg.fillRect(0, 0, W, H);

      for (let i = 0; i < 420; i++) {
        g.fillStyle = `rgba(95,84,64,${r() * 0.06})`;
        g.fillRect(r() * W, r() * H, 6 + r() * 48, 3 + r() * 14);
      }
      for (let y = 0; y < H; y += 18) {
        g.fillStyle = 'rgba(115,102,78,0.2)';
        g.fillRect(0, y, W, 2);
        bg.fillStyle = 'rgb(140,140,140)';
        bg.fillRect(0, y, W, 2);
      }

      for (let f = 0; f < floors; f++) {
        const balconyFloor = f === 1;
        for (let b = 0; b < bays; b++) {
          const x = b * bw + bw * 0.25;
          const y = f * fh + fh * 0.13;
          const w = bw * 0.5;
          const h = fh * 0.68;

          // Carved stone surround + cornice pediment
          g.fillStyle = '#d4c6aa';
          g.fillRect(x - 6, y - 6, w + 12, h + 8);
          bg.fillStyle = 'rgb(230,230,230)';
          bg.fillRect(x - 6, y - 6, w + 12, h + 8);
          if (f === 2) {
            g.beginPath();
            g.moveTo(x - 10, y - 6);
            g.lineTo(x + w / 2, y - 20);
            g.lineTo(x + w + 10, y - 6);
            g.closePath();
            g.fill();
          }

          // Deep recessed French glass doors
          const fg = g.createLinearGradient(0, y, 0, y + h);
          fg.addColorStop(0, '#222b33');
          fg.addColorStop(1, '#34414d');
          g.fillStyle = fg;
          g.fillRect(x, y, w, h);
          rg.fillStyle = 'rgb(22,22,22)';
          rg.fillRect(x, y, w, h);
          bg.fillStyle = 'rgb(60,60,60)';
          bg.fillRect(x, y, w, h);

          g.fillStyle = r() > 0.65 ? 'rgba(248,225,170,0.45)' : 'rgba(186,218,242,0.22)';
          g.fillRect(x + 4, y + 4, w / 2 - 6, h - 8);
          g.fillStyle = '#f2ead9';
          g.fillRect(x + w / 2 - 2, y, 4, h);
          g.fillRect(x, y + h * 0.35, w, 3);

          if (!balconyFloor) {
            g.fillStyle = '#181a1e';
            g.fillRect(x - 4, y + h * 0.64, w + 8, 3);
            for (let k = 0; k <= 8; k++) {
              g.fillRect(x - 4 + (k * (w + 8)) / 8, y + h * 0.64, 2, h * 0.36);
            }
          }
        }
        if (balconyFloor) {
          const y = f * fh + fh * 0.62;
          g.fillStyle = '#cfc1a4';
          g.fillRect(0, y + fh * 0.18, W, 10);
          bg.fillStyle = 'rgb(245,245,245)';
          bg.fillRect(0, y + fh * 0.18, W, 10);
          g.fillStyle = '#181a1e';
          g.fillRect(0, y - 3, W, 4);
          for (let x = 0; x < W; x += 9) g.fillRect(x, y - 3, 2, fh * 0.21);
        }
        g.fillStyle = '#d6c8ab';
        g.fillRect(0, f * fh + fh - 10, W, 10);
        g.fillStyle = 'rgba(20,16,12,0.22)';
        g.fillRect(0, f * fh + fh - 2, W, 2);
      }
    } else {
      // Heritage / colonial sandstone & lime-wash: arched recessed windows, louvered shutters, deep stone cornices
      g.fillStyle = '#f2e8d2';
      g.fillRect(0, 0, W, H);
      rg.fillStyle = 'rgb(235,235,235)';
      rg.fillRect(0, 0, W, H);
      bg.fillStyle = 'rgb(180,180,180)';
      bg.fillRect(0, 0, W, H);

      for (let i = 0; i < 450; i++) {
        g.fillStyle = `rgba(110,92,65,${r() * 0.06})`;
        g.fillRect(r() * W, r() * H, 6 + r() * 36, 4 + r() * 20);
      }

      for (let f = 0; f < floors; f++) {
        for (let b = 0; b < bays; b++) {
          const x = b * bw + bw * 0.23;
          const y = f * fh + fh * 0.16;
          const w = bw * 0.54;
          const h = fh * 0.64;

          // Stone arch trim
          g.fillStyle = '#d8c9a9';
          g.beginPath();
          g.moveTo(x - 6, y + h + 4);
          g.lineTo(x - 6, y + w / 2);
          g.arc(x + w / 2, y + w / 2, w / 2 + 6, Math.PI, 0);
          g.lineTo(x + w + 6, y + h + 4);
          g.closePath();
          g.fill();

          // Arched louvered shutter + recessed glass fanlight
          g.fillStyle = '#3f5f46';
          g.beginPath();
          g.moveTo(x, y + h);
          g.lineTo(x, y + w / 2);
          g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
          g.lineTo(x + w, y + h);
          g.closePath();
          g.fill();

          bg.fillStyle = 'rgb(75,75,75)';
          bg.fillRect(x, y + w / 2, w, h - w / 2);
          rg.fillStyle = 'rgb(50,50,50)';
          rg.fillRect(x + 4, y + 6, w - 8, w / 2);

          // Louver slats
          g.strokeStyle = 'rgba(255,255,255,0.28)';
          g.lineWidth = 2;
          for (let k = 1; k < 9; k++) {
            const ly = y + w / 2 + (k * (h - w / 2)) / 9;
            g.beginPath();
            g.moveTo(x + 4, ly);
            g.lineTo(x + w - 4, ly);
            g.stroke();
          }
        }
        g.fillStyle = '#d7c9ab';
        g.fillRect(0, f * fh + fh - 14, W, 14);
        g.fillStyle = 'rgba(28,22,14,0.24)';
        g.fillRect(0, f * fh + fh - 3, W, 3);
        bg.fillStyle = 'rgb(240,240,240)';
        bg.fillRect(0, f * fh + fh - 14, W, 14);
      }
    }

    const map = keep(new THREE.CanvasTexture(cv));
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const rough = keep(new THREE.CanvasTexture(rc));
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    rough.anisotropy = 4;
    const bump = keep(new THREE.CanvasTexture(bc));
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.anisotropy = 4;
    return { map, rough, bump };
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
  const sImg = g.getImageData(0, 0, 512, 512);
  const sData = sImg.data;
  for (let i = 0; i < 40000; i++) {
    const v = (170 + r() * 85) | 0;
    const vg = v - 4;
    const vb = v - 10;
    const x = (r() * 512) | 0;
    const y = (r() * 512) | 0;
    const w = 1 + ((r() * 1.5) | 0);
    const h = 1 + ((r() * 1.5) | 0);
    const maxY = y + h < 512 ? y + h : 512;
    const maxX = x + w < 512 ? x + w : 512;
    for (let py = y; py < maxY; py++) {
      let idx = (py * 512 + x) << 2;
      for (let px = x; px < maxX; px++) {
        sData[idx] = (sData[idx] + v) >> 1;
        sData[idx + 1] = (sData[idx + 1] + vg) >> 1;
        sData[idx + 2] = (sData[idx + 2] + vb) >> 1;
        idx += 4;
      }
    }
  }
  g.putImageData(sImg, 0, 0);
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
  groundMat.userData.nightDim = 0.4;
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
  plaza.material.userData.nightDim = 0.45;
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
  const stands = buildGrandstands(group, track, city, avoid, r);
  anim.stands = stands;
  const fullAvoid = [...avoid, ...stands];
  // Continuous street frontage just behind the barrier walls and footpaths
  const frontage = buildFrontage(group, r, a, city, track, fullAvoid);
  buildSkyline(group, r, a);
  buildHills(group, r, a);
  buildTrees(group, r, a, track, [...fullAvoid, ...frontage]);

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

/* ---------- Street frontage ---------- */
let shopCache = null;
/** Ground-floor shops: glazing, doors, fascia signs and awnings (4 shops per tile, ~18 units). */
function shopfrontTextures() {
  if (shopCache) return shopCache;
  const mk = (words, seed) => {
    const W = 1024;
    const H = 256;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    const rc = document.createElement('canvas');
    rc.width = W / 4;
    rc.height = H / 4;
    const rg = rc.getContext('2d');
    const r = rand(seed);
    g.fillStyle = '#d8d2c6';
    g.fillRect(0, 0, W, H);
    rg.fillStyle = 'rgb(225,225,225)';
    rg.fillRect(0, 0, W / 4, H / 4);
    const sw = W / 4;
    const signCols = ['#7f1d1d', '#14532d', '#1e3a8a', '#78350f', '#111827', '#831843', '#0f766e', '#a16207'];
    for (let k = 0; k < 4; k++) {
      const x = k * sw;
      // pilasters between shops
      g.fillStyle = '#bdb5a6';
      g.fillRect(x, 0, 10, H);
      // fascia sign
      const col = signCols[(r() * signCols.length) | 0];
      g.fillStyle = col;
      g.fillRect(x + 14, 22, sw - 28, 48);
      g.fillStyle = '#f8f4ea';
      g.font = '800 30px system-ui, "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(words[(k + seed) % words.length], x + sw / 2, 47, sw - 50);
      // striped awning
      const awn = r() < 0.6;
      if (awn) {
        for (let st = 0; st < 10; st++) {
          g.fillStyle = st % 2 ? '#f2efe6' : col;
          g.beginPath();
          g.moveTo(x + 14 + (st * (sw - 28)) / 10, 74);
          g.lineTo(x + 14 + ((st + 1) * (sw - 28)) / 10, 74);
          g.lineTo(x + 10 + ((st + 1) * (sw - 20)) / 10, 102);
          g.lineTo(x + 10 + (st * (sw - 20)) / 10, 102);
          g.closePath();
          g.fill();
        }
      }
      // shop window with reflections and goods
      const wy = awn ? 104 : 80;
      g.fillStyle = '#1f2830';
      g.fillRect(x + 18, wy, sw - 36, H - wy - 14);
      rg.fillStyle = 'rgb(30,30,30)';
      rg.fillRect((x + 18) / 4, wy / 4, (sw - 36) / 4, (H - wy - 14) / 4);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `hsla(${(r() * 360) | 0},40%,${45 + r() * 25}%,0.55)`;
        g.fillRect(x + 26 + r() * (sw - 60), H - 40 - r() * 60, 8 + r() * 22, 8 + r() * 30);
      }
      const ref = g.createLinearGradient(x, wy, x + sw, H);
      ref.addColorStop(0, 'rgba(200,215,225,0.28)');
      ref.addColorStop(0.5, 'rgba(200,215,225,0.04)');
      ref.addColorStop(1, 'rgba(200,215,225,0.18)');
      g.fillStyle = ref;
      g.fillRect(x + 18, wy, sw - 36, H - wy - 14);
      // door
      const dx = x + (k % 2 ? sw - 70 : 30);
      g.fillStyle = '#3b2f25';
      g.fillRect(dx, wy + 8, 40, H - wy - 22);
      g.fillStyle = 'rgba(190,205,215,0.35)';
      g.fillRect(dx + 6, wy + 14, 28, (H - wy) * 0.45);
      g.fillStyle = '#9a9286';
      g.fillRect(x, H - 14, sw, 14); // stall riser / step
    }
    const map = keep(new THREE.CanvasTexture(cv));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    map.userData.nightGlow = 0.45; // lit shop fronts at night
    const rough = keep(new THREE.CanvasTexture(rc));
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    return { map, rough };
  };
  shopCache = {
    india: mk(['CHAI', 'MEDICAL', 'SWEETS', 'MOBILE', 'TAILOR', 'BOOKS', 'JEWELLERS', 'TIFFIN'], 3),
    world: mk(['CAFÉ', 'PHARMACY', 'BAKERY', 'DELI', 'BOOKS', 'FLOWERS', 'BISTRO', 'NEWS'], 7),
  };
  return shopCache;
}

function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Buildings shoulder to shoulder along the outside of the circuit, shops at street level,
 * so the race runs through city streets instead of open ground. Returns footprints for tree placement.
 */
function buildFrontage(group, r, a, city, track, avoid) {
  const facades = facadeTextures().all;
  const shops = shopfrontTextures()[city.region === 'world' ? 'world' : 'india'];
  const S = track.samples;
  const N = S.length;
  const poly = S.map((s) => [s.point.x, s.point.z]);
  const lap = track.totalLength;
  const step = lap / N;
  const prof = a.skyline;
  const styles = prof.styles.map((w, i) => (i === 0 ? w * 0.45 : w)); // fewer curtain-wall towers at street level
  const tall = prof.maxH >= 40;
  const hMin = a.roofs === 'mansard' ? 14 : tall ? 11 : 8;
  const hMax = a.roofs === 'mansard' ? 18 : THREE.MathUtils.clamp(prof.maxH * 0.3, 14, 42);
  const FRONT = 18.6; // building line, behind the 17.6 service-road edge
  const SHOP_H = 4.2;
  const max = Q.tier === 'low' ? 70 : 120;

  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.95 });
  const meshes = {};
  const getUpper = (style) => {
    if (meshes[style]) return meshes[style];
    const map = facades[style].map.clone();
    map.userData = {};
    map.repeat.set(11 / 14, ((hMin + hMax) / 2 - SHOP_H) / 14);
    map.needsUpdate = true;
    const rough = facades[style].rough.clone();
    rough.userData = {};
    rough.repeat.copy(map.repeat);
    rough.needsUpdate = true;
    const bump = facades[style].bump.clone();
    bump.userData = {};
    bump.repeat.copy(map.repeat);
    bump.needsUpdate = true;
    const side = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rough,
      bumpMap: bump,
      bumpScale: style === 'glass' ? 0.28 : 0.42,
      roughness: 1,
      metalness: style === 'glass' ? 0.68 : 0.04,
      envMapIntensity: style === 'glass' ? 1.65 : 0.72,
    });
    const m = new THREE.InstancedMesh(unit, [side, side, roofMat, roofMat, side, side], max);
    m.count = 0;
    m.castShadow = Q.tier !== 'low';
    m.receiveShadow = true;
    meshes[style] = m;
    group.add(m);
    return m;
  };
  const shopMap = shops.map.clone();
  shopMap.userData = {};
  shopMap.repeat.set(11 / 18, 1);
  shopMap.needsUpdate = true;
  const shopRough = shops.rough.clone();
  shopRough.userData = {};
  shopRough.repeat.copy(shopMap.repeat);
  shopRough.needsUpdate = true;
  const shopSide = new THREE.MeshStandardMaterial({ map: shopMap, roughnessMap: shopRough, roughness: 1, envMapIntensity: 0.9 });
  const shopMesh = new THREE.InstancedMesh(unit, [shopSide, shopSide, roofMat, roofMat, shopSide, shopSide], max);
  shopMesh.count = 0;
  shopMesh.receiveShadow = true;
  shopMesh.castShadow = Q.tier !== 'low';
  const corniceMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc0, roughness: 0.82 });
  const cornices = new THREE.InstancedMesh(unit, corniceMat, max * 2);
  cornices.count = 0;
  const mansardGeo = new THREE.CylinderGeometry(0.5, 0.707, 1, 4, 1);
  mansardGeo.rotateY(Math.PI / 4);
  mansardGeo.translate(0, 0.5, 0);
  const mansards = new THREE.InstancedMesh(
    mansardGeo,
    new THREE.MeshStandardMaterial({ color: 0x5d6672, roughness: 0.45, metalness: 0.45, flatShading: true }),
    a.roofs === 'mansard' ? max : 1
  );
  mansards.count = 0;
  group.add(shopMesh, cornices, mansards);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const footprints = [];
  const clearOf = (x, z, minD) => {
    for (let i = 0; i < N; i += 2) {
      const p = S[i].point;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) return false;
    }
    return true;
  };
  let placed = 0;
  for (const side of [-1, 1]) {
    let i = 0;
    while (i < N && placed < max) {
      const w = 7 + r() * 7;
      const d = 9 + r() * 6;
      const span = Math.max(2, Math.round(w / step));
      const mid = (i + Math.floor(span / 2)) % N;
      const s = S[mid];
      const gap = r() < 0.16 ? 6 + r() * 5 : r() * 0.8; // the odd side street
      const next = i + span + Math.max(1, Math.round(gap / step));
      const ok = (() => {
        for (let k = i; k <= i + span; k++) if (S[k % N].point.y > 0.8) return false;
        const off = FRONT + d / 2;
        const cx = s.point.x + s.right.x * side * off;
        const cz = s.point.z + s.right.z * side * off;
        if (pointInPolygon(poly, cx, cz)) return false; // keep the infield parks open
        // every corner must stay behind the building line of every part of the circuit
        const tx = s.tangent.x;
        const tz = s.tangent.z;
        const rx = s.right.x * side;
        const rz = s.right.z * side;
        for (const [ua, ra] of [[-w / 2, FRONT], [w / 2, FRONT], [-w / 2, FRONT + d], [w / 2, FRONT + d]]) {
          const x = s.point.x + tx * ua + rx * ra;
          const z = s.point.z + tz * ua + rz * ra;
          if (!clearOf(x, z, FRONT - 0.6)) return false;
          if (pointInPolygon(poly, x, z)) return false;
        }
        if (blocked(avoid, cx, cz, Math.max(w, d) * 0.45)) return false;
        return { cx, cz };
      })();
      if (ok) {
        const h = hMin + Math.pow(r(), 1.4) * (hMax - hMin);
        let styleIdx = pickWeighted(styles, r);
        if (h > 26 && styleIdx >= 2 && styleIdx < 4) styleIdx = r() < 0.5 ? 0 : 1;
        const style = STYLE_NAMES[styleIdx];
        const rotY = Math.atan2(s.tangent.x, s.tangent.z);
        // shops at street level
        dummy.position.set(ok.cx, 0, ok.cz);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(d + 0.3, SHOP_H, w + 0.02);
        dummy.updateMatrix();
        shopMesh.setMatrixAt(shopMesh.count++, dummy.matrix);
        // the floors above
        const up = getUpper(style);
        dummy.position.y = SHOP_H;
        dummy.scale.set(d, h - SHOP_H, w);
        dummy.updateMatrix();
        up.setMatrixAt(up.count, dummy.matrix);
        const paints = PAINTS[style];
        col.setHex(paints[(r() * paints.length) | 0]);
        up.setColorAt(up.count, col);
        up.count++;
        // cornice band over the shops
        dummy.position.y = SHOP_H - 0.1;
        dummy.scale.set(d + 0.65, 0.48, w + 0.08);
        dummy.updateMatrix();
        cornices.setMatrixAt(cornices.count++, dummy.matrix);
        // Architectural roof crown parapet cornice on every street building
        if (!(a.roofs === 'mansard' && style === 'stone')) {
          dummy.position.y = h;
          dummy.scale.set(d + 0.5, 0.75, w + 0.5);
          dummy.updateMatrix();
          cornices.setMatrixAt(cornices.count++, dummy.matrix);
        } else {
          dummy.position.y = h;
          dummy.scale.set(d, 3 + r() * 1.2, w);
          dummy.updateMatrix();
          mansards.setMatrixAt(mansards.count++, dummy.matrix);
        }
        footprints.push({ x: ok.cx, z: ok.cz, r: Math.max(w, d) * 0.55 });
        placed++;
      }
      i = next;
    }
  }
  for (const m of [shopMesh, cornices, mansards, ...Object.values(meshes)]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }
  return footprints;
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
    const bump = f.bump.clone();
    bump.repeat.copy(map.repeat);
    bump.needsUpdate = true;
    map.userData = {}; // per-city clones get disposed with the city
    rough.userData = {};
    bump.userData = {};
    const side = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rough,
      bumpMap: bump,
      bumpScale: style === 'glass' ? 0.25 : 0.38,
      roughness: 1,
      metalness: style === 'glass' ? 0.68 : 0.04,
      envMapIntensity: style === 'glass' ? 1.65 : 0.72,
    });
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    // BoxGeometry groups: +x, -x, +y, -y, +z, -z
    const mats = [side, side, roofMat, roofMat, side, side];
    const m = new THREE.InstancedMesh(box, mats, Q.buildings * 2);
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
  const acMat = new THREE.MeshStandardMaterial({ color: 0xbdbdb8, roughness: 0.55, metalness: 0.45 });
  const acUnits = new THREE.InstancedMesh(parapetGeo, acMat, Q.buildings * 3);
  acUnits.count = 0;

  // Tapered skyscraper spires & glowing red aviation beacons for world-class skylines
  const spireGeo = new THREE.CylinderGeometry(0.12, 0.45, 1, 8);
  spireGeo.translate(0, 0.5, 0);
  const spires = new THREE.InstancedMesh(
    spireGeo,
    new THREE.MeshStandardMaterial({ color: 0xd8e0e8, roughness: 0.25, metalness: 0.85 }),
    Q.buildings
  );
  spires.count = 0;
  const beaconGeo = new THREE.SphereGeometry(0.65, 8, 8);
  const beacons = new THREE.InstancedMesh(
    beaconGeo,
    new THREE.MeshStandardMaterial({
      color: 0xff2a2a,
      emissive: 0xff1e1e,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    }),
    Q.buildings
  );
  beacons.count = 0;

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
    if (ci === 2 && styleIdx >= 2) styleIdx = r() < 0.65 ? 0 : 1; // towers are glass/office
    const style = STYLE_NAMES[styleIdx];
    const mesh = getMesh(style, ci);
    if (mesh.count >= Q.buildings * 2 - 2) continue;

    const rotY = Math.round(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.3;
    const paints = PAINTS[style];
    const paintHex = paints[(r() * paints.length) | 0];
    col.setHex(paintHex);

    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count, dummy.matrix);
    mesh.setColorAt(mesh.count, col);
    mesh.count++;
    placed++;

    // Stepped architectural setback upper tier + spire on tall towers
    let topY = h;
    let topW = w;
    let topD = d;
    if (ci === 2 && (style === 'glass' || style === 'office') && r() < 0.68) {
      const stepScale = 0.58 + r() * 0.16;
      const stepH = h * (0.16 + r() * 0.14);
      topW = w * stepScale;
      topD = d * stepScale;
      dummy.position.set(x, h, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(topW, stepH, topD);
      dummy.updateMatrix();
      mesh.setMatrixAt(mesh.count, dummy.matrix);
      mesh.setColorAt(mesh.count, col);
      mesh.count++;
      topY = h + stepH;

      // Tapered architectural spire + red aviation warning light
      if (r() < 0.62 && spires.count < spires.instanceMatrix.count) {
        const spireH = 10 + r() * 18;
        dummy.position.set(x, topY, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, spireH, 1);
        dummy.updateMatrix();
        spires.setMatrixAt(spires.count++, dummy.matrix);

        if (beacons.count < beacons.instanceMatrix.count) {
          dummy.position.set(x, topY + spireH, z);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          beacons.setMatrixAt(beacons.count++, dummy.matrix);
        }
      }
    }

    if (roofs === 'mansard' && style === 'stone' && mansards.count < mansards.instanceMatrix.count) {
      dummy.position.set(x, topY, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(topW, 3 + r() * 1.5, topD);
      dummy.updateMatrix();
      mansards.setMatrixAt(mansards.count++, dummy.matrix);
      continue;
    }

    // Architectural roof parapet cap on modern towers
    if (ci >= 1 && acUnits.count < acUnits.instanceMatrix.count) {
      dummy.position.set(x, topY, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(topW + 0.4, 0.9, topD + 0.4);
      dummy.updateMatrix();
      acUnits.setMatrixAt(acUnits.count++, dummy.matrix);
    }

    // Rooftop clutter: water tanks on homes (black PVC in India, timber towers in New York), mechanical penthouse on offices
    const tankStyle = roofs === 'water-tower' ? style === 'brick' || style === 'heritage' : roofs === 'indian' && (style === 'residential' || style === 'heritage');
    const roofItems = tankStyle ? (roofs === 'water-tower' ? (r() < 0.6 ? 1 : 0) : 1 + ((r() * 2) | 0)) : r() < 0.55 ? 1 : 0;
    for (let k = 0; k < roofItems; k++) {
      const ox = (r() - 0.5) * topW * 0.52;
      const oz = (r() - 0.5) * topD * 0.52;
      const cs = Math.cos(rotY);
      const sn = Math.sin(rotY);
      const px = x + ox * cs + oz * sn;
      const pz = z - ox * sn + oz * cs;
      if (tankStyle) {
        if (tanks.count < tanks.instanceMatrix.count) {
          dummy.position.set(px, topY, pz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.9 + r() * 0.5);
          dummy.updateMatrix();
          tanks.setMatrixAt(tanks.count++, dummy.matrix);
        }
      } else if (acUnits.count < acUnits.instanceMatrix.count) {
        dummy.position.set(px, topY + 0.9, pz);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(3 + r() * 2.5, 1.8 + r() * 1.4, 2.5 + r() * 2.5);
        dummy.updateMatrix();
        acUnits.setMatrixAt(acUnits.count++, dummy.matrix);
      }
    }
  }
  for (const m of [tanks, acUnits, mansards, spires, beacons, ...Object.values(meshes)]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }
  group.add(tanks, acUnits, mansards, spires, beacons);
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
      const off = 13.6 + v.radius * 0.4 + r() * 3.5; // on the service road verge, behind the barrier
      x = s.point.x + s.right.x * side * off;
      z = s.point.z + s.right.z * side * off;
    } else {
      x = (r() - 0.5) * 200;
      z = (r() - 0.5) * 140;
    }
    const clear = 13.2 + v.radius * 0.25;
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
/** Shared clock for the cheering crowd (advanced by DeskWorld.update). */
export const crowdClock = { value: 0 };

/**
 * Grand-prix grandstands along the straights, outside the circuit: tiered concrete,
 * packed with fans in team colours who bob and cheer. Returns footprints to keep clear.
 */
function buildGrandstands(group, track, city, avoid, r) {
  const S = track.samples;
  const N = S.length;
  const poly = S.map((s) => [s.point.x, s.point.z]);
  const lap = track.totalLength;
  const step = lap / N;
  const low = Q.tier === 'low';
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.35, metalness: 0.55 });
  roofMat.userData.nightDim = 0.3;
  const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.4, metalness: 0.7 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f4e8c, roughness: 0.55 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const cheer = (m) => {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.crowdTime = crowdClock;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float crowdTime;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nfloat ph = float(gl_InstanceID) * 2.399;\n' +
            'transformed.y += max(0.0, sin(crowdTime * (4.0 + mod(ph, 3.0)) + ph)) * 0.09;'
        );
    };
  };
  cheer(clothMat);
  cheer(skinMat);
  const torso = new THREE.CapsuleGeometry(0.19, 0.4, 2, 6);
  const head = new THREE.SphereGeometry(0.14, 7, 5);
  const seatGeo = new THREE.BoxGeometry(0.48, 0.4, 0.42);
  const shirts = [0xff8000, 0xd40000, 0x111111, 0xf2f2f2, 0x1e3a8a, 0xffd400, 0x0b6e4f, 0xff8000, 0xd40000, city.accentHex, city.secondaryHex, 0x6b7280];
  const skins = [0x8d5524, 0xc68642, 0xa0662f, 0x6b4423, 0xe0ac69, 0x7a4a2a, 0xf1c27d];

  const outsideSide = (s) => {
    const p = s.point.clone().addScaledVector(s.right, 22);
    return pointInPolygon(poly, p.x, p.z) ? -1 : 1;
  };
  const straightAt = (i, half) => {
    for (let k = -half; k <= half; k++) {
      const q = S[(i + k + N) % N];
      if (q.curvature > 0.1 || q.point.y > 0.6) return false;
    }
    return true;
  };

  // candidate spots: the start straight first, then the longest other straights
  const spots = [];
  const want = low ? 2 : 4;
  const tryAdd = (i, len) => {
    const half = Math.ceil(len / 2 / step);
    if (!straightAt(i, half)) return false;
    const s = S[i];
    const side = outsideSide(s);
    const depth = (low ? 9 : 14) * 1.05 + 2;
    const off = 14.2 + depth / 2;
    const cx = s.point.x + s.right.x * side * off;
    const cz = s.point.z + s.right.z * side * off;
    if (spots.some((p) => Math.hypot(p.cx - cx, p.cz - cz) < len)) return false;
    if (blocked(avoid, cx, cz, len * 0.3)) return false;
    // the far edge must not reach another part of the track
    for (const q of S) if (Math.hypot(q.point.x - cx, q.point.z - cz) < off - 1) return false;
    spots.push({ i, len, side, cx, cz, depth });
    return true;
  };
  tryAdd(Math.round(0.04 * N), 48) || tryAdd(Math.round(0.07 * N), 44);
  const order = [...Array(N).keys()].sort(() => r() - 0.5);
  for (const i of order) {
    if (spots.length >= want) break;
    tryAdd(i, 36 + Math.round(r() * 10));
  }

  const footprints = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  spots.forEach((spot, si) => {
    const s = S[spot.i];
    const rows = low ? 9 : si === 0 ? 16 : 13;
    const rise = 0.62;
    const run = 1.05;
    const g = new THREE.Group();
    const front = s.point.clone().addScaledVector(s.right, spot.side * 14.2);
    g.position.set(front.x, 0, front.z);
    // local axes: +X along the track, +Z away from it
    const zAxis = s.right.clone().multiplyScalar(spot.side).setY(0).normalize();
    const xAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), zAxis).normalize();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, new THREE.Vector3(0, 1, 0), zAxis));

    // stepped concrete terraces: one extruded stair profile
    const prof = new THREE.Shape();
    prof.moveTo(0, 0);
    for (let k = 0; k < rows; k++) {
      prof.lineTo(k * run, (k + 1) * rise + 0.4);
      prof.lineTo((k + 1) * run, (k + 1) * rise + 0.4);
    }
    prof.lineTo(rows * run, 0);
    prof.closePath();
    const tg = new THREE.ExtrudeGeometry(prof, { depth: spot.len, bevelEnabled: false });
    tg.rotateY(-Math.PI / 2); // profile (z, y), extrude along x
    tg.translate(spot.len / 2, 0, 0);
    const terraces = new THREE.Mesh(tg, concrete);
    terraces.castShadow = !low;
    terraces.receiveShadow = true;
    g.add(terraces);

    // front railing and side walls
    const rail = new THREE.Mesh(new THREE.BoxGeometry(spot.len, 0.08, 0.08), railMat);
    rail.position.set(0, 1.55, 0.1);
    g.add(rail);
    for (const sx of [-spot.len / 2, spot.len / 2]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, rows * rise + 1.6, rows * run), concrete);
      wall.position.set(sx, (rows * rise + 1.6) / 2, (rows * run) / 2);
      wall.castShadow = !low;
      g.add(wall);
    }
    if (si === 0 || r() < 0.5) {
      const roofY = rows * rise + 4.6;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(spot.len + 1, 0.3, rows * run + 2), roofMat);
      roof.position.set(0, roofY, (rows * run) / 2 - 0.6);
      roof.rotation.x = -0.06;
      roof.castShadow = !low;
      g.add(roof);
      for (let x = -spot.len / 2; x <= spot.len / 2 + 0.1; x += spot.len / 4) {
        const colm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, roofY, 8), railMat);
        colm.position.set(x, roofY / 2, rows * run + 0.4);
        g.add(colm);
      }
    }

    // the crowd
    const cols = Math.floor(spot.len / 0.6) - 1;
    const maxP = rows * cols;
    const seats = new THREE.InstancedMesh(seatGeo, seatMat, maxP);
    const people = new THREE.InstancedMesh(torso, clothMat, maxP);
    const heads = new THREE.InstancedMesh(head, skinMat, maxP);
    let ns = 0;
    let np = 0;
    const fill = si === 0 ? 0.96 : 0.9;
    for (let k = 0; k < rows; k++) {
      for (let j = 0; j < cols; j++) {
        const x = -spot.len / 2 + 0.6 + j * 0.6;
        const y = (k + 1) * rise + 0.4;
        const z = k * run + run * 0.55;
        dummy.position.set(x, y + 0.2, z + 0.15);
        dummy.rotation.set(0, Math.PI, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        seats.setMatrixAt(ns++, dummy.matrix);
        if (r() > fill) continue;
        const standing = r() < 0.35;
        dummy.position.set(x + (r() - 0.5) * 0.1, y + (standing ? 1.0 : 0.78), z + (standing ? -0.15 : 0.05));
        dummy.rotation.set((r() - 0.5) * 0.15, Math.PI + (r() - 0.5) * 0.5, (r() - 0.5) * 0.2);
        dummy.scale.set(1, standing ? 1.15 : 0.95, 0.85);
        dummy.updateMatrix();
        people.setMatrixAt(np, dummy.matrix);
        col.setHex(shirts[(r() * shirts.length) | 0]);
        people.setColorAt(np, col);
        dummy.position.y += standing ? 0.62 : 0.54;
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        heads.setMatrixAt(np, dummy.matrix);
        col.setHex(skins[(r() * skins.length) | 0]);
        heads.setColorAt(np, col);
        np++;
      }
    }
    seats.count = ns;
    people.count = heads.count = np;
    people.castShadow = !low;
    for (const m of [seats, people, heads]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
    g.add(seats, people, heads);
    group.add(g);
    footprints.push({ x: spot.cx, z: spot.cz, r: spot.len * 0.55 });
  });
  return footprints;
}
