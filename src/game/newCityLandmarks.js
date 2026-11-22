import * as THREE from 'three';
import { addWaterBasin, addTowerSkyscraper } from './cityLandmarks.js';

/**
 * Landmarks for Warangal, Kochi, Goa, Pune, Ahmedabad and Srinagar.
 * Same three slots as the original cities: infield-right (44,12),
 * centre with water (-5,11) and north-east skyline (78,-52).
 */
export function buildNewCityLandmarks(city, group, animTargets, addCol) {
  const { waterMeshes, rotatingBeacons } = animTargets;
  switch (city.id) {
    case 'warangal':
      buildKalaThoranam(group, 44, 12);
      addCol(44, 12, 13);
      buildThousandPillarTemple(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildWarangalFort(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'kochi':
      buildStFrancisChurch(group, 44, 12);
      addCol(44, 12, 13);
      buildChineseFishingNets(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildKochiPortSkyline(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'goa':
      buildBomJesus(group, 44, 12);
      addCol(44, 12, 13);
      buildGoaBeach(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildFortAguada(group, rotatingBeacons, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'pune':
      buildShaniwarWada(group, 44, 12);
      addCol(44, 12, 14);
      buildAgaKhanPalace(group, waterMeshes, -5, 11);
      addCol(-5, 11, 16);
      buildPuneSkyline(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'ahmedabad':
      buildSidiSaiyyedMosque(group, 44, 12);
      addCol(44, 12, 12);
      buildSabarmatiRiverfront(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildModiStadium(group, 78, -52);
      addCol(78, -52, 18);
      return true;
    case 'srinagar':
      buildHazratbal(group, 44, 12);
      addCol(44, 12, 13);
      buildDalLake(group, waterMeshes, -5, 11);
      addCol(-5, 11, 18);
      buildShankaracharyaHill(group, 78, -52);
      addCol(78, -52, 18);
      return true;
    default:
      return false;
  }
}

/* ---------------- shared helpers ---------------- */
const mat = (color, roughness = 0.8, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

function box(parent, w, h, d, m, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(parent, rt, rb, h, m, x, y, z, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function lawn(parent, radius, color = 0x4f7a35) {
  const l = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.4, 0.3, 40), mat(color, 0.95));
  l.position.y = 0.15;
  l.receiveShadow = true;
  parent.add(l);
  return l;
}

/** Gable roof prism along local Z. */
function gableRoof(parent, w, h, len, m, x, y, z, ry = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Arched opening silhouette (dark recess) on a facade facing +Z. */
function archRecess(parent, w, h, m, x, y, z) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  s.lineTo(w / 2, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function coconutPalm(parent, x, z, h = 9, lean = 0.25, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * h * 0.2, h * 0.4, 0),
    new THREE.Vector3(lean * h * 0.55, h * 0.8, 0),
    new THREE.Vector3(lean * h * 0.7, h, 0),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.22, 7, false), mat(0x7a6247, 0.95));
  trunk.castShadow = true;
  g.add(trunk);
  const top = curve.getPoint(1);
  const frondMat = mat(0x3d7a2a, 0.85, 0, { side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 4.2, 1, 4), frondMat);
    const pos = frond.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const yy = pos.getY(v) + 2.1; // 0..4.2 along the frond
      pos.setZ(v, -0.06 * yy * yy); // droop
      pos.setX(v, pos.getX(v) * (1 - yy / 5));
    }
    frond.geometry.translate(0, 2.1, 0);
    frond.geometry.computeVertexNormals();
    frond.position.copy(top);
    frond.rotation.order = 'YXZ';
    frond.rotation.y = (i / 9) * Math.PI * 2;
    frond.rotation.x = -1.0;
    frond.castShadow = true;
    g.add(frond);
  }
  for (let i = 0; i < 4; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat(0x5c4a1e, 0.8));
    nut.position.set(top.x + Math.cos(i * 1.6) * 0.3, top.y - 0.3, Math.sin(i * 1.6) * 0.3);
    g.add(nut);
  }
  parent.add(g);
  return g;
}

/* ==================== WARANGAL ==================== */
function buildKalaThoranam(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  lawn(g, 13, 0x6b7a3c);
  const granite = mat(0xb4a28c, 0.88);
  const dark = mat(0x8f7f6c, 0.9);

  // Ruins of the Swayambhu temple plinth in the middle
  box(g, 7, 0.8, 7, dark, 0, 0.55, 0);
  box(g, 5, 0.7, 5, granite, 0, 1.3, 0);
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7;
    box(g, 0.9 + (i % 3) * 0.3, 0.6, 0.7, granite, Math.cos(a) * 2.8, 1.95, Math.sin(a) * 2.8, a);
  }

  // Four ornate Kakatiya thoranams facing the centre
  for (let k = 0; k < 4; k++) {
    const t = new THREE.Group();
    const ang = (k * Math.PI) / 2;
    t.position.set(Math.sin(ang) * 9, 0.3, Math.cos(ang) * 9);
    t.rotation.y = ang;
    for (const px of [-2.6, 2.6]) {
      box(t, 1.15, 0.6, 1.15, dark, px, 0.3, 0);
      box(t, 0.95, 7.2, 0.95, granite, px, 4.2, 0);
      for (let b = 1.6; b < 7.6; b += 1.2) box(t, 1.1, 0.22, 1.1, dark, px, b, 0); // carved bands
      box(t, 1.25, 0.5, 1.25, dark, px, 7.9, 0);
      // swan brackets reaching inward
      const br = box(t, 1.5, 0.35, 0.6, granite, px * 0.72, 7.55, 0);
      br.rotation.z = px > 0 ? 0.5 : -0.5;
    }
    box(t, 7.4, 0.8, 1.2, granite, 0, 8.55, 0); // lintel
    box(t, 6.2, 0.45, 1.0, dark, 0, 9.15, 0);
    // carved arch crest with makara ends and finial
    const crest = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.32, 8, 20, Math.PI), granite);
    crest.position.set(0, 9.35, 0);
    crest.castShadow = true;
    t.add(crest);
    for (const sx of [-2.7, 2.7]) {
      const mk = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), dark);
      mk.position.set(sx, 9.55, 0);
      mk.scale.set(1.4, 0.8, 0.8);
      t.add(mk);
    }
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), dark);
    fin.position.set(0, 12.2, 0);
    t.add(fin);
    g.add(t);
  }
  group.add(g);
}

function buildThousandPillarTemple(group, waterMeshes, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  lawn(g, 16, 0x5f6e37);
  const stone = mat(0x9c8f80, 0.85);
  const basalt = mat(0x3a3836, 0.6);

  // Star-shaped plinth (24-point base)
  const star = new THREE.Shape();
  for (let i = 0; i <= 24; i++) {
    const r = i % 2 === 0 ? 9.5 : 8.2;
    const a = (i / 24) * Math.PI * 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const plinthGeo = new THREE.ExtrudeGeometry(star, { depth: 1.2, bevelEnabled: false });
  plinthGeo.rotateX(-Math.PI / 2);
  const plinth = new THREE.Mesh(plinthGeo, stone);
  plinth.position.y = 0.3;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  g.add(plinth);

  // Pillared mandapa (dense grid of carved pillars) with flat stone roof
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      if (Math.abs(i) + Math.abs(j) > 5) continue;
      const p = cyl(g, 0.24, 0.3, 3.6, stone, i * 1.6, 3.3, j * 1.6, 8);
      p.castShadow = false;
    }
  }
  box(g, 11.5, 0.7, 11.5, stone, 0, 5.4, 0, Math.PI / 4);
  box(g, 9.5, 0.4, 9.5, basalt, 0, 5.95, 0, Math.PI / 4);

  // Three shrines (trikutalayam) with stepped pyramidal vimanas
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const sx = Math.cos(a) * 7;
    const sz = Math.sin(a) * 7;
    box(g, 3.6, 3.6, 3.6, stone, sx, 3.3, sz, a);
    for (let s = 0; s < 4; s++) box(g, 3.4 - s * 0.75, 0.75, 3.4 - s * 0.75, s % 2 ? basalt : stone, sx, 5.5 + s * 0.75, sz, a);
    const kal = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat(0xc9a227, 0.35, 0.7));
    kal.position.set(sx, 8.7, sz);
    g.add(kal);
  }

  // Polished black basalt Nandi facing the shrine
  const nandi = new THREE.Group();
  nandi.position.set(0, 1.5, 11.5);
  box(nandi, 1.4, 1.2, 2.6, basalt, 0, 0.6, 0);
  box(nandi, 0.9, 0.9, 1.0, basalt, 0, 1.25, 1.4);
  box(nandi, 1.8, 0.4, 3.0, stone, 0, -0.2, 0);
  g.add(nandi);

  group.add(g);
  // Bhadrakali-style lotus tank beside the temple
  addWaterBasin(group, waterMeshes, x - 12, z - 2, 4.2, 0x2f6b5e, 0x0a2e28, 0x9c8f80);
}

function buildWarangalFort(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const granite = mat(0x8e8478, 0.9);
  const wallMat = mat(0xa08a70, 0.88);

  // Ekashila: a heap of rounded granite boulders
  const rnd = (() => {
    let s = 77;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  })();
  for (let i = 0; i < 16; i++) {
    const r = 2 + rnd() * 3.2;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), granite);
    const a = rnd() * Math.PI * 2;
    const d = i < 5 ? rnd() * 2 : 2 + rnd() * 5;
    rock.position.set(Math.cos(a) * d, r * 0.7 + (i < 5 ? 5 - i : 0), Math.sin(a) * d);
    rock.scale.set(1, 0.8 + rnd() * 0.4, 1);
    rock.rotation.set(rnd() * 3, rnd() * 3, 0);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
  }

  // Ring of crenellated fort wall with round bastions
  const R = 14;
  const segs = 18;
  for (let i = 0; i < segs; i++) {
    if (i === 4 || i === 5) continue; // gateway gap
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const len = 2 * R * Math.sin(Math.PI / segs);
    const wx = Math.cos(am) * R;
    const wz = Math.sin(am) * R;
    box(g, len + 0.2, 4.2, 1.6, wallMat, wx, 2.1, wz, -am + Math.PI / 2);
    for (let m = -1; m <= 1; m++) {
      const mx = wx + Math.cos(am + Math.PI / 2) * m * (len / 3);
      const mz = wz + Math.sin(am + Math.PI / 2) * m * (len / 3);
      box(g, 0.8, 0.8, 1.6, wallMat, mx, 4.6, mz, -am + Math.PI / 2);
    }
    if (i % 3 === 0) cyl(g, 1.8, 2.1, 5.4, wallMat, Math.cos(a0) * R, 2.7, Math.sin(a0) * R, 14);
  }
  group.add(g);
}

/* ==================== KOCHI ==================== */
function buildStFrancisChurch(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.3;
  lawn(g, 13, 0x3f7a2c);
  const plaster = mat(0xf2efe6, 0.75);
  const tile = mat(0x9a3b25, 0.7);
  const dark = mat(0x2b2a28, 0.9);

  box(g, 8, 6.5, 16, plaster, 0, 3.55, -2);
  gableRoof(g, 9, 3, 16.6, tile, 0, 6.8, -2);

  // Stepped Dutch-style facade gable
  const s = new THREE.Shape();
  const steps = [[-4.4, 0], [-4.4, 7], [-3.4, 7], [-3.4, 8.4], [-2.2, 8.4], [-2.2, 9.8], [-1, 9.8], [-1, 11.2], [1, 11.2], [1, 9.8], [2.2, 9.8], [2.2, 8.4], [3.4, 8.4], [3.4, 7], [4.4, 7], [4.4, 0]];
  steps.forEach(([px, py], i) => (i === 0 ? s.moveTo(px, py) : s.lineTo(px, py)));
  s.closePath();
  const facade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false }), plaster);
  facade.position.set(0, 0.3, 6);
  facade.castShadow = true;
  g.add(facade);
  archRecess(g, 2.2, 3.8, dark, 0, 0.3, 6.82);
  archRecess(g, 1.0, 1.8, dark, -2.4, 3.8, 6.82);
  archRecess(g, 1.0, 1.8, dark, 2.4, 3.8, 6.82);
  archRecess(g, 0.9, 1.4, dark, 0, 7.6, 6.82);
  // small bell gable on top
  box(g, 1.4, 1.3, 0.8, plaster, 0, 12.1, 6.4);
  const cross = new THREE.Group();
  box(cross, 0.18, 1.2, 0.18, dark, 0, 0, 0);
  box(cross, 0.7, 0.18, 0.18, dark, 0, 0.2, 0);
  cross.position.set(0, 13.4, 6.4);
  g.add(cross);

  coconutPalm(g, -8, 6, 9, 0.3, 0.4);
  coconutPalm(g, 8.5, 3, 10, 0.25, 2.6);
  coconutPalm(g, 7, -9, 8.5, 0.35, 4.0);
  group.add(g);
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(40,36,30,0.9)';
  g.lineWidth = 1.2;
  for (let i = 0; i <= 128; i += 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

function buildChineseFishingNets(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 13, 0x2f5d5a, 0x0b2a28, 0x8a8170);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const wood = mat(0x5b4632, 0.85);
  const rope = mat(0x3a3328, 0.9);
  const netMat = new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 1 });

  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const n = new THREE.Group();
    n.position.set(Math.cos(a) * 12.5, 0, Math.sin(a) * 12.5);
    n.rotation.y = -a + Math.PI / 2; // local +Z points into the water
    n.rotation.y += Math.PI;
    // wooden platform on the bank
    box(n, 3, 0.4, 3, wood, 0, 0.9, 1.5);
    // main cantilever boom tilted out over the water
    const boom = new THREE.Group();
    boom.position.set(0, 1.6, 0);
    boom.rotation.x = -0.62;
    const pole = cyl(boom, 0.16, 0.24, 15, wood, 0, 0, -7.5, 8);
    pole.rotation.x = Math.PI / 2;
    // square frame of bent poles at the tip, net hanging below
    const tip = new THREE.Group();
    tip.position.set(0, 0, -14.5);
    tip.rotation.x = 0.62;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const arm = cyl(tip, 0.07, 0.09, 6, wood, sx * 2, 0, sz * 2, 6);
      arm.rotation.z = sx * 0.75;
      arm.rotation.x = -sz * 0.75;
    }
    const net = new THREE.Mesh(new THREE.PlaneGeometry(7, 7, 6, 6), netMat);
    const pos = net.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const dx = pos.getX(v);
      const dy = pos.getY(v);
      pos.setZ(v, -1.6 * (1 - (dx * dx + dy * dy) / 24.5)); // sagging belly
    }
    net.rotation.x = Math.PI / 2;
    net.position.y = -2.2;
    tip.add(net);
    boom.add(tip);
    n.add(boom);
    // counterweight ropes with hanging stones behind the pivot
    for (let r = 0; r < 4; r++) {
      const ry = cyl(n, 0.03, 0.03, 3.2, rope, -0.6 + r * 0.4, 2.2, 3.2 + r * 0.3, 4);
      ry.castShadow = false;
      const stoneW = new THREE.Mesh(new THREE.SphereGeometry(0.35, 7, 5), mat(0x7d7466, 0.9));
      stoneW.position.set(-0.6 + r * 0.4, 0.8, 3.2 + r * 0.3);
      n.add(stoneW);
    }
    g.add(n);
  }
  coconutPalm(g, -14, 6, 9.5, 0.35, 1.2);
  coconutPalm(g, 13, -7, 9, 0.3, 3.4);
  group.add(g);
}

function buildKochiPortSkyline(group, x, z) {
  addTowerSkyscraper(group, { x: x - 6, z: z + 2, w: 8, h: 34, d: 8, color: 0x2b5876, spire: true });
  addTowerSkyscraper(group, { x: x + 5, z: z - 4, w: 9, h: 26, d: 9, color: 0x3a6073 });
  const g = new THREE.Group();
  g.position.set(x + 8, 0, z + 8);
  const red = mat(0xc0392b, 0.5, 0.5);
  const white = mat(0xecf0f1, 0.5, 0.4);
  // ship-to-shore container crane (Vallarpadam terminal)
  for (const [lx, lz] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) box(g, 0.6, 14, 0.6, (lx + lz) % 2 ? red : white, lx, 7, lz);
  box(g, 7, 1, 6, red, 0, 14.2, 0);
  box(g, 1.2, 1.2, 22, white, 0, 15.2, -5);
  box(g, 1.6, 1.4, 1.6, mat(0x34495e, 0.4, 0.3), 0, 13.6, -12);
  // container stacks
  const cc = [0x1f6fb2, 0xc0392b, 0x27ae60, 0xf39c12, 0x7f8c8d];
  for (let i = 0; i < 12; i++) box(g, 2.4, 1.1, 1.1, mat(cc[i % cc.length], 0.7, 0.3), -6 + (i % 4) * 2.6, 0.55 + Math.floor(i / 8) * 1.1, 6 + (Math.floor(i / 4) % 2) * 1.2);
  group.add(g);
}

/* ==================== GOA ==================== */
function buildBomJesus(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.25;
  lawn(g, 13, 0x4f7a35);
  const laterite = mat(0x9a4f2c, 0.92);
  const basalt = mat(0xcdbfa8, 0.75);
  const dark = mat(0x241c18, 0.9);

  // Long laterite nave behind the facade
  box(g, 9, 8, 22, laterite, 0, 4.3, -10);
  gableRoof(g, 10, 3, 22.5, mat(0x7a3a20, 0.75), 0, 8.3, -10);
  // Three-tier baroque facade
  box(g, 16, 6, 1.4, laterite, 0, 3.3, 1.2);
  box(g, 13, 4.5, 1.3, laterite, 0, 8.55, 1.2);
  box(g, 8.5, 3.6, 1.2, laterite, 0, 12.6, 1.2);
  const ped = new THREE.Shape();
  ped.moveTo(-4.5, 0);
  ped.lineTo(4.5, 0);
  ped.lineTo(0, 3);
  ped.closePath();
  const pedM = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: 1.1, bevelEnabled: false }), laterite);
  pedM.position.set(0, 14.4, 0.6);
  g.add(pedM);
  // basalt cornices and pilasters
  for (const [w, y] of [[16.6, 6.35], [13.6, 10.85], [9, 14.45]]) box(g, w, 0.35, 1.7, basalt, 0, y, 1.3);
  for (const px of [-7.6, -4.2, 4.2, 7.6]) box(g, 0.55, 6, 1.6, basalt, px, 3.3, 1.35);
  for (const px of [-6, -2.5, 2.5, 6]) box(g, 0.45, 4.4, 1.5, basalt, px, 8.55, 1.35);
  // doors and windows
  archRecess(g, 2.4, 4.2, dark, 0, 0.3, 1.96);
  for (const px of [-5.8, 5.8]) archRecess(g, 1.6, 3.2, dark, px, 0.3, 1.96);
  for (const px of [-4.2, 0, 4.2]) archRecess(g, 1.3, 2.4, dark, px, 7.1, 1.9);
  for (const px of [-2.2, 2.2]) archRecess(g, 1.0, 1.8, dark, px, 11.2, 1.85);
  // IHS emblem medallion
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 20), basalt);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(0, 13.2, 1.95);
  g.add(disc);
  // bell tower at the back
  box(g, 3, 13, 3, laterite, 5.8, 6.8, -19);
  box(g, 3.4, 0.5, 3.4, basalt, 5.8, 13.5, -19);
  group.add(g);
}

function buildGoaBeach(group, waterMeshes, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(16, 16.5, 0.3, 48), mat(0xe8d3a3, 1));
  sand.position.y = 0.15;
  sand.receiveShadow = true;
  g.add(sand);
  group.add(g);
  addWaterBasin(group, waterMeshes, x - 4, z - 4, 8.5, 0x1aa6b7, 0x07444c, 0xe8d3a3);

  const palms = [[9, 5, 10, 0.3], [11, -3, 9, 0.35], [6, 11, 8.5, 0.25], [-10, 9, 9.5, 0.3], [-13, 1, 10, 0.32], [2, 13, 9, 0.28], [12.5, 8, 8, 0.4]];
  palms.forEach(([px, pz, h, l], i) => coconutPalm(g, px, pz, h, l, i * 1.3));

  // beach shack with thatch roof
  const shack = new THREE.Group();
  shack.position.set(6, 0.3, -9);
  box(shack, 5, 2.6, 3.5, mat(0xb08a5a, 0.9), 0, 1.3, 0);
  const thatch = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.4, 4), mat(0xc9a66b, 1));
  thatch.position.y = 3.8;
  thatch.rotation.y = Math.PI / 4;
  thatch.castShadow = true;
  shack.add(thatch);
  g.add(shack);

  // umbrellas + loungers
  const colors = [0xe74c3c, 0x2980b9, 0xf1c40f, 0x16a085, 0xe84393];
  for (let i = 0; i < 5; i++) {
    const ux = -2 + i * 3.2;
    const uz = 7 - (i % 2) * 2;
    cyl(g, 0.05, 0.05, 2.6, mat(0xdddddd, 0.4, 0.6), ux, 1.6, uz, 6);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 10), mat(colors[i], 0.7, 0, { side: THREE.DoubleSide }));
    canopy.position.set(ux, 3.0, uz);
    canopy.castShadow = true;
    g.add(canopy);
    box(g, 0.7, 0.2, 1.8, mat(0xf5f5f5, 0.6), ux + 0.9, 0.55, uz + 0.3, 0.2);
  }
}

function buildFortAguada(group, rotatingBeacons, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const laterite = mat(0x8f4a2a, 0.92);
  // sloped laterite bastion walls
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(11, 13, 5, 7, 1, true), laterite);
  wall.position.y = 2.5;
  wall.material.side = THREE.DoubleSide;
  wall.castShadow = true;
  g.add(wall);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.6, 7), mat(0x7a3f24, 0.9));
  top.position.y = 5;
  g.add(top);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    for (let m = 0; m < 3; m++) {
      const aa = a + (m - 1) * 0.18;
      box(g, 1, 0.9, 0.9, laterite, Math.cos(aa) * 11, 5.75, Math.sin(aa) * 11, -aa);
    }
  }
  // white 4-storey lighthouse with lantern + rotating beam
  const white = mat(0xf4f4f0, 0.6);
  cyl(g, 1.6, 2.2, 14, white, 0, 12, 0, 18);
  for (const y of [8, 11.5, 15]) cyl(g, 2.1, 2.1, 0.3, mat(0x9a4f2c, 0.8), 0, y, 0, 18);
  cyl(g, 2.3, 2.3, 0.4, mat(0x333333, 0.5, 0.6), 0, 19.2, 0, 18);
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 1.8, 14),
    new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0xffe9a8, emissiveIntensity: 1.4, roughness: 0.2 })
  );
  lantern.position.y = 20.3;
  g.add(lantern);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 14), mat(0x2d2d2d, 0.5, 0.5));
  cap.position.y = 21.8;
  g.add(cap);
  const pivot = new THREE.Group();
  pivot.position.y = 20.3;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  for (const dir of [1, -1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.6, 22, 14, 1, true), beamMat);
    cone.rotation.z = (dir * Math.PI) / 2;
    cone.position.x = dir * 11;
    pivot.add(cone);
  }
  g.add(pivot);
  rotatingBeacons.push(pivot);
  group.add(g);
}

/* ==================== PUNE ==================== */
function buildShaniwarWada(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -Math.PI / 2;
  lawn(g, 14, 0x5f7a3a);
  const stone = mat(0x8a6b4c, 0.9);
  const dark = mat(0x2a211a, 0.9);
  const S = 10;
  // fort walls with crenellations
  for (const [wx, wz, ry] of [[0, -S, 0], [0, S, 0], [-S, 0, Math.PI / 2], [S, 0, Math.PI / 2]]) {
    box(g, 2 * S, 6, 1.4, stone, wx, 3, wz, ry);
    for (let m = -S + 1; m < S; m += 1.6) {
      const mx = ry ? wx : wx + m;
      const mz = ry ? wz + m : wz;
      box(g, 0.8, 0.8, 1.4, stone, mx, 6.4, mz, ry);
    }
  }
  // round bastions on the corners
  for (const [bx, bz] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
    cyl(g, 2.2, 2.5, 8, stone, bx, 4, bz, 14);
    cyl(g, 2.4, 2.4, 0.6, dark, bx, 8.3, bz, 14);
  }
  // Delhi Darwaza: tall gate with huge arched door and anti-elephant spikes
  box(g, 8, 11, 3.2, stone, 0, 5.5, S + 0.6);
  archRecess(g, 3.6, 7.2, dark, 0, 0, S + 2.25);
  const spikeMat = mat(0x6e6e6e, 0.4, 0.8);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 6), spikeMat);
      sp.rotation.x = Math.PI / 2;
      sp.position.set(-0.9 + c * 0.9, 1.5 + r * 1.6, S + 2.6);
      g.add(sp);
    }
  }
  // nagarkhana pavilion on top of the gate
  for (const px of [-2.6, 2.6]) for (const pz of [-0.9, 0.9]) cyl(g, 0.25, 0.25, 2.2, mat(0xd8c3a0, 0.7), px, 12.1, S + 0.6 + pz, 8);
  box(g, 6.4, 0.5, 2.8, mat(0x7a5a3a, 0.8), 0, 13.4, S + 0.6);
  // lotus fountain inside
  cyl(g, 3, 3.2, 0.6, mat(0xbfb6a6, 0.6), 0, 0.6, -2, 24);
  group.add(g);
}

function buildAgaKhanPalace(group, waterMeshes, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  lawn(g, 16, 0x4f7a35);
  const cream = mat(0xf1e3c4, 0.7);
  const trim = mat(0xd8c49c, 0.7);
  const dark = mat(0x3a3128, 0.9);
  const L = 22;
  box(g, L, 9, 8, cream, 0, 4.8, -4);
  // two-level arcade on the front
  for (let lvl = 0; lvl < 2; lvl++) {
    const y = 0.3 + lvl * 4.3;
    for (let i = 0; i < 11; i++) {
      const ax = -L / 2 + 1 + i * 2;
      archRecess(g, 1.3, 3.1, dark, ax, y + 0.3, 0.02);
    }
    box(g, L + 0.4, 0.35, 0.6, trim, 0, y + 4.1, 0.2);
  }
  // central raised pavilion with parapet and dome
  box(g, 7, 3, 8.4, cream, 0, 10.8, -4);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), trim);
  dome.position.set(0, 12.3, -4);
  dome.castShadow = true;
  g.add(dome);
  for (let i = 0; i < 12; i++) box(g, 0.5, 0.7, 0.5, trim, -L / 2 + 1 + i * 1.82, 9.65, 0.1);
  group.add(g);
  addWaterBasin(group, waterMeshes, x, z + 9.5, 3.8, 0x2f6b78, 0x0b2f36, 0xd8c49c);
}

function buildPuneSkyline(group, x, z) {
  addTowerSkyscraper(group, { x: x - 6, z: z - 2, w: 9, h: 38, d: 9, color: 0x264653, spire: true });
  addTowerSkyscraper(group, { x: x + 6, z: z + 3, w: 8, h: 30, d: 8, color: 0x355c7d });
  addTowerSkyscraper(group, { x: x + 2, z: z - 9, w: 7, h: 22, d: 7, color: 0x6c5b7b });
  // Parvati hill with temple
  const hill = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a7d3e, 1));
  hill.position.set(x - 4, -1, z + 10);
  hill.scale.set(1, 0.9, 0.8);
  hill.receiveShadow = true;
  group.add(hill);
  const t = new THREE.Group();
  t.position.set(x - 4, 7, z + 10);
  box(t, 2.4, 2, 2.4, mat(0xe9dcc3, 0.7), 0, 1, 0);
  const sh = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 8), mat(0xd4a017, 0.4, 0.5));
  sh.position.y = 3.2;
  t.add(sh);
  group.add(t);
}

/* ==================== AHMEDABAD ==================== */
function jaliTexture() {
  // Sidi Saiyyed "tree of life" stone lattice: stone branches, open gaps between
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#d8b27a';
  g.lineCap = 'round';
  const branch = (x, y, ang, len, w, depth) => {
    if (depth === 0 || len < 6) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(ang + 0.3) * len * 0.5, y + Math.sin(ang + 0.3) * len * 0.5, x2, y2);
    g.stroke();
    branch(x2, y2, ang - 0.45, len * 0.74, w * 0.7, depth - 1);
    branch(x2, y2, ang + 0.45, len * 0.74, w * 0.7, depth - 1);
    if (depth < 4) {
      // curling fronds
      g.lineWidth = Math.max(1.5, w * 0.5);
      g.beginPath();
      g.arc(x2 + Math.cos(ang) * 6, y2 + Math.sin(ang) * 6, 6, ang, ang + 4.5);
      g.stroke();
    }
  };
  branch(128, 250, -Math.PI / 2, 70, 14, 7);
  branch(128, 200, -Math.PI / 2 - 0.9, 45, 8, 5);
  branch(128, 200, -Math.PI / 2 + 0.9, 45, 8, 5);
  // arch frame
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(5, 256);
  g.lineTo(5, 128);
  g.arc(128, 128, 123, Math.PI, 0);
  g.lineTo(251, 256);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSidiSaiyyedMosque(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.2;
  lawn(g, 12, 0x7d7a4e);
  const sand = mat(0xd2a96a, 0.85);
  const dark = mat(0x2e2418, 0.9);
  box(g, 16, 8, 8, sand, 0, 4.3, 0);
  box(g, 16.6, 0.6, 8.6, mat(0xc29358, 0.8), 0, 8.5, 0);
  // front: five arched openings
  for (let i = -2; i <= 2; i++) archRecess(g, 2.2, 5, dark, i * 3, 0.3, 4.02);
  // back wall: arched windows with stone jali (the famous tree of life in the centre)
  const jaliMat = new THREE.MeshStandardMaterial({ map: jaliTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 });
  for (let i = -2; i <= 2; i++) {
    const w = i === 0 ? 3.4 : 2.2;
    const jali = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 1.05), jaliMat);
    jali.position.set(i * 3, 5.2, -4.06);
    jali.rotation.y = Math.PI;
    g.add(jali);
    archRecess(g, w, w * 1.05, dark, i * 3, 5.2 - (w * 1.05) / 2, -4.2).rotation.y = Math.PI;
  }
  // stub minarets at the front corners
  for (const px of [-8.3, 8.3]) {
    cyl(g, 0.9, 1.1, 10, sand, px, 5, 4.2, 12);
    for (const y of [3, 6.5, 9.6]) cyl(g, 1.2, 1.2, 0.35, mat(0xc29358, 0.8), px, y, 4.2, 12);
  }
  group.add(g);
}

function buildSabarmatiRiverfront(group, waterMeshes, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 10),
    new THREE.MeshPhysicalMaterial({ color: 0x1f4f5a, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.22;
  g.add(water);
  // stepped stone promenades on both banks
  const stoneMat = mat(0xbdb4a2, 0.85);
  for (const side of [-1, 1]) {
    for (let s = 0; s < 3; s++) box(g, 32, 0.35, 1.2, stoneMat, 0, 0.3 + s * 0.35, side * (5.6 + s * 1.2));
    box(g, 32, 0.4, 3, mat(0x9e9688, 0.9), 0, 1.25, side * 9.6);
  }
  // Atal Bridge: steel pipe truss with a wavy, colourful fabric canopy
  const steel = mat(0xb8c0c8, 0.35, 0.85);
  const bridge = new THREE.Group();
  bridge.position.y = 3;
  for (const side of [-1.6, 1.6]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(side, -1.5, -11), new THREE.Vector3(side, 0.6, 0), new THREE.Vector3(side, -1.5, 11)]);
    bridge.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.18, 8, false), steel));
    for (let i = -10; i <= 10; i += 2.5) {
      const p = curve.getPoint((i + 11) / 22);
      const post = cyl(bridge, 0.06, 0.06, 1.6, steel, side, p.y + 0.8, i, 6);
      post.castShadow = false;
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 22), mat(0x8d8d8d, 0.7));
  deck.position.y = -1.3;
  bridge.add(deck);
  const canopyGeo = new THREE.PlaneGeometry(4, 22, 1, 40);
  const pos = canopyGeo.attributes.position;
  const cols = [];
  const palette = [new THREE.Color(0xf97316), new THREE.Color(0x14b8a6), new THREE.Color(0xef4444), new THREE.Color(0xfacc15)];
  for (let v = 0; v < pos.count; v++) {
    const yy = pos.getY(v);
    pos.setZ(v, Math.sin(yy * 0.9) * 0.5 + 2.2);
    const c = palette[Math.floor((yy + 11) / 2.75) % palette.length];
    cols.push(c.r, c.g, c.b);
  }
  canopyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  canopyGeo.computeVertexNormals();
  const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 }));
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.y = 0;
  canopy.castShadow = true;
  bridge.add(canopy);
  g.add(bridge);
  group.add(g);
  waterMeshes.push(water);
}

function buildModiStadium(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.set(1.15, 1, 1);
  const concrete = mat(0xd9d6cf, 0.75);
  // outer facade ring
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.5, 8, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  outer.position.y = 4;
  outer.castShadow = true;
  g.add(outer);
  // seating bowl
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(14.8, 8.5, 7, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x2c5aa0, roughness: 0.8, side: THREE.DoubleSide }));
  bowl.position.y = 4.2;
  g.add(bowl);
  const field = new THREE.Mesh(new THREE.CircleGeometry(8.5, 40), mat(0x3f8f3a, 0.95));
  field.rotation.x = -Math.PI / 2;
  field.position.y = 0.75;
  g.add(field);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.6), mat(0xc8b48a, 1));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.78;
  g.add(pitch);
  // roof canopy ring with LED floodlight band
  const roof = new THREE.Mesh(new THREE.RingGeometry(11.5, 15.6, 48), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, side: THREE.DoubleSide }));
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = 8.3;
  roof.castShadow = true;
  g.add(roof);
  const led = new THREE.Mesh(new THREE.TorusGeometry(11.6, 0.15, 6, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 }));
  led.rotation.x = Math.PI / 2;
  led.position.y = 8.2;
  g.add(led);
  box(g, 4, 1, 1, concrete, 0, 0.5, 15.6);
  group.add(g);
}

/* ==================== SRINAGAR ==================== */
function buildHazratbal(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.15;
  lawn(g, 13, 0x5e8a42);
  const marble = mat(0xf5f4ef, 0.35);
  const dark = mat(0x2a3440, 0.8);
  box(g, 15, 7, 10, marble, 0, 3.8, 0);
  box(g, 15.6, 0.5, 10.6, mat(0xe2e0d8, 0.4), 0, 7.5, 0);
  for (let i = -3; i <= 3; i++) archRecess(g, 1.4, 3.6, dark, i * 2, 0.6, 5.02);
  // drum + white marble dome
  cyl(g, 3.6, 3.8, 2.4, marble, 0, 8.9, 0, 24);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), marble);
  dome.position.y = 10.1;
  dome.scale.set(1, 1.15, 1);
  dome.castShadow = true;
  g.add(dome);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.2, 8), mat(0xd4af37, 0.3, 0.8));
  fin.position.y = 16.2;
  g.add(fin);
  // single tall minaret with balcony
  const mx = 9;
  cyl(g, 0.8, 1.1, 18, marble, mx, 9, -3.5, 14);
  cyl(g, 1.5, 1.5, 0.5, marble, mx, 14.5, -3.5, 14);
  const md = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), marble);
  md.position.set(mx, 18, -3.5);
  g.add(md);
  group.add(g);
}

function houseboat(parent, x, z, ry) {
  const b = new THREE.Group();
  b.position.set(x, 0.25, z);
  b.rotation.y = ry;
  const wood = mat(0x6b4423, 0.75);
  const carved = mat(0x8b5a2b, 0.7);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.3, 11, 12), wood);
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, 1, 0.55);
  hull.position.y = 0.35;
  b.add(hull);
  box(b, 8.5, 2.4, 2.8, carved, -0.5, 1.9, 0);
  for (let i = -3; i <= 3; i++) box(b, 0.6, 0.9, 0.05, mat(0xe9dcc3, 0.6), -0.5 + i * 1.15, 2.1, 1.43);
  gableRoof(b, 3.4, 1.1, 9, mat(0x2e6b4f, 0.6, 0.3), -0.5, 3.1, 0, Math.PI / 2);
  box(b, 2.2, 0.15, 2.6, wood, 4.6, 1.2, 0);
  for (const pz of [-1.1, 1.1]) cyl(b, 0.06, 0.06, 1.6, wood, 5.4, 1.9, pz, 6);
  parent.add(b);
}

function shikara(parent, x, z, ry, color) {
  const s = new THREE.Group();
  s.position.set(x, 0.32, z);
  s.rotation.y = ry;
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat(0x5b3a1e, 0.7));
  hull.scale.set(3.2, 0.35, 0.65);
  s.add(hull);
  for (const [px, pz] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) cyl(s, 0.04, 0.04, 1.3, mat(0x5b3a1e, 0.7), px, 0.7, pz, 5);
  box(s, 2.1, 0.12, 1.1, mat(color, 0.6), 0, 1.4, 0);
  const rower = new THREE.Group();
  rower.position.set(2.2, 0.35, 0);
  box(rower, 0.35, 0.8, 0.35, mat(0x7a6a55, 0.8), 0, 0.4, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xc68642, 0.7));
  head.position.y = 0.95;
  rower.add(head);
  s.add(rower);
  parent.add(s);
}

function buildDalLake(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 15, 0x2c5d6e, 0x0d2a33, 0x7a7466);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  houseboat(g, -6, -7, 0.25);
  houseboat(g, 5, -9, -0.15);
  houseboat(g, 9, 3, 1.4);
  const canopies = [0xc0392b, 0xf39c12, 0x8e44ad, 0x16a085, 0xd35400];
  [[-4, 3, 0.6], [1, 6, -0.4], [-9, 6, 1.2], [3, -1, 2.2], [-1, -3, 0.1]].forEach(([sx, sz, r], i) => shikara(g, sx, sz, r, canopies[i]));
  // wooden jetty (ghat)
  const wood = mat(0x6b4f33, 0.85);
  box(g, 2.2, 0.3, 8, wood, -12, 0.55, 2, 0.4);
  group.add(g);
}

function buildShankaracharyaHill(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const hill = new THREE.Mesh(new THREE.SphereGeometry(17, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x58704a, 1));
  const pos = hill.geometry.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const yy = pos.getY(v);
    pos.setY(v, yy * (1.15 + 0.08 * Math.sin(pos.getX(v) * 0.6) * Math.cos(pos.getZ(v) * 0.5)));
  }
  hill.geometry.computeVertexNormals();
  hill.receiveShadow = true;
  g.add(hill);
  // conifers (deodar) on the slopes
  const pine = mat(0x1f3d2b, 0.9);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39;
    const r = 7 + (i % 5) * 1.9;
    const hgt = Math.sqrt(Math.max(0, 1 - (r / 17) ** 2)) * 19.5;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 7), pine);
    cone.position.set(Math.cos(a) * r, hgt + 1.4, Math.sin(a) * r);
    cone.castShadow = true;
    g.add(cone);
  }
  // stone temple with conical roof on the summit
  const stone = mat(0x8c8176, 0.85);
  const t = new THREE.Group();
  t.position.set(0, 19.2, 0);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.2, 8), stone);
  plinth.position.y = 0.6;
  t.add(plinth);
  box(t, 3, 3, 3, stone, 0, 2.7, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.2, 8), mat(0x6e655c, 0.85));
  roof.position.y = 6.3;
  roof.castShadow = true;
  t.add(roof);
  g.add(t);
  group.add(g);
}
