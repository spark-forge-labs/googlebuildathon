import * as THREE from 'three';

/**
 * Translucent "ghost" car that replays a recorded run (10 Hz samples:
 * [ms, x, y, z, heading, speed, ...]) in sync with the current race clock.
 */
export class GhostCar {
  constructor(scene, rig, samples, label = 'GHOST') {
    this.scene = scene;
    this.rig = rig;
    this.samples = samples;
    this.label = label;
    this.idx = 0;
    rig.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const ghostMats = mats.map((m) => {
        const g = m.clone();
        g.transparent = true;
        g.opacity = 0.32;
        g.depthWrite = false;
        if (g.emissive) g.emissive.set(0x6ec6ff);
        if ('emissiveIntensity' in g) g.emissiveIntensity = 0.35;
        return g;
      });
      o.material = Array.isArray(o.material) ? ghostMats : ghostMats[0];
    });
    for (const f of rig.nitroFlames || []) f.visible = false;
    rig.root.renderOrder = 5;
    rig.root.visible = false;
    scene.add(rig.root);
  }

  update(raceTimeSec) {
    const s = this.samples;
    if (!s || s.length < 2) return;
    const t = raceTimeSec * 1000;
    if (t < s[0][0] || t > s[s.length - 1][0] + 1500) {
      this.rig.root.visible = false;
      return;
    }
    if (this.idx >= s.length - 1 || s[this.idx][0] > t) this.idx = 0;
    while (this.idx < s.length - 2 && s[this.idx + 1][0] <= t) this.idx++;
    const a = s[this.idx];
    const b = s[Math.min(this.idx + 1, s.length - 1)];
    const k = b[0] > a[0] ? THREE.MathUtils.clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0;
    let dh = b[4] - a[4];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.rig.root.visible = true;
    this.rig.root.position.set(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k);
    this.rig.root.rotation.set(0, a[4] + dh * k, 0);
    const spin = ((a[5] + (b[5] - a[5]) * k) * 0.016 * 2.2);
    for (const w of this.rig.wheelMeshes || []) w.rotation.x += spin * (w.userData.spinSign || 1);
  }

  dispose() {
    this.scene.remove(this.rig.root);
    this.rig.root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    });
  }
}
