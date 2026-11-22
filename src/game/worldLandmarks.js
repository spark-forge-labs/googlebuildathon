import * as THREE from 'three';
import { addWaterBasin, addTowerSkyscraper } from './cityLandmarks.js';
import {
  mat, stone, glass, gold, finish, box, cyl, cone, sphere, strut, lathe, plaza, lawn, gableRoof, prism,
  facadeBlock, facadeMaterial, bake, placed, latticeMaterial, boat, spinner, beaconBeam,
} from './worldKit.js';
import { buildWorldLandmarks2 } from './worldLandmarks2.js';

/**
 * World Tour landmarks. Same three slots as every circuit:
 * infield-right (44, 12), centre with water (-5, 11), north-east skyline (78, -52).
 */
export function buildWorldLandmarks(city, group, animTargets, addCol) {
  const { waterMeshes, rotatingBeacons } = animTargets;
  switch (city.id) {
    case 'london':
      buildWestminster(group, 44, 12);
      addCol(44, 12, 13);
      buildLondonEye(group, waterMeshes, rotatingBeacons, -5, 11);
      addCol(-5, 11, 17);
      buildShardAndGherkin(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'paris':
      buildArcDeTriomphe(group, 44, 12);
      addCol(44, 12, 12);
      buildEiffelTower(group, waterMeshes, rotatingBeacons, -5, 11);
      addCol(-5, 11, 16);
      buildSacreCoeur(group, 78, -52);
      addCol(78, -52, 17);
      return true;
    case 'newyork':
      buildFlatiron(group, 44, 12);
      addCol(44, 12, 12);
      buildStatueOfLiberty(group, waterMeshes, -5, 11);
      addCol(-5, 11, 17);
      buildEmpireAndChrysler(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'mexicocity':
      buildAngel(group, 44, 12);
      addCol(44, 12, 12);
      buildBellasArtes(group, waterMeshes, -5, 11);
      addCol(-5, 11, 16);
      buildTorreLatino(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'sanfrancisco':
      buildPaintedLadies(group, 44, 12);
      addCol(44, 12, 13);
      buildAlcatraz(group, waterMeshes, rotatingBeacons, -5, 11);
      addCol(-5, 11, 17);
      buildTransamerica(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    case 'dallas':
      buildReunionTower(group, 44, 12);
      addCol(44, 12, 11);
      buildFountainPlace(group, waterMeshes, -5, 11);
      addCol(-5, 11, 16);
      buildDallasSkyline(group, 78, -52);
      addCol(78, -52, 16);
      return true;
    default:
      return buildWorldLandmarks2(city, group, animTargets, addCol);
  }
}

/* ============================ LONDON ============================ */
function buildWestminster(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.35;
  lawn(g, 13, 0x56803c);
  const st = stone(0xd6c49a);
  const dark = mat(0x2a2d31, 0.6);
  // Palace of Westminster: long Gothic range with buttress ribs and pinnacles
  box(g, 20, 7, 5.5, st, 2, 3.65, 4);
  for (let i = -9.5; i <= 11.5; i += 1.25) box(g, 0.35, 7.6, 5.9, st, i, 3.9, 4);
  for (let i = -9; i <= 11; i += 2.5) cone(g, 0.35, 2.2, st, i, 8.4, 1.3, 4), cone(g, 0.35, 2.2, st, i, 8.4, 6.7, 4);
  gableRoof(g, 5.5, 2.2, 20, mat(0x4a5560, 0.55, 0.3), 2, 7.3, 4, Math.PI / 2);
  for (let i = -8; i <= 10; i += 2.5) box(g, 0.9, 2.6, 0.1, dark, i, 3.6, 1.2);
  // Victoria Tower at the far end
  box(g, 4.4, 17, 4.4, st, 11.5, 8.8, 4);
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) cone(g, 0.45, 3, st, 11.5 + px, 18.6, 4 + pz, 6);
  // Elizabeth Tower (Big Ben)
  const t = new THREE.Group();
  t.position.set(-8, 0.3, -2);
  box(t, 3.4, 19, 3.4, st, 0, 9.5, 0);
  for (const sx of [-1.75, 1.75]) for (const sz of [-1.75, 1.75]) box(t, 0.45, 19.5, 0.45, st, sx, 9.75, sz);
  box(t, 4.2, 4.2, 4.2, st, 0, 21.1, 0);
  const face = mat(0xf4ecd2, 0.5, 0, { emissive: 0xfff1c9, emissiveIntensity: 0.25 });
  const rim = gold();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const fx = Math.sin(a) * 2.13;
    const fz = Math.cos(a) * 2.13;
    const c = finish(new THREE.Mesh(new THREE.CircleGeometry(1.55, 28), face), false);
    c.position.set(fx, 21.1, fz);
    c.rotation.y = a;
    t.add(c);
    const ring = finish(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.13, 6, 28), rim), false);
    ring.position.set(fx * 1.01, 21.1, fz * 1.01);
    ring.rotation.y = a;
    t.add(ring);
    for (const [len, rot] of [[1.1, 0.6], [0.8, 2.1]]) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, len, 0.05), dark);
      hand.position.set(fx * 1.02 + Math.sin(a + Math.PI / 2) * 0, 21.1, fz * 1.02);
      hand.rotation.set(0, a, rot);
      hand.translateY(len / 2 - 0.05);
      t.add(hand);
    }
  }
  box(t, 3.6, 2.4, 3.6, st, 0, 24.4, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    box(t, 1.6, 1.6, 0.1, dark, Math.sin(a) * 1.82, 24.4, Math.cos(a) * 1.82, a);
  }
  const spire = finish(new THREE.Mesh(new THREE.ConeGeometry(2.7, 6.5, 4), mat(0x3a4450, 0.5, 0.4)));
  spire.rotation.y = Math.PI / 4;
  spire.position.y = 28.9;
  t.add(spire);
  cone(t, 0.18, 1.6, rim, 0, 32.8, 0, 6);
  g.add(t);
  group.add(g);
}

function buildLondonEye(group, waterMeshes, rotatingBeacons, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 15.5, 0x3b5560, 0x10232a, 0x8a8478);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const steel = mat(0xe7ebef, 0.35, 0.7);
  // South Bank promenade the wheel stands on
  box(g, 7, 0.9, 30, stone(0xb8b0a2), -12.5, 0.6, 0);
  const R = 11;
  const holder = new THREE.Group();
  holder.position.set(-11.5, R + 2.2, 0);
  holder.rotation.set(0, Math.PI / 2, 0);
  const tilt = new THREE.Group();
  tilt.rotation.x = Math.PI / 2;
  holder.add(tilt);
  const wheel = spinner(0.07);
  tilt.add(wheel);
  // rim, spokes and hub baked into one mesh so the turning wheel is a single draw call
  const geos = [];
  for (const off of [-0.55, 0.55]) geos.push(placed(new THREE.TorusGeometry(R, 0.2, 6, 64), 0, off, 0, Math.PI / 2));
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const sp = new THREE.CylinderGeometry(0.05, 0.05, R, 4);
    sp.translate(0, R / 2, 0);
    geos.push(placed(sp, 0, 0, 0, Math.PI / 2, 0, 0).rotateY(a));
  }
  geos.push(placed(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12), 0, 0, 0));
  wheel.add(bake(geos, steel));
  const pods = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const pod = new THREE.SphereGeometry(0.62, 10, 8);
    pod.scale(1, 1.6, 1); // capsules are long along the wheel axis, so they look right as it turns
    pods.push(placed(pod, Math.cos(a) * (R + 0.4), 0, Math.sin(a) * (R + 0.4)));
  }
  wheel.add(bake(pods, glass(0xcfe3ee, 0.4, 0.05)));
  rotatingBeacons.push(wheel);
  g.add(holder);
  // A-frame back legs to the hub
  const hub = new THREE.Vector3(-11.5, R + 2.2, 0);
  for (const sz of [-5.5, 5.5]) strut(g, new THREE.Vector3(-15.5, 0.6, sz), hub, 0.38, steel, 8);
  strut(g, new THREE.Vector3(-15.5, 0.6, -5.5), new THREE.Vector3(-15.5, 0.6, 5.5), 0.3, steel);
  boat(g, 2, -6, 0.2, { len: 8, cabin: 0x1e3a8a, decks: 2 });
  boat(g, 6, 7, -0.4, { len: 6, cabin: 0x991b1b });
  group.add(g);
}

function buildShardAndGherkin(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x9a968e);
  // The Shard: splintered glass pyramid
  const shardGlass = glass(0xbfd2df, 0.85, 0.08);
  const s1 = finish(new THREE.Mesh(new THREE.ConeGeometry(6, 54, 4, 1), shardGlass));
  s1.rotation.y = Math.PI / 4;
  s1.position.set(-4, 27, 2);
  g.add(s1);
  const s2 = finish(new THREE.Mesh(new THREE.ConeGeometry(3.2, 58, 4, 1), shardGlass));
  s2.rotation.y = Math.PI / 4 + 0.2;
  s2.position.set(-3.2, 29, 2.8);
  g.add(s2);
  // The Gherkin: bullet-shaped diagrid tower
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    prof.push([Math.max(0.01, 3.6 * Math.pow(Math.sin(Math.PI * (0.25 + 0.75 * t)), 0.8)), t * 28]);
  }
  const gher = lathe(g, prof, glass(0x3b5a6e, 0.6, 0.2), 0, 28);
  gher.position.set(7, 0, -3);
  const spiral = latticeMaterial(0xdfe6ea);
  const shell = lathe(g, prof.map(([r, h]) => [r + 0.06, h]), spiral, 0, 28);
  shell.position.set(7, 0, -3);
  addTowerSkyscraper(g, { x: 6, z: 9, w: 7, h: 30, d: 7, color: 0x1e293b });
  addTowerSkyscraper(g, { x: -12, z: -8, w: 6, h: 24, d: 8, color: 0x334155 });
  group.add(g);
}

/* ============================ PARIS ============================ */
function roundArchBlock(w, h, d, archW, archH, m) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-archW / 2, 0);
  s.lineTo(-archW / 2, archH - archW / 2);
  s.absarc(0, archH - archW / 2, archW / 2, Math.PI, 0, true);
  s.lineTo(archW / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 14 });
  geo.translate(0, 0, -d / 2);
  return finish(new THREE.Mesh(geo, m));
}

function buildArcDeTriomphe(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = 0.4;
  plaza(g, 12, 0xc9bfa9);
  const st = stone(0xe3d7bd);
  const arc = roundArchBlock(10.5, 12, 6, 4.4, 8, st);
  arc.position.y = 0.3;
  g.add(arc);
  // side passages (through the piers, along the other axis)
  const side = roundArchBlock(6, 6.4, 10.6, 2.2, 4.8, st);
  side.rotation.y = Math.PI / 2;
  side.position.y = 0.3;
  g.add(side);
  box(g, 11.2, 0.7, 6.6, st, 0, 9.4, 0); // cornice
  box(g, 10.8, 2.4, 6.2, st, 0, 11.3, 0); // attic
  box(g, 11.4, 0.5, 6.8, st, 0, 12.7, 0);
  // relief groups on the pier faces
  const relief = stone(0xcdbf9f);
  for (const sx of [-3.9, 3.9]) for (const sz of [-3.08, 3.08]) box(g, 1.9, 3.4, 0.3, relief, sx, 3.4, sz);
  // the Tricolore hanging under the vault
  const flag = new THREE.Group();
  flag.position.set(0, 5.4, 0);
  [0x1e40af, 0xf8fafc, 0xdc2626].forEach((c, i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.2), mat(c, 0.8, 0, { side: THREE.DoubleSide }));
    p.position.x = (i - 1) * 1.1;
    flag.add(p);
  });
  g.add(flag);
  group.add(g);
}

function buildEiffelTower(group, waterMeshes, rotatingBeacons, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  lawn(g, 16, 0x5b8a3e); // Champ-de-Mars
  addWaterBasin(group, waterMeshes, x + 10, z + 9, 4.2, 0x3d6f8a, 0x0e2a3a, 0xd9cfb8); // Trocadéro fountain pool
  const iron = latticeMaterial(0x6f5b44);
  const solid = mat(0x5e4b38, 0.7, 0.35);
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  // four curving legs up to the second platform
  for (const [cx, cz] of corners) {
    let prev = null;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const y = t * 18;
      const r = 8.2 - 5.2 * Math.pow(t, 0.75);
      const p = new THREE.Vector3(cx * r, y, cz * r);
      if (prev) {
        const w = 2.6 - 1.4 * t;
        const dir = new THREE.Vector3().subVectors(p, prev);
        const len = dir.length() + 0.15;
        const seg = finish(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.85, w * 1.05, len, 4, 1, true), iron));
        seg.position.copy(prev).addScaledVector(dir, 0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        seg.rotateY(Math.PI / 4);
        g.add(seg);
        // solid inner girder so the leg keeps its mass at a distance
        const core = finish(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.5, len, 4), solid));
        core.position.copy(seg.position);
        core.quaternion.copy(seg.quaternion);
        g.add(core);
      }
      prev = p;
    }
  }
  // decorative arches between the legs under the first platform
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const arch = finish(new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.32, 6, 24, Math.PI), iron));
    arch.position.set(Math.sin(a) * 6.3, 1.6, Math.cos(a) * 6.3);
    arch.rotation.y = a + Math.PI / 2;
    g.add(arch);
  }
  // first and second platforms
  box(g, 13.4, 1.4, 13.4, solid, 0, 8.3, 0);
  box(g, 13.8, 0.35, 13.8, mat(0xcaa66a, 0.5, 0.6), 0, 9.1, 0);
  box(g, 7.6, 1.1, 7.6, solid, 0, 18.2, 0);
  // upper shaft tapering to the summit
  const shaft = finish(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 3.4, 24, 4, 1, true), iron));
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 30.6;
  g.add(shaft);
  const shaftCore = finish(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.7, 24, 4), solid));
  shaftCore.rotation.y = Math.PI / 4;
  shaftCore.position.y = 30.6;
  g.add(shaftCore);
  box(g, 2.2, 1.8, 2.2, solid, 0, 43.4, 0);
  cyl(g, 0.6, 0.8, 2.2, solid, 0, 45.4, 0, 8);
  cyl(g, 0.08, 0.14, 4.5, mat(0xd1d5db, 0.4, 0.7), 0, 48.8, 0, 6);
  const beacon = beaconBeam(0xfff2c0, 22);
  beacon.position.set(0, 45.6, 0);
  g.add(beacon);
  rotatingBeacons.push(beacon);
  group.add(g);
}

function buildSacreCoeur(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // Montmartre hill
  const hill = finish(new THREE.Mesh(new THREE.SphereGeometry(17, 30, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5d7f42, 1)), false);
  hill.scale.y = 0.55;
  g.add(hill);
  const white = stone(0xf3efe6, 0.7);
  const b = new THREE.Group();
  b.position.set(0, 9, 0);
  box(b, 11, 6, 8, white, 0, 3, 0);
  box(b, 6, 3.5, 3, white, 0, 1.75, 5.2); // portico
  for (let i = -2; i <= 2; i++) box(b, 0.6, 3.5, 0.6, white, i * 1.2, 1.75, 6.8);
  // central dome on a tall drum
  cyl(b, 2.9, 3.1, 4, white, 0, 8, 0, 20);
  const dome = finish(new THREE.Mesh(new THREE.SphereGeometry(3, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), white));
  dome.scale.y = 1.45;
  dome.position.y = 10;
  b.add(dome);
  cyl(b, 0.6, 0.7, 1.6, white, 0, 15.2, 0, 10);
  cone(b, 0.55, 1.6, white, 0, 16.8, 0, 10);
  // four smaller domes
  for (const [dx, dz] of [[-4.2, 3], [4.2, 3], [-4.2, -3], [4.2, -3]]) {
    cyl(b, 1.1, 1.2, 2, white, dx, 7, dz, 12);
    const d = finish(new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), white));
    d.scale.y = 1.4;
    d.position.set(dx, 8, dz);
    b.add(d);
  }
  // campanile behind
  box(b, 2.4, 11, 2.4, white, 0, 5.5, -5.5);
  const cd = finish(new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), white));
  cd.scale.y = 1.5;
  cd.position.set(0, 11, -5.5);
  b.add(cd);
  g.add(b);
  group.add(g);
}

/* ============================ NEW YORK ============================ */
function buildFlatiron(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = 0.9;
  plaza(g, 12, 0x8f8b84);
  const foot = [[-5.5, -7], [5.5, -7], [0.9, 8], [-0.9, 8]];
  const m = facadeMaterial('stone', 0xf1e6cf, 1 / 14, 1 / 14);
  prism(g, foot, 22, m, 0.3);
  const cornice = prism(g, [[-5.9, -7.3], [5.9, -7.3], [1.1, 8.4], [-1.1, 8.4]], 0.8, stone(0xe2d6bc), 22.3);
  cornice.castShadow = true;
  // yellow cabs on Fifth Avenue
  const cab = mat(0xf5c518, 0.45, 0.3);
  for (const [cx, cz, r] of [[-8, 2, 0.3], [-9.5, -4, 0.3], [8.5, 0, -0.3]]) {
    const c = box(g, 1.8, 1.2, 4.2, cab, cx, 0.9, cz, r);
    c.castShadow = true;
  }
  group.add(g);
}

function buildStatueOfLiberty(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 15.5, 0x2f5566, 0x0c2130, 0x7a766c);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // Liberty Island + star-shaped Fort Wood
  lawn(g, 6.5, 0x5b7f45);
  const star = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = i % 2 ? 3.2 : 4.6;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  prism(g, star, 1.4, stone(0xa8a090), 0.3);
  const granite = stone(0xb3aa98);
  box(g, 4, 1.2, 4, granite, 0, 2.3, 0);
  box(g, 3.2, 5.6, 3.2, granite, 0, 5.7, 0);
  box(g, 3.6, 0.6, 3.6, granite, 0, 8.8, 0);
  // the statue in verdigris copper
  const copper = mat(0x6fae95, 0.55, 0.35);
  const s = new THREE.Group();
  s.position.y = 9.1;
  lathe(s, [[1.35, 0], [1.25, 1.5], [1.0, 4], [0.85, 6], [0.7, 7.2], [0.45, 7.8], [0.01, 8.1]], copper, 0, 14);
  sphere(s, 0.62, copper, 0, 8.6, 0.05, 12, 10);
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + (i / 6) * 2.4;
    const ray = finish(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 5), copper));
    ray.position.set(Math.sin(a) * 0.62, 9.15, Math.cos(a) * 0.62);
    ray.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
    s.add(ray);
  }
  strut(s, new THREE.Vector3(0.55, 7.2, 0), new THREE.Vector3(0.9, 10.6, 0.15), 0.26, copper);
  cyl(s, 0.32, 0.18, 0.7, gold(), 0.92, 10.9, 0.15, 10);
  const flame = finish(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xffc94d })), false);
  flame.position.set(0.92, 11.6, 0.15);
  s.add(flame);
  box(s, 0.9, 1.3, 0.2, copper, -0.75, 5.8, 0.55, 0.3); // tablet
  s.rotation.y = 0.6;
  g.add(s);
  group.add(g);
}

function buildEmpireAndChrysler(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x86827a);
  // Empire State: limestone setbacks and mast
  const es = new THREE.Group();
  es.position.set(-4, 0, 2);
  facadeBlock(es, 'office', 12, 5, 10, 0, 0, 0xe9e1d0);
  facadeBlock(es, 'office', 9, 26, 7.5, 0, 0, 0xece5d6, 5);
  facadeBlock(es, 'office', 6.4, 9, 5.4, 0, 0, 0xefe9dc, 31);
  facadeBlock(es, 'office', 4.2, 4, 3.6, 0, 0, 0xf2ede2, 40);
  const metal = mat(0xd8dde3, 0.3, 0.85);
  cyl(es, 1.1, 1.6, 4, metal, 0, 46, 0, 12);
  cyl(es, 0.6, 1.0, 2.2, metal, 0, 49.1, 0, 12);
  cyl(es, 0.08, 0.2, 7, metal, 0, 53.7, 0, 6);
  g.add(es);
  // Chrysler: shaft + stainless sunburst crown + needle
  const ch = new THREE.Group();
  ch.position.set(8, 0, -5);
  facadeBlock(ch, 'office', 8, 6, 8, 0, 0, 0xd9d4ca);
  facadeBlock(ch, 'office', 6, 28, 6, 0, 0, 0xdedad1, 6);
  for (let i = 0; i < 6; i++) {
    const r = 3 - i * 0.45;
    const ring = finish(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), metal));
    ring.position.y = 34 + i * 1.4;
    ring.scale.y = 1.2;
    ring.rotation.y = Math.PI / 8;
    ch.add(ring);
  }
  cone(ch, 0.35, 8, metal, 0, 46, 0, 8);
  g.add(ch);
  addTowerSkyscraper(g, { x: 9, z: 9, w: 6, h: 22, d: 6, color: 0x1e293b });
  group.add(g);
}

/* ============================ MEXICO CITY ============================ */
function buildAngel(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 12, 0xc4b9a3);
  // flower beds of the glorieta
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const bed = finish(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.5, 12), mat(k % 2 ? 0xd9467a : 0xf59e0b, 0.9)), false);
    bed.position.set(Math.cos(a) * 9, 0.45, Math.sin(a) * 9);
    g.add(bed);
  }
  const st = stone(0xd8cfbd);
  box(g, 7, 1.2, 7, st, 0, 0.9, 0);
  box(g, 5.2, 3.6, 5.2, st, 0, 3.3, 0);
  const bronze = mat(0x3f3a30, 0.5, 0.6);
  for (const [cx, cz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) sphere(g, 0.9, bronze, cx, 2.2, cz, 10, 8);
  cyl(g, 1.0, 1.15, 26, st, 0, 18.1, 0, 16);
  for (const y of [9, 15, 21]) cyl(g, 1.25, 1.25, 0.6, gold(), 0, y, 0, 16);
  box(g, 2.6, 1.4, 2.6, st, 0, 31.8, 0);
  // golden Winged Victory
  const au = gold();
  const v = new THREE.Group();
  v.position.y = 32.5;
  lathe(v, [[0.5, 0], [0.42, 1.2], [0.3, 2.2], [0.01, 2.6]], au, 0, 10);
  sphere(v, 0.32, au, 0, 2.8, 0, 10, 8);
  for (const s of [-1, 1]) {
    const wing = box(v, 0.12, 2.6, 1.1, au, s * 0.45, 2.6, -0.3);
    wing.rotation.set(0.2, 0, s * -0.45);
  }
  strut(v, new THREE.Vector3(0.3, 2.2, 0), new THREE.Vector3(0.6, 3.8, 0.2), 0.12, au);
  g.add(v);
  group.add(g);
}

function buildBellasArtes(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x + 6, z + 8, 6, 0x3e7a8c, 0x0f2c36, 0xd8cfbd); // Alameda fountain
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  lawn(g, 16, 0x5d8a43);
  const marble = stone(0xf1ede4, 0.6);
  const p = new THREE.Group();
  p.position.set(-3, 0, -3);
  p.rotation.y = 0.5;
  box(p, 18, 8, 12, marble, 0, 4.3, 0);
  for (let i = -3; i <= 3; i++) cyl(p, 0.45, 0.5, 6.4, marble, i * 2.1, 3.6, 6.4, 10);
  box(p, 16, 0.8, 1.6, marble, 0, 7.2, 6.4);
  // orange-and-gold tiled domes
  const tile = mat(0xe39a2d, 0.35, 0.45);
  cyl(p, 3.6, 3.8, 2.2, marble, 0, 9.4, 0, 20);
  const dome = finish(new THREE.Mesh(new THREE.SphereGeometry(3.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), tile));
  dome.scale.y = 1.25;
  dome.position.y = 10.4;
  p.add(dome);
  for (let k = 0; k < 4; k++) {
    const rib = finish(new THREE.Mesh(new THREE.TorusGeometry(3.74, 0.09, 4, 16, Math.PI), gold()), false);
    rib.position.y = 10.4;
    rib.scale.y = 1.25;
    rib.rotation.y = (k * Math.PI) / 4;
    p.add(rib);
  }
  sphere(p, 0.7, gold(), 0, 15.3, 0, 10, 8);
  for (const sx of [-6.5, 6.5]) {
    const d = finish(new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), tile));
    d.scale.y = 1.3;
    d.position.set(sx, 8.3, 4);
    p.add(d);
  }
  g.add(p);
  group.add(g);
}

function buildTorreLatino(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x9c9488);
  const t = new THREE.Group();
  t.position.set(-3, 0, 1);
  facadeBlock(t, 'glass', 8, 30, 8, 0, 0, 0x6e8fb0);
  facadeBlock(t, 'glass', 6, 5, 6, 0, 0, 0x7a9ab8, 30);
  facadeBlock(t, 'glass', 4, 3, 4, 0, 0, 0x86a4c0, 35);
  cyl(t, 0.15, 0.35, 8, mat(0xd1d5db, 0.4, 0.8), 0, 42, 0, 6);
  g.add(t);
  // Torre Reforma's stepped concrete flanks + glass towers along Reforma
  facadeBlock(g, 'office', 6, 38, 6, 8, -6, 0xd6d0c6);
  addTowerSkyscraper(g, { x: 9, z: 7, w: 6, h: 26, d: 7, color: 0x0f3b5c, spire: true });
  addTowerSkyscraper(g, { x: -11, z: -8, w: 6, h: 20, d: 6, color: 0x334155 });
  group.add(g);
}

/* ============================ SAN FRANCISCO ============================ */
function buildPaintedLadies(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.4;
  // Alamo Square park rising behind the row
  const park = finish(new THREE.Mesh(new THREE.SphereGeometry(10, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5f8f46, 1)), false);
  park.scale.y = 0.32;
  g.add(park);
  g.scale.setScalar(1.3);
  const paints = [0xb9a3d6, 0x9fd3c7, 0xf2b49a, 0x9cc3e6, 0xf3dc8e, 0xe7a3b8];
  const trim = mat(0xfaf7f0, 0.6);
  paints.forEach((c, i) => {
    const hx = -11 + i * 4.4;
    const hz = 6 - i * 0.6;
    const hy = 0.3 + i * 0.35; // the street climbs the hill
    const body = mat(c, 0.75);
    box(g, 4.1, 7, 7, body, hx, hy + 3.5, hz);
    gableRoof(g, 4.3, 2.6, 7.4, mat(0x4b4f55, 0.7), hx, hy + 7, hz);
    box(g, 1.7, 4.5, 0.9, body, hx - 0.8, hy + 3.4, hz + 3.9); // bay window
    for (const wy of [2.2, 4.6]) box(g, 1.4, 1.5, 0.12, mat(0x2b3037, 0.4), hx - 0.8, hy + wy, hz + 4.37);
    box(g, 4.2, 0.3, 0.3, trim, hx, hy + 6.9, hz + 3.55);
    box(g, 1.2, 2.2, 0.15, trim, hx + 1.2, hy + 1.4, hz + 3.55); // door frame
  });
  group.add(g);
}

function buildAlcatraz(group, waterMeshes, rotatingBeacons, x, z) {
  addWaterBasin(group, waterMeshes, x, z, 15.5, 0x355d6d, 0x0e2530, 0x6b6a62);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const rock = finish(new THREE.Mesh(new THREE.SphereGeometry(8, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6f725e, 1)));
  rock.scale.set(1.25, 0.42, 0.8);
  const pos = rock.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * (0.85 + 0.3 * Math.sin(pos.getX(i) * 1.3 + pos.getZ(i))));
  rock.geometry.computeVertexNormals();
  g.add(rock);
  const concrete = stone(0xcfc6b0);
  const cell = facadeBlock(g, 'office', 11, 3.6, 4.2, 0, 0, 0xe6dcc4, 3.2);
  cell.position.set(-0.5, 3.2 + 1.8, 0.5);
  box(g, 4, 2.4, 3.2, concrete, -6.5, 3.8, -1);
  // lighthouse with sweeping beam
  cyl(g, 0.6, 0.85, 8, mat(0xf5f5f0, 0.6), 6.5, 6.2, -1, 12);
  cyl(g, 0.9, 0.9, 1.1, glass(0xfff7d6, 0.2, 0.1), 6.5, 10.7, -1, 12);
  cone(g, 1.0, 1.0, mat(0x2d2f33, 0.5), 6.5, 11.8, -1, 12);
  const beam = beaconBeam(0xfff3c4, 16);
  beam.position.set(6.5, 10.7, -1);
  g.add(beam);
  rotatingBeacons.push(beam);
  // water tower
  const steel = mat(0x8a8f94, 0.6, 0.5);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) strut(g, new THREE.Vector3(-8.5 + lx, 1.6, 2.5 + lz), new THREE.Vector3(-8.5 + lx * 0.6, 9, 2.5 + lz * 0.6), 0.1, steel, 4);
  cyl(g, 1.3, 1.3, 2, steel, -8.5, 10, 2.5, 12);
  boat(g, 9, 9, 2.4, { len: 7, cabin: 0x1f2937, decks: 2 });
  group.add(g);
}

function buildTransamerica(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x9b978f);
  const tm = facadeMaterial('office', 0xf4f2ec, 2, 6);
  const pyr = finish(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 6, 42, 4, 1), tm));
  pyr.rotation.y = Math.PI / 4;
  pyr.position.set(-4, 21, 2);
  g.add(pyr);
  for (const s of [-1, 1]) {
    const wing = finish(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.2, 14, 4), tm));
    wing.rotation.y = Math.PI / 4;
    wing.position.set(-4 + s * 2.6, 31, 2);
    g.add(wing);
  }
  cyl(g, 0.05, 0.25, 6, mat(0xe5e7eb, 0.3, 0.8), -4, 44.5, 2, 6);
  // Salesforce Tower: rounded obelisk with a lattice crown
  const sf = finish(new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 48, 24), glass(0xb6c6d2, 0.7, 0.1)));
  sf.scale.x = 1.25;
  sf.position.set(8, 24, -5);
  g.add(sf);
  const crown = finish(new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.65, 6, 24, 1, true), latticeMaterial(0xe8edf0)));
  crown.scale.x = 1.25;
  crown.position.set(8, 51, -5);
  g.add(crown);
  addTowerSkyscraper(g, { x: 8, z: 8, w: 6, h: 24, d: 6, color: 0x1f2937 });
  group.add(g);
}

/* ============================ DALLAS ============================ */
function buildReunionTower(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 11, 0xa8a399);
  const concrete = stone(0xcfcbc2);
  cyl(g, 1.1, 1.3, 30, concrete, 0, 15, 0, 14);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    cyl(g, 0.7, 0.8, 29, concrete, Math.cos(a) * 1.9, 14.5, Math.sin(a) * 1.9, 10);
  }
  cyl(g, 3.4, 2.6, 2.4, concrete, 0, 30.5, 0, 20);
  // the geodesic "ball" with its lattice of lights
  const ball = new THREE.IcosahedronGeometry(5, 2);
  const shell = finish(new THREE.Mesh(ball, glass(0x2b3440, 0.6, 0.2)));
  shell.position.y = 35.5;
  g.add(shell);
  const lights = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(5.05, 2)),
    new THREE.LineBasicMaterial({ color: 0xfff1c2 })
  );
  lights.position.y = 35.5;
  g.add(lights);
  group.add(g);
}

function buildFountainPlace(group, waterMeshes, x, z) {
  addWaterBasin(group, waterMeshes, x + 4, z + 5, 9, 0x3b7f92, 0x0f2f38, 0xbdb6a8);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 16, 0xb1aa9c);
  // fountain jets in a grid
  const jet = mat(0xf2f8fb, 0.3, 0, { emissive: 0xcfe8f2, emissiveIntensity: 0.25 });
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if ((i + j) % 2 === 0) cyl(g, 0.12, 0.2, 2.4, jet, 4 + i * 2.6, 1.3, 5 + j * 2.6, 6);
  // faceted green-glass prism with a sliced top
  const green = glass(0x3f7d68, 0.8, 0.1);
  const t = new THREE.Group();
  t.position.set(-7, 0, -6);
  t.rotation.y = 0.5;
  box(t, 8, 30, 8, green, 0, 15, 0);
  const cap = finish(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 5.66, 10, 4, 1), green));
  cap.rotation.y = Math.PI / 4;
  cap.position.set(1.2, 35, 1.2);
  cap.scale.set(1, 1, 0.55);
  t.add(cap);
  g.add(t);
  group.add(g);
}

function buildDallasSkyline(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  plaza(g, 15, 0x9a968e);
  // Bank of America Plaza with its green argon outline
  const t = new THREE.Group();
  t.position.set(-4, 0, 2);
  facadeBlock(t, 'glass', 9, 46, 9, 0, 0, 0x7b8f9e);
  const neon = new THREE.MeshBasicMaterial({ color: 0x39ff8a });
  for (const sx of [-4.55, 4.55]) for (const sz of [-4.55, 4.55]) box(t, 0.18, 46, 0.18, neon, sx, 23, sz);
  for (const sz of [-4.55, 4.55]) box(t, 9.2, 0.18, 0.18, neon, 0, 46, sz);
  for (const sx of [-4.55, 4.55]) box(t, 0.18, 0.18, 9.2, neon, sx, 46, 0);
  g.add(t);
  // Renaissance Tower with the double-X lights
  const r = new THREE.Group();
  r.position.set(8, 0, -6);
  facadeBlock(r, 'glass', 7, 36, 7, 0, 0, 0x8aa0b0);
  for (const zf of [3.56]) {
    for (const s of [-1, 1]) {
      const bar = box(r, 0.2, 9, 0.1, neon, 0, 31, zf);
      bar.rotation.z = s * 0.6;
    }
  }
  cyl(r, 0.12, 0.3, 6, mat(0xe5e7eb, 0.3, 0.8), 0, 39, 0, 6);
  g.add(r);
  addTowerSkyscraper(g, { x: 8, z: 8, w: 7, h: 28, d: 6, color: 0x0c4a6e });
  addTowerSkyscraper(g, { x: -11, z: -8, w: 6, h: 22, d: 6, color: 0x334155 });
  group.add(g);
}
