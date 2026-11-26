import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSpeedCameraFeel,
  distanceMetersToTrackU,
  paceSpeedKmhToUPerSec,
  speedKmhToWorldUnitsPerSec,
} from './speedVisuals';

describe('speedVisuals 1:1 3D speed mapping', () => {
  it('maps 200 km/h to genuine high-speed world units/sec (~68 u/s) rather than compressed GPS speed', () => {
    const uPerSecAt200 = speedKmhToWorldUnitsPerSec(200);
    assert.ok(uPerSecAt200 >= 65 && uPerSecAt200 <= 72, `expected ~67.8 u/s, got ${uPerSecAt200}`);

    // Over 1 second at 200 km/h (55.56m), track u advances by ~0.056 on a 1200u 3D circuit
    const u0 = distanceMetersToTrackU(0, 1200);
    const u1 = distanceMetersToTrackU(55.56, 1200);
    const deltaU = u1 - u0;
    assert.ok(deltaU > 0.05, `expected deltaU > 0.05 per sec at 200 km/h, got ${deltaU}`);
  });

  it('wraps distanceMetersToTrackU cleanly into [0, 1) across multiple laps', () => {
    const u = distanceMetersToTrackU(5432, 1150);
    assert.ok(u >= 0 && u < 1);
    const uNeg = distanceMetersToTrackU(-20, 1150);
    assert.ok(uNeg >= 0 && uNeg < 1);
  });

  it('keeps pace cars slower than a 200 km/h player so overtaking feels dramatic', () => {
    const playerU = paceSpeedKmhToUPerSec(200, 1150);
    const paceU = paceSpeedKmhToUPerSec(155, 1150);
    assert.ok(playerU > paceU * 1.25);
  });

  it('expands FOV, lowers chase camera closer to asphalt, and activates speed lines at 200+ km/h', () => {
    const slow = computeSpeedCameraFeel('CHASE', 40, false);
    const fast200 = computeSpeedCameraFeel('CHASE', 200, false);
    const nitro290 = computeSpeedCameraFeel('CHASE', 290, true);

    assert.ok(fast200.fov >= 74, `expected Chase FOV >= 74 at 200 km/h, got ${fast200.fov}`);
    assert.ok(fast200.fov > slow.fov + 12);
    assert.ok(nitro290.fov > fast200.fov);
    assert.ok(fast200.chaseHeight < slow.chaseHeight);
    assert.equal(slow.speedLinesOpacity, 0);
    assert.ok(fast200.speedLinesOpacity > 0.15);
    assert.ok(nitro290.speedLinesOpacity > fast200.speedLinesOpacity);
    assert.ok(fast200.shakeAmplitude > 0);
  });
});
