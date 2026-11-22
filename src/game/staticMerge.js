import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Draw-call reduction: bakes every static mesh under `root` into one mesh per
 * (equivalent material + attribute layout + shadow flags). Landmarks are built from
 * hundreds of small boxes/cylinders, each of which used to cost a draw call.
 *
 * @param {THREE.Object3D} root
 * @param {Set<THREE.Object3D|THREE.Material>} exclude  objects (and their subtrees) or materials that animate
 * @param {{tag?: (mesh: THREE.Mesh) => string}} [opts]  tag keeps meshes in separate batches; the batch is named after it
 * @returns {{before: number, after: number}}
 */
export function mergeStaticMeshes(root, exclude = new Set(), opts = {}) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const canonical = new Map(); // material signature -> material
  const groups = new Map();
  const multi = new Set(); // multi-material meshes split into per-material parts
  let before = 0;

  const skip = (o) => {
    for (let p = o; p && p !== root; p = p.parent) if (exclude.has(p)) return true;
    return false;
  };
  const mergeable = (m) =>
    m && !m.transparent && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile && !exclude.has(m);
  const attrKey = (geo) =>
    Object.keys(geo.attributes)
      .sort()
      .map((n) => {
        const a = geo.attributes[n];
        if (a.isInterleavedBufferAttribute) return `${n}:il`;
        return `${n}:${a.itemSize}${a.array.constructor.name}${a.normalized ? 'n' : ''}`;
      })
      .join(',');
  const add = (o, m, part) => {
    const sig = materialSignature(m);
    if (!canonical.has(sig)) canonical.set(sig, m);
    const tag = opts.tag ? opts.tag(o) : '';
    const key = `${sig}#${attrKey(o.geometry)}#${o.geometry.index ? 'i' : 'n'}#${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}#${tag}`;
    if (!groups.has(key)) groups.set(key, { material: canonical.get(sig), items: [], cast: o.castShadow, receive: o.receiveShadow, tag });
    groups.get(key).items.push({ mesh: o, part });
  };

  root.traverse((o) => {
    if (!o.isMesh) return;
    before++;
    if (o.isInstancedMesh || o.isSkinnedMesh || !o.visible || skip(o)) return;
    if (o.geometry.morphAttributes && Object.keys(o.geometry.morphAttributes).length) return;
    if (attrKey(o.geometry).includes(':il')) return;
    if (Array.isArray(o.material)) {
      // e.g. facade boxes (walls + roof): split by geometry group, only if every part can be baked
      const gs = o.geometry.groups;
      if (!gs.length || !gs.every((g) => mergeable(o.material[g.materialIndex]))) return;
      multi.add(o);
      gs.forEach((g) => add(o, o.material[g.materialIndex], g));
      return;
    }
    if (!mergeable(o.material)) return;
    add(o, o.material, null);
  });

  const partGeometry = (mesh, part) => {
    const src = mesh.geometry;
    let geo;
    if (!part) {
      geo = src.clone();
      geo.clearGroups(); // single-material mesh: cylinder cap groups are irrelevant
    } else {
      geo = new THREE.BufferGeometry();
      for (const [n, a] of Object.entries(src.attributes)) geo.setAttribute(n, a.clone());
      if (src.index) geo.setIndex(Array.from(src.index.array.slice(part.start, part.start + part.count)));
      else {
        for (const [n, a] of Object.entries(src.attributes)) {
          const arr = a.array.slice(part.start * a.itemSize, (part.start + part.count) * a.itemSize);
          geo.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
        }
      }
    }
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld));
    return geo;
  };

  let after = before;
  const removed = new Set();
  for (const g of groups.values()) {
    // plain meshes need a partner to be worth baking; split multi-material parts always bake
    if (g.items.length < 2 && !g.items.some((it) => it.part)) continue;
    const geos = g.items.map((it) => partGeometry(it.mesh, it.part));
    let mergedGeo = null;
    try {
      mergedGeo = mergeGeometries(geos, false);
    } catch (e) {
      mergedGeo = null;
    }
    geos.forEach((geo) => geo.dispose());
    if (!mergedGeo) {
      // a multi-material mesh we can't bake must stay whole
      g.items.forEach((it) => it.part && multi.delete(it.mesh));
      continue;
    }
    mergedGeo.computeBoundingSphere();
    const mesh = new THREE.Mesh(mergedGeo, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.name = g.tag || 'merged-static';
    root.add(mesh);
    after++;
    for (const it of g.items) {
      if (it.part || removed.has(it.mesh)) continue;
      it.mesh.parent.remove(it.mesh);
      removed.add(it.mesh);
      after--;
    }
  }
  for (const o of multi) {
    if (o.parent) o.parent.remove(o);
    after--;
  }
  return { before, after };
}

function hex(c) {
  return c && c.getHexString ? c.getHexString() : '';
}

function materialSignature(m) {
  return [
    m.type,
    hex(m.color),
    hex(m.emissive),
    (m.emissiveIntensity ?? 0).toFixed(3),
    (m.roughness ?? 0).toFixed(3),
    (m.metalness ?? 0).toFixed(3),
    (m.envMapIntensity ?? 1).toFixed(2),
    m.map ? m.map.uuid : '',
    m.normalMap ? m.normalMap.uuid : '',
    m.roughnessMap ? m.roughnessMap.uuid : '',
    m.bumpMap ? m.bumpMap.uuid : '',
    (m.bumpScale ?? 1).toFixed(3),
    m.side,
    m.flatShading ? 1 : 0,
    m.vertexColors ? 1 : 0,
    (m.alphaTest ?? 0).toFixed(2),
    m.clearcoat ?? '',
    m.toneMapped ? 1 : 0,
    m.fog ? 1 : 0,
  ].join('|');
}

/**
 * Merges plain-coloured meshes that use *different* materials into a single draw call.
 * Each source material becomes one texel of a tiny palette texture (base colour,
 * roughness/metalness and emissive), and every vertex's UV points at its texel.
 * Only for untextured MeshStandardMaterials (the car's trim, lights, rims, tyres...).
 *
 * @param {THREE.Object3D} root      the merged mesh is added here, in root space
 * @param {THREE.Mesh[]} meshes
 * @param {string} name
 * @returns {THREE.Mesh|null}
 */
export function paletteMerge(root, meshes, name) {
  const usable = meshes.filter(
    (m) =>
      m.isMesh &&
      !Array.isArray(m.material) &&
      m.material.type === 'MeshStandardMaterial' &&
      !m.material.transparent &&
      !m.material.map &&
      !m.material.normalMap &&
      !m.material.roughnessMap &&
      !m.material.metalnessMap &&
      !m.material.emissiveMap &&
      m.geometry.attributes.position &&
      m.geometry.attributes.normal &&
      !m.geometry.attributes.position.isInterleavedBufferAttribute
  );
  if (usable.length < 2) return null;

  const mats = [...new Set(usable.map((m) => m.material))];
  const n = mats.length;
  const base = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  const emis = new Uint8Array(n * 4);
  const tmp = new THREE.Color();
  mats.forEach((m, i) => {
    tmp.copy(m.color);
    const c = tmp.getRGB(new THREE.Color(), THREE.SRGBColorSpace);
    base.set([c.r * 255, c.g * 255, c.b * 255, 255], i * 4);
    orm.set([255, Math.round(m.roughness * 255), Math.round(m.metalness * 255), 255], i * 4);
    tmp.copy(m.emissive).multiplyScalar(Math.min(1, m.emissiveIntensity));
    const e = tmp.getRGB(new THREE.Color(), THREE.SRGBColorSpace);
    emis.set([e.r * 255, e.g * 255, e.b * 255, 255], i * 4);
  });
  const tex = (data, srgb) => {
    const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const anyEmissive = mats.some((m) => m.emissive.getHex() !== 0 && m.emissiveIntensity > 0);
  const material = new THREE.MeshStandardMaterial({
    map: tex(base, true),
    roughnessMap: null,
    roughness: 1,
    metalness: 1,
    envMapIntensity: mats[0].envMapIntensity ?? 1,
    side: mats.some((m) => m.side === THREE.DoubleSide) ? THREE.DoubleSide : THREE.FrontSide,
  });
  const ormTex = tex(orm, false);
  material.roughnessMap = ormTex;
  material.metalnessMap = ormTex;
  if (anyEmissive) {
    material.emissive = new THREE.Color(0xffffff);
    material.emissiveMap = tex(emis, true);
  }
  material.name = `${name}-palette`;

  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const allIndexed = usable.every((m) => m.geometry.index);
  const geos = usable.map((mesh) => {
    const src = mesh.geometry;
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', src.attributes.position.clone());
    geo.setAttribute('normal', src.attributes.normal.clone());
    if (src.index) geo.setIndex(src.index.clone());
    if (!allIndexed && geo.index) geo = geo.toNonIndexed(); // mergeGeometries needs a uniform layout
    const i = mats.indexOf(mesh.material);
    const u = (i + 0.5) / n;
    const uv = new Float32Array(geo.attributes.position.count * 2);
    for (let k = 0; k < uv.length; k += 2) {
      uv[k] = u;
      uv[k + 1] = 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld));
    return geo;
  });
  let merged = null;
  try {
    merged = mergeGeometries(geos, false);
  } catch (e) {
    merged = null;
  }
  geos.forEach((g) => g.dispose());
  if (!merged) return null;
  merged.computeBoundingSphere();
  const out = new THREE.Mesh(merged, material);
  out.name = name;
  out.castShadow = usable.some((m) => m.castShadow);
  out.receiveShadow = usable.some((m) => m.receiveShadow);
  root.add(out);
  for (const m of usable) m.parent.remove(m);
  return out;
}
