export type CameraViewMode = 'CHASE' | 'HOOD' | 'BUMPER' | 'TV';

/**
 * Real-world 1:1 visual speed scale for the 3D circuit.
 * Original RaceTrack world units represent ~1 meter; a 1.22x racing-lens factor
 * ensures 200 km/h (~55.6 m/s) delivers genuine supercar street-speed rush (~68 u/s)
 * instead of compressing a 4.5 km GPS loop onto a ~1.1 km 3D spline (which felt 4x too slow).
 */
export const THREE_D_SPEED_SCALE = 1.22;

/**
 * Convert real traveled distance (meters) into wrapped 3D spline parameter u in [0, 1).
 */
export function distanceMetersToTrackU(
  distanceMeters: number,
  trackTotalLengthUnits: number
): number {
  const safeTrackLen = Math.max(200, trackTotalLengthUnits || 1100);
  const raw = (distanceMeters * THREE_D_SPEED_SCALE) / safeTrackLen;
  return ((raw % 1) + 1) % 1;
}

/**
 * Convert a real-world speed (km/h) into 3D world units per second.
 */
export function speedKmhToWorldUnitsPerSec(speedKmh: number): number {
  return Math.max(0, speedKmh / 3.6) * THREE_D_SPEED_SCALE;
}

/**
 * Convert a pace/traffic car speed (km/h) into 3D track u-progress per second.
 */
export function paceSpeedKmhToUPerSec(
  speedKmh: number,
  trackTotalLengthUnits: number
): number {
  const safeTrackLen = Math.max(200, trackTotalLengthUnits || 1100);
  return speedKmhToWorldUnitsPerSec(speedKmh) / safeTrackLen;
}

export interface SpeedCameraFeel {
  fov: number;
  chaseDistance: number;
  chaseHeight: number;
  shakeAmplitude: number;
  speedLinesOpacity: number;
}

/**
 * Compute dynamic camera FOV expansion, tarmac-hugging height drop,
 * high-speed chassis micro-vibration, and peripheral wind-streak intensity.
 */
export function computeSpeedCameraFeel(
  mode: CameraViewMode,
  speedKmh: number,
  isNitroActive: boolean
): SpeedCameraFeel {
  const clampedSpeed = Math.max(0, Math.min(360, speedKmh));
  // Nonlinear sensation curve: ramps dramatically between 120 and 280 km/h
  const norm = Math.min(1, clampedSpeed / 260);
  const highSpeedFactor = Math.max(0, Math.min(1, (clampedSpeed - 125) / 155));
  const nitroBonus = isNitroActive ? 1 : 0;

  let fov = 58;
  if (mode === 'CHASE') {
    fov = 58 + norm * 19 + highSpeedFactor * 6 + nitroBonus * 7;
  } else if (mode === 'HOOD') {
    fov = 65 + norm * 19 + highSpeedFactor * 6 + nitroBonus * 7;
  } else if (mode === 'BUMPER') {
    fov = 69 + norm * 19 + highSpeedFactor * 6 + nitroBonus * 8;
  } else {
    fov = 46 + norm * 6;
  }

  // Pull back slightly for acceleration thrust while dropping closer to asphalt for faster ground rush
  const chaseDistance = 8.4 + norm * 1.45 + nitroBonus * 1.25;
  const chaseHeight = 3.55 - norm * 0.58 - nitroBonus * 0.2;

  // High-frequency suspension & road-rush micro-shake above 130 km/h
  const shakeAmplitude =
    mode === 'TV'
      ? 0
      : highSpeedFactor * highSpeedFactor * (mode === 'BUMPER' ? 0.055 : 0.042) +
        nitroBonus * 0.025;

  // Peripheral speed lines kick in above 155 km/h and intensify at 200-320 km/h + Nitro
  const linesRaw = Math.max(0, (clampedSpeed - 155) / 125);
  const speedLinesOpacity =
    mode === 'TV' ? 0 : Math.min(0.88, linesRaw * 0.62 + nitroBonus * 0.34);

  return {
    fov: Math.min(100, fov),
    chaseDistance,
    chaseHeight,
    shakeAmplitude,
    speedLinesOpacity,
  };
}
