import type { CircuitDefinition } from './circuits';

export interface BuildingFootprint3D {
  id: string;
  /** Four GPS corners [lat, lng] forming the building base footprint */
  corners: Array<{ lat: number; lng: number }>;
  centerLat: number;
  centerLng: number;
  /** Architectural building height in meters */
  heightMeters: number;
  roofColor: string;
  wallLitColor: string;
  wallShadeColor: string;
  windowTint: string;
  isLandmark: boolean;
}

interface BuildingPalette {
  roof: string;
  lit: string;
  shade: string;
  window: string;
}

const CITY_PALETTES: Record<string, BuildingPalette[]> = {
  hyderabad: [
    { roof: '#334155', lit: '#475569', shade: '#1e293b', window: 'rgba(125, 211, 252, 0.55)' },
    { roof: '#3f4f63', lit: '#52657c', shade: '#243244', window: 'rgba(253, 224, 71, 0.48)' },
    { roof: '#4b5563', lit: '#64748b', shade: '#27303f', window: 'rgba(186, 230, 253, 0.5)' },
  ],
  mumbai: [
    { roof: '#475569', lit: '#64748b', shade: '#2b3545', window: 'rgba(254, 240, 138, 0.5)' },
    { roof: '#57534e', lit: '#78716c', shade: '#332f2c', window: 'rgba(147, 197, 253, 0.45)' },
    { roof: '#3b4a5e', lit: '#4f627a', shade: '#1f2937', window: 'rgba(253, 186, 116, 0.45)' },
  ],
  sanfrancisco: [
    { roof: '#475569', lit: '#64748b', shade: '#253141', window: 'rgba(186, 230, 253, 0.52)' },
    { roof: '#57534e', lit: '#78716c', shade: '#2f2d2a', window: 'rgba(254, 215, 170, 0.48)' },
    { roof: '#334155', lit: '#4b5e75', shade: '#1b2432', window: 'rgba(125, 211, 252, 0.48)' },
  ],
  london: [
    { roof: '#3f495a', lit: '#5b677a', shade: '#242c38', window: 'rgba(147, 197, 253, 0.5)' },
    { roof: '#524b45', lit: '#71675f', shade: '#302b27', window: 'rgba(254, 240, 138, 0.42)' },
    { roof: '#334155', lit: '#475569', shade: '#1e293b', window: 'rgba(224, 242, 254, 0.52)' },
  ],
  paris: [
    { roof: '#57606f', lit: '#8c867a', shade: '#4d4841', window: 'rgba(254, 243, 199, 0.46)' },
    { roof: '#4b5563', lit: '#7c776e', shade: '#3f3b35', window: 'rgba(253, 230, 138, 0.44)' },
    { roof: '#64748b', lit: '#948e82', shade: '#524e47', window: 'rgba(226, 232, 240, 0.42)' },
  ],
};

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generates deterministic realistic 3D building footprints positioned cleanly
 * along both flanks of every circuit boulevard (with safe setback so buildings
 * never overlap the drivable asphalt track).
 */
export function buildCircuit3DBuildings(circuit: CircuitDefinition): BuildingFootprint3D[] {
  const rand = seededRandom(hashString(`3d-buildings-${circuit.id}`));
  const palettes = CITY_PALETTES[circuit.id] ?? CITY_PALETTES.hyderabad;
  const buildings: BuildingFootprint3D[] = [];
  const waypoints = circuit.waypoints;
  if (waypoints.length < 2) return buildings;

  const cosLat = Math.cos((circuit.center.lat * Math.PI) / 180);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.max(0.2, cosLat);

  // Helper to verify a building center stays cleanly off every road segment
  const isClearOfTrack = (lat: number, lng: number, minClearanceM: number): boolean => {
    for (let i = 0; i < waypoints.length; i++) {
      const a = waypoints[i];
      const b = waypoints[(i + 1) % waypoints.length];
      const ax = (a.lng - lng) * metersPerDegLng;
      const ay = (a.lat - lat) * metersPerDegLat;
      const bx = (b.lng - lng) * metersPerDegLng;
      const by = (b.lat - lat) * metersPerDegLat;
      const abx = bx - ax;
      const aby = by - ay;
      const lenSq = abx * abx + aby * aby;
      const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, (-ax * abx - ay * aby) / lenSq)) : 0;
      const px = ax + abx * t;
      const py = ay + aby * t;
      if (Math.hypot(px, py) < minClearanceM) {
        return false;
      }
    }
    return true;
  };

  let idx = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const dLatM = (b.lat - a.lat) * metersPerDegLat;
    const dLngM = (b.lng - a.lng) * metersPerDegLng;
    const segLenM = Math.hypot(dLatM, dLngM);
    if (segLenM < 30) continue;

    // Unit tangent & left-hand normal in meters
    const tx = dLngM / segLenM;
    const ty = dLatM / segLenM;
    const nx = -ty;
    const ny = tx;

    const samples = Math.min(8, Math.max(3, Math.floor(segLenM / 70)));
    for (let s = 0; s < samples; s++) {
      const frac = (s + 0.5) / samples;
      const baseLat = a.lat + (b.lat - a.lat) * frac;
      const baseLng = a.lng + (b.lng - a.lng) * frac;

      for (const side of [-1, 1]) {
        const setbackM = 48 + rand() * 72;
        const jitterAlongM = (rand() - 0.5) * 24;
        const offsetLngM = nx * side * setbackM + tx * jitterAlongM;
        const offsetLatM = ny * side * setbackM + ty * jitterAlongM;
        const centerLat = baseLat + offsetLatM / metersPerDegLat;
        const centerLng = baseLng + offsetLngM / metersPerDegLng;

        const widthM = 24 + rand() * 34;
        const depthM = 20 + rand() * 30;
        const minClearance = Math.max(widthM, depthM) * 0.65 + 22;
        if (!isClearOfTrack(centerLat, centerLng, minClearance)) continue;

        const isLandmark = rand() > 0.78;
        const heightMeters = isLandmark
          ? 75 + rand() * 105
          : circuit.id === 'paris'
            ? 24 + rand() * 24
            : 28 + rand() * 58;

        const palette = palettes[Math.floor(rand() * palettes.length)];
        const hw = widthM * 0.5;
        const hd = depthM * 0.5;

        // Align footprint with street tangent for realistic urban block orientation
        const localCorners = [
          { u: -hw, v: -hd },
          { u: hw, v: -hd },
          { u: hw, v: hd },
          { u: -hw, v: hd },
        ];
        const corners = localCorners.map(({ u, v }) => {
          const dxM = u * tx + v * nx;
          const dyM = u * ty + v * ny;
          return {
            lat: centerLat + dyM / metersPerDegLat,
            lng: centerLng + dxM / metersPerDegLng,
          };
        });

        buildings.push({
          id: `${circuit.id}-b-${idx++}`,
          corners,
          centerLat,
          centerLng,
          heightMeters,
          roofColor: palette.roof,
          wallLitColor: palette.lit,
          wallShadeColor: palette.shade,
          windowTint: palette.window,
          isLandmark,
        });
      }
    }
  }

  return buildings;
}

export interface ExtrudedBuildingGeometry {
  baseScreen: Array<{ x: number; y: number }>;
  roofScreen: Array<{ x: number; y: number }>;
  extrudePxY: number;
  extrudePxX: number;
  sortY: number;
}

/**
 * Computes oblique 3D roof offset & depth-sort key from 2D projected ground footprint
 * so buildings extrude realistically upward with architectural tilt & subtle lean.
 */
export function computeBuilding3DExtrusion(
  baseScreen: Array<{ x: number; y: number }>,
  heightMeters: number,
  pixelsPerMeter: number,
  tiltFactor = 0.58
): ExtrudedBuildingGeometry {
  const extrudePxY = Math.max(4, Math.min(92, heightMeters * pixelsPerMeter * tiltFactor));
  const extrudePxX = extrudePxY * 0.16;
  const roofScreen = baseScreen.map((p) => ({
    x: p.x + extrudePxX,
    y: p.y - extrudePxY,
  }));
  const sortY =
    baseScreen.reduce((acc, p) => acc + p.y, 0) / Math.max(1, baseScreen.length);

  return { baseScreen, roofScreen, extrudePxY, extrudePxX, sortY };
}

/**
 * Checks whether the current browser context supports WebGL2 (required by Google
 * Maps Photorealistic 3D `<Map3D>` tiles per CF3).
 */
export function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2');
    return gl !== null;
  } catch {
    return false;
  }
}
