import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { facadeTextures, getSurfaceGrain } from './realWorld.js';

/** Small modelling kit shared by the World Tour landmarks. */

export const mat = (color, roughness = 0.8, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Weathered stone / concrete with the shared surface grain. */
export function stone(color, roughness = 0.85) {
  const m = mat(color, roughness);
  m.map = getSurfaceGrain();
  m.bumpMap = m.map;
  m.bumpScale = 0.4;
  return m;
}

export function glass(color = 0x9fb8c8, metalness = 0.75, roughness = 0.12) {
  return mat(color, roughness, metalness, { envMapIntensity: 1.4 });
}

export const gold = () => mat(0xd4a017, 0.28, 1.0);

export function finish(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

export function box(parent, w, h, d, m, x, y, z, ry = 0) {
  const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}

export function cyl(parent, rt, rb, h, m, x, y, z, seg = 16) {
  const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function cone(parent, r, h, m, x, y, z, seg = 12) {
  const mesh = finish(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function sphere(parent, r, m, x, y, z, ws = 16, hs = 12) {
  const mesh = finish(new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Thin member between two local points. */
export function strut(parent, a, b, radius, m, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, seg), m));
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

export function lathe(parent, profile, m, y = 0, seg = 24) {
  const mesh = finish(new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), m));
  mesh.position.y = y;
  parent.add(mesh);
  return mesh;
}

export function plaza(parent, radius, color = 0xb9b3a6) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.4, 0.3, 40), stone(color, 0.95));
  p.position.y = 0.15;
  p.receiveShadow = true;
  parent.add(p);
  return p;
}

export function lawn(parent, radius, color = 0x4f7a35) {
  const l = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.4, 0.3, 40), mat(color, 0.95));
  l.position.y = 0.15;
  l.receiveShadow = true;
  parent.add(l);
  return l;
}

/** Gable roof prism along local Z. */
export function gableRoof(parent, w, h, len, m, x, y, z, ry = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  const mesh = finish(new THREE.Mesh(geo, m));
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}

/** Vertical extrusion of a 2D footprint (x, z) to height h. */
export function prism(parent, points, h, m, y = 0) {
  const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = finish(new THREE.Mesh(geo, m));
  mesh.position.y = y;
  parent.add(mesh);
  return mesh;
}

/** Material wearing one of the shared photo-style facades; repeat = tiles across (u) and up (v). */
const facadeCache = new Map();
export function facadeMaterial(style, tint = 0xffffff, ru = 1, rv = 1) {
  // share materials between same-looking blocks so the static merge can batch them
  const q = (v) => (v < 0.2 ? Math.round(v * 1000) / 1000 : Math.max(0.5, Math.round(v * 2) / 2));
  const key = `${style}|${tint}|${q(ru)}|${q(rv)}`;
  const hit = facadeCache.get(key);
  if (hit && !hit.userData.disposed) return hit;
  ru = q(ru);
  rv = q(rv);
  const f = facadeTextures().all[style];
  const map = f.map.clone();
  map.userData = {};
  map.repeat.set(ru, rv);
  map.needsUpdate = true;
  const rough = f.rough.clone();
  rough.userData = {};
  rough.repeat.set(ru, rv);
  rough.needsUpdate = true;
  const bump = f.bump.clone();
  bump.userData = {};
  bump.repeat.set(ru, rv);
  bump.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    map,
    roughnessMap: rough,
    bumpMap: bump,
    bumpScale: style === 'glass' ? 0.25 : 0.38,
    color: tint,
    roughness: 1,
    metalness: style === 'glass' ? 0.68 : 0.04,
    envMapIntensity: style === 'glass' ? 1.65 : 0.72,
  });
  m.addEventListener('dispose', () => {
    m.userData.disposed = true;
    facadeCache.delete(key);
  });
  facadeCache.set(key, m);
  return m;
}

let facadeRoof = null;

/** Building block wearing one of the shared photo-style facades (repeat matched to size). */
export function facadeBlock(parent, style, w, h, d, x, z, tint = 0xffffff, y = 0) {
  const m = facadeMaterial(style, tint, Math.max(0.5, w / 14), Math.max(0.5, h / 14));
  if (!facadeRoof || facadeRoof.userData.disposed) {
    facadeRoof = mat(0x77746e, 0.9);
    facadeRoof.addEventListener('dispose', () => (facadeRoof.userData.disposed = true));
  }
  const roof = facadeRoof;
  const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [m, m, roof, roof, m, m]));
  mesh.position.set(x, y + h / 2, z);
  parent.add(mesh);
  return mesh;
}

/** Bakes several already-positioned geometries into one mesh (keeps animated groups to one draw call). */
export function bake(geos, m) {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const merged = mergeGeometries(flat, false);
  return finish(new THREE.Mesh(merged, m));
}

export function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(s, s, s)
  );
  return geo.applyMatrix4(m);
}

/* ---------------- canvas textures ---------------- */
const texCache = new Map();
function canvasTex(key, w, h, draw, opts = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.shared = true;
  if (opts.repeat) t.repeat.set(...opts.repeat);
  texCache.set(key, t);
  return t;
}

/** Wrought-iron lattice (Eiffel Tower, tower crowns): use with alphaTest. */
export function latticeTexture() {
  return canvasTex('lattice', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 7;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, h);
    g.moveTo(w, 0);
    g.lineTo(0, h);
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
  });
}

export function latticeMaterial(color) {
  const t = latticeTexture();
  return new THREE.MeshStandardMaterial({ color, map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.35 });
}

/** Glossy ceramic tiles (Sydney Opera House shells). */
export function tileTexture() {
  return canvasTex('tiles', 256, 256, (g, w, h) => {
    g.fillStyle = '#f2efe6';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
        const v = 235 + Math.random() * 18;
        g.fillStyle = Math.random() < 0.3 ? `rgb(${v - 18},${v - 20},${v - 28})` : `rgb(${v},${v},${v - 6})`;
        g.fillRect(x + 1, y + 1, 14, 14);
      }
    }
  });
}

/** Porcelain mosaic (Wat Arun). */
export function mosaicTexture() {
  return canvasTex('mosaic', 256, 256, (g, w, h) => {
    g.fillStyle = '#e9e3d6';
    g.fillRect(0, 0, w, h);
    const cols = ['#c0392b', '#2e86c1', '#f4d03f', '#27ae60', '#ffffff', '#e67e22', '#8e44ad'];
    for (let i = 0; i < 900; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.beginPath();
      g.arc(x, y, 1.5 + Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(120,100,80,0.35)';
    for (let y = 0; y < h; y += 22) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
}

/** Text atlas: one cell per sign (neon boards, word marks). Returns { tex, uv(i) }. */
export function signAtlas(key, entries, cols = 4, cellW = 256, cellH = 128) {
  const rows = Math.ceil(entries.length / cols);
  const tex = canvasTex(key, cols * cellW, rows * cellH, (g) => {
    entries.forEach((e, i) => {
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * cellH;
      g.fillStyle = e.bg || '#111';
      g.fillRect(x, y, cellW, cellH);
      g.strokeStyle = e.fg;
      g.lineWidth = 6;
      g.strokeRect(x + 6, y + 6, cellW - 12, cellH - 12);
      g.fillStyle = e.fg;
      g.font = `900 ${e.size || 64}px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Noto Sans Thai", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(e.text, x + cellW / 2, y + cellH / 2 + 4, cellW - 20);
    });
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return {
    tex,
    rect: (i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      return [c / cols, 1 - (r + 1) / rows, (c + 1) / cols, 1 - r / rows];
    },
  };
}

/** Plane whose UVs are remapped to an atlas rect, so many signs share one material. */
export function atlasPlane(w, h, rect) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
  }
  return g;
}

/** Simple boat hull + cabin (river cruisers, ferries). */
export function boat(parent, x, z, ry, { len = 7, w = 2.4, hull = 0xf8fafc, cabin = 0x1e3a5f, decks = 1 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0.3, z);
  g.rotation.y = ry;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -len / 2);
  shape.lineTo(w / 2, -len / 2);
  shape.lineTo(w / 2, len / 2 - 1.2);
  shape.quadraticCurveTo(0, len / 2 + 0.6, -w / 2, len / 2 - 1.2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  g.add(finish(new THREE.Mesh(geo, mat(hull, 0.5))));
  for (let k = 0; k < decks; k++) box(g, w * 0.8, 0.9, len * 0.6, mat(k ? 0xf1f5f9 : cabin, 0.4, 0.2), 0, 1.35 + k * 0.95, -0.3);
  parent.add(g);
  return g;
}

/** Slowly turning group for rotatingBeacons; spin in rad/s. */
export function spinner(spin) {
  const g = new THREE.Group();
  g.userData.spin = spin;
  return g;
}

/** Lighthouse beam that sweeps (added to rotatingBeacons by the caller). */
export function beaconBeam(color = 0xfff3c4, len = 18) {
  const pivot = spinner(1.0);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, len, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.x = len / 2;
  pivot.add(beam);
  return pivot;
}
