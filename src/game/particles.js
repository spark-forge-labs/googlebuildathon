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
        bounce: false,
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

  spawn({ pos, vel, color = 0xffffff, scale = 0.7, grow = 1.6, life = 0.55, gravity = 0, opacity = 0.75, bounce = false, floorY = 0.12 }) {
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
    p.bounce = bounce;
    p.floorY = floorY;

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

  /** Titanium skid-block sparks: a short bright streak thrown back and bouncing off the asphalt. */
  emitFloorSparks(pos, carVel, count = 6) {
    for (let i = 0; i < count; i++) {
      this.spawn({
        pos,
        vel: new THREE.Vector3(
          carVel.x * (0.45 + Math.random() * 0.3) + (Math.random() - 0.5) * 3,
          0.6 + Math.random() * 2.4,
          carVel.z * (0.45 + Math.random() * 0.3) + (Math.random() - 0.5) * 3
        ),
        color: Math.random() > 0.4 ? 0xfff2b8 : 0xffa53a,
        scale: 0.15 + Math.random() * 0.08,
        grow: 0.05,
        life: 0.22 + Math.random() * 0.2,
        gravity: -16,
        opacity: 1,
        bounce: true,
        floorY: pos.y,
      });
    }
  }

  /** Bodywork shards thrown out of a crash. */
  emitDebris(pos, carVel, count = 20) {
    const cols = [0x1a1a1a, 0x2b2b2b, 0x444444, 0x7a0f0f, 0xb0b0b0];
    for (let i = 0; i < count; i++) {
      this.spawn({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6)),
        vel: new THREE.Vector3(
          carVel.x * (0.3 + Math.random() * 0.5) + (Math.random() - 0.5) * 14,
          4 + Math.random() * 9,
          carVel.z * (0.3 + Math.random() * 0.5) + (Math.random() - 0.5) * 14
        ),
        color: cols[(Math.random() * cols.length) | 0],
        scale: 0.12 + Math.random() * 0.28,
        grow: 1,
        life: 1.6 + Math.random() * 1.4,
        gravity: -24,
        opacity: 1,
        bounce: true,
      });
    }
  }

  /** Grass and dirt kicked up when a car slides off the track. */
  emitDust(pos, carVel) {
    this.spawn({
      pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.3, (Math.random() - 0.5) * 2)),
      vel: new THREE.Vector3(carVel.x * 0.15 + (Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.6, carVel.z * 0.15 + (Math.random() - 0.5) * 2),
      color: Math.random() < 0.5 ? 0x8a7a55 : 0x6b7a45,
      scale: 0.6 + Math.random() * 0.5,
      grow: 3.2,
      life: 1.1 + Math.random() * 0.6,
      gravity: -0.6,
      opacity: 0.5,
    });
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
      if (p.bounce && p.mesh.position.y < p.floorY && p.vel.y < 0) {
        // carbon-fibre shards skitter along the asphalt
        p.mesh.position.y = p.floorY;
        p.vel.y *= -0.32;
        p.vel.x *= 0.62;
        p.vel.z *= 0.62;
      }
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
