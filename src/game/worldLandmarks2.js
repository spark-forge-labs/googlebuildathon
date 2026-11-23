import * as THREE from 'three';
import { buildVegasLandmarks } from './vegasLandmarks.js';
import { addWaterBasin, addTowerSkyscraper } from './cityLandmarks.js';
import {
  mat, stone, glass, gold, finish, box, cyl, cone, sphere, strut, lathe, plaza, lawn, gableRoof, prism,
  facadeBlock, facadeMaterial, latticeMaterial, tileTexture, mosaicTexture, signAtlas, atlasPlane, bake, boat,
} from './worldKit.js';

/** Toronto, Sydney, Shanghai, Hong Kong and Bangkok (same three slots as every circuit). */
export function buildWorldLandmarks2(city, group, animTargets, addCol) {
  const { waterMeshes } = animTargets;
  switch (city.id) {
    case 'toronto':
      buildCNTower(group, 44, 12);
      addCol(44, 12, 13);
      buildNathanPhillips(group, waterMeshes, -5, 11);
      addCol(-5, 11, 16);
      buildTorontoSkyline(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'sydney':
      buildSydneyTower(group, 44, 12);
      addCol(44, 12, 11);
      buildOperaHouse(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildSydneySkyline(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'shanghai':
      buildOrientalPearl(group, 44, 12);
      addCol(44, 12, 12);
      buildYuGarden(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildLujiazui(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'hongkong':
      buildNathanRoad(group, 44, 12);
      addCol(44, 12, 13);
      buildVictoriaHarbour(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildCentralTowers(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'bangkok':
      buildGrandPalace(group, 44, 12);
      addCol(44, 12, 13);
      buildWatArun(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildMahanakhon(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'lasvegas':
      return buildVegasLandmarks(group, animTargets, addCol);
    default:
      return false;
  }
}

/* ============================ TORONTO ============================ */
function buildCNTower(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 13, 0xa39e94);
  const concrete = stone(0xcfcac0, 0.8);
  const t = new THREE.Group();
  t.position.set(-4, 0.3, -1);
  // Y-shaped legs merging into the hexagonal shaft
  const legs = finish(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 4.2, 40, 3), concrete));
  legs.position.y = 20;
  t.add(legs);
  cyl(t, 1.3, 2.2, 52, concrete, 0, 26, 0, 6);
  // main pod
  cyl(t, 2.4, 4.4, 1.6, concrete, 0, 39.5, 0, 24);
  cyl(t, 4.5, 4.5, 2.2, glass(0x56708a, 0.6, 0.12), 0, 41.4, 0, 24);
  cyl(t, 4.6, 3.2, 1.6, concrete, 0, 43.3, 0, 24);
  // SkyPod and antenna mast
  cyl(t, 1.6, 1.6, 1.8, concrete, 0, 52.9, 0, 16);
  cyl(t, 0.5, 0.9, 6, concrete, 0, 56.6, 0, 10);
  cyl(t, 0.18, 0.32, 14, mat(0xe8e8e8, 0.5, 0.3), 0, 66.6, 0, 8);
  sphere(t, 0.25, new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 0, 73.7, 0, 8, 6);
  g.add(t);
  // Rogers Centre dome beside it
  const dome = finish(new THREE.Mesh(new THREE.SphereGeometry(6.5, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xdfe3e8, 0.4, 0.5)));
  dome.scale.y = 0.42;
  dome.position.set(6, 2.4, 4);
  g.add(dome);
  cyl(g, 6.6, 6.9, 2.4, concrete, 6, 1.2, 4, 26);
  for (let k = 0; k < 6; k++) {
    const rib = finish(new THREE.Mesh(new THREE.TorusGeometry(6.55, 0.12, 4, 18, Math.PI), mat(0x9aa3ad, 0.4, 0.6)), false);
    rib.position.set(6, 2.4, 4);
    rib.scale.y = 0.42;
    rib.rotation.y = (k * Math.PI) / 6;
    g.add(rib);
  }
  group.add(g);
}

function buildNathanPhillips(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x + 3, z + 6, 7, 0x4a7d92, 0x0f2c38, 0xc9c3b6); // reflecting pool / winter rink
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 16, 0xb7b1a5);
  const concrete = stone(0xd9d4c9, 0.75);
  // City Hall: two curved towers cradling the saucer-shaped council chamber
  const ch = new THREE.Group();
  ch.position.set(-4, 0.3, -6);
  ch.rotation.y = 0.3;
  const slab = (R, th, a0, a1, h) => {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, R, a0, a1, false);
    sh.absarc(0, 0, R - th, a1, a0, true);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 18 });
    geo.rotateX(-Math.PI / 2);
    return finish(new THREE.Mesh(geo, concrete));
  };
  // the two curved towers face each other, concave sides towards the plaza
  const towerA = slab(9, 1.8, -2.2, -0.9, 22);
  towerA.position.set(1, 0, 9);
  ch.add(towerA);
  const towerB = slab(8, 1.8, 0.9, 2.2, 17);
  towerB.position.set(-1, 0, -8);
  ch.add(towerB);
  box(ch, 10, 3, 6, concrete, 0, 1.5, 0);
  cyl(ch, 1.6, 2, 3, concrete, 0, 4.5, 0, 12);
  const saucer = finish(new THREE.Mesh(new THREE.SphereGeometry(4, 22, 10), concrete));
  saucer.scale.y = 0.35;
  saucer.position.y = 6.4;
  ch.add(saucer);
  g.add(ch);
  // Freedom arches over the pool
  const arches = mat(0xf3f4f6, 0.4, 0.3);
  for (const dz of [-3, 0, 3]) {
    const a = finish(new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.25, 6, 20, Math.PI), arches));
    a.position.set(3, 0.4, 6 + dz);
    g.add(a);
  }
  // the colourful TORONTO sign: letters cut out with alphaTest, front and back
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const ctx = c.getContext('2d');
  const cols = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
  ctx.font = '900 170px system-ui, Arial Black, sans-serif';
  ctx.textBaseline = 'middle';
  'TORONTO'.split('').forEach((ch2, i) => {
    ctx.fillStyle = cols[i];
    ctx.fillText(ch2, 18 + i * 142, 100);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35,
  });
  for (const dz of [0, 0.6]) {
    const sign = finish(new THREE.Mesh(new THREE.PlaneGeometry(16, 3), signMat));
    sign.position.set(5, 1.9, -1.5 + dz);
    sign.rotation.y = 0.2;
    g.add(sign);
  }
  group.add(g);
}

function buildTorontoSkyline(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x99958d);
  facadeBlock(g, 'office', 8, 48, 8, -4, 2, 0xf3f1ec); // First Canadian Place
  facadeBlock(g, 'glass', 7, 36, 7, 8, -6, 0x2b2f36); // TD Centre black towers
  facadeBlock(g, 'glass', 6, 28, 6, -11, -8, 0x2b2f36);
  // Royal Bank Plaza: gold-glass sawtooth towers
  const goldGlass = glass(0xd6a84a, 0.95, 0.12);
  const rb = new THREE.Group();
  rb.position.set(8, 0, 8);
  for (let i = 0; i < 4; i++) box(rb, 2, 22 - i * 0.2, 6, goldGlass, -3 + i * 2, 11, (i % 2) * 0.8);
  g.add(rb);
  group.add(g);
}

/* ============================ SYDNEY ============================ */
function buildSydneyTower(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 11, 0xb0a99b);
  facadeBlock(g, 'office', 14, 6, 10, 0, 0, 0xe7e1d4, 0.3); // Westfield podium
  const goldGlass = glass(0xd9a441, 0.95, 0.15);
  const shaft = mat(0xbfc5cb, 0.4, 0.6);
  cyl(g, 0.9, 1.1, 32, shaft, 0, 22, 0, 12);
  // stay-cable net around the shaft
  const net = latticeMaterial(0xdfe5ea);
  const hyper = finish(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 30, 16, 1, true), net), false);
  hyper.position.y = 21;
  g.add(hyper);
  // the golden turret
  cyl(g, 3.2, 2.6, 1.6, goldGlass, 0, 37.6, 0, 24);
  cyl(g, 3.4, 3.4, 3.4, goldGlass, 0, 40.1, 0, 24);
  cyl(g, 2.8, 3.4, 1.4, goldGlass, 0, 42.5, 0, 24);
  cyl(g, 0.12, 0.35, 9, shaft, 0, 47.6, 0, 8);
  group.add(g);
}

function buildOperaHouse(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 16, 0x1f6a85, 0x082a38, 0x9c9480);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const granite = stone(0xc9a982);
  // Bennelong Point podium
  box(g, 22, 2.4, 13, granite, -1, 1.4, 0);
  box(g, 10, 1, 4, granite, -14, 0.9, 0); // forecourt steps
  const tile = new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  tile.map.repeat.set(3, 3);
  const glassWall = glass(0x3c4a52, 0.5, 0.1);
  const shell = (sx, sz, s, ry, lean) => {
    const geo = new THREE.SphereGeometry(7, 20, 12, -0.55, 1.1, 0, Math.PI / 2);
    const m = finish(new THREE.Mesh(geo, tile));
    m.scale.setScalar(s);
    m.position.set(sx, 2.6, sz);
    m.rotation.set(lean, ry, 0);
    g.add(m);
    return m;
  };
  // two rows of interlocking sails, tallest at the harbour end
  const rows = [
    { z: -2.6, ry: -Math.PI / 2 },
    { z: 3.4, ry: -Math.PI / 2 },
  ];
  rows.forEach((r, ri) => {
    [[5, 1.12], [0.5, 0.95], [-3.6, 0.78]].forEach(([sx, s], i) => {
      shell(sx - ri * 1.2, r.z, s * (ri ? 0.85 : 1), r.ry, -0.15);
      shell(sx - ri * 1.2 - 1.5, r.z, s * 0.82 * (ri ? 0.85 : 1), r.ry + Math.PI, -0.15);
      if (i === 0) box(g, 0.2, 4.5 * s, 4.5 * s, glassWall, sx + 3.4 * s - ri * 1.2, 4.6, r.z);
    });
  });
  boat(g, 10, -10, 0.6, { len: 7, hull: 0x166534, cabin: 0xfef3c7, decks: 2 }); // Manly ferry
  group.add(g);
}

function buildSydneySkyline(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x9c988f);
  // Crown Sydney: white sculpted glass petals
  const crown = finish(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 44, 3, 6), glass(0xe8eef2, 0.6, 0.15)));
  const pos = crown.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const a = (y / 44) * 0.9;
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    pos.setXYZ(i, px * Math.cos(a) - pz * Math.sin(a), y, px * Math.sin(a) + pz * Math.cos(a));
  }
  crown.geometry.computeVertexNormals();
  crown.position.set(-4, 22, 2);
  g.add(crown);
  facadeBlock(g, 'glass', 7, 36, 7, 8, -6, 0x9cb8c8); // Deutsche Bank Place
  const bligh = finish(new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 30, 24), glass(0xb8d0dc, 0.7, 0.1)));
  bligh.scale.x = 1.4;
  bligh.position.set(8, 15, 8);
  g.add(bligh);
  addTowerSkyscraper(g, { x: -11, z: -8, w: 6, h: 22, d: 6, color: 0x334155 });
  group.add(g);
}

/* ============================ SHANGHAI ============================ */
function buildOrientalPearl(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 12, 0xa9a397);
  const concrete = stone(0xd6d2ca, 0.7);
  const pearl = mat(0xc2185b, 0.22, 0.6, { envMapIntensity: 1.5 });
  const silver = mat(0xc9ced4, 0.3, 0.75);
  // three tilted legs to the lower pearl
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    strut(g, new THREE.Vector3(Math.cos(a) * 8, 0.3, Math.sin(a) * 8), new THREE.Vector3(Math.cos(a) * 2.2, 13, Math.sin(a) * 2.2), 0.75, concrete, 10);
  }
  // three vertical columns all the way up
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 3;
    cyl(g, 0.8, 0.9, 40, concrete, Math.cos(a) * 1.6, 20.3, Math.sin(a) * 1.6, 10);
  }
  sphere(g, 4.4, pearl, 0, 14, 0, 26, 18);
  // small pearls between the big ones
  for (let k = 0; k < 5; k++) sphere(g, 0.75, pearl, Math.cos(k * 1.3) * 1.6, 20 + k * 1.6, Math.sin(k * 1.3) * 1.6, 12, 10);
  sphere(g, 3.1, pearl, 0, 32, 0, 24, 16);
  cyl(g, 0.9, 1.1, 6, concrete, 0, 37.5, 0, 12);
  sphere(g, 1.4, pearl, 0, 41.5, 0, 16, 12);
  cyl(g, 0.2, 0.5, 12, silver, 0, 48.5, 0, 8);
  group.add(g);
}

/** Chinese hip roof with upswept eaves. */
function upturnedRoof(parent, w, d, h, m, y) {
  const geo = new THREE.CylinderGeometry(0.15, 1, h, 4, 3, false, Math.PI / 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const yy = pos.getY(i) / h + 0.5; // 0 bottom .. 1 top
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const corner = Math.abs(px) > 0.5 && Math.abs(pz) > 0.5 ? 1 : 0;
    const sag = Math.sin(yy * Math.PI) * 0.12; // concave slope
    pos.setXYZ(i, px * (1 - sag), pos.getY(i) + corner * (1 - yy) * h * 0.55, pz * (1 - sag));
  }
  geo.computeVertexNormals();
  const mesh = finish(new THREE.Mesh(geo, m));
  mesh.scale.set(w * 0.72, 1, d * 0.72);
  mesh.position.y = y + h / 2;
  parent.add(mesh);
  return mesh;
}

function buildYuGarden(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 15.5, 0x3d6b5e, 0x0f2a24, 0x8c8478);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const wood = mat(0x8b2c1e, 0.7);
  const roof = mat(0x3a3b3e, 0.6, 0.2);
  const stoneM = stone(0xb8b0a0);
  // Huxinting teahouse on its island platform
  const t = new THREE.Group();
  t.position.set(2, 0, -1);
  t.scale.setScalar(1.35);
  box(t, 9, 1.2, 8, stoneM, 0, 0.6, 0);
  box(t, 6.5, 3.2, 5.5, wood, 0, 2.8, 0);
  for (const sx of [-3.4, 3.4]) for (const sz of [-2.9, 2.9]) cyl(t, 0.2, 0.2, 3.2, wood, sx, 2.8, sz, 8);
  upturnedRoof(t, 10, 9, 2.2, roof, 4.4);
  box(t, 4.6, 2.4, 4, wood, 0, 7.4, 0);
  upturnedRoof(t, 7.5, 6.8, 2, roof, 8.6);
  cone(t, 0.25, 1, gold(), 0, 11.1, 0, 8);
  g.add(t);
  // Nine-Turn zigzag bridge to the shore
  const pts = [[-14, 5], [-11, 2.5], [-8.5, 4.5], [-6, 2], [-3.5, 3.8], [-1.5, 2.5]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az);
    box(g, 1.8, 0.35, len + 0.6, stoneM, (ax + bx) / 2, 0.75, (az + bz) / 2, ry);
    for (const s of [-0.8, 0.8]) {
      const rail = box(g, 0.1, 0.5, len + 0.4, stoneM, (ax + bx) / 2 + Math.cos(ry) * s, 1.15, (az + bz) / 2 - Math.sin(ry) * s, ry);
      rail.castShadow = false;
    }
  }
  // weeping willows on the bank
  // scholar rocks and red lanterns along the bank
  const rockM = stone(0x8d8a80);
  for (const [rx, rz, rs] of [[-12, -8, 1.4], [-13, 9, 1.1], [10, 10, 1.3], [11, -9, 0.9]]) {
    const r = sphere(g, rs, rockM, rx, rs * 0.8, rz, 7, 5);
    r.scale.set(1, 1.6, 0.8);
  }
  const lantern = mat(0xd62828, 0.5, 0, { emissive: 0xff3b1f, emissiveIntensity: 0.6 });
  for (const [lx, lz] of [[-9, 5.5], [-5, 3.5], [-1, 3]]) {
    cyl(g, 0.06, 0.06, 2.4, mat(0x2b2b2b), lx, 2, lz, 4);
    sphere(g, 0.45, lantern, lx, 3.4, lz, 10, 8).scale.y = 1.2;
  }
  group.add(g);
}

function buildLujiazui(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x9a968e);
  // Shanghai Tower: twisting, tapering rounded triangle
  const st = new THREE.CylinderGeometry(3.6, 6, 66, 36, 16);
  const pos = st.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const y = pos.getY(i);
    const t = y / 66 + 0.5;
    const ang = Math.atan2(pz, px);
    const r = Math.hypot(px, pz) * (1 + 0.12 * Math.cos(3 * ang));
    const tw = ang + t * 2.1;
    pos.setXYZ(i, Math.cos(tw) * r, y, Math.sin(tw) * r);
  }
  st.computeVertexNormals();
  const tower = finish(new THREE.Mesh(st, glass(0xa9c4cf, 0.75, 0.1)));
  tower.position.set(-5, 33, 3);
  g.add(tower);
  // Shanghai World Financial Center: the "bottle opener"
  const swfc = new THREE.Shape();
  swfc.moveTo(-4, 0);
  swfc.lineTo(4, 0);
  swfc.lineTo(4, 44);
  swfc.lineTo(1.2, 58);
  swfc.lineTo(-1.2, 58);
  swfc.lineTo(-4, 44);
  swfc.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-2.6, 50);
  hole.lineTo(2.6, 50);
  hole.lineTo(1.6, 55);
  hole.lineTo(-1.6, 55);
  hole.closePath();
  swfc.holes.push(hole);
  const sg = new THREE.ExtrudeGeometry(swfc, { depth: 6, bevelEnabled: false });
  sg.translate(0, 0, -3);
  const sw = finish(new THREE.Mesh(sg, glass(0x8fa9b8, 0.8, 0.1)));
  sw.position.set(8, 0, -4);
  sw.rotation.y = 0.6;
  g.add(sw);
  // Jin Mao: pagoda-like stepped setbacks
  const jm = new THREE.Group();
  jm.position.set(6, 0, 9);
  let y = 0;
  let w = 6;
  for (let i = 0; i < 9; i++) {
    const h = 6 - i * 0.45;
    facadeBlock(jm, 'office', w, h, w, 0, 0, 0xb9c0c8, y);
    y += h;
    w *= 0.9;
  }
  cone(jm, 0.6, 7, mat(0xd1d5db, 0.3, 0.8), 0, y + 3.5, 0, 8);
  g.add(jm);
  group.add(g);
}

/* ============================ HONG KONG ============================ */
function buildNathanRoad(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.5;
  plaza(g, 13, 0x7d7a74);
  // dense residential towers lining the street
  const towers = [[-9, -5, 6, 26], [-3, -6, 5, 30], [3, -5.5, 6, 24], [9, -5, 5, 28], [-8, 6, 5, 22], [-2, 6.5, 6, 27], [5, 6, 5, 25]];
  for (const [tx, tz, w, h] of towers) facadeBlock(g, 'residential', w, h, w, tx, tz, [0xf3e8d8, 0xdfe7e1, 0xe9dcd0][(tx + 20) % 3 | 0]);
  // neon signs hung over the road, all in one atlas so they share a material
  const atlas = signAtlas('hk-neon', [
    { text: '金行', fg: '#ffd84d' }, { text: '酒樓', fg: '#ff4d6d' }, { text: '大藥房', fg: '#4dffb8' },
    { text: '找換', fg: '#4dd2ff' }, { text: '茶餐廳', fg: '#ff9f40' }, { text: '海鮮', fg: '#c77dff' },
    { text: '押', fg: '#ff4d4d', size: 96 }, { text: '麻雀', fg: '#7dff6b' },
  ]);
  const neon = new THREE.MeshStandardMaterial({ map: atlas.tex, emissive: 0xffffff, emissiveMap: atlas.tex, emissiveIntensity: 1.1, side: THREE.DoubleSide, roughness: 0.5 });
  const boards = [];
  let k = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const bx = -10 + i * 4;
      const by = 5 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 2.4;
      const vertical = (i + (side > 0 ? 1 : 0)) % 2 === 0;
      const geo = vertical ? atlasPlane(4, 2, atlas.rect(k % 8)).rotateZ(Math.PI / 2) : atlasPlane(4.4, 2.2, atlas.rect(k % 8));
      geo.rotateY(Math.PI / 2);
      geo.translate(bx, by, side * 2.4);
      boards.push(geo);
      k++;
    }
  }
  g.add(bake(boards, neon));
  // red taxis
  for (const [cx, cz] of [[-6, 0.8], [2, -1], [8, 1]]) {
    box(g, 1.8, 1.1, 4, mat(0xc81e1e, 0.45, 0.3), cx, 0.85, cz, Math.PI / 2);
    box(g, 1.6, 0.6, 2, mat(0xf2f2f2, 0.5), cx, 1.7, cz, Math.PI / 2);
  }
  group.add(g);
}

function buildVictoriaHarbour(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 16, 0x23566a, 0x082230, 0x6e6c66);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  boat(g, -4, 4, 0.9, { len: 9, w: 3, hull: 0x166534, cabin: 0xf1f5f9, decks: 2 }); // Star Ferry
  // Duk Ling junk with red battened sails
  const junk = new THREE.Group();
  junk.position.set(5, 0.3, -5);
  junk.rotation.y = -0.6;
  const hull = new THREE.Shape();
  hull.moveTo(-1.4, -4);
  hull.lineTo(1.4, -4);
  hull.lineTo(1.6, 3);
  hull.quadraticCurveTo(0, 4.4, -1.6, 3);
  hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 1.2, bevelEnabled: false });
  hg.rotateX(-Math.PI / 2);
  junk.add(finish(new THREE.Mesh(hg, mat(0x5a3a22, 0.8))));
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#5a1f17';
  for (let y = 10; y < 128; y += 16) ctx.fillRect(0, y, 64, 3);
  const sailTex = new THREE.CanvasTexture(c);
  sailTex.colorSpace = THREE.SRGBColorSpace;
  const sail = new THREE.MeshStandardMaterial({ map: sailTex, side: THREE.DoubleSide, roughness: 0.9 });
  [[-2, 4.5, 3], [0.6, 6, 3.6], [2.8, 3.6, 2.4]].forEach(([sz, h, w]) => {
    cyl(junk, 0.08, 0.1, h + 1.6, mat(0x3b2a1a), 0, 1.2 + (h + 1.6) / 2, sz, 6);
    const p = finish(new THREE.Mesh(new THREE.PlaneGeometry(w, h), sail));
    p.position.set(0, 2.2 + h / 2, sz - w * 0.3);
    p.rotation.y = Math.PI / 2;
    junk.add(p);
  });
  g.add(junk);
  // Tsim Sha Tsui clock tower on the pier
  box(g, 8, 0.8, 4, stone(0xb7afa1), -11, 0.7, -8, 0.3);
  const ct = new THREE.Group();
  ct.position.set(-12, 1, -8);
  box(ct, 2, 9, 2, mat(0xc77a52, 0.8), 0, 4.5, 0);
  box(ct, 2.3, 2, 2.3, stone(0xe7dfcf), 0, 9.6, 0);
  cyl(ct, 0.6, 0.9, 2, mat(0xc77a52, 0.8), 0, 11.6, 0, 8);
  cyl(ct, 0.06, 0.1, 3, mat(0x777777), 0, 14, 0, 4);
  g.add(ct);
  group.add(g);
}

function buildCentralTowers(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x99958d);
  // Bank of China Tower: triangular shafts rising to different heights, X-braced
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a4c5c';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(160,190,210,0.25)';
  for (let y = 0; y < 256; y += 8) ctx.fillRect(0, y, 256, 3);
  ctx.strokeStyle = '#f2f4f6';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(256, 256);
  ctx.moveTo(256, 0);
  ctx.lineTo(0, 256);
  ctx.stroke();
  ctx.strokeRect(0, 0, 256, 256);
  const bocTex = new THREE.CanvasTexture(c);
  bocTex.colorSpace = THREE.SRGBColorSpace;
  bocTex.wrapS = bocTex.wrapT = THREE.RepeatWrapping;
  bocTex.repeat.set(1 / 9, 1 / 9);
  const boc = new THREE.MeshStandardMaterial({ map: bocTex, roughness: 0.2, metalness: 0.6 });
  const b = new THREE.Group();
  b.position.set(-4, 0, 2);
  const s = 4.5;
  const quads = [
    [[[-s, -s], [s, -s], [s, s]], 56],
    [[[-s, -s], [s, s], [-s, s]], 44],
    [[[0, 0], [s, s], [-s, s]], 34],
    [[[0, 0], [-s, -s], [s, -s]], 26],
  ];
  for (const [pts, h] of quads) {
    prism(b, pts, h, boc, 0);
    const top = finish(new THREE.Mesh(new THREE.ConeGeometry(s * 0.6, 4, 3), boc));
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
    const cz = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
    top.position.set(cx, h + 2, cz);
    b.add(top);
  }
  for (const sx of [-1, 1]) cyl(b, 0.12, 0.2, 9, mat(0xd1d5db, 0.3, 0.8), sx * 1.2 + 2, 60, 2, 6);
  g.add(b);
  // IFC: tapering tower with a crown of fins
  const ifc = new THREE.Group();
  ifc.position.set(8, 0, -6);
  facadeBlock(ifc, 'glass', 8, 44, 8, 0, 0, 0xa7b9c6);
  facadeBlock(ifc, 'glass', 6.6, 10, 6.6, 0, 0, 0xb2c3cf, 44);
  facadeBlock(ifc, 'glass', 5, 6, 5, 0, 0, 0xbccbd6, 54);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    box(ifc, 0.4, 4, 1.2, mat(0xdfe5ea, 0.3, 0.7), Math.cos(a) * 2.6, 62, Math.sin(a) * 2.6, -a);
  }
  g.add(ifc);
  addTowerSkyscraper(g, { x: 8, z: 8, w: 6, h: 30, d: 6, color: 0x1f2937 });
  group.add(g);
}

/* ============================ BANGKOK ============================ */
function thaiRoof(parent, w, len, tiers, y, ry = 0) {
  const orange = mat(0xd9541e, 0.55);
  const green = mat(0x2e7d32, 0.55);
  const au = gold();
  for (let i = 0; i < tiers; i++) {
    const s = 1 - i * 0.18;
    const r = gableRoof(parent, w * s, 2.6 * s, len * (1 - i * 0.12), i % 2 ? green : orange, 0, y + i * 1.6, 0, ry);
    r.castShadow = true;
  }
  // chofa finials on the gable ends
  for (const e of [-1, 1]) {
    const f = cone(parent, 0.18, 1.6, au, Math.sin(ry) * e * len * 0.5, y + 2.6 + (tiers - 1) * 1.6, Math.cos(ry) * e * len * 0.5, 6);
    f.rotation.x = e * 0.6;
  }
}

function buildGrandPalace(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = 0.3;
  plaza(g, 13, 0xe6dfcf);
  const white = stone(0xf5f1e8, 0.6);
  const au = gold();
  // crenellated palace wall
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    box(g, 3.6, 2.4, 0.6, white, Math.cos(a) * 12, 1.5, Math.sin(a) * 12, -a + Math.PI / 2);
  }
  // Phra Si Rattana Chedi: golden bell-shaped stupa
  const chedi = new THREE.Group();
  chedi.position.set(-4, 0.3, -3);
  box(chedi, 7, 1.2, 7, white, 0, 0.6, 0);
  box(chedi, 5.6, 1, 5.6, white, 0, 1.7, 0);
  lathe(chedi, [[2.8, 0], [2.9, 0.6], [2.7, 1.2], [3.1, 2.4], [2.9, 4.2], [2.2, 5.6], [1.2, 6.4], [0.9, 6.8], [1.0, 7.3], [0.7, 7.6], [0.55, 9], [0.4, 10.4], [0.25, 11.6], [0.01, 13]], au, 2.2, 28);
  for (let k = 0; k < 6; k++) cyl(chedi, 0.62 - k * 0.07, 0.62 - k * 0.07, 0.25, au, 0, 10.2 + k * 0.5, 0, 16);
  g.add(chedi);
  // Ubosot hall of the Emerald Buddha: tiered orange-and-green roofs
  const hall = new THREE.Group();
  hall.position.set(4, 0.3, 3);
  hall.rotation.y = 0.4;
  box(hall, 6, 1, 11, white, 0, 0.5, 0);
  box(hall, 5, 4, 9.5, white, 0, 3, 0);
  for (let i = -3; i <= 3; i++) for (const sx of [-2.7, 2.7]) cyl(hall, 0.25, 0.3, 4, au, sx, 3, i * 1.4, 8);
  thaiRoof(hall, 7, 11, 3, 5);
  g.add(hall);
  group.add(g);
}

function buildWatArun(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 16, 0x6b5a3a, 0x241c10, 0x8c8070); // Chao Phraya
  const g = new THREE.Group();
  g.position.set(x - 3, 0, z - 2);
  const terrace = stone(0xd8cfbf);
  box(g, 14, 1.2, 14, terrace, 0, 0.9, 0);
  box(g, 10, 1.2, 10, terrace, 0, 2.1, 0);
  const mosaic = new THREE.MeshStandardMaterial({ map: mosaicTexture(), roughness: 0.55 });
  mosaic.map.repeat.set(4, 6);
  // central Khmer-style prang
  const prof = [[3.6, 0], [3.4, 1.5], [3.0, 1.8], [3.1, 3.6], [2.6, 4], [2.6, 6], [2.2, 6.4], [2.2, 8.6], [1.8, 9], [1.9, 11], [1.4, 11.6], [1.3, 13.5], [0.9, 14.2], [0.8, 16], [0.5, 16.8], [0.35, 19], [0.12, 21], [0.01, 22.5]];
  lathe(g, prof, mosaic, 2.7, 16);
  // four satellite prangs
  for (const [px, pz] of [[-5.4, -5.4], [5.4, -5.4], [-5.4, 5.4], [5.4, 5.4]]) {
    const m = lathe(g, prof.map(([r, h]) => [r * 0.42, h * 0.45]), mosaic, 1.5, 12);
    m.position.x = px;
    m.position.z = pz;
  }
  // long-tail boat on the river
  boat(g, 10, 10, 0.4, { len: 6, w: 1.6, hull: 0x7c4a1e, cabin: 0x7c4a1e });
  group.add(g);
}

function buildMahanakhon(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x9a968e);
  // MahaNakhon: glass tower with a spiralling "pixelated" ribbon
  const t = new THREE.Group();
  t.position.set(-4, 0, 2);
  facadeBlock(t, 'glass', 8, 58, 8, 0, 0, 0xb7c9d4);
  const pix = [];
  for (let i = 0; i < 46; i++) {
    const y = 4 + i * 1.15;
    const a = i * 0.32;
    const face = Math.floor(((a % (Math.PI * 2)) / (Math.PI * 2)) * 4);
    const along = ((a % (Math.PI / 2)) / (Math.PI / 2)) * 8 - 4;
    const dx = [along, 4.25, -along, -4.25][face];
    const dz = [4.25, along, -4.25, -along][face];
    const cube = new THREE.BoxGeometry(1.4, 1.1, 1.4);
    cube.translate(dx, y, dz);
    pix.push(cube);
  }
  t.add(bake(pix, mat(0x2a3138, 0.4, 0.5)));
  g.add(t);
  // Baiyoke Tower II
  facadeBlock(g, 'glass', 7, 46, 7, 8, -6, 0xc9a0a8);
  cyl(g, 0.2, 0.4, 8, mat(0xd1d5db, 0.3, 0.8), 8, 50, -6, 8);
  addTowerSkyscraper(g, { x: 8, z: 8, w: 6, h: 26, d: 6, color: 0x334155 });
  addTowerSkyscraper(g, { x: -11, z: -8, w: 6, h: 20, d: 6, color: 0x1e293b });
  group.add(g);
}
