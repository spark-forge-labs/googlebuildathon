import * as THREE from 'three';
import { makeRealWaterMaterial, facadeTextures } from './realWorld.js';

/**
 * Modular 3D Iconic Towers, Monuments & Signature Bridges for all 7 Indian cities.
 * Every landmark sits safely inside cleared plazas/basins on the wooden desk.
 */

function rightHandedRoadQuaternion(tangent) {
  const up = new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const z = new THREE.Vector3().crossVectors(x, up).normalize();
  const mat = new THREE.Matrix4().makeBasis(x, up, z);
  return new THREE.Quaternion().setFromRotationMatrix(mat);
}

/**
 * Shared helper for a shimmering tabletop water basin (Hussain Sagar, Arabian Sea, Hooghly, Bay of Bengal, Yamuna).
 */
function addWaterBasin(group, waterMeshes, x, z, radius, colorHex = 0x0d9488, emissiveHex = 0x074d52, rimColor = 0xb8aa94) {
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.5, 0.95, 10, 40),
    new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.75 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, 0.48, z);
  rim.receiveShadow = true;
  rim.castShadow = true;
  group.add(rim);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.32, 36),
    makeRealWaterMaterial(colorHex)
  );
  water.position.set(x, 0.2, z);
  water.receiveShadow = true;
  group.add(water);
  waterMeshes.push(water);
}

function addTowerSkyscraper(parent, { x, z, w, h, d, color = 0x0f2b5c, accent = 0x38bdf8, spire = false }) {
  const tex = facadeTextures().glass.clone();
  tex.userData = {};
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(0.5, w / 14), Math.max(0.5, h / 14));
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.65),
    roughness: 0.12,
    metalness: 0.65,
    envMapIntensity: 1.3,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.set(x, h / 2, z);
  body.castShadow = true;
  body.receiveShadow = true;
  parent.add(body);

  // Steel crown trim (real towers, no neon bands)
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.3 });

  const crown = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.55, d + 0.35), bandMat);
  crown.position.set(x, h + 0.25, z);
  parent.add(crown);

  if (spire) {
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.42, 6.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 })
    );
    antenna.position.set(x, h + 3.5, z);
    parent.add(antenna);
  }
}

/**
 * Builds the signature elevated bridge for each city.
 */
export function buildCityBridge(city, track, group, animTargets) {
  const { bridgeCables, waterMeshes } = animTargets;
  const bridgeGroup = new THREE.Group();

  // Water beneath bridge (for coastal/lake/river cities)
  if (city.bridgeWaterU !== null && city.bridgeWaterU !== undefined) {
    const fMid = track.getFrameAt(city.bridgeWaterU);
    addWaterBasin(bridgeGroup, waterMeshes, fMid.point.x, fMid.point.z, 16, 0x0e7490, 0x083344, 0x64748b);
  }

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xe5eaf2, roughness: 0.38, metalness: 0.22 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.42, metalness: 0.78 });

  // Support piers beneath elevated spans
  for (let u = 0.54; u <= 0.76; u += 0.045) {
    const f = track.getFrameAt(u);
    if (f.point.y > 1.8) {
      for (const side of [-4.5, 4.5]) {
        const p = f.point.clone().addScaledVector(f.right, side);
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, f.point.y - 0.3, 10), concreteMat);
        pier.position.set(p.x, (f.point.y - 0.3) * 0.5, p.z);
        pier.castShadow = true;
        bridgeGroup.add(pier);
      }
    }
  }

  if (city.bridgeStyle === 'durgam-cable' || city.bridgeStyle === 'sea-link') {
    // Sweeping cable-stayed towers (Durgam Cheruvu or Mumbai Bandra-Worli Sea Link!)
    const isSeaLink = city.bridgeStyle === 'sea-link';
    const pylonH = isSeaLink ? 31 : 26.5;

    for (const pu of city.bridgeUs) {
      const f = track.getFrameAt(pu);
      const pylon = new THREE.Group();
      pylon.position.set(f.point.x, 0, f.point.z);
      pylon.quaternion.copy(rightHandedRoadQuaternion(f.tangent));

      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, pylonH, 2.0), concreteMat);
        leg.position.set(side * (isSeaLink ? 5.6 : 6.8), pylonH * 0.48, 0);
        leg.rotation.z = side * (isSeaLink ? 0.17 : 0.24);
        leg.castShadow = true;
        pylon.add(leg);
      }

      const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.4, 1.6), concreteMat);
      crossBeam.position.set(0, f.point.y - 0.8, 0);
      pylon.add(crossBeam);

      if (isSeaLink) {
        const midCross = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.5, 1.8), concreteMat);
        midCross.position.set(0, pylonH * 0.65, 0);
        pylon.add(midCross);
      }

      const apex = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 2.2), concreteMat);
      apex.position.set(0, pylonH - 0.8, 0);
      apex.castShadow = true;
      pylon.add(apex);
      bridgeGroup.add(pylon);

      const apexWorld = new THREE.Vector3(f.point.x, pylonH - 1.2, f.point.z);
      const cableOffsets = [-0.045, -0.035, -0.025, -0.014, 0.014, 0.025, 0.035, 0.045];
      for (const du of cableOffsets) {
        const anchorFrame = track.getFrameAt(pu + du);
        for (const side of [-1, 1]) {
          const anchor = anchorFrame.point.clone().addScaledVector(anchorFrame.right, side * 8.1);
          anchor.y += 0.35;
          const dir = new THREE.Vector3().subVectors(anchor, apexWorld);
          const cableMat = new THREE.MeshStandardMaterial({
            color: city.secondaryHex,
            emissive: city.accentHex,
            emissiveIntensity: 1.15,
            roughness: 0.25,
          });
          const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, dir.length(), 6), cableMat);
          cable.position.copy(apexWorld).addScaledVector(dir, 0.5);
          cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
          bridgeGroup.add(cable);
          bridgeCables.push({ mesh: cable, phase: pu * 15 + du * 40 + side });
        }
      }
    }
  } else if (city.bridgeStyle === 'howrah-truss') {
    // Iconic Kolkata Howrah Cantilever Steel Truss Bridge!
    const trussSteel = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.8 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    for (const pu of city.bridgeUs) {
      const f = track.getFrameAt(pu);
      const tower = new THREE.Group();
      tower.position.set(f.point.x, 0, f.point.z);
      tower.quaternion.copy(rightHandedRoadQuaternion(f.tangent));

      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 25, 2.2), trussSteel);
        leg.position.set(side * 8.4, 12.5, 0);
        leg.castShadow = true;
        tower.add(leg);
      }
      // Cantilever cross-bracing overhead portals
      for (const y of [15.5, 20.5, 24.2]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(18.2, 1.1, 1.4), trussSteel);
        beam.position.set(0, y, 0);
        tower.add(beam);
      }
      const xBrace1 = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.65, 0.65), trussSteel);
      xBrace1.position.set(0, 18, 0);
      xBrace1.rotation.z = 0.28;
      tower.add(xBrace1);
      const xBrace2 = xBrace1.clone();
      xBrace2.rotation.z = -0.28;
      tower.add(xBrace2);

      // Golden evening illumination strips
      const strip = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.35, 1.6), glowMat);
      strip.position.set(0, 24.8, 0);
      tower.add(strip);
      bridgeGroup.add(tower);

      // Iconic diagonal steel cantilever chords sloping from tower tops to deck!
      const topL = f.point.clone().addScaledVector(f.right, -8.4).setY(24.2);
      const topR = f.point.clone().addScaledVector(f.right, 8.4).setY(24.2);
      for (const du of [-0.042, 0.042]) {
        const af = track.getFrameAt(pu + du);
        for (const [side, topPt] of [[-1, topL], [1, topR]]) {
          const botPt = af.point.clone().addScaledVector(af.right, side * 8.4);
          botPt.y += 1.0;
          const dir = new THREE.Vector3().subVectors(botPt, topPt);
          const chord = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, dir.length(), 6), trussSteel);
          chord.position.copy(topPt).addScaledVector(dir, 0.5);
          chord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
          bridgeGroup.add(chord);
        }
      }
    }
  } else if (city.bridgeStyle === 'signature-delhi') {
    // Iconic Delhi Signature Bridge: dramatic leaning asymmetrical steel pylon!
    const pu = city.bridgeUs[0];
    const f = track.getFrameAt(pu);
    const pylon = new THREE.Group();
    pylon.position.set(f.point.x, 0, f.point.z);
    pylon.quaternion.copy(rightHandedRoadQuaternion(f.tangent));

    const whiteSteel = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.45 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.9, 34, 2.4), whiteSteel);
      leg.position.set(side * 6.5, 15.5, -5.5);
      leg.rotation.x = -0.34; // dramatic iconic Signature Bridge lean!
      leg.rotation.z = side * 0.16;
      leg.castShadow = true;
      pylon.add(leg);
    }
    const crownBox = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 4.4, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.9, roughness: 0.15 })
    );
    crownBox.position.set(0, 31.2, -11.2);
    pylon.add(crownBox);
    bridgeGroup.add(pylon);

    const apexWorld = new THREE.Vector3(0, 30.8, -10.8).applyQuaternion(pylon.quaternion).add(pylon.position);
    for (const du of [-0.045, -0.03, -0.015, 0.015, 0.03, 0.048, 0.065]) {
      const af = track.getFrameAt(pu + du);
      for (const side of [-1, 1]) {
        const anchor = af.point.clone().addScaledVector(af.right, side * 8.1);
        anchor.y += 0.4;
        const dir = new THREE.Vector3().subVectors(anchor, apexWorld);
        const cableMat = new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0xf97316,
          emissiveIntensity: 1.0,
        });
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, dir.length(), 6), cableMat);
        cable.position.copy(apexWorld).addScaledVector(dir, 0.5);
        cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        bridgeGroup.add(cable);
        bridgeCables.push({ mesh: cable, phase: du * 55 + side });
      }
    }
  } else if (city.bridgeStyle === 'napier-arch') {
    // Iconic Chennai Napier Bridge: twin glowing white-and-black bowstring iron arches!
    const archMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35, metalness: 0.45 });
    for (const pu of city.bridgeUs) {
      const f = track.getFrameAt(pu);
      const archGroup = new THREE.Group();
      archGroup.position.set(f.point.x, f.point.y, f.point.z);
      archGroup.quaternion.copy(rightHandedRoadQuaternion(f.tangent));

      for (const side of [-1, 1]) {
        const bow = new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.62, 10, 24, Math.PI), archMat);
        bow.rotation.y = Math.PI / 2;
        bow.position.set(side * 8.3, 0.4, 0);
        bow.castShadow = true;
        archGroup.add(bow);

        for (let h = -6; h <= 6; h += 3) {
          const hangerH = Math.sqrt(Math.max(1, 9.2 * 9.2 - h * h));
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, hangerH, 6), steelMat);
          rod.position.set(side * 8.3, hangerH * 0.5 + 0.3, h);
          archGroup.add(rod);
        }
      }
      const tie = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.65, 0.8), archMat);
      tie.position.set(0, 9.5, 0);
      archGroup.add(tie);
      bridgeGroup.add(archGroup);
    }
  } else if (city.bridgeStyle === 'namma-metro') {
    // Iconic Bangalore Namma Metro Purple/Green glowing elevated viaduct arches!
    const purpleGlow = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
    const greenGlow = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    for (let i = 0; i < 6; i++) {
      const pu = 0.52 + i * 0.036;
      const f = track.getFrameAt(pu);
      const portal = new THREE.Group();
      portal.position.set(f.point.x, f.point.y, f.point.z);
      portal.quaternion.copy(rightHandedRoadQuaternion(f.tangent));

      for (const side of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.9, 10.5, 1.2), concreteMat);
        col.position.set(side * 8.5, 5.2, 0);
        portal.add(col);
      }
      const cap = new THREE.Mesh(new THREE.BoxGeometry(18.2, 1.0, 1.4), concreteMat);
      cap.position.set(0, 10.5, 0);
      portal.add(cap);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.3, 1.5), i % 2 === 0 ? purpleGlow : greenGlow);
      neon.position.set(0, 10.0, 0);
      portal.add(neon);
      bridgeGroup.add(portal);
    }
  } else if (city.bridgeStyle === 'prakasam-barrage') {
    // Iconic Vijayawada Prakasam Barrage over the Krishna River:
    // grand white-and-gold arched sluice portals & glowing crown lamps!
    const barrageWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
    const barrageGold = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.6 });
    const glowBulb = new THREE.MeshBasicMaterial({ color: 0xffe49c });

    for (const pu of city.bridgeUs) {
      const f = track.getFrameAt(pu);
      const portal = new THREE.Group();
      portal.position.set(f.point.x, 0, f.point.z);
      portal.quaternion.copy(rightHandedRoadQuaternion(f.tangent));

      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.8, f.point.y + 10.5, 2.6), barrageWhite);
        pier.position.set(side * 8.6, (f.point.y + 10.5) * 0.5, 0);
        pier.castShadow = true;
        portal.add(pier);

        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 4), barrageGold);
        cap.rotation.y = Math.PI / 4;
        cap.position.set(side * 8.6, f.point.y + 11.7, 0);
        portal.add(cap);

        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), glowBulb);
        orb.position.set(side * 8.6, f.point.y + 13.2, 0);
        portal.add(orb);
      }

      const archBeam = new THREE.Mesh(new THREE.BoxGeometry(18.2, 1.35, 1.8), barrageWhite);
      archBeam.position.set(0, f.point.y + 9.2, 0);
      portal.add(archBeam);
      const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(18.5, 0.35, 2.0), barrageGold);
      goldTrim.position.set(0, f.point.y + 10.0, 0);
      portal.add(goldTrim);
      bridgeGroup.add(portal);
    }
  } else if (city.bridgeStyle === 'vizag-coastal') {
    // Sleek Vizag Bay-of-Bengal Coastal Cable-Arch Skybridge!
    const cyanSteel = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.28, metalness: 0.55 });
    for (const pu of city.bridgeUs) {
      const f = track.getFrameAt(pu);
      const tower = new THREE.Group();
      tower.position.set(f.point.x, 0, f.point.z);
      tower.quaternion.copy(rightHandedRoadQuaternion(f.tangent));

      // Sweeping ocean-wave arch straddling the deck
      const arch = new THREE.Mesh(new THREE.TorusGeometry(9.6, 0.72, 10, 28, Math.PI), cyanSteel);
      arch.position.set(0, f.point.y + 5.2, 0);
      arch.castShadow = true;
      tower.add(arch);

      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, f.point.y + 5.5, 10), cyanSteel);
        leg.position.set(side * 9.5, (f.point.y + 5.5) * 0.5, 0);
        tower.add(leg);
      }
      bridgeGroup.add(tower);

      const apexWorld = new THREE.Vector3(f.point.x, f.point.y + 14.8, f.point.z);
      for (const du of [-0.032, -0.018, 0.018, 0.032]) {
        const af = track.getFrameAt(pu + du);
        for (const side of [-1, 1]) {
          const anchor = af.point.clone().addScaledVector(af.right, side * 8.1);
          anchor.y += 0.4;
          const dir = new THREE.Vector3().subVectors(anchor, apexWorld);
          const cableMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0ea5e9,
            emissiveIntensity: 1.15,
          });
          const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, dir.length(), 6), cableMat);
          cable.position.copy(apexWorld).addScaledVector(dir, 0.5);
          cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
          bridgeGroup.add(cable);
          bridgeCables.push({ mesh: cable, phase: pu * 18 + du * 42 + side });
        }
      }
    }
  } else {
    // Pondicherry Promenade Coastal Pier Bridge with warm Riviera lanterns!
    const lampGlow = new THREE.MeshBasicMaterial({ color: 0xfde68a });
    const ochreMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 });
    for (let u = 0.58; u <= 0.73; u += 0.03) {
      const f = track.getFrameAt(u);
      const pair = new THREE.Group();
      pair.position.set(f.point.x, f.point.y, f.point.z);
      pair.quaternion.copy(rightHandedRoadQuaternion(f.tangent));
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 6.2, 10), ochreMat);
        pillar.position.set(side * 8.5, 3.1, 0);
        pair.add(pillar);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 10), lampGlow);
        lantern.position.set(side * 8.5, 6.6, 0);
        pair.add(lantern);
      }
      bridgeGroup.add(pair);
    }
  }

  group.add(bridgeGroup);
}

/**
 * Builds every city's iconic towers, monuments, and parks.
 * Returns extra colliders [{ x, z, radius }] for solid landmarks.
 */
export function buildCityLandmarks(city, group, animTargets) {
  const colliders = [];
  const { waterMeshes, rotatingBeacons } = animTargets;
  const addCol = (x, z, r) => colliders.push({ x, z, radius: r });

  if (city.id === 'hyderabad') {
    buildCharminar(group, 44, 12);
    addCol(44, 12, 11.5);
    buildHussainSagarBuddha(group, waterMeshes, -5, 11);
    addCol(-5, 11, 18.5);
    buildHitecCyberTowers(group, 78, -52);
    addCol(78, -52, 16);
  } else if (city.id === 'bangalore') {
    // Vidhana Soudha (center-right grand plaza)
    buildVidhanaSoudha(group, 42, 12);
    addCol(42, 12, 13.5);
    // Lalbagh Glass House & Botanical Lake (center-left)
    buildLalbaghGlassHouse(group, waterMeshes, -6, 12);
    addCol(-6, 12, 16);
    // UB City Luxury Towers + World Trade Center Bangalore (north-east skyline!)
    buildBangaloreTowers(group, 78, -50);
    addCol(78, -50, 16);
  } else if (city.id === 'mumbai') {
    // Gateway of India + Taj Mahal Palace Hotel on Arabian Sea waterfront
    buildGatewayAndTaj(group, 44, 12);
    addCol(44, 12, 14);
    // Iconic 27-Story Antilia Tower + Worli Seaface Skyline!
    buildAntiliaAndWorli(group, 78, -52);
    addCol(78, -52, 16);
    // Arabian Sea Marine Drive Basin & Queen's Necklace promenade lamps
    buildMarineDriveBasin(group, waterMeshes, -5, 11);
    addCol(-5, 11, 18);
  } else if (city.id === 'kolkata') {
    // Victoria Memorial gleaming white marble dome & reflection pool
    buildVictoriaMemorial(group, waterMeshes, 43, 12);
    addCol(43, 12, 15);
    // Biswa Bangla Golden Ring Gate & Shaheed Minar Tower (center)
    buildBiswaBanglaAndMinar(group, -6, 11);
    addCol(-6, 11, 13);
    // The 42 (Kolkata's Tallest Iconic Skyscraper) + Salt Lake Skyline
    buildThe42Skyline(group, 78, -52);
    addCol(78, -52, 16);
  } else if (city.id === 'delhi') {
    // India Gate with glowing Amar Jawan Jyoti eternal flame
    buildIndiaGate(group, 44, 12);
    addCol(44, 12, 12);
    // Qutub Minar towering fluted sandstone minaret + Lotus Temple!
    buildQutubAndLotus(group, -5, 11);
    addCol(-5, 11, 15.5);
    // Pitampura TV Tower & Connaught / Aerocity Skyline
    buildDelhiSkyline(group, 78, -52);
    addCol(78, -52, 16);
  } else if (city.id === 'chennai') {
    // Kapaleeshwarar Colorful Tiered Temple Gopuram
    buildKapaleeshwararGopuram(group, 44, 12);
    addCol(44, 12, 12.5);
    // Marina Beach & Iconic Striped Chennai Lighthouse with rotating beacon beam!
    buildMarinaLighthouse(group, waterMeshes, rotatingBeacons, -5, 11);
    addCol(-5, 11, 17);
    // Chennai Central Terracotta Clock Tower + LIC / TIDEL Park Skyline!
    buildChennaiCentralAndTowers(group, 78, -52);
    addCol(78, -52, 16);
  } else if (city.id === 'pondicherry') {
    // Auroville Matrimandir (gleaming golden geodesic sphere monument!)
    buildMatrimandir(group, 44, 12);
    addCol(44, 12, 14);
    // Promenade Beach, Gandhi Pavilion & Pondicherry Lighthouse with rotating beacon
    buildPondyLighthousePromenade(group, waterMeshes, rotatingBeacons, -5, 11);
    addCol(-5, 11, 17);
    // Sacred Heart Basilica Twin Spires + Mustard-Yellow French Quarter Villas
    buildFrenchQuarterBasilica(group, 78, -52);
    addCol(78, -52, 16);
  } else if (city.id === 'vijayawada') {
    // Indrakeeladri Hill crowned with the Golden Kanaka Durga Temple Gopuram!
    buildKanakaDurgaHill(group, 44, 12);
    addCol(44, 12, 14.5);
    // Swaraj Maidan — Iconic 125ft Dr. B.R. Ambedkar Smriti Vanam Statue & Reflecting Pool!
    buildAmbedkarSmritiVanam(group, waterMeshes, -5, 11);
    addCol(-5, 11, 17);
    // Benz Circle Gateway & Amaravati / MG Road Modern Glass Towers
    buildVijayawadaSkyline(group, 78, -52);
    addCol(78, -52, 16);
  } else if (city.id === 'vizag') {
    // Kailasagiri Lush Coastal Hilltop & Iconic Giant White Shiva-Parvati Monument!
    buildKailasagiriHill(group, 44, 12);
    addCol(44, 12, 14.5);
    // RK Beach Bay + INS Kurusura Submarine Museum + Dolphin's Nose Lighthouse Beacon!
    buildVizagBeachSubmarineLighthouse(group, waterMeshes, rotatingBeacons, -5, 11);
    addCol(-5, 11, 17.5);
    // Rushikonda IT SEZ Glass Skyline & Visakhapatnam Port Cranes
    buildVizagPortSkyline(group, 78, -52);
    addCol(78, -52, 16);
  }

  return colliders;
}

/* ==================== HYDERABAD ==================== */
function buildCharminar(group, x, z) {
  const charminar = new THREE.Group();
  charminar.position.set(x, 0, z);
  const sandstone = new THREE.MeshStandardMaterial({ color: 0xe6cfa8, roughness: 0.72, metalness: 0.05 });
  const trimStone = new THREE.MeshStandardMaterial({ color: 0xd2b382, roughness: 0.65 });
  const domeGold = new THREE.MeshStandardMaterial({ color: 0xf4d58d, roughness: 0.35, metalness: 0.45 });
  const archShadow = new THREE.MeshStandardMaterial({ color: 0x3f2e1f, roughness: 0.9 });

  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(18.5, 19.2, 0.45, 8),
    new THREE.MeshStandardMaterial({ color: 0x9b8b75, roughness: 0.85 })
  );
  plaza.position.y = 0.22;
  plaza.receiveShadow = true;
  charminar.add(plaza);

  const steps = new THREE.Mesh(new THREE.BoxGeometry(15.5, 1.1, 15.5), trimStone);
  steps.position.y = 0.8;
  charminar.add(steps);

  const core = new THREE.Mesh(new THREE.BoxGeometry(12.2, 11.5, 12.2), sandstone);
  core.position.y = 7.0;
  core.castShadow = true;
  charminar.add(core);

  for (let i = 0; i < 4; i++) {
    const side = new THREE.Group();
    side.rotation.y = (i * Math.PI) / 2;
    const archVoid = new THREE.Mesh(new THREE.BoxGeometry(5.6, 6.8, 0.8), archShadow);
    archVoid.position.set(0, 4.6, 5.9);
    side.add(archVoid);
    const archTop = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.8, 16, 1, false, 0, Math.PI), archShadow);
    archTop.rotation.x = Math.PI / 2;
    archTop.rotation.z = Math.PI / 2;
    archTop.position.set(0, 7.9, 5.9);
    side.add(archTop);
    charminar.add(side);
  }

  const roofParapet = new THREE.Mesh(new THREE.BoxGeometry(12.6, 1.8, 12.6), trimStone);
  roofParapet.position.y = 13.6;
  charminar.add(roofParapet);

  const centralDome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeGold);
  centralDome.position.y = 14.4;
  charminar.add(centralDome);

  for (const [cx, cz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    const minaret = new THREE.Group();
    minaret.position.set(cx, 1.2, cz);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.75, 24, 12), sandstone);
    tower.position.y = 12;
    tower.castShadow = true;
    minaret.add(tower);
    for (const by of [11.5, 17.5, 22.8]) {
      const balc = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 1.65, 1.0, 12), trimStone);
      balc.position.y = by;
      minaret.add(balc);
    }
    const mDome = new THREE.Mesh(new THREE.SphereGeometry(1.55, 14, 12), domeGold);
    mDome.scale.set(1, 1.25, 1);
    mDome.position.y = 25.0;
    minaret.add(mDome);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 8), domeGold);
    spire.position.y = 27.6;
    minaret.add(spire);
    charminar.add(minaret);
  }

  const light = new THREE.PointLight(0xffb84d, 48, 45, 1.5);
  light.position.set(0, 17, 0);
  charminar.add(light);
  group.add(charminar);
}

function buildHussainSagarBuddha(group, waterMeshes, x, z) {
  const lake = new THREE.Group();
  lake.position.set(x, 0, z);
  addWaterBasin(lake, waterMeshes, 0, 0, 17.5, 0x0d9488, 0x074d52);

  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(4.6, 1),
    new THREE.MeshStandardMaterial({ color: 0x6b6e76, roughness: 0.9 })
  );
  rock.scale.set(1.25, 0.52, 1.25);
  rock.position.y = 0.9;
  lake.add(rock);

  const lotus = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3.3, 1.3, 14),
    new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.55 })
  );
  lotus.position.y = 2.6;
  lake.add(lotus);

  const statueMat = new THREE.MeshStandardMaterial({ color: 0xe8e4db, roughness: 0.48 });
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.9, 8.8, 14), statueMat);
  robe.position.y = 7.6;
  robe.castShadow = true;
  lake.add(robe);

  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 1.6), statueMat);
  shoulders.position.y = 11.4;
  lake.add(shoulders);

  const head = new THREE.Mesh(new THREE.SphereGeometry(1.12, 14, 14), statueMat);
  head.position.y = 13.4;
  lake.add(head);

  const light = new THREE.PointLight(0x2dd4bf, 36, 36, 1.5);
  light.position.set(0, 10, 4);
  lake.add(light);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.7 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe4a0 });
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.2, 6), poleMat);
    pole.position.set(Math.cos(ang) * 18.0, 2.5, Math.sin(ang) * 18.0);
    lake.add(pole);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), bulbMat);
    orb.position.set(Math.cos(ang) * 18.0, 4.7, Math.sin(ang) * 18.0);
    lake.add(orb);
  }
  group.add(lake);
}

function buildHitecCyberTowers(group, x, z) {
  const hitec = new THREE.Group();
  hitec.position.set(x, 0, z);
  hitec.rotation.y = -0.55;
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, emissive: 0x0b2a5b, emissiveIntensity: 0.65, roughness: 0.15, metalness: 0.78 });
  const whiteFacade = new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.4 });
  const ringRadius = 11.2;
  for (let q = 0; q < 4; q++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(ringRadius, ringRadius, 15.5, 12, 1, false, q * (Math.PI / 2) + 0.15, Math.PI / 2 - 0.3),
      q % 2 === 0 ? whiteFacade : glassMat
    );
    seg.position.y = 7.8;
    seg.castShadow = true;
    hitec.add(seg);
  }
  for (const fy of [3.5, 7.5, 11.5]) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius + 0.15, 0.42, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.85 })
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = fy;
    hitec.add(band);
  }
  addTowerSkyscraper(hitec, { x: 17, z: -7, w: 9, h: 27, d: 9, color: 0x0f2b5c, accent: 0x18d6c4, spire: true });
  addTowerSkyscraper(hitec, { x: -17, z: -9, w: 9.5, h: 22, d: 8, color: 0x164e63, accent: 0x38bdf8 });
  group.add(hitec);
}

/* ==================== BANGALORE ==================== */
function buildVidhanaSoudha(group, x, z) {
  const vs = new THREE.Group();
  vs.position.set(x, 0, z);
  const granite = new THREE.MeshStandardMaterial({ color: 0xd8d1c5, roughness: 0.65 });
  const darkGranite = new THREE.MeshStandardMaterial({ color: 0xa69c8e, roughness: 0.75 });
  const goldAccent = new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.3, metalness: 0.6 });

  const lawn = new THREE.Mesh(
    new THREE.CylinderGeometry(18.5, 19, 0.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9 })
  );
  lawn.position.y = 0.2;
  vs.add(lawn);

  const mainHall = new THREE.Mesh(new THREE.BoxGeometry(22, 9.2, 13.5), granite);
  mainHall.position.y = 5.0;
  mainHall.castShadow = true;
  vs.add(mainHall);

  // Grand ceremonial entrance columns
  for (let cx = -7; cx <= 7; cx += 2.8) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 8.8, 10), darkGranite);
    col.position.set(cx, 4.8, 7.1);
    vs.add(col);
  }

  // Central iconic stepped dome + Ashoka emblem finial
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 3.8, 16), darkGranite);
  drum.position.y = 11.4;
  vs.add(drum);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), granite);
  dome.position.y = 13.2;
  dome.castShadow = true;
  vs.add(dome);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.2, 10), goldAccent);
  finial.position.y = 18.8;
  vs.add(finial);

  // 4 Corner neo-Dravidian cupolas
  for (const [cx, cz] of [[-9.5, -5.2], [9.5, -5.2], [-9.5, 5.2], [9.5, 5.2]]) {
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 4.2, 10), darkGranite);
    turret.position.set(cx, 11.4, cz);
    vs.add(turret);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), goldAccent);
    cap.position.set(cx, 13.4, cz);
    vs.add(cap);
  }
  const light = new THREE.PointLight(0xfff3c4, 46, 46, 1.4);
  light.position.set(0, 14, 10);
  vs.add(light);
  group.add(vs);
}

function buildLalbaghGlassHouse(group, waterMeshes, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const garden = new THREE.Mesh(
    new THREE.CylinderGeometry(17, 17.5, 0.4, 28),
    new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.88 })
  );
  garden.position.y = 0.2;
  g.add(garden);

  // Victorian Glass Conservatory (inspired by London Crystal Palace!)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.45,
    roughness: 0.1,
    metalness: 0.75,
    transparent: true,
    opacity: 0.84,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.5 });

  const hall = new THREE.Mesh(new THREE.BoxGeometry(16, 6.2, 9.5), glassMat);
  hall.position.y = 3.5;
  g.add(hall);
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 16, 16, 1, false, 0, Math.PI), glassMat);
  vault.rotation.z = Math.PI / 2;
  vault.position.y = 6.5;
  g.add(vault);
  for (let rx = -7.5; rx <= 7.5; rx += 3.75) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.22, 6, 16, Math.PI), ironMat);
    rib.rotation.y = Math.PI / 2;
    rib.position.set(rx, 6.5, 0);
    g.add(rib);
  }
  addWaterBasin(g, waterMeshes, 0, 9.5, 4.5, 0x0ea5e9, 0x0369a1, 0x94a3b8);
  group.add(g);
}

function buildBangaloreTowers(group, x, z) {
  const sky = new THREE.Group();
  sky.position.set(x, 0, z);
  sky.rotation.y = -0.45;
  // UB City Concorde & Canberra luxury towers
  addTowerSkyscraper(sky, { x: -10, z: 2, w: 9, h: 30, d: 9, color: 0x1e293b, accent: 0x38bdf8, spire: true });
  addTowerSkyscraper(sky, { x: 4, z: -2, w: 8.5, h: 26, d: 8.5, color: 0x0f3460, accent: 0x10b981, spire: true });
  // World Trade Center Bangalore angled glass crown
  addTowerSkyscraper(sky, { x: 16, z: 6, w: 10, h: 33, d: 8, color: 0x0c4a6e, accent: 0x38bdf8, spire: true });
  group.add(sky);
}

/* ==================== MUMBAI ==================== */
function buildGatewayAndTaj(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const basalt = new THREE.MeshStandardMaterial({ color: 0xc29b61, roughness: 0.72 });
  const tajCream = new THREE.MeshStandardMaterial({ color: 0xf1e5d1, roughness: 0.55 });
  const tajCrimson = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4 });

  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(18.5, 19, 0.45, 24),
    new THREE.MeshStandardMaterial({ color: 0x8c7b6b, roughness: 0.85 })
  );
  plaza.position.y = 0.22;
  g.add(plaza);

  // Gateway of India Triumphal Arch (front-left)
  const gate = new THREE.Group();
  gate.position.set(-5.5, 0.5, 5.5);
  gate.rotation.y = 0.4;
  for (const sx of [-4.2, 4.2]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 14, 3.6), basalt);
    pier.position.set(sx, 7, 0);
    pier.castShadow = true;
    gate.add(pier);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(12.2, 4.4, 3.8), basalt);
  lintel.position.set(0, 12.8, 0);
  lintel.castShadow = true;
  gate.add(lintel);
  for (const sx of [-5.2, 5.2]) {
    const turret = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.2, 8), basalt);
    turret.position.set(sx, 16.4, 0);
    gate.add(turret);
  }
  g.add(gate);

  // Taj Mahal Palace Hotel (iconic crimson central dome behind Gateway!)
  const taj = new THREE.Group();
  taj.position.set(4.5, 0.5, -4.5);
  const body = new THREE.Mesh(new THREE.BoxGeometry(13.5, 10.5, 8.5), tajCream);
  body.position.y = 5.25;
  body.castShadow = true;
  taj.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.8, 16, 12), tajCrimson);
  dome.scale.set(1, 1.15, 1);
  dome.position.y = 11.8;
  dome.castShadow = true;
  taj.add(dome);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.7 }));
  spire.position.y = 16.5;
  taj.add(spire);
  g.add(taj);

  const warm = new THREE.PointLight(0xffad5a, 46, 45, 1.4);
  warm.position.set(0, 16, 4);
  g.add(warm);
  group.add(g);
}

function buildAntiliaAndWorli(group, x, z) {
  const sky = new THREE.Group();
  sky.position.set(x, 0, z);
  sky.rotation.y = -0.5;

  // Iconic Antilia: stacked cantilevered alternating terraced glass-and-garden blocks!
  const antilia = new THREE.Group();
  antilia.position.set(-4, 0, 0);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, emissive: 0x0c2442, emissiveIntensity: 0.65, roughness: 0.15, metalness: 0.8 });
  const slab = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.45 });
  const green = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8 });

  const tiers = [
    { y: 2.5, w: 11, h: 5, d: 10, ox: 0 },
    { y: 7.5, w: 9.5, h: 5, d: 9, ox: 1.4 },
    { y: 12.5, w: 11.5, h: 5, d: 9.5, ox: -1.1 },
    { y: 17.5, w: 9, h: 5, d: 8.5, ox: 1.5 },
    { y: 22.5, w: 11, h: 5, d: 9.5, ox: -0.6 },
    { y: 27.5, w: 8.5, h: 5, d: 8.5, ox: 0.8 },
    { y: 32.0, w: 10, h: 4, d: 9, ox: 0 },
  ];
  for (const t of tiers) {
    const blk = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), glass);
    blk.position.set(t.ox, t.y, 0);
    blk.castShadow = true;
    antilia.add(blk);
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.8, 0.55, t.d + 0.8), slab);
    terrace.position.set(t.ox, t.y + t.h / 2, 0);
    antilia.add(terrace);
    const gardenStrip = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.3, 0.5, 1.1), green);
    gardenStrip.position.set(t.ox, t.y + t.h / 2 + 0.45, t.d / 2);
    antilia.add(gardenStrip);
  }
  // Rooftop Helipad "H"
  const heli = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 0.3, 18),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
  );
  heli.position.set(0, 34.4, 0);
  antilia.add(heli);
  sky.add(antilia);

  // Worli Twin Imperial Skyscrapers beside Antilia
  addTowerSkyscraper(sky, { x: 14, z: -6, w: 8, h: 31, d: 8, color: 0x312e81, accent: 0xf43f5e, spire: true });
  addTowerSkyscraper(sky, { x: -19, z: -7, w: 8, h: 25, d: 8, color: 0x1e293b, accent: 0xfbbf24 });
  group.add(sky);
}

function buildMarineDriveBasin(group, waterMeshes, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addWaterBasin(g, waterMeshes, 0, 0, 17.5, 0x0c4a6e, 0x1e1b4b, 0x94a3b8);

  // Iconic "Queen's Necklace" curved golden Art-Deco lamps ringing the Arabian Sea!
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 });
  const goldBulb = new THREE.MeshBasicMaterial({ color: 0xfde047 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.4, 6), poleMat);
    pole.position.set(Math.cos(a) * 17.9, 2.4, Math.sin(a) * 17.9);
    g.add(pole);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), goldBulb);
    orb.position.set(Math.cos(a) * 17.9, 4.8, Math.sin(a) * 17.9);
    g.add(orb);
  }
  group.add(g);
}

/* ==================== KOLKATA ==================== */
function buildVictoriaMemorial(group, waterMeshes, x, z) {
  const vm = new THREE.Group();
  vm.position.set(x, 0, z);
  const marble = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.32, metalness: 0.08 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.75 });

  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(18.5, 19, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.9 }));
  lawn.position.y = 0.2;
  vm.add(lawn);

  const base = new THREE.Mesh(new THREE.BoxGeometry(17.5, 7.2, 13.5), marble);
  base.position.y = 4.0;
  base.castShadow = true;
  vm.add(base);

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 5.2, 18), marble);
  drum.position.y = 10.2;
  vm.add(drum);

  const mainDome = new THREE.Mesh(new THREE.SphereGeometry(4.3, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), marble);
  mainDome.position.y = 12.8;
  mainDome.castShadow = true;
  vm.add(mainDome);

  // Angel of Victory golden statue on apex!
  const angel = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.0, 8), gold);
  angel.position.y = 18.2;
  vm.add(angel);

  for (const [cx, cz] of [[-7.2, -5.2], [7.2, -5.2], [-7.2, 5.2], [7.2, 5.2]]) {
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 3.6, 12), marble);
    cupola.position.set(cx, 9.4, cz);
    vm.add(cupola);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), marble);
    cap.position.set(cx, 11.2, cz);
    vm.add(cap);
  }
  addWaterBasin(vm, waterMeshes, 0, 11.5, 4.8, 0x0ea5e9, 0x0369a1, 0xe2e8f0);
  const light = new THREE.PointLight(0xfffbeb, 44, 46, 1.4);
  light.position.set(0, 16, 6);
  vm.add(light);
  group.add(vm);
}

function buildBiswaBanglaAndMinar(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(14, 14.5, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }));
  plaza.position.y = 0.2;
  g.add(plaza);

  // Iconic Biswa Bangla Gate: giant illuminated golden ring suspended on curved arches!
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xd97706, emissiveIntensity: 0.75, roughness: 0.25, metalness: 0.65 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.8, 1.1, 12, 32), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 12.2;
  ring.castShadow = true;
  g.add(ring);

  const steel = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75, roughness: 0.35 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.1, 14, 8), steel);
    leg.position.set(Math.cos(a) * 8.2, 6.5, Math.sin(a) * 8.2);
    leg.rotation.z = Math.cos(a) * 0.24;
    leg.rotation.x = -Math.sin(a) * 0.24;
    g.add(leg);
  }

  // Shaheed Minar fluted column rising in the middle
  const minar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.7, 24, 12),
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 })
  );
  minar.position.set(0, 12, 0);
  minar.castShadow = true;
  g.add(minar);
  const topDome = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), ringMat);
  topDome.position.y = 24.4;
  g.add(topDome);
  group.add(g);
}

function buildThe42Skyline(group, x, z) {
  const sky = new THREE.Group();
  sky.position.set(x, 0, z);
  sky.rotation.y = -0.45;
  // The 42 Chowringhee — Kolkata's iconic super-tall slender white tower!
  addTowerSkyscraper(sky, { x: 0, z: 0, w: 8.5, h: 38, d: 8.5, color: 0xe2e8f0, accent: 0x38bdf8, spire: true });
  addTowerSkyscraper(sky, { x: 14, z: -6, w: 9, h: 24, d: 8, color: 0x1e3a5f, accent: 0xfacc15 });
  addTowerSkyscraper(sky, { x: -14, z: -8, w: 8.5, h: 21, d: 8.5, color: 0x334155, accent: 0xfbbf24 });
  group.add(sky);
}

/* ==================== DELHI ==================== */
function buildIndiaGate(group, x, z) {
  const ig = new THREE.Group();
  ig.position.set(x, 0, z);
  const sandstone = new THREE.MeshStandardMaterial({ color: 0xdba979, roughness: 0.72 });
  const redSand = new THREE.MeshStandardMaterial({ color: 0xa64b2a, roughness: 0.78 });

  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(18.5, 19, 0.45, 24), new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9 }));
  lawn.position.y = 0.22;
  ig.add(lawn);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 9.5), redSand);
  plinth.position.y = 1.0;
  ig.add(plinth);

  for (const sx of [-4.8, 4.8]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4.4, 16, 6.2), sandstone);
    pier.position.set(sx, 9.4, 0);
    pier.castShadow = true;
    ig.add(pier);
  }
  const entablature = new THREE.Mesh(new THREE.BoxGeometry(14.8, 5.2, 6.8), sandstone);
  entablature.position.set(0, 18.2, 0);
  entablature.castShadow = true;
  ig.add(entablature);

  const attic = new THREE.Mesh(new THREE.BoxGeometry(12.2, 2.2, 5.4), redSand);
  attic.position.set(0, 21.8, 0);
  ig.add(attic);

  // Amar Jawan Jyoti Eternal Flame glowing under the arch!
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.6, 10),
    new THREE.MeshBasicMaterial({ color: 0xff8c2b })
  );
  flame.position.set(0, 3.2, 0);
  ig.add(flame);

  const flameLight = new THREE.PointLight(0xff7b29, 52, 42, 1.4);
  flameLight.position.set(0, 8, 2);
  ig.add(flameLight);
  group.add(ig);
}

function buildQutubAndLotus(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const park = new THREE.Mesh(new THREE.CylinderGeometry(16.5, 17, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.9 }));
  park.position.y = 0.2;
  g.add(park);

  // Iconic Qutub Minar (5-story fluted tapered red sandstone & marble minaret!)
  const qutub = new THREE.Group();
  qutub.position.set(-6, 0.4, -2);
  const redStone = new THREE.MeshStandardMaterial({ color: 0xb4533c, roughness: 0.75 });
  const marble = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
  const stories = [
    { y: 4.5, rTop: 2.8, rBot: 3.5, h: 9, mat: redStone },
    { y: 12.2, rTop: 2.3, rBot: 2.75, h: 6.8, mat: redStone },
    { y: 18.2, rTop: 1.85, rBot: 2.25, h: 5.5, mat: redStone },
    { y: 23.0, rTop: 1.45, rBot: 1.8, h: 4.4, mat: marble },
    { y: 27.0, rTop: 1.05, rBot: 1.4, h: 3.8, mat: redStone },
  ];
  for (const s of stories) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(s.rTop, s.rBot, s.h, 16), s.mat);
    seg.position.y = s.y;
    seg.castShadow = true;
    qutub.add(seg);
    const balc = new THREE.Mesh(new THREE.CylinderGeometry(s.rTop + 0.55, s.rTop + 0.15, 0.65, 16), marble);
    balc.position.y = s.y + s.h / 2;
    qutub.add(balc);
  }
  g.add(qutub);

  // Iconic Lotus Temple (2 rings of sculpted gleaming white marble petals!)
  const lotus = new THREE.Group();
  lotus.position.set(6.5, 0.4, 4.5);
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x38bdf8, emissiveIntensity: 0.16, roughness: 0.22 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const outerP = new THREE.Mesh(new THREE.ConeGeometry(2.3, 6.8, 4), petalMat);
    outerP.position.set(Math.cos(a) * 3.8, 3.0, Math.sin(a) * 3.8);
    outerP.rotation.z = -Math.cos(a) * 0.45;
    outerP.rotation.x = Math.sin(a) * 0.45;
    outerP.castShadow = true;
    lotus.add(outerP);

    const innerP = new THREE.Mesh(new THREE.ConeGeometry(2.1, 8.6, 4), petalMat);
    innerP.position.set(Math.cos(a + 0.35) * 1.9, 4.2, Math.sin(a + 0.35) * 1.9);
    innerP.rotation.z = -Math.cos(a + 0.35) * 0.18;
    innerP.rotation.x = Math.sin(a + 0.35) * 0.18;
    lotus.add(innerP);
  }
  g.add(lotus);
  group.add(g);
}

function buildDelhiSkyline(group, x, z) {
  const sky = new THREE.Group();
  sky.position.set(x, 0, z);
  sky.rotation.y = -0.5;
  // Pitampura Iconic TV Tower!
  const tvMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.2, 27, 12), tvMat);
  shaft.position.set(0, 13.5, 0);
  shaft.castShadow = true;
  sky.add(shaft);
  const pod = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 2.8, 3.6, 16),
    new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 0.55 })
  );
  pod.position.set(0, 21.5, 0);
  sky.add(pod);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.55, 11, 8), tvMat);
  spire.position.set(0, 32, 0);
  sky.add(spire);

  addTowerSkyscraper(sky, { x: 14, z: -6, w: 9, h: 24, d: 8, color: 0x3f2e3e, accent: 0xf97316 });
  addTowerSkyscraper(sky, { x: -15, z: -7, w: 9, h: 21, d: 8, color: 0x1e293b, accent: 0x22c55e });
  group.add(sky);
}

/* ==================== CHENNAI ==================== */
function buildKapaleeshwararGopuram(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(17.5, 18, 0.45, 24), new THREE.MeshStandardMaterial({ color: 0x9a8468, roughness: 0.85 }));
  plaza.position.y = 0.22;
  g.add(plaza);

  // Iconic colorful tiered Dravidian Temple Gopuram tower!
  const tierColors = [0xd97706, 0x0284c7, 0xdc2626, 0x16a34a, 0xeab308, 0x9333ea, 0xf97316];
  for (let i = 0; i < tierColors.length; i++) {
    const w = 13.5 - i * 1.45;
    const d = 8.2 - i * 0.85;
    const h = 2.7;
    const tier = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: tierColors[i], roughness: 0.58 })
    );
    tier.position.y = 1.8 + i * h;
    tier.castShadow = true;
    g.add(tier);
  }
  // Barrel-vaulted Shala roof + golden Kalasams on top!
  const topY = 1.8 + tierColors.length * 2.7;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 5.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.y = topY + 0.5;
  g.add(barrel);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xfde047, metalness: 0.8, roughness: 0.2 });
  for (let kx = -1.8; kx <= 1.8; kx += 0.9) {
    const kalasam = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 8), goldMat);
    kalasam.position.set(kx, topY + 2.4, 0);
    g.add(kalasam);
  }
  const light = new THREE.PointLight(0xffbe55, 44, 42, 1.4);
  light.position.set(0, 14, 7);
  g.add(light);
  group.add(g);
}

function buildMarinaLighthouse(group, waterMeshes, rotatingBeacons, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addWaterBasin(g, waterMeshes, 0, 0, 17, 0x0284c7, 0x0c4a6e, 0xd6b588);

  // Sandy Marina island base
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.2, 0.9, 18), new THREE.MeshStandardMaterial({ color: 0xe6c896, roughness: 0.9 }));
  sand.position.y = 0.6;
  g.add(sand);

  // Iconic red-and-white striped Chennai Marina Lighthouse tower!
  const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
  const red = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
  for (let i = 0; i < 6; i++) {
    const rBot = 2.4 - i * 0.22;
    const rTop = 2.18 - i * 0.22;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 3.6, 14), i % 2 === 0 ? white : red);
    seg.position.y = 2.6 + i * 3.6;
    seg.castShadow = true;
    g.add(seg);
  }
  const lanternY = 2.6 + 6 * 3.6;
  const glassRoom = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 2.2, 14),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  glassRoom.position.y = lanternY;
  g.add(glassRoom);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.0, 14), red);
  roof.position.y = lanternY + 2.0;
  g.add(roof);

  // Rotating volumetric lighthouse beacon beam!
  const beaconPivot = new THREE.Group();
  beaconPivot.position.y = lanternY;
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfef9c3,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const dir of [-1, 1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 24, 14, 1, true), beamMat);
    cone.rotation.z = dir * (Math.PI / 2);
    cone.position.x = dir * 12;
    beaconPivot.add(cone);
  }
  g.add(beaconPivot);
  rotatingBeacons.push(beaconPivot);
  group.add(g);
}

function buildChennaiCentralAndTowers(group, x, z) {
  const sky = new THREE.Group();
  sky.position.set(x, 0, z);
  sky.rotation.y = -0.5;

  // Iconic bright terracotta-red Chennai Central Station with tall Clock Tower!
  const brick = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.65 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  const station = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 10), brick);
  station.position.set(0, 4.5, 0);
  station.castShadow = true;
  sky.add(station);
  const clockTower = new THREE.Mesh(new THREE.BoxGeometry(4.8, 21, 4.8), brick);
  clockTower.position.set(0, 10.5, 1.5);
  clockTower.castShadow = true;
  sky.add(clockTower);
  const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 16), trim);
  clockFace.rotation.x = Math.PI / 2;
  clockFace.position.set(0, 17.5, 4.0);
  sky.add(clockFace);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.2, 4), trim);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, 23.5, 1.5);
  sky.add(spire);

  // Iconic LIC Building & TIDEL Park towers behind
  addTowerSkyscraper(sky, { x: 16, z: -7, w: 9, h: 27, d: 7, color: 0x0c4a6e, accent: 0x06b6d4, spire: true });
  addTowerSkyscraper(sky, { x: -16, z: -6, w: 9, h: 22, d: 8, color: 0x1e293b, accent: 0xf59e0b });
  group.add(sky);
}

/* ==================== PONDICHERRY ==================== */
function buildMatrimandir(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  // Serene circular amphitheater & red earth gardens
  const garden = new THREE.Mesh(new THREE.CylinderGeometry(18, 18.5, 0.45, 32), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.88 }));
  garden.position.y = 0.22;
  g.add(garden);

  const crater = new THREE.Mesh(new THREE.TorusGeometry(10.5, 1.6, 10, 28), new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 }));
  crater.rotation.x = Math.PI / 2;
  crater.position.y = 0.9;
  g.add(crater);

  // Iconic gleaming golden faceted geodesic Matrimandir Sphere!
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xca8a04,
    emissiveIntensity: 0.42,
    roughness: 0.16,
    metalness: 0.88,
    flatShading: true,
  });
  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(8.2, 2), goldMat);
  sphere.scale.set(1.12, 0.92, 1.12);
  sphere.position.y = 8.4;
  sphere.castShadow = true;
  g.add(sphere);

  const glow = new THREE.PointLight(0xfde047, 55, 48, 1.4);
  glow.position.set(0, 15, 5);
  g.add(glow);
  group.add(g);
}

function buildPondyLighthousePromenade(group, waterMeshes, rotatingBeacons, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addWaterBasin(g, waterMeshes, 0, 0, 17, 0x0284c7, 0x075985, 0xca8a04);

  // Rock Beach basalt rocks + tall Pondicherry Coastal Lighthouse
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(5.2, 1), rockMat);
  rock.scale.set(1.3, 0.45, 1.3);
  rock.position.y = 0.7;
  g.add(rock);

  const towerMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.45 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.45 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.3, 21, 14), towerMat);
  shaft.position.y = 11;
  shaft.castShadow = true;
  g.add(shaft);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 3.2, 14), accentMat);
  band.position.y = 16.5;
  g.add(band);

  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.1, 12), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
  lantern.position.y = 22.4;
  g.add(lantern);

  const beaconPivot = new THREE.Group();
  beaconPivot.position.y = 22.4;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
  for (const dir of [-1, 1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.0, 22, 12, 1, true), beamMat);
    cone.rotation.z = dir * (Math.PI / 2);
    cone.position.x = dir * 11;
    beaconPivot.add(cone);
  }
  g.add(beaconPivot);
  rotatingBeacons.push(beaconPivot);
  group.add(g);
}

function buildFrenchQuarterBasilica(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.5;

  // Sacred Heart Basilica (terracotta & white twin neo-Gothic spires!)
  const terra = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
  const nave = new THREE.Mesh(new THREE.BoxGeometry(12, 11, 14), terra);
  nave.position.set(0, 5.5, 0);
  nave.castShadow = true;
  g.add(nave);
  for (const sx of [-4.2, 4.2]) {
    const belfry = new THREE.Mesh(new THREE.BoxGeometry(3.2, 18, 3.2), terra);
    belfry.position.set(sx, 9, 5.2);
    belfry.castShadow = true;
    g.add(belfry);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.0, 9.5, 6), white);
    spire.position.set(sx, 22.6, 5.2);
    spire.castShadow = true;
    g.add(spire);
  }

  // Iconic Mustard-Yellow French Quarter / White Town colonial villas!
  const mustard = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.65 });
  const coral = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.65 });
  const villa1 = new THREE.Mesh(new THREE.BoxGeometry(10, 7.5, 8.5), mustard);
  villa1.position.set(15, 3.75, -4);
  villa1.castShadow = true;
  g.add(villa1);
  const villa2 = new THREE.Mesh(new THREE.BoxGeometry(9.5, 6.8, 8.5), coral);
  villa2.position.set(-15, 3.4, -5);
  villa2.castShadow = true;
  g.add(villa2);

  group.add(g);
}

/* ==================== VIJAYAWADA ==================== */
function buildKanakaDurgaHill(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  // Terraced rocky Indrakeeladri Hill
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c4f44, roughness: 0.9 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.88 });
  const hillBase = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 17.5, 7.5, 12), rockMat);
  hillBase.position.y = 3.75;
  hillBase.castShadow = true;
  hillBase.receiveShadow = true;
  g.add(hillBase);

  const hillMid = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 11.2, 4.6, 12), greenMat);
  hillMid.position.y = 9.5;
  hillMid.castShadow = true;
  g.add(hillMid);

  // Gleaming Golden Kanaka Durga Temple Vimana & Gopuram atop the hill!
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xb45309,
    emissiveIntensity: 0.42,
    roughness: 0.22,
    metalness: 0.85,
  });
  const sanctum = new THREE.Mesh(new THREE.BoxGeometry(8.5, 4.2, 8.5), new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 }));
  sanctum.position.y = 13.6;
  g.add(sanctum);

  for (let i = 0; i < 4; i++) {
    const w = 7.4 - i * 1.4;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(w, 1.9, w), goldMat);
    tier.position.y = 16.5 + i * 1.9;
    tier.castShadow = true;
    g.add(tier);
  }
  const kalasam = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.2, 10), goldMat);
  kalasam.position.y = 25.0;
  g.add(kalasam);

  const light = new THREE.PointLight(0xffc145, 52, 48, 1.4);
  light.position.set(0, 22, 6);
  g.add(light);
  group.add(g);
}

function buildAmbedkarSmritiVanam(group, waterMeshes, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addWaterBasin(g, waterMeshes, 0, 0, 16.5, 0x0284c7, 0x0c4a6e, 0xe2e8f0);

  // Circular Kalachakra marble pedestal (Smriti Vanam Swaraj Maidan)
  const marble = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 6.8, 5.2, 20), marble);
  pedestal.position.y = 2.8;
  pedestal.castShadow = true;
  g.add(pedestal);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.1, 0.38, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.9 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 5.4;
  g.add(ring);

  // Towering 125ft Bronze Dr. B.R. Ambedkar Monument Silhouette
  const bronze = new THREE.MeshStandardMaterial({ color: 0x92623a, roughness: 0.32, metalness: 0.78 });
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 11.5, 14), bronze);
  coat.position.y = 11.2;
  coat.castShadow = true;
  g.add(coat);

  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 2.0), bronze);
  shoulders.position.y = 16.5;
  g.add(shoulders);

  // Raised iconic pointing arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 5.2, 8), bronze);
  arm.position.set(2.4, 19.2, 0.6);
  arm.rotation.z = -0.35;
  g.add(arm);

  const head = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 14), bronze);
  head.position.y = 18.8;
  g.add(head);

  const light = new THREE.PointLight(0x38bdf8, 42, 42, 1.4);
  light.position.set(0, 14, 6);
  g.add(light);
  group.add(g);
}

function buildVijayawadaSkyline(group, x, z) {
  const sky = new THREE.Group();
  sky.position.set(x, 0, z);
  sky.rotation.y = -0.5;
  addTowerSkyscraper(sky, { x: 0, z: 0, w: 9.5, h: 31, d: 9, color: 0x1e3a5f, accent: 0xfb923c, spire: true });
  addTowerSkyscraper(sky, { x: 15, z: -6, w: 8.5, h: 25, d: 8, color: 0x0c4a6e, accent: 0x38bdf8, spire: true });
  addTowerSkyscraper(sky, { x: -15, z: -7, w: 9, h: 22, d: 8.5, color: 0x334155, accent: 0xfacc15 });
  group.add(sky);
}

/* ==================== VIZAG (VISAKHAPATNAM) ==================== */
function buildKailasagiriHill(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  // Lush coastal Kailasagiri Hill overlooking the Bay of Bengal
  const hill = new THREE.Mesh(
    new THREE.CylinderGeometry(10.5, 17.5, 8.8, 16),
    new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.88 })
  );
  hill.position.y = 4.4;
  hill.castShadow = true;
  hill.receiveShadow = true;
  g.add(hill);

  const terrace = new THREE.Mesh(
    new THREE.CylinderGeometry(9.6, 10.2, 1.2, 18),
    new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.7 })
  );
  terrace.position.y = 9.2;
  g.add(terrace);

  // Iconic Giant White Kailasagiri Shiva-Parvati Seated Monument!
  const whiteMarble = new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x38bdf8, emissiveIntensity: 0.14, roughness: 0.35 });
  const baseSeat = new THREE.Mesh(new THREE.BoxGeometry(9.5, 2.4, 5.2), whiteMarble);
  baseSeat.position.y = 10.9;
  g.add(baseSeat);

  for (const [sx, hScale] of [[-2.4, 1.12], [2.4, 0.96]]) {
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 2.0, 6.2 * hScale, 12), whiteMarble);
    torso.position.set(sx, 12 + 3.0 * hScale, 0);
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.15 * hScale, 12, 12), whiteMarble);
    head.position.set(sx, 12.6 + 6.4 * hScale, 0);
    g.add(head);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.8, 8), whiteMarble);
    crown.position.set(sx, 14.1 + 6.5 * hScale, 0);
    g.add(crown);
  }

  // Iconic glowing coastal beacon uplight
  const light = new THREE.PointLight(0x7dd3fc, 48, 46, 1.4);
  light.position.set(0, 18, 6);
  g.add(light);
  group.add(g);
}

function buildVizagBeachSubmarineLighthouse(group, waterMeshes, rotatingBeacons, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  addWaterBasin(g, waterMeshes, 0, 0, 17, 0x0284c7, 0x0c4a6e, 0xe2c799);

  // RK Beach sand strip + Iconic Black-and-Red INS Kurusura Submarine Museum!
  const sand = new THREE.Mesh(new THREE.BoxGeometry(15, 0.9, 7.5), new THREE.MeshStandardMaterial({ color: 0xe7cca0, roughness: 0.9 }));
  sand.position.set(0, 0.55, 6.5);
  g.add(sand);

  const sub = new THREE.Group();
  sub.position.set(-1.0, 2.2, 6.5);
  const hullBlack = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.42, metalness: 0.55 });
  const hullRed = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 9.6, 8, 16), hullBlack);
  hull.rotation.z = Math.PI / 2;
  hull.castShadow = true;
  sub.add(hull);

  const keel = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.7, 2.1), hullRed);
  keel.position.y = -0.9;
  sub.add(keel);

  const conningTower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 1.3), hullBlack);
  conningTower.position.set(0.8, 2.0, 0);
  conningTower.castShadow = true;
  sub.add(conningTower);

  const periscope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85 }));
  periscope.position.set(0.8, 3.8, 0);
  sub.add(periscope);
  g.add(sub);

  // Rocky Dolphin's Nose Headland + Tall Rotating Lighthouse Tower!
  const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(4.8, 1), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }));
  cliff.scale.set(1.2, 0.7, 1.1);
  cliff.position.set(2.5, 1.5, -5.5);
  g.add(cliff);

  const lh = new THREE.Group();
  lh.position.set(2.5, 2.8, -5.5);
  const lhMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.0, 18.5, 14), lhMat);
  shaft.position.y = 9.25;
  shaft.castShadow = true;
  lh.add(shaft);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 3.2, 14), stripeMat);
  band.position.y = 13.5;
  lh.add(band);

  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.0, 12), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
  lantern.position.y = 19.4;
  lh.add(lantern);

  const beaconPivot = new THREE.Group();
  beaconPivot.position.y = 19.4;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  for (const dir of [-1, 1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 23, 12, 1, true), beamMat);
    cone.rotation.z = dir * (Math.PI / 2);
    cone.position.x = dir * 11.5;
    beaconPivot.add(cone);
  }
  lh.add(beaconPivot);
  rotatingBeacons.push(beaconPivot);
  g.add(lh);

  group.add(g);
}

function buildVizagPortSkyline(group, x, z) {
  const sky = new THREE.Group();
  sky.position.set(x, 0, z);
  sky.rotation.y = -0.5;
  // Rushikonda IT SEZ glass towers
  addTowerSkyscraper(sky, { x: -4, z: 0, w: 9.5, h: 30, d: 8.5, color: 0x0c4a6e, accent: 0x38bdf8, spire: true });
  addTowerSkyscraper(sky, { x: 11, z: -6, w: 9, h: 25, d: 8, color: 0x1e293b, accent: 0xfacc15, spire: true });
  // Visakhapatnam Iconic Port Crane silhouette!
  const craneRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, metalness: 0.5 });
  const craneMast = new THREE.Mesh(new THREE.BoxGeometry(1.8, 22, 1.8), craneRed);
  craneMast.position.set(-16, 11, -4);
  craneMast.castShadow = true;
  sky.add(craneMast);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(14, 1.3, 1.3), craneRed);
  boom.position.set(-12, 20.5, -4);
  boom.rotation.z = 0.16;
  sky.add(boom);
  group.add(sky);
}

