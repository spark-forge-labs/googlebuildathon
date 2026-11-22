import * as THREE from 'three';
import { getSurfaceGrain } from './realWorld.js';

/**
 * Signature bridges for the World Tour cities. Each one decorates the circuit's elevated
 * section (track frames between city.bridgeUs) — the road deck itself comes from the track.
 *   tower-bridge (London) · golden-gate (San Francisco) · brooklyn (New York) · tsing-ma (Hong Kong)
 *   harbour-arch (Sydney) · paris-pont (Pont Alexandre III) · hunt-hill (Dallas) · viaduct (Mexico City, Toronto)
 * Returns true when the style was handled here.
 */
export function buildWorldBridge(city, track, group) {
  const style = city.bridgeStyle;
  const [u0, u1] = [city.bridgeUs[0], city.bridgeUs[city.bridgeUs.length - 1]];
  switch (style) {
    case 'golden-gate':
      suspension(track, group, u0, u1, {
        towerH: 34,
        cable: mat(0xc0362c, 0.55, 0.2),
        tower: (f) => goldenGateTower(f, 34),
      });
      return true;
    case 'tsing-ma':
      suspension(track, group, u0, u1, {
        towerH: 31,
        cable: mat(0xdfe3e6, 0.4, 0.5),
        tower: (f) => portalTower(f, 31, mat(0xd7d6d0, 0.7)),
      });
      return true;
    case 'brooklyn':
      suspension(track, group, u0, u1, {
        towerH: 30,
        cable: mat(0x8d9399, 0.45, 0.6),
        stays: true,
        tower: (f) => masonryTower(f, 30, stone(0xb6a487)),
      });
      return true;
    case 'tower-bridge':
      towerBridge(track, group, u0, u1);
      return true;
    case 'harbour-arch':
      harbourArch(track, group, u0, u1);
      return true;
    case 'paris-pont':
      parisPont(track, group, u0, u1);
      return true;
    case 'hunt-hill':
      huntHill(track, group, u0, u1);
      return true;
    case 'viaduct':
      viaduct(track, group, city);
      return true;
    default:
      return false;
  }
}

/* ---------------- helpers ---------------- */
const mat = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

function stone(color) {
  const m = mat(color, 0.85);
  m.map = getSurfaceGrain();
  m.bumpMap = m.map;
  m.bumpScale = 0.4;
  return m;
}

function roadQuat(tangent) {
  const up = new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
  const x = new THREE.Vector3().crossVectors(up, t).normalize();
  const z = new THREE.Vector3().crossVectors(x, up).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z));
}

function box(parent, w, h, d, m, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Group standing on the ground under the track frame, axes: x across the road, z along it. */
function anchorAt(f) {
  const g = new THREE.Group();
  g.position.set(f.point.x, 0, f.point.z);
  g.quaternion.copy(roadQuat(f.tangent));
  return g;
}

/** Thin straight member between two world points. */
function strut(parent, a, b, radius, m, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.05) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, seg), m);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function tube(parent, points, radius, m, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 3), radius, radial, false), m);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

const edge = (f, side, off = 8.6) => f.point.clone().addScaledVector(f.right, side * off);

/** Pointed-arch portal (Gothic tower) as an extruded outline: x across, y up from `y0`, depth along z. */
function gothicPortal(w, h, archW, archH, depth, m) {
  const s = new THREE.Shape();
  const hw = w / 2;
  const aw = archW / 2;
  s.moveTo(-hw, 0);
  s.lineTo(-aw, 0);
  s.lineTo(-aw, archH * 0.58);
  s.quadraticCurveTo(-aw, archH * 0.9, 0, archH);
  s.quadraticCurveTo(aw, archH * 0.9, aw, archH * 0.58);
  s.lineTo(aw, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, h);
  s.lineTo(-hw, h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------------- suspension bridges ---------------- */
function suspension(track, group, u0, u1, { towerH, cable, tower, stays = false }) {
  const f0 = track.getFrameAt(u0);
  const f1 = track.getFrameAt(u1);
  group.add(tower(f0), tower(f1));
  const ext = 0.055;
  const hangerMat = mat(0x3a3f45, 0.5, 0.6);
  for (const side of [-1, 1]) {
    const pts = [];
    const sample = (u) => {
      const f = track.getFrameAt(((u % 1) + 1) % 1);
      const p = edge(f, side);
      let y;
      if (u < u0) y = THREE.MathUtils.lerp(towerH - 0.8, f.point.y + 0.9, Math.pow((u0 - u) / ext, 0.85));
      else if (u > u1) y = THREE.MathUtils.lerp(towerH - 0.8, f.point.y + 0.9, Math.pow((u - u1) / ext, 0.85));
      else {
        const t = (u - u0) / (u1 - u0);
        y = THREE.MathUtils.lerp(f.point.y + 1.4, towerH - 0.8, (2 * t - 1) ** 2);
      }
      p.y = y;
      return { p, f };
    };
    for (let u = u0 - ext; u <= u1 + ext + 1e-6; u += 0.004) pts.push(sample(u).p);
    tube(group, pts, 0.24, cable);
    // vertical suspenders
    for (let u = u0 + 0.005; u < u1 - 0.002; u += 0.0055) {
      const { p, f } = sample(u);
      const deck = edge(f, side);
      deck.y = f.point.y + 0.35;
      if (p.y - deck.y > 0.6) strut(group, deck, p, 0.05, hangerMat, 4);
    }
    for (const [ua, ub] of [[u0 - ext + 0.006, u0 - 0.004], [u1 + 0.004, u1 + ext - 0.006]]) {
      for (let u = ua; u < ub; u += 0.0055) {
        const { p, f } = sample(u);
        const deck = edge(f, side);
        deck.y = f.point.y + 0.35;
        if (p.y - deck.y > 0.6) strut(group, deck, p, 0.05, hangerMat, 4);
      }
    }
    if (stays) {
      // Brooklyn's diagonal stays radiating from the tower tops
      for (const [ut, dir] of [[u0, 1], [u0, -1], [u1, 1], [u1, -1]]) {
        const top = edge(track.getFrameAt(ut), side);
        top.y = towerH - 3;
        for (let k = 1; k <= 5; k++) {
          const f = track.getFrameAt(ut + dir * k * 0.007);
          const d = edge(f, side);
          d.y = f.point.y + 0.4;
          strut(group, top, d, 0.06, hangerMat, 4);
        }
      }
    }
  }
}

function goldenGateTower(f, H) {
  const g = anchorAt(f);
  const orange = mat(0xc0362c, 0.62, 0.15);
  const deckY = f.point.y;
  for (const side of [-1, 1]) {
    // stepped Art Deco legs: wide at the base, setbacks towards the top
    const stages = [
      [0, H * 0.42, 2.6],
      [H * 0.42, H * 0.72, 2.2],
      [H * 0.72, H, 1.8],
    ];
    for (const [y0, y1, w] of stages) {
      box(g, w, y1 - y0, w * 1.25, orange, side * 9.4, (y0 + y1) / 2, 0);
      for (const rx of [-0.45, 0.45]) box(g, 0.25, y1 - y0 - 0.4, 0.2, orange, side * 9.4 + rx * w, (y0 + y1) / 2, w * 0.63);
    }
  }
  for (const y of [deckY - 1.6, deckY + 9, H * 0.72, H - 0.8]) box(g, 17.4, 1.3, 1.6, orange, 0, y, 0);
  // portal bracing below the deck
  box(g, 17.4, 1.0, 1.4, orange, 0, Math.max(1.2, deckY * 0.45), 0);
  return g;
}

function portalTower(f, H, m) {
  const g = anchorAt(f);
  const deckY = f.point.y;
  for (const side of [-1, 1]) box(g, 2.4, H, 3.4, m, side * 9.6, H / 2, 0);
  for (const y of [deckY - 1.4, deckY + 10, H * 0.78, H - 0.9]) box(g, 17.8, 1.6, 2.6, m, 0, y, 0);
  return g;
}

function masonryTower(f, H, m) {
  const g = anchorAt(f);
  const deckY = f.point.y;
  // piers below the deck
  for (const side of [-1, 1]) box(g, 4, deckY, 6, m, side * 10, deckY / 2, 0);
  const portal = gothicPortal(24, H - deckY, 16.4, 14.5, 6, m);
  portal.position.y = deckY;
  g.add(portal);
  // cornice and pinnacle caps
  box(g, 25, 1.0, 7, m, 0, H + 0.5, 0);
  const dark = mat(0x2a2622, 0.9);
  // small Gothic window recesses above the arch, both faces
  for (const zf of [-3.05, 3.05]) {
    for (const x of [-5, 5]) {
      const win = gothicPortal(2.2, 0.01, 2.2, 4.2, 0.12, dark);
      win.position.set(x, deckY + 17.5, zf);
      g.add(win);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.5), dark);
      fill.position.set(x, deckY + 18.7, zf + Math.sign(zf) * 0.07);
      if (zf < 0) fill.rotation.y = Math.PI;
      g.add(fill);
    }
  }
  return g;
}

/* ---------------- London: Tower Bridge ---------------- */
function towerBridge(track, group, u0, u1) {
  const stoneM = stone(0xcbbd9f);
  const roofM = mat(0x3c4a58, 0.5, 0.4);
  const blue = mat(0x7fb0d6, 0.45, 0.5);
  const white = mat(0xf1f5f9, 0.5, 0.2);
  const tops = [];
  for (const u of [u0, u1]) {
    const f = track.getFrameAt(u);
    const deckY = f.point.y;
    const g = anchorAt(f);
    box(g, 26, deckY, 9, stoneM, 0, deckY / 2, 0); // river pier
    const H = 26;
    const portal = gothicPortal(23, H, 16, 12.5, 8, stoneM);
    portal.position.y = deckY;
    g.add(portal);
    // four corner turrets with lead spires
    for (const sx of [-10.2, 10.2]) {
      for (const sz of [-3.6, 3.6]) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, H + 4, 10), stoneM);
        t.position.set(sx, deckY + (H + 4) / 2, sz);
        t.castShadow = true;
        g.add(t);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.75, 5, 10), roofM);
        cone.position.set(sx, deckY + H + 6.5, sz);
        g.add(cone);
        const fin = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(0xd4a017, 0.3, 0.9));
        fin.position.set(sx, deckY + H + 9.2, sz);
        g.add(fin);
      }
    }
    // central pyramid roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(8, 6, 4), roofM);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, deckY + H + 3, 0);
    g.add(roof);
    // lancet windows on both faces
    const dark = mat(0x22262b, 0.6);
    for (const zf of [-4.06, 4.06]) {
      for (const x of [-4, 0, 4]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.6), dark);
        w.position.set(x, deckY + 18, zf);
        if (zf < 0) w.rotation.y = Math.PI;
        g.add(w);
      }
    }
    group.add(g);
    tops.push(f);
  }
  // high-level walkways (two parallel lattice spans) between the tower tops
  const [fa, fb] = tops;
  for (const side of [-1, 1]) {
    const a = edge(fa, side, 3.2);
    const b = edge(fb, side, 3.2);
    const y = Math.max(fa.point.y, fb.point.y) + 22;
    a.y = b.y = y;
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const span = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, len), blue);
    span.position.copy(a).addScaledVector(dir, 0.5);
    span.lookAt(b);
    span.castShadow = true;
    group.add(span);
    for (const dy of [-1.4, 1.4]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, len), white);
      trim.position.copy(span.position);
      trim.position.y += dy;
      trim.quaternion.copy(span.quaternion);
      group.add(trim);
    }
  }
  // suspension chains on the side spans (towers to the shore abutments)
  for (const [ut, dir] of [[u0, -1], [u1, 1]]) {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const u = ut + dir * k * 0.0055;
        const f = track.getFrameAt(u);
        const p = edge(f, side, 8.4);
        const t = k / 12;
        p.y = THREE.MathUtils.lerp(f.point.y + 13, f.point.y + 1, Math.sin((t * Math.PI) / 2) * 0.6 + t * 0.4);
        pts.push(p);
      }
      tube(group, pts, 0.42, blue);
      for (let k = 2; k < 12; k += 2) {
        const p = pts[k];
        const f = track.getFrameAt(ut + dir * k * 0.0055);
        const d = edge(f, side, 8.4);
        d.y = f.point.y + 0.3;
        strut(group, d, p, 0.09, blue, 4);
      }
    }
  }
}

/* ---------------- Sydney: Harbour Bridge ---------------- */
function harbourArch(track, group, u0, u1) {
  const granite = stone(0xc8b38a);
  const steel = mat(0x8b939a, 0.5, 0.65);
  const f0 = track.getFrameAt(u0);
  const f1 = track.getFrameAt(u1);
  const deck0 = Math.min(f0.point.y, f1.point.y);
  // granite pylons at both ends
  for (const f of [f0, f1]) {
    const g = anchorAt(f);
    for (const side of [-1, 1]) {
      box(g, 4.4, f.point.y + 15, 5.6, granite, side * 11, (f.point.y + 15) / 2, 0);
      box(g, 5, 1, 6.2, granite, side * 11, f.point.y + 15.5, 0);
    }
    group.add(g);
  }
  const H = 24;
  const n = 30;
  for (const side of [-1, 1]) {
    const top = [];
    const bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const f = track.getFrameAt(u0 + (u1 - u0) * t);
      const s = Math.sin(Math.PI * t);
      const b = edge(f, side, 9.2);
      b.y = deck0 - 2.5 + (H - 4) * Math.pow(s, 0.85);
      const tp = b.clone();
      tp.y = b.y + 2.4 + 5.5 * (1 - s);
      bot.push(b);
      top.push(tp);
    }
    tube(group, top, 0.55, steel, 6);
    tube(group, bot, 0.55, steel, 6);
    for (let i = 1; i < n; i++) {
      strut(group, bot[i], top[i], 0.22, steel, 4);
      strut(group, bot[i], top[i + 1], 0.16, steel, 4);
      const t = i / n;
      const f = track.getFrameAt(u0 + (u1 - u0) * t);
      const d = edge(f, side, 9.2);
      d.y = f.point.y + 0.3;
      if (bot[i].y > d.y + 1) strut(group, d, bot[i], 0.14, steel, 4);
    }
    if (side === 1) {
      // top lateral bracing between the two arch ribs
      for (let i = 4; i <= n - 4; i += 3) {
        const a = top[i].clone();
        const t = i / n;
        const f = track.getFrameAt(u0 + (u1 - u0) * t);
        const b = edge(f, -1, 9.2);
        b.y = a.y;
        strut(group, a, b, 0.2, steel, 4);
      }
    }
  }
}

/* ---------------- Paris: Pont Alexandre III ---------------- */
function parisPont(track, group, u0, u1) {
  const gold = mat(0xd4a017, 0.28, 1.0);
  const stoneM = stone(0xe4dac4);
  const iron = mat(0x2c3a3e, 0.5, 0.6);
  // monumental pillars with gilded Pegasus groups at both ends
  for (const u of [u0, u1]) {
    const f = track.getFrameAt(u);
    const g = anchorAt(f);
    for (const side of [-1, 1]) {
      const x = side * 10.8;
      box(g, 4, f.point.y + 3, 4, stoneM, x, (f.point.y + 3) / 2, 0);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 12, 14), stoneM);
      col.position.set(x, f.point.y + 3 + 6, 0);
      col.castShadow = true;
      g.add(col);
      box(g, 3.2, 1.2, 3.2, stoneM, x, f.point.y + 15.6, 0);
      // gilded figure: horse body, raised wings, rider
      const fig = new THREE.Group();
      fig.position.set(x, f.point.y + 16.2, 0);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.6, 4, 8), gold);
      body.rotation.z = Math.PI / 2;
      body.position.y = 1.1;
      fig.add(body);
      const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 6), gold);
      neck.position.set(1.0, 1.8, 0);
      neck.rotation.z = -0.6;
      fig.add(neck);
      for (const wz of [-0.5, 0.5]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.9), gold);
        wing.position.set(-0.2, 2.1, wz);
        wing.rotation.set(wz * 1.4, 0, 0.7);
        fig.add(wing);
      }
      const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 6), gold);
      rider.position.set(-0.2, 2.2, 0);
      fig.add(rider);
      fig.rotation.y = side > 0 ? 0 : Math.PI;
      g.add(fig);
    }
    group.add(g);
  }
  // shallow cast-iron arch ribs under the deck, with decorative ring spandrels
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const f = track.getFrameAt(u0 + (u1 - u0) * t);
      const p = edge(f, side, 6.8);
      p.y = 0.6 + (f.point.y - 1.6) * Math.sin(Math.PI * t);
      pts.push(p);
      if (i % 3 === 0 && i > 0 && i < 24) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.09, 6, 14), gold);
        ring.position.set(p.x, (p.y + f.point.y) / 2, p.z);
        ring.quaternion.copy(roadQuat(f.tangent));
        ring.rotateY(Math.PI / 2);
        group.add(ring);
      }
    }
    tube(group, pts, 0.5, iron, 6);
  }
  // Belle Époque candelabra lamps along the deck
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
  for (let u = u0 + 0.01; u < u1; u += 0.016) {
    const f = track.getFrameAt(u);
    for (const side of [-1, 1]) {
      const p = edge(f, side, 8.4);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3.4, 6), iron);
      post.position.set(p.x, f.point.y + 1.7, p.z);
      group.add(post);
      for (const dx of [-0.35, 0, 0.35]) {
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glow);
        globe.position.set(p.x + dx * f.tangent.z, f.point.y + 3.5 + (dx === 0 ? 0.3 : 0), p.z - dx * f.tangent.x);
        group.add(globe);
      }
    }
  }
}

/* ---------------- Dallas: Margaret Hunt Hill Bridge ---------------- */
function huntHill(track, group, u0, u1) {
  const white = mat(0xf4f6f8, 0.35, 0.25);
  const cableM = mat(0xe8ecef, 0.3, 0.5);
  const pts = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const f = track.getFrameAt(u0 + (u1 - u0) * t);
    const p = edge(f, -1, 10.2); // the arch stands just outside the barrier, cables fan across the deck
    p.y = f.point.y - 0.6 + 24 * Math.sin(Math.PI * t);
    pts.push({ p, f });
  }
  tube(group, pts.map((q) => q.p), 0.75, white, 10);
  // the arch's feet in the median
  for (const q of [pts[0], pts[n]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.2, 10), white);
    foot.position.set(q.p.x, q.f.point.y - 0.4, q.p.z);
    group.add(foot);
  }
  // twisting fan of stay cables to both deck edges
  for (let i = 2; i <= n - 2; i++) {
    const { p } = pts[i];
    if (p.y < pts[i].f.point.y + 6) continue;
    const offU = (i / n - 0.5) * 0.02;
    for (const side of [-1, 1]) {
      const af = track.getFrameAt(u0 + (u1 - u0) * (i / n) + side * offU);
      const d = edge(af, side, 7.9);
      d.y = af.point.y + 0.4;
      strut(group, p, d, 0.06, cableM, 4);
    }
  }
}

/* ---------------- Elevated expressway (Mexico City Segundo Piso, Toronto Gardiner) ---------------- */
function viaduct(track, group, city) {
  const concrete = stone(0xbab5ab);
  const accent = mat(city.accentHex, 0.5, 0.1, { emissive: city.accentHex, emissiveIntensity: 0.18 });
  for (let i = 0; i < 7; i++) {
    const f = track.getFrameAt(0.5 + i * 0.034);
    if (f.point.y < 2) continue;
    const g = anchorAt(f);
    // hammerhead pier: one wide column, flared cap under the deck
    box(g, 3.2, f.point.y - 1.2, 2.4, concrete, 0, (f.point.y - 1.2) / 2, 0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 2.2, 1.4, 4, 1), concrete);
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(1, 1, 0.3);
    cap.position.y = f.point.y - 0.9;
    g.add(cap);
    group.add(g);
  }
  // painted fascia panels along both edges of the elevated deck
  for (let u = 0.5; u < 0.74; u += 0.008) {
    const f = track.getFrameAt(u);
    if (f.point.y < 1.5) continue;
    for (const side of [-1, 1]) {
      const p = edge(f, side, 7.9);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 3.6), accent);
      panel.position.set(p.x, f.point.y - 0.55, p.z);
      panel.quaternion.copy(roadQuat(f.tangent));
      group.add(panel);
    }
  }
}
