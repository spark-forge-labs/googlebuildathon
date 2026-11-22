import * as THREE from 'three';
import { getCityWaypointVectors } from './cities.js';

export const ROAD_WIDTH = 15.0;
export const ROAD_HALF_WIDTH = ROAD_WIDTH * 0.5;
export const TRACK_SAMPLES = 480;

function createRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Deep realistic dark tarmac base
  ctx.fillStyle = '#20232b';
  ctx.fillRect(0, 0, 1024, 1024);

  // Fine asphalt aggregate micro-grain
  for (let i = 0; i < 42000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const v = 22 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle asphalt weathering & micro-cracks
  ctx.strokeStyle = 'rgba(12, 14, 18, 0.35)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 18; c++) {
    let cx = 80 + Math.random() * 860;
    let cy = Math.random() * 1024;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (Math.random() - 0.5) * 44;
      cy += 18 + Math.random() * 28;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Realistic rubberized racing line grooves in both lanes
  for (const gx of [290, 734]) {
    const groove = ctx.createLinearGradient(gx - 120, 0, gx + 120, 0);
    groove.addColorStop(0, 'rgba(8,10,14,0)');
    groove.addColorStop(0.5, 'rgba(8,10,14,0.34)');
    groove.addColorStop(1, 'rgba(8,10,14,0)');
    ctx.fillStyle = groove;
    ctx.fillRect(gx - 120, 0, 240, 1024);
  }

  // Crisp outer Indian expressway solid amber-gold shoulder lines
  ctx.fillStyle = '#f5be36';
  ctx.fillRect(42, 0, 20, 1024);
  ctx.fillRect(1024 - 62, 0, 20, 1024);

  // Subtle white inner rumble line
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(72, 0, 6, 1024);
  ctx.fillRect(1024 - 78, 0, 6, 1024);

  // Crisp center dashed white highway lane divider
  ctx.fillStyle = 'rgba(248, 250, 252, 0.94)';
  for (let y = 24; y < 1024; y += 256) {
    ctx.fillRect(503, y, 18, 128);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 58);
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createKerbTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const stripeH = 64;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f5b82e' : '#181a22';
    ctx.fillRect(0, i * stripeH, 64, stripeH);
  }
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
  ctx.fillStyle = '#0c1424';
  ctx.fillRect(0, 0, 256, 256);

  const c1 = '#' + secondaryHex.toString(16).padStart(6, '0');
  const c2 = '#' + accentHex.toString(16).padStart(6, '0');

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

    const roadMat = new THREE.MeshStandardMaterial({
      map: createRoadTexture(),
      roughness: 0.74,
      metalness: 0.14,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    // 2. Raised Indian Highway Kerbs + Outer Deck Skirt
    const kerbMat = new THREE.MeshStandardMaterial({ map: createKerbTexture(), roughness: 0.62, metalness: 0.08 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x353b47, roughness: 0.75, metalness: 0.2 });

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
    const studMatAmber = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const studMatCyan = new THREE.MeshBasicMaterial({ color: this.city.secondaryHex });
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
    const railMat = new THREE.MeshStandardMaterial({ color: 0xdce4f0, roughness: 0.3, metalness: 0.72 });
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

    // 6. Start / Finish Checkered Strip
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

    // 7. Glowing Boost Pads
    const padTex = createBoostPadTexture(this.city.accentHex, this.city.secondaryHex);
    const padGeo = new THREE.PlaneGeometry(4.4, 7.2);
    for (const padU of this.boostPadsU) {
      const f = this.getFrameAt(padU);
      const padMat = new THREE.MeshStandardMaterial({
        map: padTex,
        emissive: new THREE.Color(this.city.secondaryHex),
        emissiveMap: padTex,
        emissiveIntensity: 0.95,
        roughness: 0.28,
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
    const pulse = 0.78 + 0.35 * Math.sin(time * 6.0);
    for (const pad of this.boostPadMeshes) {
      pad.mesh.material.emissiveIntensity = pulse;
    }
  }
}
