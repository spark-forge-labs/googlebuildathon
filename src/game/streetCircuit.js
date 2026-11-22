import * as THREE from 'three';

/**
 * Real street-circuit dressing (Monaco / Singapore / Macau style):
 *  - concrete barrier walls with sponsor boards (red/white chevrons in the corners)
 *  - debris catch-fencing on steel posts above the walls
 *  - red/white kerbs only where the road bends; grey concrete gutters elsewhere
 *  - raised paved footpaths behind the walls
 *  - painted road markings, manhole covers, asphalt repairs and skid marks
 * Walls only line ground-level road; the elevated bridge keeps its guardrails.
 */
export const WALL_INNER = 9.3; // lateral distance of the wall face from the centre line
const WALL_T = 0.6;
const WALL_H = 1.15;
const FENCE_H = 2.6;
const GROUND_MAX_Y = 1.3;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------- textures ---------------- */
function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Wall face: top row = sponsor boards, bottom row = corner chevrons. */
function wallBannerTexture(city) {
  const sponsors = [
    { bg: '#0d1b33', fg: '#ffffff', text: `${city.name.toUpperCase()} GP`, acc: city.badgeColor },
    { bg: '#f4f4f0', fg: '#141414', text: city.nitroName, acc: '#e11d48' },
    { bg: '#111111', fg: '#f7c948', text: 'DESI TYRES', acc: '#f7c948' },
    { bg: city.badgeColor, fg: '#ffffff', text: city.nativeName, acc: '#ffffff' },
    { bg: '#1d4ed8', fg: '#ffffff', text: 'CHAI FUEL', acc: '#93c5fd' },
    { bg: '#f8fafc', fg: '#0f172a', text: 'INDIA GP', acc: '#f97316' },
  ];
  return canvasTexture(2048, 256, (g, w, h) => {
    const pw = w / sponsors.length;
    sponsors.forEach((s, i) => {
      const x = i * pw;
      g.fillStyle = s.bg;
      g.fillRect(x, 0, pw, h / 2);
      g.fillStyle = s.acc;
      g.fillRect(x, h / 2 - 10, pw, 10);
      g.fillStyle = s.fg;
      g.font = `900 64px system-ui, "Noto Sans", "Noto Sans CJK SC", "Noto Sans Thai", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s.text, x + pw / 2, h / 4, pw - 30);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + pw - 3, 0, 3, h / 2); // panel joints
    });
    // chevrons
    const y0 = h / 2;
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, y0, w, h / 2);
    g.fillStyle = '#c81e1e';
    for (let x = -h; x < w + h; x += 128) {
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + 64, y0);
      g.lineTo(x + 128, y0 + h / 4);
      g.lineTo(x + 64, y0 + h / 2);
      g.lineTo(x, y0 + h / 2);
      g.lineTo(x + 64, y0 + h / 4);
      g.closePath();
      g.fill();
    }
    // road grime splashed along the bottom of the boards
    for (let i = 0; i < 1400; i++) {
      const yy = (i % 2 ? h / 2 : h) - Math.random() * Math.random() * 60;
      g.fillStyle = `rgba(40,36,30,${Math.random() * 0.14})`;
      g.fillRect(Math.random() * w, yy, 2 + Math.random() * 10, 1 + Math.random() * 4);
    }
  });
}

function concreteTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#a9a69e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const v = 120 + Math.random() * 80;
      g.fillStyle = `rgba(${v},${v - 2},${v - 8},0.35)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,56,50,${Math.random() * 0.08})`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 6 + Math.random() * 20, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(40,38,34,0.5)';
    g.fillRect(0, 0, 2, h); // block joint
  });
}

/** Footpath pavers with a granite kerbstone along the road edge (u across, v along). */
function paverTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#9b958a';
    g.fillRect(0, 0, w, h);
    const s = 32;
    for (let y = 0; y < h; y += s) {
      for (let x = (y / s) % 2 ? s / 2 : 0; x < w + s; x += s) {
        const v = 135 + Math.random() * 40;
        g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
      }
    }
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(50,46,40,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  });
}

function gutterTexture() {
  return canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#8e8b84';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 110 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v},${v - 6},0.4)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = 'rgba(40,40,38,0.6)';
      g.fillRect(0, y, w, 2);
    }
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(25,25,24,0.45)');
    grad.addColorStop(0.5, 'rgba(25,25,24,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function kerbTexture() {
  return canvasTexture(64, 256, (g, w, h) => {
    for (let i = 0; i < 2; i++) {
      g.fillStyle = i ? '#ecebe6' : '#c4161c';
      g.fillRect(0, i * 128, w, 128);
    }
    for (let k = 0; k < 900; k++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(40,40,40,0.2)' : 'rgba(255,255,255,0.08)';
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  });
}

/** Chain-link debris fence (alpha-tested). */
function fenceTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(205,210,214,1)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, h);
    g.moveTo(w, 0);
    g.lineTo(0, h);
    g.stroke();
  });
}

/** Road paint + grime atlas: 4 x 4 cells. */
function decalAtlas() {
  const C = 256;
  const tex = canvasTexture(C * 4, C * 4, (g) => {
    g.clearRect(0, 0, C * 4, C * 4);
    const cell = (i, draw) => {
      const x = (i % 4) * C;
      const y = Math.floor(i / 4) * C;
      g.save();
      g.translate(x, y);
      draw(g);
      g.restore();
    };
    const paint = 'rgba(236,236,230,1)';
    const wear = (n) => {
      for (let k = 0; k < n; k++) {
        g.clearRect(Math.random() * C, Math.random() * C, 1 + Math.random() * 3, 1 + Math.random() * 4);
      }
    };
    // 0: zebra bar
    cell(0, () => {
      g.fillStyle = paint;
      g.fillRect(40, 0, C - 80, C);
      wear(900);
    });
    // 1: lane dash
    cell(1, () => {
      g.fillStyle = paint;
      g.fillRect(96, 0, 64, C);
      wear(500);
    });
    // 2: manhole cover
    cell(2, () => {
      g.fillStyle = '#2c2c2b';
      g.beginPath();
      g.arc(128, 128, 110, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#4a4a47';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(128, 128, 104, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 5;
      for (let k = -80; k <= 80; k += 20) {
        g.beginPath();
        g.moveTo(128 + k, 128 - Math.sqrt(9000 - k * k) * 0.95);
        g.lineTo(128 + k, 128 + Math.sqrt(9000 - k * k) * 0.95);
        g.stroke();
      }
    });
    // 3: turn arrow
    cell(3, () => {
      g.fillStyle = paint;
      g.fillRect(108, 90, 40, 166);
      g.beginPath();
      g.moveTo(60, 100);
      g.lineTo(128, 0);
      g.lineTo(196, 100);
      g.closePath();
      g.fill();
      wear(400);
    });
    // 4: asphalt repair patch (dark, slightly ragged)
    cell(4, () => {
      g.fillStyle = 'rgba(28,28,27,0.75)';
      g.beginPath();
      g.moveTo(20, 30);
      for (let k = 0; k <= 12; k++) g.lineTo(20 + (k / 12) * 216, 22 + Math.random() * 16);
      for (let k = 0; k <= 12; k++) g.lineTo(236 - Math.random() * 10, 30 + (k / 12) * 196);
      for (let k = 0; k <= 12; k++) g.lineTo(236 - (k / 12) * 216, 226 + Math.random() * 12);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(15,15,14,0.6)';
      g.lineWidth = 4;
      g.stroke();
    });
    // 5: skid marks (two tyre streaks)
    cell(5, () => {
      for (const x of [70, 186]) {
        const grad = g.createLinearGradient(0, 0, 0, C);
        grad.addColorStop(0, 'rgba(12,12,12,0)');
        grad.addColorStop(0.25, 'rgba(12,12,12,0.55)');
        grad.addColorStop(1, 'rgba(12,12,12,0.15)');
        g.fillStyle = grad;
        g.fillRect(x - 14, 0, 28, C);
      }
    });
    // 6: oil stain
    cell(6, () => {
      const grad = g.createRadialGradient(128, 128, 10, 128, 128, 120);
      grad.addColorStop(0, 'rgba(10,10,10,0.5)');
      grad.addColorStop(1, 'rgba(10,10,10,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, C, C);
    });
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return {
    tex,
    rect: (i) => {
      const c = i % 4;
      const r = Math.floor(i / 4);
      const pad = 0.004;
      return [c / 4 + pad, 1 - (r + 1) / 4 + pad, (c + 1) / 4 - pad, 1 - r / 4 - pad];
    },
  };
}

/* ---------------- geometry helpers ---------------- */
/**
 * Quad strip through pairs of points. `want` is the direction the surface should face
 * (the winding is flipped to match, so lighting and back-face culling are right).
 */
function ribbon(points, uvs, want) {
  const pos = [];
  const uv = [];
  const idx = [];
  points.forEach(([a, b], i) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uv.push(...uvs[i][0], ...uvs[i][1]);
  });
  let flip = false;
  if (want && points.length > 1) {
    const [a, b] = points[0];
    const c = points[1][0];
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    flip = n.dot(want) < 0;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const k = i * 2;
    if (flip) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Contiguous index runs (wrapping) where pred(i) is true. */
function runs(N, pred) {
  const out = [];
  let start = -1;
  for (let i = 0; i < N; i++) {
    if (pred(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) {
    if (out.length && out[0][0] === 0) out[0][0] = start - N; // merge with the wrap-around run
    else out.push([start, N]);
  }
  return out;
}

const mesh = (geo, mat, cast = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};

/* ---------------- builder ---------------- */
export function buildStreetCircuit(track, group, city, halfW, kerbW) {
  const S = track.samples;
  const N = S.length;
  const at = (i) => S[((i % N) + N) % N];
  const lap = track.totalLength;
  const stepLen = lap / N;
  const ground = (i) => at(i).point.y <= GROUND_MAX_Y;
  // smoothed curvature so kerb/chevron runs don't flicker
  const curv = S.map((_, i) => (at(i - 2).curvature + at(i - 1).curvature + at(i).curvature + at(i + 1).curvature + at(i + 2).curvature) / 5);
  const corner = (i) => curv[((i % N) + N) % N] > 0.14;

  const off = (s, lat, dy = 0) => {
    const p = s.point.clone().addScaledVector(s.right, lat);
    p.y += dy;
    return p;
  };

  /* --- corner kerbs (over the grey gutter that the track already lays) --- */
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const side of [-1, 1]) {
    for (const [a, b] of runs(N, (i) => corner(i) && ground(i))) {
      const pts = [];
      const uvs = [];
      for (let i = a; i <= b; i++) {
        const s = at(i);
        const v = (i * stepLen) / 3.2; // one red+white pair every 3.2 units
        const inner = off(s, side * halfW, 0.012);
        const outer = off(s, side * (halfW + kerbW), 0.1);
        pts.push(side > 0 ? [inner, outer] : [outer, inner]);
        uvs.push(side > 0 ? [[0, v], [1, v]] : [[1, v], [0, v]]);
      }
      if (pts.length > 1) group.add(mesh(ribbon(pts, uvs, at(a).normal), kerbMat, false));
    }
  }

  /* --- concrete walls with sponsor boards, catch fencing, footpaths --- */
  const banner = wallBannerTexture(city);
  const bannerMat = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.65 });
  const concreteMap = concreteTexture();
  const concrete = new THREE.MeshStandardMaterial({ map: concreteMap, roughness: 0.9 });
  const fenceMap = fenceTexture();
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceMap, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5b6168, roughness: 0.5, metalness: 0.7 });
  const paverMat = new THREE.MeshStandardMaterial({ map: paverTexture(), roughness: 0.92 });
  const kerbStone = new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 0.8 });
  const postGeo = new THREE.BoxGeometry(0.1, FENCE_H + 0.3, 0.1);
  const posts = [];

  // footpath width: 16.5 from the centre line, narrower on the inside of tight bends so it never folds
  const pathOuter = (i, side) => {
    const prev = at(i - 4).tangent;
    const next = at(i + 4).tangent;
    const turn = new THREE.Vector3().subVectors(next, prev).dot(at(i).right);
    const innerSide = Math.sign(turn) || 1;
    if (side !== innerSide) return 16.5;
    const radius = (8 * stepLen) / Math.max(1e-3, at(i).curvature);
    return Math.max(WALL_INNER + WALL_T + 0.6, Math.min(16.5, radius * 0.8));
  };
  const gantryGap = (i) => {
    // leave the start gantry's legs room
    const d = Math.abs(((i / N + 0.5) % 1) - 0.5) * lap;
    return d < 0.8;
  };

  for (const side of [-1, 1]) {
    const wallRuns = runs(N, (i) => ground(i) && ground(i + 1) && !gantryGap(i));
    for (const [a, b] of wallRuns) {
      // split into chevron (corner) and sponsor (straight) sub-runs, sharing end vertices
      let segStart = a;
      const flush = (from, to, chev) => {
        if (to - from < 1) return;
        const face = [];
        const faceUV = [];
        const top = [];
        const topUV = [];
        const back = [];
        const backUV = [];
        const fence = [];
        const fenceUV = [];
        const path = [];
        const pathUV = [];
        const curb = [];
        const curbUV = [];
        for (let i = from; i <= to; i++) {
          const s = at(i);
          const dist = i * stepLen;
          const v = (-side * dist) / 26; // banner repeats every 26 units; reads left-to-right on both walls
          const inL = side * WALL_INNER;
          const outL = side * (WALL_INNER + WALL_T);
          const b0 = off(s, inL, -0.05);
          const b1 = off(s, inL, WALL_H);
          const t1 = off(s, outL, WALL_H);
          const o0 = off(s, outL, -0.05);
          const rowV = chev ? [0.02, 0.48] : [0.52, 0.98];
          face.push([b0, b1]);
          faceUV.push([[v, rowV[0]], [v, rowV[1]]]);
          top.push([b1, t1]);
          topUV.push([[dist / 4, 0], [dist / 4, 0.15]]);
          back.push([t1, o0]);
          backUV.push([[dist / 4, 0.3], [dist / 4, 0]]);
          const f0 = off(s, side * (WALL_INNER + 0.15), WALL_H);
          const f1 = off(s, side * (WALL_INNER + 0.15), WALL_H + FENCE_H);
          fence.push([f0, f1]);
          fenceUV.push([[dist / 0.7, 0], [dist / 0.7, FENCE_H / 0.7]]);
          // footpath behind the wall (raised kerb, pavers out to the frontage)
          const py = Math.max(0.16, s.point.y) + 0.06;
          const p0 = off(s, side * (WALL_INNER + WALL_T), 0);
          const p1 = off(s, side * pathOuter(i, side), 0);
          p0.y = p1.y = py;
          path.push([p0, p1]);
          pathUV.push([[0, dist / 8], [7.2 / 8, dist / 8]]);
          const c0 = p1.clone();
          const c1 = p1.clone();
          c1.y = 0.0;
          curb.push([c0, c1]);
          curbUV.push([[dist / 2, 0], [dist / 2, 0.1]]);
          if (i % 7 === 0) posts.push(off(s, side * (WALL_INNER + 0.15), WALL_H + (FENCE_H + 0.3) / 2));
        }
        const s0 = at(from);
        const towardRoad = s0.right.clone().multiplyScalar(-side);
        const away = s0.right.clone().multiplyScalar(side);
        const up = new THREE.Vector3(0, 1, 0);
        group.add(mesh(ribbon(face, faceUV, towardRoad), bannerMat));
        group.add(mesh(ribbon(top, topUV, up), concrete));
        group.add(mesh(ribbon(back, backUV, away), concrete));
        group.add(mesh(ribbon(fence, fenceUV, towardRoad), fenceMat, false));
        group.add(mesh(ribbon(path, pathUV, up), paverMat, false));
        group.add(mesh(ribbon(curb, curbUV, away), kerbStone, false));
      };
      for (let i = a + 1; i <= b; i++) {
        const switching = i === b || corner(i) !== corner(i - 1);
        if (switching) {
          flush(segStart, i, corner(segStart));
          segStart = i;
        }
      }
    }
  }
  if (posts.length) {
    const inst = new THREE.InstancedMesh(postGeo, steel, posts.length);
    const d = new THREE.Object3D();
    posts.forEach((p, i) => {
      d.position.copy(p);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.castShadow = true;
    group.add(inst);
  }

  /* --- road paint, manholes, patches and skid marks --- */
  const atlas = decalAtlas();
  const paintMat = new THREE.MeshStandardMaterial({
    map: atlas.tex, alphaTest: 0.5, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const grimeMat = new THREE.MeshStandardMaterial({
    map: atlas.tex, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const paint = [];
  const grime = [];
  const decal = (list, u, lat, w, l, cellIdx, rot = 0) => {
    const f = track.getFrameAt(u);
    const g = new THREE.PlaneGeometry(w, l);
    const r = atlas.rect(cellIdx);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, r[0] + uv.getX(k) * (r[2] - r[0]), r[1] + uv.getY(k) * (r[3] - r[1]));
    if (rot) g.rotateZ(rot);
    const m = new THREE.Matrix4().makeBasis(f.right, f.tangent, f.normal);
    m.setPosition(f.point.clone().addScaledVector(f.right, lat).addScaledVector(f.normal, 0.025));
    g.applyMatrix4(m);
    list.push(g);
  };
  const rand = rng(city.id.length * 977 + city.name.charCodeAt(0));
  const isPad = (u) => track.boostPadsU.some((p) => Math.abs(((u - p + 1.5) % 1) - 0.5) < 0.02);
  const nearStart = (u) => u < 0.035 || u > 0.985;
  // centre lane dashes on the straights (3 units of paint, 6 units gap)
  for (let d = 0; d < lap; d += 9) {
    const u = d / lap;
    const i = Math.floor(u * N);
    if (corner(i) || nearStart(u) || isPad(u)) continue;
    decal(paint, u, 0, 0.16, 3, 1);
  }
  // zebra crossings on the two longest straights
  const straightUs = [];
  for (let i = 0; i < N; i += 4) if (!corner(i) && !corner(i + 12) && !corner(i - 12) && ground(i)) straightUs.push(i / N);
  const crossings = [];
  for (const u of straightUs) {
    if (crossings.length >= 3) break;
    if (nearStart(u) || isPad(u) || crossings.some((c) => Math.abs(c - u) < 0.12)) continue;
    crossings.push(u);
    for (let k = -6; k <= 6; k++) decal(paint, u, k * 1.12, 0.62, 3.2, 0, 0);
  }
  // turn arrows before corners
  for (let i = 0; i < N; i++) {
    if (corner(i + 10) && !corner(i + 9) && !corner(i) && ground(i)) {
      const u = i / N;
      if (nearStart(u) || isPad(u)) continue;
      decal(paint, u, -3.6, 1.2, 2.6, 3);
      decal(paint, u, 3.6, 1.2, 2.6, 3);
    }
  }
  // manholes and repairs, off the racing line
  for (let k = 0; k < 16; k++) {
    const u = rand();
    if (nearStart(u) || isPad(u)) continue;
    const lat = (rand() < 0.5 ? -1 : 1) * (2 + rand() * 4.5);
    if (k % 2) decal(paint, u, lat, 0.9, 0.9, 2);
    else decal(grime, u, lat * 0.6, 2 + rand() * 3, 2.5 + rand() * 5, 4, rand() * 0.3);
  }
  // braking skid marks and oil before each corner
  for (let i = 0; i < N; i++) {
    if (corner(i + 6) && !corner(i + 5) && ground(i)) {
      for (let k = 0; k < 3; k++) {
        const u = (i - k * 3 - 2) / N;
        decal(grime, ((u % 1) + 1) % 1, (rand() - 0.5) * 7, 1.6, 6 + rand() * 6, 5, (rand() - 0.5) * 0.12);
      }
      decal(grime, i / N, (rand() - 0.5) * 6, 2.6, 2.6, 6);
    }
  }
  const bake = (list, mat) => {
    if (!list.length) return;
    const geos = list.map((g) => g.toNonIndexed());
    const merged = new THREE.BufferGeometry();
    const total = geos.reduce((a, g) => a + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3);
      nrm.set(g.attributes.normal.array, o * 3);
      uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = new THREE.Mesh(merged, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    group.add(m);
  };
  bake(paint, paintMat);
  bake(grime, grimeMat);
}
