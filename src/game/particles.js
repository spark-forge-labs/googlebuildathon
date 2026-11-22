import * as THREE from 'three';

/**
 * Pooled 3D particle system + Real-Time Asphalt Tire Skid Marks!
 */
export class ParticleSystem {
  constructor(scene, maxParticles = 260, maxSkids = 220) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.pool = [];
    const geo = new THREE.DodecahedronGeometry(0.32, 0);
    for (let i = 0; i < maxParticles; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        mesh,
        active: false,
        life: 0,
        maxLife: 1,
        vel: new THREE.Vector3(),
        grow: 1,
        gravity: 0,
        startScale: 1,
        startOpacity: 0.8,
      });
    }
    this.cursor = 0;

    // Pooled asphalt tire skid marks
    this.skids = [];
    const skidGeo = new THREE.PlaneGeometry(0.38, 1.35);
    skidGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < maxSkids; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x090a0e,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(skidGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.skids.push({ mesh, life: 0, maxLife: 6.5, active: false });
    }
    this.skidCursor = 0;
  }

  clearSkids() {
    for (const s of this.skids) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  emitSkidPair(pos, heading, normal) {
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);

    for (const side of [-0.96, 0.96]) {
      const s = this.skids[this.skidCursor];
      this.skidCursor = (this.skidCursor + 1) % this.skids.length;
      s.active = true;
      s.life = 0;
      s.mesh.visible = true;
      s.mesh.position.set(
        pos.x - fwdX * 1.32 + rightX * side,
        pos.y + 0.055,
        pos.z - fwdZ * 1.32 + rightZ * side
      );
      s.mesh.rotation.set(0, heading, 0);
      if (normal && normal.y < 0.995) {
        const up = normal;
        const fwd = new THREE.Vector3(fwdX, 0, fwdZ);
        const r = new THREE.Vector3().crossVectors(up, fwd).normalize();
        const of = new THREE.Vector3().crossVectors(r, up).normalize();
        s.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, up, of));
      }
      s.mesh.material.opacity = 0.44;
    }
  }

  spawn({ pos, vel, color = 0xffffff, scale = 0.7, grow = 1.6, life = 0.55, gravity = 0, opacity = 0.75 }) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;

    p.active = true;
    p.life = 0;
    p.maxLife = life;
    p.vel.copy(vel);
    p.grow = grow;
    p.gravity = gravity;
    p.startScale = scale;
    p.startOpacity = opacity;

    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.mesh.scale.setScalar(scale);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = opacity;
  }

  emitSmoke(pos, carVel) {
    this.spawn({
      pos,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 2.2 - carVel.x * 0.08,
        1.4 + Math.random() * 1.4,
        (Math.random() - 0.5) * 2.2 - carVel.z * 0.08
      ),
      color: 0xd8dce8,
      scale: 0.65,
      grow: 2.6,
      life: 0.55,
      gravity: 0.2,
      opacity: 0.48,
    });
  }

  emitNitro(pos, backwardDir) {
    const color = Math.random() > 0.45 ? 0xff8c2b : 0x18d6c4;
    this.spawn({
      pos,
      vel: backwardDir
        .clone()
        .multiplyScalar(7 + Math.random() * 5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5)),
      color,
      scale: 0.58,
      grow: 0.2,
      life: 0.24,
      gravity: 0,
      opacity: 0.92,
    });
  }

  emitSparks(pos, count = 10) {
    for (let i = 0; i < count; i++) {
      this.spawn({
        pos,
        vel: new THREE.Vector3((Math.random() - 0.5) * 14, 4 + Math.random() * 7, (Math.random() - 0.5) * 14),
        color: Math.random() > 0.35 ? 0xffd166 : 0xff6b35,
        scale: 0.28,
        grow: 0.1,
        life: 0.36 + Math.random() * 0.2,
        gravity: -20,
        opacity: 0.95,
      });
    }
  }

  emitSteam(pos) {
    this.spawn({
      pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3.5, 0, (Math.random() - 0.5) * 3.5)),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.9, 3.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.9),
      color: 0xf7f2eb,
      scale: 1.5,
      grow: 4.2,
      life: 2.3,
      gravity: 0.2,
      opacity: 0.24,
    });
  }

  emitConfetti(pos, count = 55) {
    const palette = [0xff8c2b, 0xf7c948, 0x18d6c4, 0xff4d6d, 0xffffff, 0x6ef3a5];
    for (let i = 0; i < count; i++) {
      this.spawn({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 4 + Math.random() * 4, (Math.random() - 0.5) * 10)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 16, 9 + Math.random() * 10, (Math.random() - 0.5) * 16),
        color: palette[i % palette.length],
        scale: 0.55,
        grow: 0.9,
        life: 1.8 + Math.random() * 0.9,
        gravity: -11,
        opacity: 1.0,
      });
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const t = p.life / p.maxLife;
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 4;
      p.mesh.rotation.y += dt * 3;
      p.mesh.scale.setScalar(THREE.MathUtils.lerp(p.startScale, p.startScale * p.grow, t));
      p.mesh.material.opacity = p.startOpacity * (1 - t);
    }

    for (const s of this.skids) {
      if (!s.active) continue;
      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      if (s.life > s.maxLife * 0.65) {
        const fade = 1 - (s.life - s.maxLife * 0.65) / (s.maxLife * 0.35);
        s.mesh.material.opacity = 0.44 * fade;
      }
    }
  }
}
