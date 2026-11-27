import * as THREE from 'three';
import { getCityWaypointVectors } from './cities.js';
import { buildStreetCircuit } from './streetCircuit.js';

export const ROAD_WIDTH = 15.0;
export const ROAD_HALF_WIDTH = ROAD_WIDTH * 0.5;
export const TRACK_SAMPLES = 480;

let roadMapsCache = null;

function createRoadMaps() {
  if (roadMapsCache) return roadMapsCache;
  // Realistic weathered circuit asphalt: grey aggregate, rubbered racing line,
  // worn white edge lines. One tile = full road width x ~14 units of length.
  const W = 1024;
  const H = 1024;
  const color = document.createElement('canvas');
  color.width = W;
  color.height = H;
  const ctx = color.getContext('2d');
  const bump = document.createElement('canvas');
  bump.width = bump.height = 512;
  const b = bump.getContext('2d');
  const rough = document.createElement('canvas');
  rough.width = rough.height = 512;
  const r = rough.getContext('2d');

  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  ctx.fillStyle = '#4b4b48';
  ctx.fillRect(0, 0, W, H);
  b.fillStyle = '#7a7a7a';
  b.fillRect(0, 0, 512, 512);
  r.fillStyle = 'rgb(232,232,232)';
  r.fillRect(0, 0, 512, 512);

  // Large-scale tonal variation (wrap-safe: drawn 3x vertically)
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const rad = 30 + rnd() * 140;
    const dark = rnd() > 0.5;
    ctx.globalAlpha = 0.035 + rnd() * 0.06;
    ctx.fillStyle = dark ? '#2e2e2c' : '#6a6a66';
    for (const oy of [-H, 0, H]) {
      ctx.beginPath();
      ctx.ellipse(x, y + oy, rad, rad * (0.5 + rnd()), rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Aggregate stones via direct ImageData pixel writes (~80x faster than 213k fillRect calls)
  const colImg = ctx.getImageData(0, 0, W, H);
  const colData = colImg.data;
  const bumpImg = b.getImageData(0, 0, 512, 512);
  const bumpData = bumpImg.data;
  for (let i = 0; i < 160000; i++) {
    const x = (rnd() * W) | 0;
    const y = (rnd() * H) | 0;
    const v = rnd();
    const g = (v < 0.55 ? 40 + v * 50 : 90 + v * 70) | 0;
    const gb = g > 2 ? g - 2 : 0;
    const sz = rnd() < 0.08 ? 3 : rnd() < 0.5 ? 2 : 1;
    const maxY = y + sz < H ? y + sz : H;
    const maxX = x + sz < W ? x + sz : W;
    for (let py = y; py < maxY; py++) {
      let idx = (py * W + x) << 2;
      for (let px = x; px < maxX; px++) {
        colData[idx] = g;
        colData[idx + 1] = g;
        colData[idx + 2] = gb;
        colData[idx + 3] = 255;
        idx += 4;
      }
    }
    if (i % 3 === 0) {
      const bv = (60 + rnd() * 150) | 0;
      const bx = x >> 1;
      const by = y >> 1;
      const bsz = sz > 1 ? 2 : 1;
      const maxBy = by + bsz < 512 ? by + bsz : 512;
      const maxBx = bx + bsz < 512 ? bx + bsz : 512;
      for (let py = by; py < maxBy; py++) {
        let bidx = (py * 512 + bx) << 2;
        for (let px = bx; px < maxBx; px++) {
          bumpData[bidx] = bv;
          bumpData[bidx + 1] = bv;
          bumpData[bidx + 2] = bv;
          bumpData[bidx + 3] = 255;
          bidx += 4;
        }
      }
    }
  }
  ctx.putImageData(colImg, 0, 0);
  b.putImageData(bumpImg, 0, 0);

  // Hairline cracks and sealed joints
  ctx.strokeStyle = 'rgba(20,20,19,0.55)';
  b.strokeStyle = 'rgb(30,30,30)';
  for (let c = 0; c < 26; c++) {
    let x = 90 + rnd() * (W - 180);
    let y = rnd() * H;
    ctx.lineWidth = 0.8 + rnd() * 1.4;
    b.lineWidth = 1;
    ctx.beginPath();
    b.beginPath();
    ctx.moveTo(x, y);
    b.moveTo(x * 0.5, y * 0.5);
    const steps = 4 + ((rnd() * 6) | 0);
    for (let k = 0; k < steps; k++) {
      x += (rnd() - 0.5) * 50;
      y += (rnd() - 0.3) * 40;
      ctx.lineTo(x, y);
      b.lineTo(x * 0.5, y * 0.5);
    }
    ctx.stroke();
    b.stroke();
  }

  // Rubbered racing lines (darker, smoother) + oil drip trail in the middle
  for (const gx of [300, 724]) {
    const grad = ctx.createLinearGradient(gx - 150, 0, gx + 150, 0);
    grad.addColorStop(0, 'rgba(18,18,18,0)');
    grad.addColorStop(0.5, 'rgba(18,18,18,0.32)');
    grad.addColorStop(1, 'rgba(18,18,18,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(gx - 150, 0, 300, H);
    const rg = r.createLinearGradient((gx - 130) / 2, 0, (gx + 130) / 2, 0);
    rg.addColorStop(0, 'rgba(160,160,160,0)');
    rg.addColorStop(0.5, 'rgba(160,160,160,0.9)');
    rg.addColorStop(1, 'rgba(160,160,160,0)');
    r.fillStyle = rg;
    r.fillRect((gx - 130) / 2, 0, 130, 512);
  }
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.12 + rnd() * 0.18;
    ctx.fillStyle = '#1a1a19';
    ctx.beginPath();
    ctx.ellipse(512 + (rnd() - 0.5) * 60, rnd() * H, 4 + rnd() * 10, 6 + rnd() * 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Worn white edge lines (~0.2 units wide, set in from the kerb)
  const lineW = 13;
  for (const lx of [26, W - 26 - lineW]) {
    ctx.fillStyle = 'rgb(232,232,226)';
    ctx.fillRect(lx, 0, lineW, H);
    r.fillStyle = 'rgb(150,150,150)';
    r.fillRect(lx / 2, 0, lineW / 2, 512);
    // wear: let asphalt show through
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(70,70,68,0.55)' : 'rgba(110,110,106,0.4)';
      ctx.fillRect(lx + rnd() * lineW, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 3);
    }
  }

  const make = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 58);
    t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.userData.shared = true;
    return t;
  };
  roadMapsCache = { map: make(color, true), bumpMap: make(bump, false), roughnessMap: make(rough, false) };
  return roadMapsCache;
}

function createGutterTexture() {
  // Concrete drainage gutter: grey slabs with joints, darker where water runs
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8f8c85';
  ctx.fillRect(0, 0, 64, 256);
  for (let k = 0; k < 1100; k++) {
    const v = 105 + Math.random() * 70;
    ctx.fillStyle = `rgba(${v},${v},${v - 6},0.45)`;
    ctx.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let y = 0; y < 256; y += 64) {
    ctx.fillStyle = 'rgba(40,40,38,0.55)';
    ctx.fillRect(0, y, 64, 2);
  }
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(20,20,20,0.35)');
  g.addColorStop(0.45, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 96);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStartFinishTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const sq = 32;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f8fafc' : '#111319';
      ctx.fillRect(x * sq, y * sq, sq, sq);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBoostPadTexture(accentHex, secondaryHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // Painted road chevrons (thermoplastic paint look) on a transparent background
  ctx.clearRect(0, 0, 256, 256);
  const c1 = '#f4f1e8';
  const c2 = '#f2b134';

  for (let i = 0; i < 3; i++) {
    const y = 32 + i * 76;
    ctx.beginPath();
    ctx.moveTo(30, y + 48);
    ctx.lineTo(128, y);
    ctx.lineTo(226, y + 48);
    ctx.lineTo(202, y + 66);
    ctx.lineTo(128, y + 26);
    ctx.lineTo(54, y + 66);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, y, 0, y + 66);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class RaceTrack {
  constructor(city) {
    this.city = city;
    this.boostPadsU = city.boostPadsU;
    this.zones = city.zones;

    const rawWaypoints = getCityWaypointVectors(city);
    this.curve = new THREE.CatmullRomCurve3(rawWaypoints, true, 'catmullrom', 0.45);
    this.totalLength = this.curve.getLength();

    this.samples = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < TRACK_SAMPLES; i++) {
      const u = i / TRACK_SAMPLES;
      const point = this.curve.getPointAt(u);
      if (point.y < 0.16) point.y = 0.16;
      this.samples.push({ u, point, tangent: new THREE.Vector3(), right: new THREE.Vector3(), normal: new THREE.Vector3(), curvature: 0 });
    }

    for (let i = 0; i < TRACK_SAMPLES; i++) {
      const prev = this.samples[(i - 1 + TRACK_SAMPLES) % TRACK_SAMPLES].point;
      const next = this.samples[(i + 1) % TRACK_SAMPLES].point;
      const tangent = new THREE.Vector3().subVectors(next, prev).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const normal = new THREE.Vector3().crossVectors(right, tangent).normalize();
      this.samples[i].tangent = tangent;
      this.samples[i].right = right;
      this.samples[i].normal = normal;
    }

    for (let i = 0; i < TRACK_SAMPLES; i++) {
      const tPrev = this.samples[(i - 4 + TRACK_SAMPLES) % TRACK_SAMPLES].tangent;
      const tNext = this.samples[(i + 4) % TRACK_SAMPLES].tangent;
      const dot = THREE.MathUtils.clamp(tPrev.dot(tNext), -1, 1);
      this.samples[i].curvature = Math.acos(dot);
    }

    this.group = new THREE.Group();
    this.boostPadMeshes = [];
    this.buildGeometry();
  }

  getFrameAt(u) {
    const wrapped = ((u % 1) + 1) % 1;
    const f = wrapped * TRACK_SAMPLES;
    const i0 = Math.floor(f) % TRACK_SAMPLES;
    const i1 = (i0 + 1) % TRACK_SAMPLES;
    const t = f - Math.floor(f);

    const s0 = this.samples[i0];
    const s1 = this.samples[i1];

    const point = new THREE.Vector3().lerpVectors(s0.point, s1.point, t);
    const tangent = new THREE.Vector3().lerpVectors(s0.tangent, s1.tangent, t).normalize();
    const right = new THREE.Vector3().lerpVectors(s0.right, s1.right, t).normalize();
    const normal = new THREE.Vector3().lerpVectors(s0.normal, s1.normal, t).normalize();
    const curvature = THREE.MathUtils.lerp(s0.curvature, s1.curvature, t);
    return { u: wrapped, point, tangent, right, normal, curvature };
  }

  project(pos, hintU = null) {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintU !== null) {
      const center = Math.floor((((hintU % 1) + 1) % 1) * TRACK_SAMPLES);
      const windowHalf = 28;
      for (let d = -windowHalf; d <= windowHalf; d++) {
        const idx = (center + d + TRACK_SAMPLES) % TRACK_SAMPLES;
        const p = this.samples[idx].point;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
      if (bestDistSq > 400) {
        for (let i = 0; i < TRACK_SAMPLES; i++) {
          const p = this.samples[i].point;
          const dx = pos.x - p.x;
          const dz = pos.z - p.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = i;
          }
        }
      }
    } else {
      for (let i = 0; i < TRACK_SAMPLES; i++) {
        const p = this.samples[i].point;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const s = this.samples[bestIdx];
    const relX = pos.x - s.point.x;
    const relZ = pos.z - s.point.z;
    const along = relX * s.tangent.x + relZ * s.tangent.z;
    const du = along / this.totalLength;
    const refinedU = ((s.u + du) % 1 + 1) % 1;
    const frame = this.getFrameAt(refinedU);

    const toCarX = pos.x - frame.point.x;
    const toCarZ = pos.z - frame.point.z;
    const lateral = toCarX * frame.right.x + toCarZ * frame.right.z;

    return {
      u: refinedU,
      frame,
      lateral,
      absLateral: Math.abs(lateral),
      onRoad: Math.abs(lateral) <= ROAD_HALF_WIDTH + 0.85,
    };
  }

  getLandmarkAt(u) {
    const wrapped = ((u % 1) + 1) % 1;
    for (const z of this.zones) {
      if (wrapped >= z.uStart && wrapped < z.uEnd) return z;
    }
    return this.zones[0];
  }

  buildGeometry() {
    const N = TRACK_SAMPLES;
    const halfW = ROAD_HALF_WIDTH;
    const kerbW = 1.05;
    const deckThickness = 0.45;

    // 1. Main High-Detail Asphalt Ribbon Mesh
    const roadPositions = [];
    const roadNormals = [];
    const roadUVs = [];
    const roadIndices = [];

    for (let i = 0; i <= N; i++) {
      const s = this.samples[i % N];
      const v = i / N;
      const leftPt = s.point.clone().addScaledVector(s.right, -halfW);
      const rightPt = s.point.clone().addScaledVector(s.right, halfW);

      roadPositions.push(leftPt.x, leftPt.y, leftPt.z, rightPt.x, rightPt.y, rightPt.z);
      roadNormals.push(s.normal.x, s.normal.y, s.normal.z, s.normal.x, s.normal.y, s.normal.z);
      roadUVs.push(0, v, 1, v);

      if (i < N) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        roadIndices.push(a, b, c, b, d, c);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
    roadGeo.setIndex(roadIndices);

    const { map, bumpMap, roughnessMap } = createRoadMaps();
    const roadMat = new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 0.6,
      roughnessMap,
      roughness: 1.0,
      metalness: 0.0,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    // 2. Concrete gutters along both edges (red/white kerbs are laid over them in the corners) + deck skirt
    const kerbMat = new THREE.MeshStandardMaterial({ map: createGutterTexture(), roughness: 0.85, metalness: 0 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9, metalness: 0 });

    for (const side of [-1, 1]) {
      const kPos = [];
      const kNorm = [];
      const kUV = [];
      const kIdx = [];
      const sPos = [];
      const sIdx = [];

      for (let i = 0; i <= N; i++) {
        const s = this.samples[i % N];
        const v = i / N;
        const inner = s.point.clone().addScaledVector(s.right, side * halfW);
        const outer = s.point.clone().addScaledVector(s.right, side * (halfW + kerbW));
        outer.y += 0.09;

        if (side === -1) {
          kPos.push(outer.x, outer.y, outer.z, inner.x, inner.y, inner.z);
        } else {
          kPos.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
        }
        kNorm.push(s.normal.x, s.normal.y, s.normal.z, s.normal.x, s.normal.y, s.normal.z);
        kUV.push(0, v, 1, v);

        const bottomY = Math.max(0.0, outer.y - (outer.y > 1.2 ? deckThickness + 0.4 : outer.y));
        if (side === 1) {
          sPos.push(outer.x, outer.y, outer.z, outer.x, bottomY, outer.z);
        } else {
          sPos.push(outer.x, bottomY, outer.z, outer.x, outer.y, outer.z);
        }

        if (i < N) {
          const a = i * 2;
          const b = a + 1;
          const c = a + 2;
          const d = a + 3;
          kIdx.push(a, b, c, b, d, c);
          sIdx.push(a, b, c, b, d, c);
        }
      }

      const kGeo = new THREE.BufferGeometry();
      kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kPos, 3));
      kGeo.setAttribute('normal', new THREE.Float32BufferAttribute(kNorm, 3));
      kGeo.setAttribute('uv', new THREE.Float32BufferAttribute(kUV, 2));
      kGeo.setIndex(kIdx);
      const kMesh = new THREE.Mesh(kGeo, kerbMat);
      kMesh.receiveShadow = true;
      kMesh.castShadow = true;
      this.group.add(kMesh);

      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
      sGeo.setIndex(sIdx);
      sGeo.computeVertexNormals();
      const sMesh = new THREE.Mesh(sGeo, skirtMat);
      sMesh.castShadow = true;
      sMesh.receiveShadow = true;
      this.group.add(sMesh);
    }

    // 3. Underside of Elevated Bridge Deck
    const underPos = [];
    const underIdx = [];
    for (let i = 0; i <= N; i++) {
      const s = this.samples[i % N];
      const yUnder = Math.max(0.02, s.point.y - deckThickness);
      const left = s.point.clone().addScaledVector(s.right, -(halfW + kerbW));
      const right = s.point.clone().addScaledVector(s.right, halfW + kerbW);
      underPos.push(right.x, yUnder, right.z, left.x, yUnder, left.z);
      if (i < N) {
        const a = i * 2;
        underIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const underGeo = new THREE.BufferGeometry();
    underGeo.setAttribute('position', new THREE.Float32BufferAttribute(underPos, 3));
    underGeo.setIndex(underIdx);
    underGeo.computeVertexNormals();
    const underMesh = new THREE.Mesh(underGeo, skirtMat);
    underMesh.castShadow = true;
    this.group.add(underMesh);

    // 4. Reflective Cat's-Eye Road Studs along the highway edges (InstancedMesh for ultra-high FPS!)
    const studGeo = new THREE.BoxGeometry(0.28, 0.08, 0.28);
    const studMatAmber = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.3, metalness: 0.3 });
    const studMatCyan = new THREE.MeshStandardMaterial({ color: 0xf2b134, roughness: 0.3, metalness: 0.3 });
    const studPositionsAmber = [];
    const studPositionsCyan = [];
    for (let i = 0; i < N; i += 6) {
      const s = this.samples[i];
      const pL = s.point.clone().addScaledVector(s.right, -(halfW - 0.55));
      pL.y += 0.06;
      const pR = s.point.clone().addScaledVector(s.right, halfW - 0.55);
      pR.y += 0.06;
      if (s.curvature > 0.24) {
        studPositionsCyan.push(pL, pR);
      } else {
        studPositionsAmber.push(pL, pR);
      }
    }
    const makeInstancedStuds = (pts, mat) => {
      if (!pts.length) return;
      const inst = new THREE.InstancedMesh(studGeo, mat, pts.length);
      const dummy = new THREE.Object3D();
      pts.forEach((p, idx) => {
        dummy.position.copy(p);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
      });
      this.group.add(inst);
    };
    makeInstancedStuds(studPositionsAmber, studMatAmber);
    makeInstancedStuds(studPositionsCyan, studMatCyan);

    // 5. Metallic Highway Guardrails on elevated sections
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.45, metalness: 0.9 });
    const postGeo = new THREE.BoxGeometry(0.24, 1.05, 0.24);
    for (let i = 0; i < N; i += 4) {
      const s = this.samples[i];
      if (s.point.y > 1.3) {
        for (const side of [-1, 1]) {
          const p = s.point.clone().addScaledVector(s.right, side * (halfW + 0.85));
          const post = new THREE.Mesh(postGeo, railMat);
          post.position.set(p.x, p.y + 0.55, p.z);
          post.castShadow = true;
          this.group.add(post);
        }
      }
    }
    for (const side of [-1, 1]) {
      const railPts = [];
      for (let i = 0; i < N; i++) {
        const s = this.samples[i];
        if (s.point.y > 1.25) {
          const p = s.point.clone().addScaledVector(s.right, side * (halfW + 0.85));
          p.y += 1.02;
          railPts.push(p);
        }
      }
      if (railPts.length > 4) {
        const railCurve = new THREE.CatmullRomCurve3(railPts, false);
        const railMesh = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 80, 0.14, 6, false), railMat);
        railMesh.castShadow = true;
        this.group.add(railMesh);
      }
    }

    // 6. Start / Finish Checkered Strip + Painted Staggered F1/GT Starting Grid Boxes
    const sfFrame = this.getFrameAt(0.0);
    const sfMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, 3.8),
      new THREE.MeshStandardMaterial({ map: createStartFinishTexture(), roughness: 0.55 })
    );
    sfMesh.position.copy(sfFrame.point).addScaledVector(sfFrame.normal, 0.05);
    const sfBasis = new THREE.Matrix4().makeBasis(sfFrame.right, sfFrame.tangent, sfFrame.normal);
    sfMesh.quaternion.setFromRotationMatrix(sfBasis);
    sfMesh.receiveShadow = true;
    this.group.add(sfMesh);

    // Painted white starting grid brackets behind Start/Finish line (P1..P6)
    const gridLineMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d3, roughness: 0.6 });
    for (let slot = 0; slot < 6; slot++) {
      const row = Math.floor(slot / 2);
      const col = slot % 2 === 0 ? -1 : 1;
      const su = (1 - 0.015 - row * 0.017) % 1;
      const gf = this.getFrameAt(su);
      const boxGroup = new THREE.Group();
      const frontBar = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.24), gridLineMat);
      frontBar.position.set(0, 2.35, 0);
      boxGroup.add(frontBar);
      for (const sx of [-1.3, 1.3]) {
        const sideBar = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.6), gridLineMat);
        sideBar.position.set(sx, 1.65, 0);
        boxGroup.add(sideBar);
      }
      boxGroup.position.copy(gf.point).addScaledVector(gf.right, col * 3.1).addScaledVector(gf.normal, 0.055);
      boxGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(gf.right, gf.tangent, gf.normal));
      this.group.add(boxGroup);
    }

    // FIA Red-and-White Apex Rumble Strips & Outer Corner Safety Chevron Barriers!
    const apexRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 });
    const apexWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });
    const chevronGeo = new THREE.BoxGeometry(1.5, 1.15, 0.26);
    const apexBlockGeo = new THREE.BoxGeometry(1.05, 0.14, 1.5);
    let apexToggle = false;
    for (let i = 0; i < N; i += 3) {
      const s = this.samples[i];
      if (s.curvature > 0.22 && s.point.y < 1.1) {
        apexToggle = !apexToggle;
        const m = new THREE.Matrix4().makeBasis(s.right.clone().negate(), s.normal, s.tangent);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        for (const side of [-1, 1]) {
          const block = new THREE.Mesh(apexBlockGeo, apexToggle ? apexRed : apexWhite);
          block.position.copy(s.point).addScaledVector(s.right, side * (halfW + 0.52));
          block.position.y += 0.09;
          block.quaternion.copy(q);
          block.receiveShadow = true;
          this.group.add(block);
        }
        // (corner chevrons are now painted on the barrier walls — see streetCircuit.js)
        if (s.curvature > 0.30 && i % 6 === 0 && s.point.y > 1.1) {
          const barrier = new THREE.Mesh(chevronGeo, apexToggle ? apexRed : apexWhite);
          barrier.position.copy(s.point).addScaledVector(s.right, halfW + 2.35);
          barrier.position.y += 0.62;
          barrier.quaternion.copy(q);
          this.group.add(barrier);
        }
      }
    }

    // Street-circuit dressing: walls, catch fences, corner kerbs, footpaths, road markings
    buildStreetCircuit(this, this.group, this.city, halfW, kerbW);

    // 7. Glowing Boost Pads
    const padTex = createBoostPadTexture(this.city.accentHex, this.city.secondaryHex);
    const padGeo = new THREE.PlaneGeometry(4.4, 7.2);
    for (const padU of this.boostPadsU) {
      const f = this.getFrameAt(padU);
      const padMat = new THREE.MeshStandardMaterial({
        map: padTex,
        emissive: new THREE.Color(this.city.secondaryHex),
        emissiveMap: padTex,
        emissiveIntensity: 0.25,
        roughness: 0.6,
        transparent: true,
        opacity: 0.85,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.copy(f.point).addScaledVector(f.normal, 0.06);
      const m = new THREE.Matrix4().makeBasis(f.right, f.tangent, f.normal);
      pad.quaternion.setFromRotationMatrix(m);
      this.group.add(pad);
      this.boostPadMeshes.push({ u: padU, mesh: pad, pos: f.point.clone() });
    }
  }

  update(time) {
    const pulse = 0.18 + 0.12 * Math.sin(time * 4.0);
    for (const pad of this.boostPadMeshes) {
      pad.mesh.material.emissiveIntensity = pulse;
    }
  }
}
