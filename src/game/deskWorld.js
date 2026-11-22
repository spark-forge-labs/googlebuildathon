import * as THREE from 'three';
import { buildCityBridge, buildCityLandmarks } from './cityLandmarks.js';
import { buildRealWorld, updateTreeWind, weatherLandmarkMaterials } from './realWorld.js';
import { mergeStaticMeshes } from './staticMerge.js';

export const DESK_HALF_W = 110;
export const DESK_HALF_D = 75;

function createWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const baseGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  baseGrad.addColorStop(0, '#6e472b');
  baseGrad.addColorStop(0.35, '#7c5132');
  baseGrad.addColorStop(0.7, '#684126');
  baseGrad.addColorStop(1, '#5a361e');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 420; i++) {
    const y = Math.random() * 1024;
    const h = 1 + Math.random() * 5;
    const dark = Math.random() > 0.4;
    ctx.fillStyle = dark
      ? `rgba(42, 22, 10, ${0.06 + Math.random() * 0.14})`
      : `rgba(176, 122, 74, ${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(0, y, 1024, h);
  }

  ctx.strokeStyle = 'rgba(30, 15, 6, 0.25)';
  ctx.lineWidth = 2;
  for (let y = 128; y < 1024; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  for (let i = 0; i < 6; i++) {
    const kx = 120 + Math.random() * 780;
    const ky = 100 + Math.random() * 820;
    const rx = 28 + Math.random() * 45;
    const ry = 8 + Math.random() * 14;
    ctx.save();
    ctx.translate(kx, ky);
    for (let r = 1; r <= 4; r++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * (r / 4), ry * (r / 4), 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(38, 18, 8, ${0.22 - r * 0.04})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1.5);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSignTexture(title, subtitle, bg = '#0f203c', accent = '#f7c948', textColor = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 176);

  ctx.fillStyle = accent;
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(subtitle, 256, 60);

  ctx.fillStyle = textColor;
  ctx.font = '900 44px sans-serif';
  ctx.fillText(title, 256, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRulerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e7c27d';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = 'rgba(130, 82, 34, 0.14)';
  for (let i = 0; i < 20; i++) ctx.fillRect(0, i * 7, 1024, 2);
  ctx.fillStyle = '#241b12';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  const totalCm = 30;
  const step = 1024 / totalCm;
  for (let i = 0; i <= totalCm; i++) {
    const x = i * step;
    ctx.fillRect(x - 1.5, 0, 3, 42);
    if (i > 0 && i < totalCm) ctx.fillText(String(i), x, 72);
    if (i < totalCm) ctx.fillRect(x + step * 0.5 - 1, 0, 2, 26);
  }
  ctx.fillStyle = '#5a3a18';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('INDIA GP EDITION • 30 CM', 512, 108);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStickyNoteTexture(text, bg = '#fde047') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, 0, 256, 36);
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 28px "Comic Sans MS", cursive, sans-serif';
  ctx.textAlign = 'center';
  text.split('\n').forEach((line, idx) => ctx.fillText(line, 128, 102 + idx * 40));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLaptopScreenTexture(city) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 1024, 640);
  grad.addColorStop(0, '#0b132b');
  grad.addColorStop(1, '#1c2541');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 640);

  ctx.fillStyle = '#070c1a';
  ctx.fillRect(0, 0, 1024, 42);
  ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(28 + i * 24, 21, 7, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`india-desk-gp — ${city.name.toUpperCase()} LIVE TELEMETRY`, 120, 27);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(28, 66, 460, 535);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 66, 460, 535);

  const codeLines = [
    `// ${city.name} Desk Circuit v2.0`,
    `const city = "${city.name.toUpperCase()}";`,
    `const native = "${city.nativeName}";`,
    `const boost = "${city.nitroName}";`,
    'const sensors = {',
    '  mobileGyro: "STEERING_WHEEL",',
    '  suspension: "REALTIME_60FPS",',
    '  skidMarks: true,',
    '};',
    '',
    'function launchRace() {',
    '  engageClearcoatReflections();',
    `  return "${city.name.toUpperCase()} GP LIVE!";`,
    '}',
  ];
  ctx.font = '20px monospace';
  codeLines.forEach((line, idx) => {
    ctx.fillStyle = idx === 0 ? '#64748b' : idx % 3 === 0 ? city.badgeColor : '#f8fafc';
    ctx.fillText(line, 48, 114 + idx * 34);
  });

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(512, 66, 484, 535);
  ctx.strokeStyle = city.badgeColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(512, 66, 484, 535);

  ctx.fillStyle = '#f7c948';
  ctx.font = '900 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${city.name.toUpperCase()} GP`, 754, 155);

  ctx.fillStyle = '#18d6c4';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`${city.nativeName} • CIRCUIT`, 754, 210);

  ctx.strokeStyle = city.badgeColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let x = 550; x <= 958; x += 12) {
    const y = 370 + Math.sin(x * 0.04) * 55 + Math.cos(x * 0.09) * 24;
    if (x === 550) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`FUEL: ${city.nitroName}`, 754, 520);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBookSpineTexture(title, bg, fg = '#f8e6b8') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.fillRect(24, 14, 464, 5);
  ctx.fillRect(24, 109, 464, 5);
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class DeskWorld {
  constructor(scene, track, city) {
    this.scene = scene;
    this.track = track;
    this.city = city;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.colliders = [];
    this.bridgeCables = [];
    this.waterMeshes = [];
    this.rotatingBeacons = [];
    this.gantryLights = [];
    // Real-world mode: no desk, no mug steam
    this.mugSteamOrigin = null;


    const animTargets = {
      bridgeCables: this.bridgeCables,
      waterMeshes: this.waterMeshes,
      rotatingBeacons: this.rotatingBeacons,
    };
    buildCityBridge(city, track, this.group, animTargets);
    const cityColliders = buildCityLandmarks(city, this.group, animTargets);
    this.colliders.push(...cityColliders);

    weatherLandmarkMaterials(this.group);

    // Real-world surroundings, kept clear of landmarks and water
    const avoid = this.colliders.map((c) => ({ x: c.x, z: c.z, r: c.radius + 2 }));
    for (const w of this.waterMeshes) {
      if (!w.geometry.boundingSphere) w.geometry.computeBoundingSphere();
      avoid.push({ x: w.position.x, z: w.position.z, r: w.geometry.boundingSphere.radius * Math.max(w.scale.x, w.scale.z) + 3 });
    }
    const realAnim = buildRealWorld(this.group, city, track, avoid);
    this.waterMeshes.push(...realAnim.water);

    this.buildStartGantryAndBillboards();
    this.buildStreetLampsAndTrees();

    // Bake static landmark/bridge/street meshes into a few draw calls (animated parts stay separate)
    const dynamic = new Set([...this.waterMeshes, ...this.rotatingBeacons, ...this.gantryLights]);
    for (const c of this.bridgeCables) dynamic.add(c.mesh);
    this.mergeStats = mergeStaticMeshes(this.group, dynamic);
  }

  dispose() {
    this.scene.remove(this.group);
    // Shared resources (tree variants, facades, ground textures) survive city switches
    this.group.traverse((obj) => {
      if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
      if (obj.isInstancedMesh) obj.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m.userData.shared) return;
          for (const k of ['map', 'emissiveMap', 'roughnessMap', 'normalMap', 'bumpMap']) {
            if (m[k] && !m[k].userData.shared) m[k].dispose();
          }
          m.dispose();
        });
      }
    });
  }

  addCollider(x, z, radius) {
    this.colliders.push({ x, z, radius });
  }

  buildDeskAndRoom() {
    const woodTex = createWoodTexture();
    const deskTopMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.48,
      metalness: 0.08,
    });
    const deskSideMat = new THREE.MeshStandardMaterial({ color: 0x452815, roughness: 0.65 });

    const deskTop = new THREE.Mesh(
      new THREE.BoxGeometry(DESK_HALF_W * 2, 6, DESK_HALF_D * 2),
      [deskSideMat, deskSideMat, deskTopMat, deskSideMat, deskSideMat, deskSideMat]
    );
    deskTop.position.set(0, -3, 0);
    deskTop.receiveShadow = true;
    this.group.add(deskTop);

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2a1b10, roughness: 0.42, metalness: 0.25 });
    const frontRim = new THREE.Mesh(new THREE.BoxGeometry(DESK_HALF_W * 2 + 1.2, 6.4, 1.2), edgeMat);
    frontRim.position.set(0, -3, DESK_HALF_D + 0.5);
    this.group.add(frontRim);
    const backRim = frontRim.clone();
    backRim.position.z = -(DESK_HALF_D + 0.5);
    this.group.add(backRim);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.4, metalness: 0.7 });
    const legGeo = new THREE.BoxGeometry(6, 95, 6);
    for (const lx of [-98, 98]) {
      for (const lz of [-64, 64]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, -52, lz);
        this.group.add(leg);
      }
    }

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(750, 750),
      new THREE.MeshStandardMaterial({ color: 0x1a1e2a, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -98;
    this.group.add(floor);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(720, 340),
      new THREE.MeshStandardMaterial({ color: this.city.skyBottom, roughness: 0.95 })
    );
    backWall.position.set(0, 50, -165);
    this.group.add(backWall);

    const winFrame = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 80),
      new THREE.MeshBasicMaterial({ color: this.city.skyTop })
    );
    winFrame.position.set(130, 68, -163);
    this.group.add(winFrame);
  }

  buildDeskProps() {
    // 1. GIANT OPEN LAPTOP displaying live selected city telemetry!
    const laptop = new THREE.Group();
    laptop.position.set(-18, 0, -61);
    const aluMat = new THREE.MeshStandardMaterial({ color: 0xb9c2cf, roughness: 0.25, metalness: 0.85 });
    const keyMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.7 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(46, 1.3, 24), aluMat);
    base.position.set(0, 0.65, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    laptop.add(base);

    const kbWell = new THREE.Mesh(new THREE.BoxGeometry(39, 0.2, 13.5), keyMat);
    kbWell.position.set(0, 1.35, -2.5);
    laptop.add(kbWell);

    const trackpad = new THREE.Mesh(
      new THREE.BoxGeometry(13, 0.14, 7),
      new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.35, metalness: 0.7 })
    );
    trackpad.position.set(0, 1.34, 7.2);
    laptop.add(trackpad);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 1.3, -11.6);
    lidPivot.rotation.x = -0.22;

    const lidBack = new THREE.Mesh(new THREE.BoxGeometry(46, 30, 0.9), aluMat);
    lidBack.position.set(0, 15, 0);
    lidBack.castShadow = true;
    lidPivot.add(lidBack);

    const screenBezel = new THREE.Mesh(new THREE.BoxGeometry(44.5, 28.5, 0.15), keyMat);
    screenBezel.position.set(0, 15, 0.45);
    lidPivot.add(screenBezel);

    const screenTex = createLaptopScreenTexture(this.city);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(42.5, 26.2),
      new THREE.MeshStandardMaterial({
        map: screenTex,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: screenTex,
        emissiveIntensity: 0.72,
        roughness: 0.18,
      })
    );
    screen.position.set(0, 15, 0.56);
    lidPivot.add(screen);

    laptop.add(lidPivot);
    this.group.add(laptop);
    this.addCollider(-18, -61, 14);

    // 2. GIANT ARTICULATED DESK LAMP
    const lamp = new THREE.Group();
    lamp.position.set(-94, 0, -56);
    lamp.rotation.y = 0.65;
    const lampMetal = new THREE.MeshStandardMaterial({ color: 0x262c38, roughness: 0.35, metalness: 0.82 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a043, roughness: 0.25, metalness: 0.85 });

    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.5, 2.2, 24), lampMetal);
    lampBase.position.y = 1.1;
    lampBase.castShadow = true;
    lamp.add(lampBase);

    const lowerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 32, 12), lampMetal);
    lowerArm.position.set(4, 16, 0);
    lowerArm.rotation.z = -0.25;
    lowerArm.castShadow = true;
    lamp.add(lowerArm);

    const joint = new THREE.Mesh(new THREE.SphereGeometry(1.7, 14, 14), brassMat);
    joint.position.set(8, 31, 0);
    lamp.add(joint);

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 28, 12), lampMetal);
    upperArm.position.set(19, 39, 0);
    upperArm.rotation.z = -1.05;
    upperArm.castShadow = true;
    lamp.add(upperArm);

    const shade = new THREE.Mesh(new THREE.ConeGeometry(8.5, 10, 24, 1, true), lampMetal);
    shade.position.set(31, 44, 0);
    shade.rotation.z = 0.35;
    shade.material.side = THREE.DoubleSide;
    lamp.add(shade);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff0c4 }));
    bulb.position.set(30, 42, 0);
    lamp.add(bulb);
    this.group.add(lamp);
    this.addCollider(-94, -56, 9.5);

    // 3. GIANT STEAMING CHAI / COFFEE CERAMIC MUG
    const mugGroup = new THREE.Group();
    mugGroup.position.set(this.city.mugPos.x, 0, this.city.mugPos.z);
    const coaster = new THREE.Mesh(
      new THREE.CylinderGeometry(9.2, 9.4, 0.55, 28),
      new THREE.MeshStandardMaterial({ color: 0xa47551, roughness: 0.88 })
    );
    coaster.position.y = 0.27;
    coaster.receiveShadow = true;
    mugGroup.add(coaster);

    const mugMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.18, metalness: 0.08 });
    const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.2, 13.5, 28), mugMat);
    mugBody.position.y = 7.2;
    mugBody.castShadow = true;
    mugBody.receiveShadow = true;
    mugGroup.add(mugBody);

    const mugBand = new THREE.Mesh(
      new THREE.CylinderGeometry(6.68, 6.64, 2.2, 28, 1, true),
      new THREE.MeshStandardMaterial({ color: this.city.accentHex, roughness: 0.3 })
    );
    mugBand.position.y = 8.5;
    mugGroup.add(mugBand);

    const chaiSurface = new THREE.Mesh(
      new THREE.CircleGeometry(6.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x9b5526, roughness: 0.12, metalness: 0.15 })
    );
    chaiSurface.rotation.x = -Math.PI / 2;
    chaiSurface.position.y = 13.98;
    mugGroup.add(chaiSurface);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.82, 12, 24, Math.PI), mugMat);
    handle.position.set(6.4, 7.6, 0);
    handle.rotation.z = -Math.PI / 2;
    handle.castShadow = true;
    mugGroup.add(handle);

    this.group.add(mugGroup);
    this.addCollider(this.city.mugPos.x, this.city.mugPos.z, 9.2);

    // 4. GIANT WOODEN RULER along Start/Finish Straight
    const rulerTex = createRulerTexture();
    const rulerSide = new THREE.MeshStandardMaterial({ color: 0xc99c58, roughness: 0.6 });
    const rulerTop = new THREE.MeshStandardMaterial({ map: rulerTex, roughness: 0.48 });
    const ruler = new THREE.Mesh(
      new THREE.BoxGeometry(82, 0.8, 7.2),
      [rulerSide, rulerSide, rulerTop, rulerSide, rulerSide, rulerSide]
    );
    ruler.position.set(4, 0.4, 62);
    ruler.rotation.y = 0.015;
    ruler.castShadow = true;
    ruler.receiveShadow = true;
    this.group.add(ruler);

    // 5. HARDCOVER BOOKS supporting bridge ramps + corner stacks
    const buildBook = (x, y, z, w, h, d, rotY, colorHex, title) => {
      const bookGroup = new THREE.Group();
      bookGroup.position.set(x, y + h / 2, z);
      bookGroup.rotation.y = rotY;
      const coverMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.65 });
      const pagesMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.85 });
      const spineMat = new THREE.MeshStandardMaterial({
        map: createBookSpineTexture(title, '#' + colorHex.toString(16).padStart(6, '0')),
        roughness: 0.6,
      });
      const bookMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        [pagesMat, pagesMat, coverMat, coverMat, spineMat, pagesMat]
      );
      bookMesh.castShadow = true;
      bookMesh.receiveShadow = true;
      bookGroup.add(bookMesh);
      this.group.add(bookGroup);
    };

    for (const b of this.city.bookRamps) {
      buildBook(b.x, 0, b.z, 22, 2.5, 19, b.rotY, b.color, b.title);
    }
    buildBook(-94, 0, -14, 24, 3.6, 30, 0.14, 0x14532d, 'ATLAS OF INDIA');
    buildBook(-93, 3.6, -13, 21, 3.2, 26, -0.08, 0x7f1d1d, 'GRAND PRIX GUIDE');
    this.addCollider(-94, -14, 15);

    // 6. SMARTPHONE on east desk edge
    const phone = new THREE.Group();
    phone.position.set(97, 0.55, 12);
    phone.rotation.y = -0.18;
    const phoneBody = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 1.0, 22.5),
      new THREE.MeshStandardMaterial({ color: 0x1b202b, roughness: 0.2, metalness: 0.85 })
    );
    phoneBody.castShadow = true;
    phone.add(phoneBody);
    const phoneScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(10.2, 20.8),
      new THREE.MeshStandardMaterial({
        map: createSignTexture(this.city.name.toUpperCase(), 'GYRO WHEEL • 5G', '#0d1b2a', this.city.badgeColor),
        emissive: 0x0b2538,
        emissiveIntensity: 0.65,
        roughness: 0.15,
      })
    );
    phoneScreen.rotation.x = -Math.PI / 2;
    phoneScreen.position.y = 0.53;
    phone.add(phoneScreen);
    this.group.add(phone);

    // 7. PENCILS, ERASER & CITY-THEMED STICKY NOTES
    const buildPencil = (x, z, rotY, colorHex) => {
      const p = new THREE.Group();
      p.position.set(x, 0.72, z);
      p.rotation.y = rotY;
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 26, 6),
        new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 })
      );
      shaft.rotation.z = Math.PI / 2;
      shaft.castShadow = true;
      p.add(shaft);
      const woodTip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.8, 6), new THREE.MeshStandardMaterial({ color: 0xe8c391, roughness: 0.7 }));
      woodTip.rotation.z = -Math.PI / 2;
      woodTip.position.x = 14.4;
      p.add(woodTip);
      const lead = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x1f242d }));
      lead.rotation.z = -Math.PI / 2;
      lead.position.x = 15.6;
      p.add(lead);
      const eraserCap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 2.0, 10), new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.8 }));
      eraserCap.rotation.z = Math.PI / 2;
      eraserCap.position.x = -13.8;
      p.add(eraserCap);
      this.group.add(p);
    };
    buildPencil(-66, 62, 0.18, 0xf59e0b);
    buildPencil(76, 58, -0.35, 0x0ea5e9);

    const eraser = new THREE.Group();
    eraser.position.set(95, 1.1, 46);
    eraser.rotation.y = 0.42;
    const ePink = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 4.4), new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.85 }));
    ePink.position.x = -1.6;
    ePink.castShadow = true;
    eraser.add(ePink);
    const eBlue = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 4.4), new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.85 }));
    eBlue.position.x = 2.8;
    eBlue.castShadow = true;
    eraser.add(eBlue);
    this.group.add(eraser);

    const addSticky = (x, z, rotY, text, color) => {
      const note = new THREE.Mesh(
        new THREE.PlaneGeometry(12.5, 12.5),
        new THREE.MeshStandardMaterial({ map: createStickyNoteTexture(text, color), roughness: 0.8 })
      );
      note.rotation.x = -Math.PI / 2;
      note.rotation.z = rotY;
      note.position.set(x, 0.08, z);
      note.receiveShadow = true;
      this.group.add(note);
    };
    const [n0, n1, n2] = this.city.stickyNotes;
    addSticky(-92, 54, 0.16, n0, '#fde047');
    addSticky(64, 62, -0.14, n1, '#fda4af');
    addSticky(-56, -58, 0.22, n2, '#86efac');
  }

  buildStartGantryAndBillboards() {
    const sf = this.track.getFrameAt(0.0);
    const gantry = new THREE.Group();
    gantry.position.copy(sf.point);
    const gantryX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sf.tangent).normalize();
    const gantryZ = new THREE.Vector3().crossVectors(gantryX, new THREE.Vector3(0, 1, 0)).normalize();
    const basis = new THREE.Matrix4().makeBasis(gantryX, new THREE.Vector3(0, 1, 0), gantryZ);
    gantry.quaternion.setFromRotationMatrix(basis);

    const trussMat = new THREE.MeshStandardMaterial({ color: 0x263042, roughness: 0.38, metalness: 0.78 });
    for (const sx of [-9.4, 9.4]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 11.4, 1.1), trussMat);
      pillar.position.set(sx, 5.7, 0);
      pillar.castShadow = true;
      gantry.add(pillar);
    }

    const bannerTex = createSignTexture(
      `${this.city.name.toUpperCase()} GP`,
      `${this.city.nativeName} • START / FINISH`,
      '#0d1b33',
      this.city.badgeColor
    );
    const bannerMat = new THREE.MeshStandardMaterial({
      map: bannerTex,
      emissive: 0xffffff,
      emissiveMap: bannerTex,
      emissiveIntensity: 0.36,
      roughness: 0.4,
    });
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(19.8, 3.6, 0.9),
      [trussMat, trussMat, trussMat, trussMat, bannerMat, bannerMat]
    );
    banner.position.set(0, 9.8, 0);
    banner.castShadow = true;
    gantry.add(banner);

    for (let i = 0; i < 4; i++) {
      const lightMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: 0x220000,
        emissiveIntensity: 1.5,
      });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 12), lightMat);
      lamp.position.set(-3.6 + i * 2.4, 7.6, -0.5);
      gantry.add(lamp);
      this.gantryLights.push(lightMat);
    }
    this.group.add(gantry);

    const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75 });
    for (const b of this.city.billboards) {
      const f = this.track.getFrameAt(b.u);
      const pos = f.point.clone().addScaledVector(f.right, b.side * 12.2);
      const boardGroup = new THREE.Group();
      boardGroup.position.set(pos.x, 0, pos.z);
      const lookTarget = f.point.clone().addScaledVector(f.tangent, -10);
      boardGroup.lookAt(lookTarget.x, 0, lookTarget.z);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 6.2, 8), postMat);
      post.position.y = 3.1;
      boardGroup.add(post);

      const tex = createSignTexture(b.title, b.sub, b.bg, b.acc);
      const faceMat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.3,
      });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(10.5, 4.0, 0.45), [postMat, postMat, postMat, postMat, faceMat, faceMat]);
      sign.position.y = 6.2;
      sign.castShadow = true;
      boardGroup.add(sign);
      this.group.add(boardGroup);
    }
  }

  buildStreetLampsAndTrees() {
    // Trees now come from EZ-Tree in realWorld.js. Real street lights: tapered
    // galvanised pole, curved outreach arm and a flat LED luminaire head.
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x9ea3a8, roughness: 0.45, metalness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.2, emissive: 0xfff3d6, emissiveIntensity: 0.15 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.17, 9.2, 10);
    const baseGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.6, 10);
    const headGeo = new THREE.BoxGeometry(0.42, 0.14, 1.25);
    const lensGeo = new THREE.BoxGeometry(0.34, 0.02, 1.0);

    for (let i = 0; i < 26; i++) {
      const f = this.track.getFrameAt(i / 26);
      if (f.point.y > 1.2) continue;
      const pos = f.point.clone().addScaledVector(f.right, 10.4);
      const lamp = new THREE.Group();
      lamp.position.set(pos.x, 0, pos.z);
      // face the road
      lamp.lookAt(f.point.x, 0, f.point.z);

      const base = new THREE.Mesh(baseGeo, poleMat);
      base.position.y = 0.3;
      lamp.add(base);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 4.6;
      pole.castShadow = true;
      lamp.add(pole);

      const armCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 8.6, 0),
        new THREE.Vector3(0, 9.6, 0.3),
        new THREE.Vector3(0, 9.55, 2.2)
      );
      const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 12, 0.06, 6, false), poleMat);
      arm.castShadow = true;
      lamp.add(arm);

      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(0, 9.5, 2.6);
      head.rotation.x = -0.08;
      head.castShadow = true;
      lamp.add(head);
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, 9.42, 2.62);
      lens.rotation.x = -0.08;
      lamp.add(lens);
      this.group.add(lamp);
    }
  }

  setGantrySignal(state) {
    this.gantryLights.forEach((mat, i) => {
      if (state === 'green') {
        mat.color.setHex(0x22c55e);
        mat.emissive.setHex(0x22c55e);
        mat.emissiveIntensity = 2.4;
      } else if (state === 'red3' || (state === 'red2' && i < 3) || (state === 'red1' && i < 2)) {
        mat.color.setHex(0xef4444);
        mat.emissive.setHex(0xef4444);
        mat.emissiveIntensity = 2.2;
      } else {
        mat.color.setHex(0x222630);
        mat.emissive.setHex(0x111111);
        mat.emissiveIntensity = 0.2;
      }
    });
  }

  update(time, dt = 0.016) {
    updateTreeWind(time);
    const colorA = new THREE.Color(this.city.accentHex);
    const colorB = new THREE.Color(this.city.secondaryHex);
    const colorC = new THREE.Color(0xf7c948);
    const tmp = new THREE.Color();

    for (const c of this.bridgeCables) {
      const wave = (Math.sin(time * 2.1 + c.phase * 1.4) + 1) * 0.5;
      if (wave < 0.5) tmp.lerpColors(colorA, colorB, wave * 2);
      else tmp.lerpColors(colorB, colorC, (wave - 0.5) * 2);
      c.mesh.material.color.setHex(0xe5e7eb);
      if (c.mesh.material.emissive) {
        c.mesh.material.emissive.copy(tmp).multiplyScalar(0.12);
      }
    }

    for (const w of this.waterMeshes) {
      const m = w.material;
      if (m.normalMap) {
        m.normalMap.offset.x = time * 0.012;
        m.normalMap.offset.y = time * 0.008;
      } else if (m.emissive) {
        m.emissiveIntensity = 0.42 + 0.16 * Math.sin(time * 2.6);
      }
    }

    // Rotate Marina & Pondicherry Lighthouse beams smoothly!
    for (const b of this.rotatingBeacons) {
      b.rotation.y += dt * 1.15;
    }
  }
}
