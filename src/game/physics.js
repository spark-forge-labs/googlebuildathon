import * as THREE from 'three';
import { ROAD_HALF_WIDTH } from './track.js';
import { DESK_HALF_W, DESK_HALF_D } from './deskWorld.js';

export const TOTAL_LAPS = 3;

export class Racer {
  constructor({ id, name, isPlayer, spec, meshRig, track, gridIndex }) {
    this.id = id;
    this.name = name;
    this.isPlayer = isPlayer;
    this.spec = spec;
    this.rig = meshRig;
    this.track = track;

    this.maxSpeed = spec.maxSpeed || 55;
    this.accel = spec.accel || 35;
    this.turnRate = spec.turnRate || 2.38;
    this.aiSkill = spec.skill || 0.92;
    this.aiLaneOffset = ((gridIndex % 3) - 1) * 3.1 + (Math.random() - 0.5) * 1.1;
    this.aiLaneTimer = 1 + Math.random() * 3;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.prevSpeed = 0;
    this.steerAngle = 0;
    this.driftAmount = 0;
    this.isDrifting = false;

    // Realistic suspension body pitch (squat/dive) and roll (cornering lean)
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.skidCooldown = 0;
    this.impactShake = 0;

    this.boostFuel = 65;
    this.boostTimer = 0;
    this.isBoosting = false;

    this.u = 0;
    this.lastU = 0;
    this.lap = 1;
    this.totalProgress = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lapStartTime = 0;
    this.bestLapTime = Infinity;
    this.topSpeedKmh = 0;
    this.wrongWay = false;
    this.onRoad = true;
    this.padCooldown = 0;

    this.currentNormal = new THREE.Vector3(0, 1, 0);
    this.placeOnGrid(gridIndex);
  }

  placeOnGrid(gridIndex) {
    const row = Math.floor(gridIndex / 2);
    const col = gridIndex % 2 === 0 ? -1 : 1;
    const startU = (1 - 0.015 - row * 0.017) % 1;
    const f = this.track.getFrameAt(startU);

    this.pos.copy(f.point).addScaledVector(f.right, col * 3.1);
    this.heading = Math.atan2(f.tangent.x, f.tangent.z);
    this.speed = 0;
    this.prevSpeed = 0;
    this.vel.set(0, 0, 0);
    this.steerAngle = 0;
    this.driftAmount = 0;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.isDrifting = false;
    this.boostFuel = 65;
    this.boostTimer = 0;
    this.isBoosting = false;
    this.u = startU;
    this.lastU = startU;
    this.lap = 1;
    this.totalProgress = startU - 1;
    this.finished = false;
    this.finishTime = 0;
    this.lapStartTime = 0;
    this.bestLapTime = Infinity;
    this.topSpeedKmh = 0;
    this.wrongWay = false;
    this.currentNormal.copy(f.normal);

    this.syncVisual(0);
  }

  resetToRoad() {
    const proj = this.track.project(this.pos, this.u);
    this.pos.copy(proj.frame.point);
    this.heading = Math.atan2(proj.frame.tangent.x, proj.frame.tangent.z);
    this.speed = 0;
    this.vel.set(0, 0, 0);
    this.driftAmount = 0;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.u = proj.u;
    this.syncVisual(0);
  }

  update(dt, input, raceTime, deskWorld, particles, sound, leaderProgress) {
    if (this.padCooldown > 0) this.padCooldown -= dt;
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (this.skidCooldown > 0) this.skidCooldown -= dt;
    this.impactShake = Math.max(0, this.impactShake - dt * 3.5);
    this.prevSpeed = this.speed;

    let throttle = 0;
    let brake = 0;
    let steerInput = 0;
    let driftHeld = false;
    let nitroHeld = false;

    if (this.isPlayer && !this.finished) {
      // Support both keyboard/touch AND mobile motion-sensor steering wheel!
      const keySteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      steerInput = Math.abs(keySteer) > 0.05 ? keySteer : (input.analogSteer || 0);
      steerInput = THREE.MathUtils.clamp(steerInput, -1, 1);

      const autoGas = Boolean(input.motionAutoGas && !input.down);
      throttle = input.up || autoGas ? 1 : 0;
      brake = input.down ? 1 : 0;
      driftHeld = input.drift;
      nitroHeld = input.boost;
    } else {
      const ai = this.computeAIControls(dt, leaderProgress);
      throttle = ai.throttle;
      brake = ai.brake;
      steerInput = ai.steer;
      driftHeld = ai.drift;
      nitroHeld = ai.nitro;
    }

    const proj = this.track.project(this.pos, this.u);
    this.onRoad = proj.onRoad;

    // Check boost pads
    if (this.padCooldown <= 0 && proj.absLateral < 3.6) {
      for (const padU of this.track.boostPadsU) {
        let diff = Math.abs(proj.u - padU);
        if (diff > 0.5) diff = 1 - diff;
        if (diff < 0.011) {
          this.boostTimer = 1.05;
          this.boostFuel = Math.min(100, this.boostFuel + 24);
          this.padCooldown = 0.9;
          if (this.isPlayer && sound) sound.playBoost();
          break;
        }
      }
    }

    const manualNitro = nitroHeld && this.boostFuel > 4 && throttle > 0;
    if (manualNitro) {
      this.boostFuel = Math.max(0, this.boostFuel - 34 * dt);
    } else {
      this.boostFuel = Math.min(100, this.boostFuel + 4.5 * dt);
    }
    this.isBoosting = manualNitro || this.boostTimer > 0;

    const offRoadFactor = this.onRoad ? 1.0 : 0.72;
    const nitroMult = this.isBoosting ? 1.33 : 1.0;
    const effectiveMax = this.maxSpeed * offRoadFactor * nitroMult;

    if (throttle > 0) {
      const accelBoost = this.isBoosting ? 1.6 : 1.0;
      this.speed += this.accel * accelBoost * throttle * dt;
    } else if (brake > 0) {
      if (this.speed > 2) this.speed -= 52 * brake * dt;
      else this.speed -= 20 * brake * dt;
    } else {
      const drag = this.onRoad ? 13 : 22;
      if (Math.abs(this.speed) < drag * dt) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * drag * dt;
    }

    if (this.speed > effectiveMax) {
      this.speed = THREE.MathUtils.lerp(this.speed, effectiveMax, Math.min(1, dt * 4.2));
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -18, this.maxSpeed * 1.44);

    // Steering & Drift Mechanics
    this.isDrifting = driftHeld && Math.abs(steerInput) > 0.14 && this.speed > 18 && this.onRoad;
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 14, 0, 1);
    const reverseFlip = this.speed >= -0.1 ? 1 : -1;
    const driftTurnMult = this.isDrifting ? 1.38 : 1.0;

    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, steerInput * 0.45, Math.min(1, dt * 13));
    this.heading += steerInput * this.turnRate * driftTurnMult * speedFactor * reverseFlip * dt;

    if (this.isDrifting) {
      this.driftAmount = THREE.MathUtils.lerp(this.driftAmount, steerInput * 0.34, Math.min(1, dt * 7));
      this.boostFuel = Math.min(100, this.boostFuel + 22 * dt);
      this.speed *= 1 - 0.16 * dt;
    } else {
      this.driftAmount = THREE.MathUtils.lerp(this.driftAmount, 0, Math.min(1, dt * 9));
    }

    // Realistic chassis suspension pitch (acceleration squat / braking nose-dive) & cornering roll!
    const longitudinalAccel = (this.speed - this.prevSpeed) / Math.max(dt, 0.008);
    const targetPitch = THREE.MathUtils.clamp(-longitudinalAccel * 0.0022 - (this.isBoosting ? 0.045 : 0), -0.09, 0.09);
    const lateralG = steerInput * speedFactor * (this.isDrifting ? 1.45 : 1.0);
    const targetRoll = THREE.MathUtils.clamp(lateralG * 0.11, -0.14, 0.14);
    this.bodyPitch = THREE.MathUtils.lerp(this.bodyPitch, targetPitch, Math.min(1, dt * 9));
    this.bodyRoll = THREE.MathUtils.lerp(this.bodyRoll, targetRoll, Math.min(1, dt * 10));

    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const grip = this.isDrifting ? 3.4 : this.onRoad ? 9.8 : 5.5;
    this.vel.x = THREE.MathUtils.lerp(this.vel.x, fwdX * this.speed, Math.min(1, grip * dt));
    this.vel.z = THREE.MathUtils.lerp(this.vel.z, fwdZ * this.speed, Math.min(1, grip * dt));

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // Elevated Bridge Guardrail Containment
    const postProj = this.track.project(this.pos, proj.u);
    if (postProj.frame.point.y > 1.15) {
      const limit = ROAD_HALF_WIDTH - 0.4;
      if (Math.abs(postProj.lateral) > limit) {
        const clampedLat = Math.sign(postProj.lateral) * limit;
        const corrected = postProj.frame.point.clone().addScaledVector(postProj.frame.right, clampedLat);
        this.pos.x = corrected.x;
        this.pos.z = corrected.z;
        this.speed *= 0.88;
        this.impactShake = Math.max(this.impactShake, 0.45);
        if (this.isPlayer && sound && Math.abs(this.speed) > 12) sound.playBump(0.4);
      }
    }

    // Desk Edge Containment
    const maxDeskX = DESK_HALF_W - 3.5;
    const maxDeskZ = DESK_HALF_D - 3.5;
    if (Math.abs(this.pos.x) > maxDeskX) {
      this.pos.x = Math.sign(this.pos.x) * maxDeskX;
      this.vel.x *= -0.35;
      this.speed *= 0.72;
      this.impactShake = Math.max(this.impactShake, 0.55);
    }
    if (Math.abs(this.pos.z) > maxDeskZ) {
      this.pos.z = Math.sign(this.pos.z) * maxDeskZ;
      this.vel.z *= -0.35;
      this.speed *= 0.72;
      this.impactShake = Math.max(this.impactShake, 0.55);
    }

    // Desk Props & Iconic Towers Colliders
    const carRadius = 1.65;
    for (const c of deskWorld.colliders) {
      const dx = this.pos.x - c.x;
      const dz = this.pos.z - c.z;
      const minD = c.radius + carRadius;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD * minD && dSq > 0.0001) {
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const nz = dz / d;
        this.pos.x = c.x + nx * minD;
        this.pos.z = c.z + nz * minD;
        this.vel.x += nx * 8;
        this.vel.z += nz * 8;
        this.speed *= 0.65;
        this.impactShake = Math.max(this.impactShake, 0.85);
        if (particles) particles.emitSparks(this.pos, 7);
        if (this.isPlayer && sound) sound.playBump(0.75);
      }
    }

    const finalProj = this.track.project(this.pos, postProj.u);
    const targetY = finalProj.onRoad ? finalProj.frame.point.y : 0.04;
    this.pos.y = THREE.MathUtils.lerp(this.pos.y, targetY, Math.min(1, dt * 18));

    const targetNorm = finalProj.onRoad ? finalProj.frame.normal : new THREE.Vector3(0, 1, 0);
    this.currentNormal.lerp(targetNorm, Math.min(1, dt * 10)).normalize();

    this.lastU = this.u;
    this.u = finalProj.u;
    let deltaU = this.u - this.lastU;
    if (deltaU < -0.5) deltaU += 1;
    if (deltaU > 0.5) deltaU -= 1;

    this.totalProgress += deltaU;

    const completedLaps = Math.floor(this.totalProgress);
    if (completedLaps >= this.lap && !this.finished) {
      if (this.lap >= 1 && raceTime > 4) {
        const lapDur = raceTime - this.lapStartTime;
        if (lapDur > 5 && lapDur < this.bestLapTime) this.bestLapTime = lapDur;
        this.lapStartTime = raceTime;
      }
      this.lap = completedLaps + 1;
      if (this.lap > TOTAL_LAPS) {
        this.finished = true;
        this.finishTime = raceTime;
        this.lap = TOTAL_LAPS;
      }
    }

    const dotDir = fwdX * finalProj.frame.tangent.x + fwdZ * finalProj.frame.tangent.z;
    this.wrongWay = this.speed > 5 && dotDir < -0.35;

    const kmh = Math.round(Math.abs(this.speed) * 3.8);
    if (kmh > this.topSpeedKmh) this.topSpeedKmh = kmh;

    // Emit drift smoke, real-time asphalt skid marks & nitro exhaust flames
    if (particles) {
      const hardBraking = brake > 0 && this.speed > 26 && this.onRoad;
      if ((this.isDrifting || hardBraking) && this.skidCooldown <= 0) {
        particles.emitSkidPair(this.pos, this.heading + this.driftAmount, this.currentNormal);
        this.skidCooldown = 0.045;
      }
      if (this.isDrifting && Math.random() < 0.72) {
        const rear = this.pos.clone().add(new THREE.Vector3(-fwdX * 1.7, 0.3, -fwdZ * 1.7));
        particles.emitSmoke(rear, this.vel);
      }
      if (this.isBoosting && Math.random() < 0.8) {
        const tail = this.pos.clone().add(new THREE.Vector3(-fwdX * 2.25, 0.45, -fwdZ * 2.25));
        particles.emitNitro(tail, new THREE.Vector3(-fwdX, 0.08, -fwdZ));
      }
    }

    this.syncVisual(dt, brake > 0);
  }

  computeAIControls(dt, leaderProgress) {
    this.aiLaneTimer -= dt;
    if (this.aiLaneTimer <= 0) {
      this.aiLaneTimer = 2.5 + Math.random() * 3.5;
      this.aiLaneOffset = (Math.random() - 0.5) * 8.8;
    }

    const lookAheadU = (this.u + 0.042) % 1;
    const f = this.track.getFrameAt(lookAheadU);
    const target = f.point.clone().addScaledVector(f.right, this.aiLaneOffset);

    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const desiredHeading = Math.atan2(dx, dz);

    let angleDiff = desiredHeading - this.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const steer = THREE.MathUtils.clamp(angleDiff * 2.2, -1, 1);
    const gap = leaderProgress - this.totalProgress;
    const catchup = THREE.MathUtils.clamp(1 + gap * 0.14, 0.88, 1.12);
    const cornerSlow = f.curvature > 0.48 ? 0.74 : f.curvature > 0.28 ? 0.88 : 1.0;
    const desiredSpeed = this.maxSpeed * this.aiSkill * catchup * cornerSlow;

    const throttle = this.speed < desiredSpeed ? 1 : 0.25;
    const brake = this.speed > desiredSpeed + 8 ? 0.6 : 0;
    const drift = Math.abs(angleDiff) > 0.42 && this.speed > 28;
    const nitro = !this.finished && f.curvature < 0.14 && this.boostFuel > 55 && Math.random() < 0.04;

    return { throttle, brake, steer, drift, nitro };
  }

  syncVisual(dt, braking = false) {
    const { root, bodyGroup, frontWheelPivots, wheelMeshes, tailLightMat, nitroFlames } = this.rig;
    root.position.copy(this.pos);

    const visualHeading = this.heading + this.driftAmount;
    const fwd = new THREE.Vector3(Math.sin(visualHeading), 0, Math.cos(visualHeading));
    const up = this.currentNormal;
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const orthoFwd = new THREE.Vector3().crossVectors(right, up).normalize();

    const mat = new THREE.Matrix4().makeBasis(right, up, orthoFwd);
    root.quaternion.setFromRotationMatrix(mat);

    // Apply realistic suspension pitch & cornering roll to chassis body!
    if (bodyGroup) {
      bodyGroup.rotation.x = this.bodyPitch;
      bodyGroup.rotation.z = this.bodyRoll;
    }

    const wheelSpin = this.speed * dt * 2.2;
    for (const w of wheelMeshes) w.rotation.x += wheelSpin;
    for (const pivot of frontWheelPivots) pivot.rotation.y = this.steerAngle;

    if (tailLightMat) tailLightMat.emissiveIntensity = braking ? 2.8 : 0.9;

    for (const flame of nitroFlames) {
      flame.visible = this.isBoosting;
      if (this.isBoosting) flame.scale.set(1, 1, 0.82 + Math.random() * 0.7);
    }
  }
}

export function resolveCarCollisions(racers, particles, sound) {
  const minDist = 2.65;
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i];
      const b = racers[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      if (Math.abs(b.pos.y - a.pos.y) > 2.0) continue;

      const dSq = dx * dx + dz * dz;
      if (dSq < minDist * minDist && dSq > 0.0001) {
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const nz = dz / d;
        const overlap = (minDist - d) * 0.52;

        a.pos.x -= nx * overlap;
        a.pos.z -= nz * overlap;
        b.pos.x += nx * overlap;
        b.pos.z += nz * overlap;

        const push = 5.5;
        a.vel.x -= nx * push;
        a.vel.z -= nz * push;
        b.vel.x += nx * push;
        b.vel.z += nz * push;
        a.impactShake = Math.max(a.impactShake, 0.7);
        b.impactShake = Math.max(b.impactShake, 0.7);

        if (particles) {
          const mid = a.pos.clone().lerp(b.pos, 0.5);
          mid.y += 0.7;
          particles.emitSparks(mid, 7);
        }
        if ((a.isPlayer || b.isPlayer) && sound) sound.playBump(0.65);
      }
    }
  }
}
