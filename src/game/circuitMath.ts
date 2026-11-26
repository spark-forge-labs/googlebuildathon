import type { GPSWaypoint, VehicleDefinition } from './circuits';

export interface CircuitMetrics {
  segmentLengths: number[];
  cumulativeMeters: number[];
  totalLapMeters: number;
}

export interface InterpolatedRoadPosition {
  lat: number;
  lng: number;
  heading: number; // Degrees clockwise from true North (0..360) for Street View POV
  lap: number; // 1-indexed current lap
  lapProgress: number; // 0..1 within current lap
  currentLandmark: string;
  nextLandmark: string;
  speedLimitKmh: number;
  curveSharpness: number; // 0..1 upcoming turn severity
}

export interface VehiclePhysicsState {
  distanceMeters: number;
  speedKmh: number;
  topSpeedKmh: number;
  nitroPercent: number; // 0..100
  steeringOffset: number; // -1..1 lane lateral position
  gear: number; // 1..7
  rpm: number; // 1500..8800
  isNitroActive: boolean;
  isBraking: boolean;
}

export interface DrivingInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  nitro: boolean;
}

export interface AgenticDriveResult {
  input: DrivingInput;
  decision: string;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Great-circle distance in meters between two GPS coordinates.
 */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial forward compass bearing in degrees [0, 360) from point A to point B.
 */
export function computeBearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Shortest angular delta in degrees between two headings [-180, 180].
 */
export function angleDeltaDeg(h1: number, h2: number): number {
  let diff = ((h2 - h1 + 540) % 360) - 180;
  if (diff < -180) diff += 360;
  return diff;
}

export function buildCircuitMetrics(waypoints: GPSWaypoint[]): CircuitMetrics {
  const segmentLengths: number[] = [];
  const cumulativeMeters: number[] = [0];
  let total = 0;

  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const dist = Math.max(10, haversineMeters(a, b));
    segmentLengths.push(dist);
    total += dist;
    cumulativeMeters.push(total);
  }

  return {
    segmentLengths,
    cumulativeMeters,
    totalLapMeters: Math.max(100, total),
  };
}

/**
 * Maps total driven distance along a closed GPS city loop into exact
 * latitude, longitude, Street View heading, landmark, and upcoming corner sharpness.
 */
export function interpolateCircuitPosition(
  waypoints: GPSWaypoint[],
  distanceMeters: number,
  metrics?: CircuitMetrics
): InterpolatedRoadPosition {
  const m = metrics ?? buildCircuitMetrics(waypoints);
  const safeDist = Math.max(0, distanceMeters);
  const lap = Math.floor(safeDist / m.totalLapMeters) + 1;
  const distInLap = safeDist % m.totalLapMeters;
  const lapProgress = distInLap / m.totalLapMeters;

  let segIdx = 0;
  for (let i = 0; i < m.segmentLengths.length; i++) {
    if (distInLap <= m.cumulativeMeters[i + 1] || i === m.segmentLengths.length - 1) {
      segIdx = i;
      break;
    }
  }

  const segStart = m.cumulativeMeters[segIdx];
  const segLen = m.segmentLengths[segIdx];
  const t = Math.max(0, Math.min(1, (distInLap - segStart) / segLen));

  const wpA = waypoints[segIdx];
  const wpB = waypoints[(segIdx + 1) % waypoints.length];
  const wpC = waypoints[(segIdx + 2) % waypoints.length];

  const lat = wpA.lat + (wpB.lat - wpA.lat) * t;
  const lng = wpA.lng + (wpB.lng - wpA.lng) * t;
  const currentHeading = computeBearing(wpA, wpB);
  const nextHeading = computeBearing(wpB, wpC);

  // Smoothly turn camera into upcoming corner during last 22% of segment
  const turnDelta = angleDeltaDeg(currentHeading, nextHeading);
  const lookAheadBlend = t > 0.78 ? ((t - 0.78) / 0.22) * 0.45 : 0;
  const heading = (currentHeading + turnDelta * lookAheadBlend + 360) % 360;

  const curveSharpness = Math.min(1, Math.abs(turnDelta) / 95);

  return {
    lat,
    lng,
    heading,
    lap,
    lapProgress,
    currentLandmark: wpA.landmark,
    nextLandmark: wpB.landmark,
    speedLimitKmh: wpA.speedLimitKmh,
    curveSharpness,
  };
}

export function createInitialPhysicsState(): VehiclePhysicsState {
  return {
    distanceMeters: 0,
    speedKmh: 0,
    topSpeedKmh: 0,
    nitroPercent: 60,
    steeringOffset: 0,
    gear: 1,
    rpm: 1800,
    isNitroActive: false,
    isBraking: false,
  };
}

/**
 * Pure simulation step for realistic street racing telemetry.
 */
export function stepVehiclePhysics(
  state: VehiclePhysicsState,
  input: DrivingInput,
  vehicle: VehicleDefinition,
  dtSec: number,
  curveSharpness: number,
  speedLimitKmh: number,
  hasSlipstream = false
): VehiclePhysicsState {
  const dt = Math.min(0.05, Math.max(0.001, dtSec));
  const useNitro = input.nitro && state.nitroPercent > 1 && input.throttle > 0.2;
  const slipstreamBonus = hasSlipstream ? 16 : 0;

  // Cornering speed ceiling scales with vehicle grip and curve sharpness
  const cornerGripCap =
    vehicle.topSpeedKmh * (1 - curveSharpness * (0.44 - (vehicle.grip - 0.8) * 0.6));
  const effectiveMaxSpeed =
    Math.min(vehicle.topSpeedKmh, Math.max(155, Math.min(cornerGripCap, speedLimitKmh + 22))) +
    (useNitro ? vehicle.nitroBoostKmh : 0) +
    slipstreamBonus;

  let speed = state.speedKmh;

  if (input.throttle > 0) {
    const accelBoost = useNitro ? 1.55 : 1.0;
    const speedRatio = Math.min(1, speed / Math.max(1, effectiveMaxSpeed));
    const torqueCurve = Math.max(0.18, 1 - speedRatio * 0.68);
    speed += vehicle.accelKmhPerSec * accelBoost * torqueCurve * input.throttle * dt;
  }

  if (input.brake > 0) {
    speed -= 145 * input.brake * dt;
  }

  // Natural aerodynamic drag & rolling resistance
  if (input.throttle <= 0.05) {
    speed -= (18 + speed * 0.08) * dt;
  }

  // Gently scrub excess speed if above cornering ceiling
  if (speed > effectiveMaxSpeed) {
    speed -= (speed - effectiveMaxSpeed) * Math.min(1, dt * 2.8);
  }

  // Off-line penalty if steering far into road edge
  const nextSteer = Math.max(
    -1,
    Math.min(1, state.steeringOffset + input.steer * dt * 2.1 - state.steeringOffset * dt * 1.4)
  );
  if (Math.abs(nextSteer) > 0.85 && speed > 140) {
    speed -= 28 * dt;
  }

  speed = Math.max(0, Math.min(vehicle.topSpeedKmh + vehicle.nitroBoostKmh + 20, speed));

  const distanceDelta = (speed / 3.6) * dt;
  const nextDistance = state.distanceMeters + distanceDelta;

  let nextNitro = state.nitroPercent;
  if (useNitro) {
    nextNitro = Math.max(0, nextNitro - 28 * dt);
  } else if (speed > 90) {
    // Slipstream and clean high-speed driving recharge nitro
    nextNitro = Math.min(100, nextNitro + (hasSlipstream ? 11 : 5.5) * dt);
  }

  const gear = Math.max(1, Math.min(7, Math.floor(speed / 46) + 1));
  const gearBandLow = (gear - 1) * 46;
  const gearFraction = Math.max(0, Math.min(1, (speed - gearBandLow) / 46));
  const rpm = Math.round(2100 + gearFraction * 6300 + (useNitro ? 400 : 0));

  return {
    distanceMeters: nextDistance,
    speedKmh: speed,
    topSpeedKmh: Math.max(state.topSpeedKmh, speed),
    nitroPercent: nextNitro,
    steeringOffset: nextSteer,
    gear,
    rpm,
    isNitroActive: useNitro,
    isBraking: input.brake > 0.15,
  };
}

/**
 * Autonomous Agentic racing driver policy once unlocked via verified human hand-press.
 */
export function computeAgenticDrive(
  state: VehiclePhysicsState,
  road: InterpolatedRoadPosition,
  rivalGapAheadMeters: number | null
): AgenticDriveResult {
  const inSlipstream =
    rivalGapAheadMeters !== null && rivalGapAheadMeters > 6 && rivalGapAheadMeters < 65;

  // Brake cleanly before sharp hairpins
  if (road.curveSharpness > 0.58 && state.speedKmh > road.speedLimitKmh * 0.82) {
    return {
      input: {
        throttle: 0.2,
        brake: 0.65,
        steer: -state.steeringOffset * 0.8,
        nitro: false,
      },
      decision: `Apex Trail-Braking · ${road.nextLandmark}`,
    };
  }

  // Deploy nitro on straights or for slipstream overtakes
  const shouldNitro =
    state.nitroPercent >= 45 &&
    road.curveSharpness < 0.25 &&
    (inSlipstream || state.speedKmh > 165);

  if (shouldNitro) {
    return {
      input: {
        throttle: 1,
        brake: 0,
        steer: -state.steeringOffset * 0.9,
        nitro: true,
      },
      decision: inSlipstream
        ? `Slipstream Nitro Overtake · ${road.currentLandmark}`
        : `Straightline Nitro Surge · ${road.currentLandmark}`,
    };
  }

  if (inSlipstream) {
    return {
      input: {
        throttle: 1,
        brake: 0,
        steer: -state.steeringOffset * 0.7,
        nitro: false,
      },
      decision: `Drafting Rival Slipstream (+16 km/h)`,
    };
  }

  return {
    input: {
      throttle: 1,
      brake: 0,
      steer: -state.steeringOffset * 0.85,
      nitro: false,
    },
    decision:
      road.curveSharpness > 0.3
        ? `Optimal Racing Line · ${road.nextLandmark}`
        : `Full Throttle · ${road.currentLandmark}`,
  };
}
