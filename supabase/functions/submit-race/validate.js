// Server-side plausibility checks for a submitted race (pure JS: runs in Deno and Node).
// The client records 60 checkpoints (20 per lap x 3 laps) and 10 Hz samples
// [ms, x, y, z, heading, speed, steer, throttle, brake, nitro]. A run is accepted only if
// every part of it fits what the fastest car can physically do on that circuit.

export const LAPS = 3;
export const CHECKPOINTS_PER_LAP = 20;
const SPEED_MARGIN = 1.12; // headroom over the physics speed clamp (collisions, drift slide)
const WORLD_HALF_X = 116;
const WORLD_HALF_Z = 82;

/** @param {string} reason @returns {{ ok: false, reason: string }} */
const fail = (reason) => ({ ok: false, reason });

/** @param {unknown} name */
export function sanitizeName(name) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
}

/**
 * @typedef {{ player_name: string, city: string, total_ms: number, best_lap_ms: number,
 *             car: string | null, finish_position: number }} LeaderboardRow
 * @typedef {{ checkpoints: number[][], samples: number[][] }} Replay
 * @typedef {{ ok: true, row: LeaderboardRow, replay: Replay } | { ok: false, reason: string }} Verdict
 */

/**
 * @param {any} run    payload from the client
 * @param {{ tracks: Record<string, { lapLength: number }>, cars: string[], vmax: number }} data  tracks.json
 * @returns {Verdict}
 */
export function validateRun(run, data) {
  if (!run || typeof run !== 'object') return fail('empty submission');
  const track = data.tracks[run.city];
  if (!track) return fail('unknown city');
  const name = sanitizeName(run.name);
  if (!name) return fail('missing player name');
  const car = run.car == null ? null : String(run.car);
  if (car !== null && !data.cars.includes(car)) return fail('unknown car');
  const position = Number(run.position);
  if (!Number.isInteger(position) || position < 1 || position > 6) return fail('bad finishing position');
  const totalMs = Number(run.totalMs);
  if (!Number.isInteger(totalMs) || totalMs < 8000 || totalMs > 900000) return fail('race time out of range');

  const vmax = data.vmax * SPEED_MARGIN; // units per second
  const lap = track.lapLength;
  const segLen = lap / CHECKPOINTS_PER_LAP;

  // --- Checkpoints: all 60, in order, each segment no faster than physically possible ---
  const cps = run.checkpoints;
  const expected = LAPS * CHECKPOINTS_PER_LAP;
  if (!Array.isArray(cps) || cps.length !== expected) return fail('incomplete checkpoint trail');
  let prevMs = 0;
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    if (!Array.isArray(c) || c.length !== 2) return fail('malformed checkpoint');
    const [idx, ms] = c;
    if (idx !== i + 1) return fail('checkpoints out of order');
    if (!Number.isFinite(ms) || ms <= prevMs) return fail('checkpoint times not increasing');
    const minMs = (segLen / vmax) * 1000;
    if (ms - prevMs < minMs) return fail(`impossibly fast between checkpoints ${i} and ${i + 1}`);
    prevMs = ms;
  }
  if (Math.abs(prevMs - totalMs) > 60) return fail('finish time does not match the checkpoint trail');
  if (totalMs < ((LAPS * lap) / vmax) * 1000) return fail('faster than the car can complete three laps');

  // Lap times from the checkpoint trail (laps end at checkpoints 20, 40, 60)
  const lapEnds = [cps[19][1], cps[39][1], cps[59][1]];
  const lapTimes = [lapEnds[0], lapEnds[1] - lapEnds[0], lapEnds[2] - lapEnds[1]];
  const bestLapMs = Math.min(lapTimes[1], lapTimes[2]); // lap 1 includes the standing start
  if (bestLapMs < (lap / vmax) * 1000) return fail('impossible lap time');

  // --- Samples: continuous, inside the world, consistent with the car's speed ---
  const s = run.samples;
  const expectedSamples = totalMs / 100;
  if (!Array.isArray(s) || s.length < expectedSamples * 0.7 || s.length > expectedSamples * 1.3 + 10) {
    return fail('telemetry sample count does not match the race time');
  }
  let path = 0;
  let prev = null;
  for (const row of s) {
    if (!Array.isArray(row) || row.length !== 10 || !row.every((v) => Number.isFinite(v))) return fail('malformed telemetry sample');
    const [t, x, y, z, , v, steer, thr, brk, nitro] = row;
    if (t < 0 || t > totalMs + 250) return fail('telemetry outside the race');
    if (Math.abs(x) > WORLD_HALF_X || Math.abs(z) > WORLD_HALF_Z || y < -2 || y > 20) return fail('car left the world');
    if (Math.abs(v) > vmax) return fail('speed above the car limit');
    if (Math.abs(steer) > 1.01 || thr < -0.01 || thr > 1.01 || brk < -0.01 || brk > 1.01 || (nitro !== 0 && nitro !== 1)) {
      return fail('impossible control inputs');
    }
    if (prev) {
      const dt = (t - prev[0]) / 1000;
      if (dt <= 0) return fail('telemetry timestamps not increasing');
      const d = Math.hypot(x - prev[1], z - prev[3]);
      if (d > vmax * dt + 2.5) return fail('car teleported');
      path += d;
    }
    prev = row;
  }
  // The sampled path must actually cover three laps
  if (path < LAPS * lap * 0.8) return fail('telemetry does not cover three laps');

  return {
    ok: true,
    row: {
      player_name: name,
      city: run.city,
      total_ms: totalMs,
      best_lap_ms: Math.round(bestLapMs),
      car,
      finish_position: position,
    },
    replay: { checkpoints: cps, samples: s },
  };
}
