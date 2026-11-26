import test from 'node:test';
import assert from 'node:assert/strict';
import { CIRCUITS, VEHICLES } from './circuits';
import {
  buildCircuitMetrics,
  computeAgenticDrive,
  computeBearing,
  createInitialPhysicsState,
  haversineMeters,
  interpolateCircuitPosition,
  stepVehiclePhysics,
} from './circuitMath';

test('haversine and bearing calculate accurate real-world metrics', () => {
  // Moving due North ~1 degree latitude ≈ 111.19 km
  const dist = haversineMeters({ lat: 17.0, lng: 78.0 }, { lat: 18.0, lng: 78.0 });
  assert.ok(dist > 110_000 && dist < 112_500);

  const bearingNorth = computeBearing({ lat: 17.0, lng: 78.0 }, { lat: 18.0, lng: 78.0 });
  assert.ok(bearingNorth < 1 || bearingNorth > 359);

  const bearingEast = computeBearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(bearingEast - 90) < 0.5);
});

test('all 5 circuits form valid closed GPS loops with positive lap lengths', () => {
  for (const circuit of CIRCUITS) {
    const metrics = buildCircuitMetrics(circuit.waypoints);
    assert.ok(metrics.totalLapMeters > 1200, `${circuit.id} lap should be > 1.2km`);

    const startPos = interpolateCircuitPosition(circuit.waypoints, 0, metrics);
    const lap2Pos = interpolateCircuitPosition(
      circuit.waypoints,
      metrics.totalLapMeters + 5,
      metrics
    );
    assert.equal(startPos.lap, 1);
    assert.equal(lap2Pos.lap, 2);
    assert.ok(startPos.heading >= 0 && startPos.heading < 360);
  }
});

test('vehicle physics accelerates, deploys nitro, and Agentic AI responds to sharp corners', () => {
  const vehicle = VEHICLES[0];
  let state = createInitialPhysicsState();

  for (let i = 0; i < 60; i++) {
    state = stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 0, nitro: false },
      vehicle,
      0.05,
      0.05,
      280,
      false
    );
  }

  assert.ok(state.speedKmh > 130, 'Vehicle should accelerate smoothly on throttle');
  assert.ok(state.distanceMeters > 50, 'Vehicle should cover road distance');

  // Verify Agentic AI brakes into sharp hairpin when travelling fast
  const sharpTurnRoad = {
    lat: 17.43,
    lng: 78.38,
    heading: 90,
    lap: 1,
    lapProgress: 0.5,
    currentLandmark: 'Cable Bridge',
    nextLandmark: 'Inorbit Hairpin',
    speedLimitKmh: 190,
    curveSharpness: 0.78,
  };
  const fastState = { ...state, speedKmh: 245 };
  const brakeDecision = computeAgenticDrive(fastState, sharpTurnRoad, null);
  assert.ok(brakeDecision.input.brake > 0.5);
  assert.match(brakeDecision.decision, /Trail-Braking/i);

  // Verify Agentic AI deploys nitro on straight when charged
  const straightRoad = { ...sharpTurnRoad, curveSharpness: 0.08, speedLimitKmh: 310 };
  const nitroDecision = computeAgenticDrive(
    { ...fastState, nitroPercent: 80 },
    straightRoad,
    24
  );
  assert.equal(nitroDecision.input.nitro, true);
  assert.match(nitroDecision.decision, /Slipstream Nitro/i);
});
