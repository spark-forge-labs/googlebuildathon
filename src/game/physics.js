import * as THREE from 'three';
import { ROAD_HALF_WIDTH } from './track.js';
import { WALL_INNER, TRACK_LIMIT, KERB_OUTER } from './streetCircuit.js';

/**
 * Race rules. strict: a crash, three track-limit offences or driving the wrong way
 * gets you disqualified (rivals included). arcade: you're put back on the road instead.
 */
export const raceRules = { strict: true };
const CRASH_WALL_INTO = 17; // speed into a barrier (u/s, ~61 km/h side-on) that wrecks the car
const CRASH_CLOSING = 15; // closing speed between two cars that wrecks the one at fault
const LIMIT_STRIKES = 3;
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
    this.ctrl = { steer: 0, throttle: 0, brake: 0, nitro: 0 };
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
    this.clearRaceState();
    // AI drivers aren't perfect: some will make one big mistake in laps 2-3
    this.mistakeAt = !this.isPlayer && Math.random() < 0.2 ? 1 + Math.random() * 1.6 : null;
    this.mistake = null;

    this.syncVisual(0);
  }

  clearRaceState() {
    this.crash = null;
    this.dsq = null;
    this.trackLimitStrikes = 0;
    this.offTrackTime = 0;
    this.offTrackCounted = false;
    this.wrongWayTime = 0;
    this.wallCooldown = 0;
    this.dsqTime = 0;
    this.retired = false;
    this.events = [];
    if (this.rig && this.rig.root) this.rig.root.visible = true;
    if (this.rig && this.rig.root) this.rig.root.position.y = this.pos.y;
  }

  /** Big impact: the car is wrecked, spins and slides to a stop. */
  crashOut(reason, impact = 20) {
    if (this.crash || this.finished) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.crash = {
      t: 0,
      reason,
      impact,
      spin: dir * (2.4 + Math.min(impact, 60) * 0.09),
      flip: impact > 27 && Math.random() < 0.65,
      flipDir: Math.random() < 0.5 ? -1 : 1,
      lift: 0,
      debris: true,
    };
    // strict rules disqualify; rivals are always out of the race after a crash
    if (raceRules.strict || !this.isPlayer) this.dsq = reason;
    this.events.push({ type: 'crash', reason, impact });
  }

  disqualify(reason) {
    if (this.dsq || this.finished) return;
    this.dsq = reason;
    this.events.push({ type: 'dsq', reason });
  }

  resetToRoad() {
    this.crash = null;
    this.mistake = null;
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
    if (this.retired) return;
    if (this.dsq) this.dsqTime += dt;
    if (this.crash) {
      this.updateCrash(dt, particles, sound);
      return;
    }
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

    if (this.dsq) {
      // black-flagged: lift off and coast to a stop
      brake = 0.5;
    } else if (this.isPlayer && !this.finished) {
      // Support both keyboard/touch AND mobile motion-sensor steering wheel!
      const keySteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      steerInput = Math.abs(keySteer) > 0.05 ? keySteer : (input.analogSteer || 0);
      steerInput = THREE.MathUtils.clamp(steerInput, -1, 1);

      // Buttons/keys win; otherwise the phone's forward/back tilt is an analog pedal
      const tiltGas = input.analogThrottle || 0;
      const tiltBrake = input.analogBrake || 0;
      throttle = input.up ? 1 : input.down ? 0 : tiltGas;
      brake = input.down ? 1 : input.up ? 0 : tiltBrake;
      this.analogPedal = !input.up && !input.down && (tiltGas > 0 || tiltBrake > 0);
      driftHeld = input.drift || !!input.padDrift;
      nitroHeld = input.boost || !!input.padBoost;

      // Assists (settings): auto-accelerate unless braking, gentle steering toward the racing line
      if (input.autoAccelerate && brake < 0.05 && !input.down) throttle = Math.max(throttle, 1);
      if (input.steerAssist > 0) {
        const auto = this.trackSteer();
        const manual = Math.abs(steerInput);
        steerInput = THREE.MathUtils.clamp(steerInput + auto * input.steerAssist * (1 - manual * 0.6), -1, 1);
      }
    } else {
      const ai = this.computeAIControls(dt, leaderProgress);
      throttle = ai.throttle;
      brake = ai.brake;
      steerInput = ai.steer;
      driftHeld = ai.drift;
      nitroHeld = ai.nitro;
    }
    // Last applied controls (recorded into race telemetry / replays)
    this.ctrl.steer = steerInput;
    this.ctrl.throttle = throttle;
    this.ctrl.brake = brake;
    this.ctrl.nitro = nitroHeld ? 1 : 0;

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
    // Partial pedal = partial top speed, like a real accelerator
    const pedalCap = this.isPlayer && this.analogPedal && throttle > 0 ? 0.4 + 0.6 * throttle : 1;
    const effectiveMax = this.maxSpeed * offRoadFactor * nitroMult * pedalCap;

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

    // Barriers: guardrails on the elevated bridge, concrete walls at street level.
    // Slide along them, one jolt per impact, a light scrape while in contact.
    const postProj = this.track.project(this.pos, proj.u);
    const elevated = postProj.frame.point.y > 1.15;
    const wallLimit = elevated ? ROAD_HALF_WIDTH - 0.4 : WALL_INNER - 1.05;
    this.wallCooldown = Math.max(0, (this.wallCooldown || 0) - dt);
    if (Math.abs(postProj.lateral) > wallLimit) {
      const sideSign = Math.sign(postProj.lateral);
      const r = postProj.frame.right;
      const corrected = postProj.frame.point.clone().addScaledVector(r, sideSign * wallLimit);
      this.pos.x = corrected.x;
      this.pos.z = corrected.z;
      const into = (this.vel.x * r.x + this.vel.z * r.z) * sideSign;
      if (into > 0) {
        this.vel.x -= r.x * into * sideSign;
        this.vel.z -= r.z * into * sideSign;
      }
      // turn the nose back along the barrier
      const t = postProj.frame.tangent;
      const along = Math.sin(this.heading) * t.x + Math.cos(this.heading) * t.z >= 0 ? 1 : -1;
      const wallHeading = Math.atan2(t.x * along, t.z * along);
      let dh = wallHeading - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 4);
      if (into > CRASH_WALL_INTO || (this.mistake && into > 6)) {
        this.crashOut(elevated ? 'hit the bridge rail' : 'crashed into the barrier', into);
        this.bounceOffBarrier(r, sideSign, into, particles);
        this.syncVisual(dt, false);
        return;
      }
      const hard = into > 7 && this.wallCooldown <= 0;
      this.speed *= hard ? 0.86 : 0.996;
      if (hard) {
        this.wallCooldown = 0.5;
        this.impactShake = Math.max(this.impactShake, 0.5);
        if (particles) particles.emitSparks(this.pos, 5);
        if (this.isPlayer && sound) sound.playBump(0.5);
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
    // off the asphalt the car sits on the verge/run-off, a touch below the road surface
    const targetY = finalProj.onRoad ? finalProj.frame.point.y : Math.max(0.04, finalProj.frame.point.y - 0.07);
    this.pos.y = THREE.MathUtils.lerp(this.pos.y, targetY, Math.min(1, dt * 18));

    const targetNorm = finalProj.onRoad ? finalProj.frame.normal : new THREE.Vector3(0, 1, 0);
    this.currentNormal.lerp(targetNorm, Math.min(1, dt * 10)).normalize();

    this.lastU = this.u;
    this.u = finalProj.u;
    this.lateral = finalProj.lateral;
    let deltaU = this.u - this.lastU;
    if (deltaU < -0.5) deltaU += 1;
    if (deltaU > 0.5) deltaU -= 1;

    this.totalProgress += deltaU;

    const completedLaps = Math.floor(this.totalProgress);
    if (completedLaps >= this.lap && !this.finished && !this.dsq) {
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

    // Track limits: all four wheels beyond the kerb (counted once per excursion)
    if (!this.finished && !this.dsq && raceTime > 1) {
      const off = finalProj.frame.point.y <= 1.3 && finalProj.absLateral > TRACK_LIMIT;
      if (off) {
        this.offTrackTime += dt;
        if (!this.offTrackCounted && this.offTrackTime > 0.35) {
          this.offTrackCounted = true;
          this.trackLimitStrikes++;
          this.events.push({ type: 'limits', strike: this.trackLimitStrikes, max: LIMIT_STRIKES });
          if (this.trackLimitStrikes >= LIMIT_STRIKES && raceRules.strict) this.disqualify('track limits exceeded three times');
        }
      } else {
        this.offTrackTime = 0;
        this.offTrackCounted = false;
      }
      this.wrongWayTime = this.wrongWay ? this.wrongWayTime + dt : 0;
      if (this.wrongWayTime > 3 && raceRules.strict) this.disqualify('driving the wrong way');
      if (this.mistake && finalProj.absLateral > WALL_INNER - 1.6) this.crashOut('lost control', Math.abs(this.speed) * 0.5);
    }

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
      // night races: the plank scrapes the asphalt at top speed and throws showers of sparks
      if (this.nightSparks && this.onRoad && this.speed > this.maxSpeed * 0.82 && Math.random() < dt * (this.isBoosting ? 9 : 3.2)) {
        const under = this.pos.clone().add(new THREE.Vector3(-fwdX * 1.4, 0.12, -fwdZ * 1.4));
        particles.emitFloorSparks(under, this.vel);
      }
    }

    this.syncVisual(dt, brake > 0);
  }

  computeAIControls(dt, leaderProgress) {
    if (this.mistakeAt !== null && this.mistakeAt !== undefined && !this.mistake && this.totalProgress > this.mistakeAt) {
      // locks up / misjudges the corner and runs straight at the barrier
      this.mistake = { t: 0, dir: Math.random() < 0.5 ? -1 : 1 };
      this.mistakeAt = null;
    }
    if (this.mistake) {
      this.mistake.t += dt;
      if (this.mistake.t > 1.6) this.mistake = null; // caught it
      else return { throttle: 1, brake: 0, steer: this.mistake.dir * 0.9, drift: false, nitro: false };
    }
    this.aiLaneTimer -= dt;
    if (this.aiLaneTimer <= 0) {
      this.aiLaneTimer = 2.5 + Math.random() * 3.5;
      this.aiLaneOffset = (Math.random() - 0.5) * 8.8;
    }

    // racecraft: don't drive into the car in front; pull out to pass, back off for wrecks
    let avoidBrake = 0;
    let yellow = false;
    if (this.field) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const myLat = this.lateral || 0;
      for (const o of this.field) {
        if (o === this || o.retired) continue;
        const dx = o.pos.x - this.pos.x;
        const dz = o.pos.z - this.pos.z;
        const ahead = dx * fx + dz * fz;
        const range = o.crash ? 34 : 18;
        if (ahead < -1 || ahead > range) continue;
        const side = Math.abs(dx * fz - dz * fx);
        if (o.crash) yellow = true;
        if (side > (o.crash ? 3.6 : 3.0)) continue;
        const closing = this.speed - (o.vel.x * fx + o.vel.z * fz);
        if (closing <= 0.5 && !o.crash) continue;
        const oLat = o.lateral || 0;
        let want = oLat + (myLat >= oLat ? 3.6 : -3.6);
        if (Math.abs(want) > 5.4) want = oLat + (myLat >= oLat ? -3.6 : 3.6);
        this.aiLaneOffset = THREE.MathUtils.clamp(want, -5.4, 5.4);
        this.aiLaneTimer = Math.max(this.aiLaneTimer, 1.4);
        if (ahead < 11 && closing > 4) avoidBrake = Math.max(avoidBrake, Math.min(0.9, closing / 14));
      }
    }

    // brake for corners early enough: scan ~56 m ahead and keep a speed we can still slow from
    const tr = this.track;
    const L = tr.totalLength || 400;
    const cornerFactor = (c) => (c > 0.48 ? 0.8 : c > 0.28 ? 0.93 : 1.0);
    let vCap = Infinity;
    let maxC = 0;
    for (let k = 1; k <= 8; k++) {
      const c = tr.getFrameAt((this.u + (k * 7) / L) % 1).curvature;
      if (c > maxC) maxC = c;
      const vc = this.maxSpeed * this.aiSkill * cornerFactor(c);
      vCap = Math.min(vCap, Math.sqrt(vc * vc + 2 * 30 * k * 7));
    }
    const lookAheadU = (this.u + 0.042) % 1;
    const f = tr.getFrameAt(lookAheadU);
    // through corners hold a tighter line towards the inside (unless pulling out to pass)
    let lane = this.aiLaneOffset;
    if (maxC > 0.28 && this.aiLaneTimer < 1.3) {
      const t1 = tr.getFrameAt((this.u + 8 / L) % 1).tangent;
      const t2 = tr.getFrameAt((this.u + 30 / L) % 1).tangent;
      const turn = Math.sign(t1.x * t2.z - t1.z * t2.x);
      lane = THREE.MathUtils.lerp(lane, turn * 2.2, 0.65);
    }
    const target = f.point.clone().addScaledVector(f.right, lane);

    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const desiredHeading = Math.atan2(dx, dz);

    let angleDiff = desiredHeading - this.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // stay off the kerbs: steer back in if we're drifting out towards the track limits
    const lat = this.lateral || 0;
    const edge = Math.abs(lat) - 7.0;
    const steer = THREE.MathUtils.clamp(angleDiff * 2.2 + (edge > 0 ? Math.sign(lat) * Math.min(0.7, edge * 0.4) : 0), -1, 1);
    const gap = leaderProgress - this.totalProgress;
    const catchup = THREE.MathUtils.clamp(1 + gap * 0.14, 0.88, 1.12);
    const cornerSlow = f.curvature > 0.48 ? 0.74 : f.curvature > 0.28 ? 0.88 : 1.0;
    const desiredSpeed = Math.min(this.maxSpeed * this.aiSkill * catchup * cornerSlow, vCap) * (yellow ? 0.82 : 1);

    let throttle = this.speed < desiredSpeed ? 1 : 0.25;
    let brake = this.speed > desiredSpeed + 2 ? THREE.MathUtils.clamp((this.speed - desiredSpeed) / 10, 0.3, 1) : 0;
    if (edge > 1.2) throttle = Math.min(throttle, 0.4);
    if (avoidBrake > 0) brake = Math.max(brake, avoidBrake);
    if (brake > 0) throttle = 0; // the physics only brakes off the throttle
    const drift = Math.abs(angleDiff) > 0.42 && this.speed > 28;
    const nitro = !this.finished && f.curvature < 0.14 && this.boostFuel > 55 && Math.random() < 0.04;

    return { throttle, brake, steer, drift, nitro };
  }

  /** A wrecked car: slides on its momentum, spins down, maybe barrel-rolls, smokes. */
  updateCrash(dt, particles, sound) {
    const c = this.crash;
    c.t += dt;
    const proj = this.track.project(this.pos, this.u);
    const onGrass = proj.absLateral > KERB_OUTER;
    this.vel.multiplyScalar(Math.exp(-(onGrass ? 1.7 : 0.95) * dt));
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.heading += c.spin * dt;
    c.spin *= Math.exp(-1.25 * dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // still contained by barriers / guardrails: bounce off them
    const pp = this.track.project(this.pos, proj.u);
    const elevated = pp.frame.point.y > 1.15;
    const limit = elevated ? ROAD_HALF_WIDTH - 0.4 : WALL_INNER - 1.05;
    if (Math.abs(pp.lateral) > limit) {
      const sideSign = Math.sign(pp.lateral);
      const r = pp.frame.right;
      const corrected = pp.frame.point.clone().addScaledVector(r, sideSign * limit);
      this.pos.x = corrected.x;
      this.pos.z = corrected.z;
      const into = (this.vel.x * r.x + this.vel.z * r.z) * sideSign;
      if (into > 0.5) {
        this.bounceOffBarrier(r, sideSign, into, particles);
        c.spin += (Math.random() - 0.5) * into * 0.12;
        if (sound && this.isPlayer && into > 4) sound.playBump(Math.min(1, into / 20));
      }
    }

    // barrel roll for the big ones, then settle back on the wheels
    if (c.flip && c.t < 1.15) {
      const ph = c.t / 1.15;
      this.bodyRoll = ph * Math.PI * 2 * c.flipDir;
      c.lift = Math.sin(ph * Math.PI) * 1.7;
    } else {
      this.bodyRoll = THREE.MathUtils.lerp(c.flip ? 0 : this.bodyRoll, 0, Math.min(1, dt * 6));
      c.lift = THREE.MathUtils.lerp(c.lift, 0, Math.min(1, dt * 8));
    }
    this.bodyPitch = Math.sin(c.t * 11) * 0.09 * Math.exp(-c.t * 2.2);
    this.steerAngle = 0;
    this.driftAmount = 0;
    this.isBoosting = false;
    this.isDrifting = false;

    const fp = this.track.project(this.pos, pp.u);
    const groundY = fp.onRoad ? fp.frame.point.y : Math.max(0.04, fp.frame.point.y - 0.07);
    this.pos.y = THREE.MathUtils.lerp(this.pos.y, groundY + c.lift, Math.min(1, dt * 14));
    this.u = fp.u;
    this.lateral = fp.lateral;
    this.impactShake = Math.max(0, this.impactShake - dt * 2);

    if (particles) {
      if (c.debris) {
        c.debris = false;
        particles.emitDebris(this.pos, this.vel, Math.round(14 + Math.min(c.impact, 40) * 0.6));
        particles.emitSparks(this.pos, 18);
      }
      const smokeRate = Math.max(0.1, 0.9 - c.t * 0.12);
      if (Math.random() < smokeRate) {
        const p = this.pos.clone();
        p.y += 0.6;
        particles.emitSmoke(p, new THREE.Vector3(this.vel.x * 0.3, 0, this.vel.z * 0.3));
      }
      if (onGrass && this.speed > 4 && Math.random() < 0.8) particles.emitDust(this.pos, this.vel);
      if (this.speed > 10 && !onGrass && Math.random() < 0.5) particles.emitSkidPair(this.pos, this.heading, this.currentNormal);
    }
    this.syncVisual(dt, false);
  }

  bounceOffBarrier(r, sideSign, into, particles) {
    this.vel.x -= r.x * into * sideSign * 1.35;
    this.vel.z -= r.z * into * sideSign * 1.35;
    this.impactShake = Math.max(this.impactShake, Math.min(1, into / 18));
    if (particles) particles.emitSparks(this.pos, Math.min(24, 6 + Math.round(into)));
  }

  /** Steering that follows the track centre-line ahead (used by the steering assist). */
  trackSteer() {
    const f = this.track.getFrameAt((this.u + 0.035) % 1);
    const desiredHeading = Math.atan2(f.point.x - this.pos.x, f.point.z - this.pos.z);
    let diff = desiredHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return THREE.MathUtils.clamp(diff * 1.8, -1, 1);
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
    for (const w of wheelMeshes) w.rotation.x += wheelSpin * (w.userData.spinSign || 1);
    for (const pivot of frontWheelPivots) pivot.rotation.y = this.steerAngle;

    if (tailLightMat) tailLightMat.emissiveIntensity = (braking ? 2.8 : 0.9) * (this.nightSparks ? 1.9 : 1);

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
      if (a.retired || b.retired) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      if (Math.abs(b.pos.y - a.pos.y) > 2.0) continue;

      const dSq = dx * dx + dz * dz;
      if (dSq < minDist * minDist && dSq > 0.0001) {
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const nz = dz / d;
        // a heavy hit wrecks the car that drove into the other one
        const closing = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
        if (closing > CRASH_CLOSING && !(a.crash && b.crash)) {
          const aInto = a.vel.x * nx + a.vel.z * nz;
          const bInto = -(b.vel.x * nx + b.vel.z * nz);
          let atFault = aInto >= bInto ? a : b;
          if (atFault.crash) atFault = atFault === a ? b : a;
          const victim = atFault === a ? b : a;
          // rivals take avoiding action around a wreck; you have to do that yourself
          if (atFault.isPlayer || !victim.crash) atFault.crashOut(`collided with ${victim.name}`, closing);
          if (!victim.crash) {
            victim.speed *= 0.8;
            victim.heading += (Math.random() - 0.5) * 0.5;
          }
        }
        const overlap = (minDist - d) * 0.52;

        a.pos.x -= nx * overlap;
        a.pos.z -= nz * overlap;
        b.pos.x += nx * overlap;
        b.pos.z += nz * overlap;

        // equal-mass contact impulse (only while closing), plus a light separating nudge
        const j = Math.max(0, closing) * 0.6 + 0.8;
        a.vel.x -= nx * j;
        a.vel.z -= nz * j;
        b.vel.x += nx * j;
        b.vel.z += nz * j;
        if (closing > 0) {
          const aFwd = Math.max(0, Math.sin(a.heading) * nx + Math.cos(a.heading) * nz);
          const bFwd = Math.max(0, -(Math.sin(b.heading) * nx + Math.cos(b.heading) * nz));
          if (!a.crash) a.speed -= closing * 0.5 * aFwd;
          if (!b.crash) b.speed -= closing * 0.5 * bFwd;
        }
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
