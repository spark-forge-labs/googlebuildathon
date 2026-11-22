import { TOTAL_LAPS } from './physics.js';

export const CHECKPOINTS_PER_LAP = 20;
export const SAMPLE_INTERVAL = 0.1; // seconds (10 Hz)

/**
 * Records the player's race for server-side validation and ghost replays:
 *  - checkpoints: [index, ms] each time total progress crosses k/20 of a lap (k = 1..60)
 *  - samples: 10 Hz [ms, x, y, z, heading, speed, steer, throttle, brake, nitro]
 * Called from the fixed-timestep physics loop, so timings are step-exact.
 */
export class RaceTelemetry {
  constructor() {
    this.checkpoints = [];
    this.samples = [];
    this.nextCheckpoint = 1;
    this.nextSampleT = 0;
    this.total = TOTAL_LAPS * CHECKPOINTS_PER_LAP;
  }

  step(raceTime, racer) {
    while (this.nextCheckpoint <= this.total && racer.totalProgress >= this.nextCheckpoint / CHECKPOINTS_PER_LAP) {
      this.checkpoints.push([this.nextCheckpoint, Math.round(raceTime * 1000)]);
      this.nextCheckpoint++;
    }
    if (raceTime >= this.nextSampleT) {
      const c = racer.ctrl;
      const r2 = (v) => Math.round(v * 100) / 100;
      this.samples.push([
        Math.round(raceTime * 1000),
        r2(racer.pos.x),
        r2(racer.pos.y),
        r2(racer.pos.z),
        Math.round(racer.heading * 1000) / 1000,
        r2(racer.speed),
        r2(c.steer),
        r2(c.throttle),
        r2(c.brake),
        c.nitro,
      ]);
      this.nextSampleT += SAMPLE_INTERVAL;
    }
  }

  complete() {
    return this.checkpoints.length === this.total;
  }
}
