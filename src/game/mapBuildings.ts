import type { CircuitDefinition } from './circuits';

export type BuildingArchetype =
  | 'glass-tower'
  | 'stepped-skyscraper'
  | 'heritage-dome'
  | 'art-deco'
  | 'modern-office'
  | 'residential';

export type RooftopFeature = 'helipad' | 'skylight' | 'hvac' | 'dome' | 'terrace' | 'none';

export interface BuildingFootprint3D {
  id: string;
  /** Four GPS corners [lat, lng] forming the building base footprint (counter-clockwise in ground space) */
  corners: Array<{ lat: number; lng: number }>;
  centerLat: number;
  centerLng: number;
  /** Architectural building height in meters */
  heightMeters: number;
  roofColor: string;
  roofAccentColor: string;
  wallLitColor: string;
  wallLitTopColor: string;
  wallShadeColor: string;
  wallShadeTopColor: string;
  windowTint: string;
  windowGlowColor: string;
  isLandmark: boolean;
  archetype: BuildingArchetype;
  rooftopFeature: RooftopFeature;
  /** Setback upper-tier scale (0 = no setback, 0.55-0.75 = stepped tower crown) */
  setbackScale: number;
  /** Setback upper-tier height fraction of total height */
  setbackHeightRatio: number;
  /** Architectural spire/antenna height in meters above roof */
  spireMeters: number;
  /** Number of window bays across the facade */
  bayCount: number;
  /** Deterministic seed for subtle interior lighting variation */
  windowSeed: number;
  isNight: boolean;
}

interface BuildingPalette {
  roof: string;
  roofAccent: string;
  litBottom: string;
  litTop: string;
  shadeBottom: string;
  shadeTop: string;
  window: string;
  glow: string;
  archetype: BuildingArchetype;
}

const PALETTE_GROUPS: Record<string, BuildingPalette[]> = {
  // Modern Indian IT / Financial skylines (Hyderabad, Bengaluru, Gurugram, Pune, Chennai, Noida, Ahmedabad, Kochi)
  indianModern: [
    {
      roof: '#2c3a4c',
      roofAccent: '#64748b',
      litBottom: '#3c5a74',
      litTop: '#78a5c4',
      shadeBottom: '#1a2a3a',
      shadeTop: '#334d66',
      window: 'rgba(186, 230, 253, 0.65)',
      glow: 'rgba(253, 224, 71, 0.55)',
      archetype: 'glass-tower',
    },
    {
      roof: '#3a4654',
      roofAccent: '#94a3b8',
      litBottom: '#4b637a',
      litTop: '#8ab4d0',
      shadeBottom: '#1e2c3b',
      shadeTop: '#384e66',
      window: 'rgba(224, 242, 254, 0.62)',
      glow: 'rgba(254, 240, 138, 0.52)',
      archetype: 'stepped-skyscraper',
    },
    {
      roof: '#6b655c',
      roofAccent: '#a89f91',
      litBottom: '#a69d8f',
      litTop: '#d2c9ba',
      shadeBottom: '#4c463e',
      shadeTop: '#6c655b',
      window: 'rgba(147, 197, 253, 0.48)',
      glow: 'rgba(254, 215, 170, 0.5)',
      archetype: 'modern-office',
    },
    {
      roof: '#7c6f60',
      roofAccent: '#c4b5a2',
      litBottom: '#b8a790',
      litTop: '#dfd1be',
      shadeBottom: '#574c3f',
      shadeTop: '#7a6c5b',
      window: 'rgba(203, 213, 225, 0.42)',
      glow: 'rgba(253, 230, 138, 0.48)',
      archetype: 'residential',
    },
  ],
  // Mumbai coastal Art Deco + Marine Drive + supertall glass towers
  mumbai: [
    {
      roof: '#2a394b',
      roofAccent: '#7dd3fc',
      litBottom: '#3b5978',
      litTop: '#80b3d4',
      shadeBottom: '#182738',
      shadeTop: '#314b66',
      window: 'rgba(186, 230, 253, 0.68)',
      glow: 'rgba(254, 240, 138, 0.58)',
      archetype: 'stepped-skyscraper',
    },
    {
      roof: '#6d6255',
      roofAccent: '#d6c7b2',
      litBottom: '#b4a38d',
      litTop: '#e3d5c1',
      shadeBottom: '#52473b',
      shadeTop: '#766757',
      window: 'rgba(147, 197, 253, 0.46)',
      glow: 'rgba(253, 186, 116, 0.54)',
      archetype: 'art-deco',
    },
    {
      roof: '#4b5563',
      roofAccent: '#cbd5e1',
      litBottom: '#5a738a',
      litTop: '#96b4cc',
      shadeBottom: '#263442',
      shadeTop: '#41566b',
      window: 'rgba(224, 242, 254, 0.58)',
      glow: 'rgba(253, 224, 71, 0.48)',
      archetype: 'glass-tower',
    },
  ],
  // Indian Heritage Sandstone / Rajput / Colonial (Jaipur, Delhi, Udaipur, Varanasi, Kolkata, Mysuru, Goa, Srinagar)
  indianHeritage: [
    {
      roof: '#8c624e',
      roofAccent: '#d9a88c',
      litBottom: '#c28d70',
      litTop: '#e6b89c',
      shadeBottom: '#664333',
      shadeTop: '#8a5d47',
      window: 'rgba(254, 243, 199, 0.52)',
      glow: 'rgba(251, 191, 36, 0.58)',
      archetype: 'heritage-dome',
    },
    {
      roof: '#7a6c5a',
      roofAccent: '#d4c4ac',
      litBottom: '#c4b195',
      litTop: '#ebe0cc',
      shadeBottom: '#5c5041',
      shadeTop: '#7f705b',
      window: 'rgba(226, 232, 240, 0.46)',
      glow: 'rgba(253, 224, 71, 0.52)',
      archetype: 'art-deco',
    },
    {
      roof: '#495866',
      roofAccent: '#94a3b8',
      litBottom: '#637a8f',
      litTop: '#9db5c9',
      shadeBottom: '#2d3a47',
      shadeTop: '#485b6e',
      window: 'rgba(186, 230, 253, 0.55)',
      glow: 'rgba(254, 240, 138, 0.48)',
      archetype: 'modern-office',
    },
  ],
  // European Classical Haussmann / Limestone & Brick (Paris, London, Rome)
  europeanClassic: [
    {
      roof: '#475569',
      roofAccent: '#94a3b8',
      litBottom: '#b8ae9c',
      litTop: '#e3dac9',
      shadeBottom: '#5e574c',
      shadeTop: '#847b6c',
      window: 'rgba(226, 232, 240, 0.55)',
      glow: 'rgba(254, 243, 199, 0.55)',
      archetype: 'art-deco',
    },
    {
      roof: '#5c4b43',
      roofAccent: '#a89285',
      litBottom: '#996452',
      litTop: '#c28a76',
      shadeBottom: '#4d2f25',
      shadeTop: '#6e4538',
      window: 'rgba(224, 242, 254, 0.48)',
      glow: 'rgba(253, 224, 71, 0.5)',
      archetype: 'residential',
    },
    {
      roof: '#334155',
      roofAccent: '#bae6fd',
      litBottom: '#45637d',
      litTop: '#85adc9',
      shadeBottom: '#1d2d3d',
      shadeTop: '#364f66',
      window: 'rgba(186, 230, 253, 0.68)',
      glow: 'rgba(254, 240, 138, 0.52)',
      archetype: 'glass-tower',
    },
    {
      roof: '#64748b',
      roofAccent: '#e2e8f0',
      litBottom: '#c2b8a3',
      litTop: '#ede5d5',
      shadeBottom: '#665f52',
      shadeTop: '#8c8372',
      window: 'rgba(254, 249, 195, 0.5)',
      glow: 'rgba(251, 191, 36, 0.52)',
      archetype: 'heritage-dome',
    },
  ],
  // Global Supertall Financial Glass Metropolises (New York, Tokyo, Dubai, Singapore, Hong Kong, Shanghai, San Francisco, Sydney, Rio, Bangkok)
  globalMetropolis: [
    {
      roof: '#243447',
      roofAccent: '#7dd3fc',
      litBottom: '#33597a',
      litTop: '#7cb5d9',
      shadeBottom: '#152536',
      shadeTop: '#2c4a66',
      window: 'rgba(186, 230, 253, 0.72)',
      glow: 'rgba(254, 240, 138, 0.58)',
      archetype: 'stepped-skyscraper',
    },
    {
      roof: '#2f3d4d',
      roofAccent: '#cbd5e1',
      litBottom: '#466885',
      litTop: '#96bedb',
      shadeBottom: '#1a2a3a',
      shadeTop: '#365169',
      window: 'rgba(224, 242, 254, 0.7)',
      glow: 'rgba(253, 224, 71, 0.55)',
      archetype: 'glass-tower',
    },
    {
      roof: '#4b5563',
      roofAccent: '#e2e8f0',
      litBottom: '#8c8982',
      litTop: '#c4c0b6',
      shadeBottom: '#3b3a36',
      shadeTop: '#5e5c57',
      window: 'rgba(147, 197, 253, 0.56)',
      glow: 'rgba(254, 215, 170, 0.52)',
      archetype: 'art-deco',
    },
    {
      roof: '#3a4a5c',
      roofAccent: '#93c5fd',
      litBottom: '#576f87',
      litTop: '#96b1c9',
      shadeBottom: '#223140',
      shadeTop: '#3b5066',
      window: 'rgba(191, 219, 254, 0.62)',
      glow: 'rgba(253, 230, 138, 0.5)',
      archetype: 'modern-office',
    },
  ],
  // Las Vegas Night GP Neon & Gold Illuminated Resort Towers
  vegasNight: [
    {
      roof: '#1b2436',
      roofAccent: '#f59e0b',
      litBottom: '#2b3348',
      litTop: '#5c4d3c',
      shadeBottom: '#111827',
      shadeTop: '#242e42',
      window: 'rgba(251, 191, 36, 0.75)',
      glow: 'rgba(253, 224, 71, 0.85)',
      archetype: 'stepped-skyscraper',
    },
    {
      roof: '#172033',
      roofAccent: '#38bdf8',
      litBottom: '#1f334d',
      litTop: '#38628a',
      shadeBottom: '#0f172a',
      shadeTop: '#1e304a',
      window: 'rgba(56, 189, 248, 0.72)',
      glow: 'rgba(125, 211, 252, 0.82)',
      archetype: 'glass-tower',
    },
    {
      roof: '#271a33',
      roofAccent: '#e879f9',
      litBottom: '#3c254f',
      litTop: '#6b3b7d',
      shadeBottom: '#191124',
      shadeTop: '#2e1d3d',
      window: 'rgba(232, 121, 249, 0.68)',
      glow: 'rgba(251, 191, 36, 0.78)',
      archetype: 'art-deco',
    },
  ],
};

function getPalettesForCircuit(circuit: CircuitDefinition): BuildingPalette[] {
  if (circuit.night || circuit.id === 'lasvegas') return PALETTE_GROUPS.vegasNight;
  if (circuit.id === 'mumbai') return PALETTE_GROUPS.mumbai;
  if (['paris', 'london', 'rome'].includes(circuit.id)) return PALETTE_GROUPS.europeanClassic;
  if (['jaipur', 'delhi', 'udaipur', 'varanasi', 'kolkata', 'mysuru', 'goa', 'srinagar'].includes(circuit.id)) {
    return PALETTE_GROUPS.indianHeritage;
  }
  if (circuit.region === 'india') return PALETTE_GROUPS.indianModern;
  return PALETTE_GROUPS.globalMetropolis;
}

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
 * Generates deterministic, architecturally rich 3D building footprints positioned cleanly
 * along both flanks of every circuit boulevard (with safe setback so buildings
 * never overlap the drivable asphalt track).
 */
export function buildCircuit3DBuildings(circuit: CircuitDefinition): BuildingFootprint3D[] {
  const rand = seededRandom(hashString(`3d-buildings-v2-${circuit.id}`));
  const palettes = getPalettesForCircuit(circuit);
  const buildings: BuildingFootprint3D[] = [];
  const waypoints = circuit.waypoints;
  if (waypoints.length < 2) return buildings;

  const isLowRiseEuropean = circuit.id === 'paris' || circuit.id === 'rome';
  const isSupertallCity = ['dubai', 'newyork', 'tokyo', 'hongkong', 'shanghai', 'singapore', 'mumbai', 'lasvegas'].includes(
    circuit.id
  );
  const isNight = Boolean(circuit.night);

  const cosLat = Math.cos((circuit.center.lat * Math.PI) / 180);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.max(0.2, cosLat);

  // Verify every building stays cleanly off every road segment
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

  // Prevent neighboring footprints from overlapping awkwardly
  const placedCenters: Array<{ lat: number; lng: number; radiusM: number }> = [];
  const isClearOfNeighbors = (lat: number, lng: number, radiusM: number): boolean => {
    for (const c of placedCenters) {
      const dx = (c.lng - lng) * metersPerDegLng;
      const dy = (c.lat - lat) * metersPerDegLat;
      if (Math.hypot(dx, dy) < c.radiusM + radiusM + 6) return false;
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
    if (segLenM < 28) continue;

    // Unit tangent & left-hand normal in meters
    const tx = dLngM / segLenM;
    const ty = dLatM / segLenM;
    const nx = -ty;
    const ny = tx;

    const samples = Math.min(9, Math.max(3, Math.floor(segLenM / 62)));
    for (let s = 0; s < samples; s++) {
      const frac = (s + 0.5) / samples;
      const baseLat = a.lat + (b.lat - a.lat) * frac;
      const baseLng = a.lng + (b.lng - a.lng) * frac;

      for (const side of [-1, 1]) {
        // Two depth tiers: boulevard front row + skyline second row
        const rowDepth = rand() > 0.65 ? 1 : 0;
        const setbackM = rowDepth === 0 ? 44 + rand() * 36 : 92 + rand() * 58;
        const jitterAlongM = (rand() - 0.5) * 20;
        const offsetLngM = nx * side * setbackM + tx * jitterAlongM;
        const offsetLatM = ny * side * setbackM + ty * jitterAlongM;
        const centerLat = baseLat + offsetLatM / metersPerDegLat;
        const centerLng = baseLng + offsetLngM / metersPerDegLng;

        const widthM = 24 + rand() * 34;
        const depthM = 20 + rand() * 28;
        const radiusM = Math.hypot(widthM, depthM) * 0.5;
        const minClearance = radiusM + 20;
        if (!isClearOfTrack(centerLat, centerLng, minClearance)) continue;
        if (!isClearOfNeighbors(centerLat, centerLng, radiusM * 0.85)) continue;

        const isLandmark = rand() > (isSupertallCity ? 0.68 : 0.78);
        const heightMeters = isLandmark
          ? isLowRiseEuropean
            ? 44 + rand() * 36
            : isSupertallCity
              ? 105 + rand() * 90
              : 75 + rand() * 95
          : isLowRiseEuropean
            ? 22 + rand() * 22
            : isSupertallCity
              ? 40 + rand() * 68
              : 28 + rand() * 54;

        const palette = palettes[Math.floor(rand() * palettes.length)];
        const hw = widthM * 0.5;
        const hd = depthM * 0.5;

        // Align footprint cleanly with street tangent
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

        const hasSetback =
          palette.archetype === 'stepped-skyscraper' ||
          (isLandmark && heightMeters > 72 && palette.archetype !== 'heritage-dome');
        const setbackScale = hasSetback ? 0.56 + rand() * 0.16 : 0;
        const setbackHeightRatio = hasSetback ? 0.24 + rand() * 0.14 : 0;
        const spireMeters =
          isLandmark && heightMeters > 88 && palette.archetype !== 'heritage-dome'
            ? 14 + rand() * 24
            : 0;

        let rooftopFeature: RooftopFeature = 'hvac';
        if (palette.archetype === 'heritage-dome') {
          rooftopFeature = 'dome';
        } else if (isLandmark && heightMeters > 95 && rand() > 0.45) {
          rooftopFeature = 'helipad';
        } else if (palette.archetype === 'glass-tower' || palette.archetype === 'modern-office') {
          rooftopFeature = rand() > 0.45 ? 'skylight' : 'hvac';
        } else if (palette.archetype === 'residential') {
          rooftopFeature = rand() > 0.5 ? 'terrace' : 'hvac';
        }

        placedCenters.push({ lat: centerLat, lng: centerLng, radiusM: radiusM * 0.85 });

        buildings.push({
          id: `${circuit.id}-b-${idx++}`,
          corners,
          centerLat,
          centerLng,
          heightMeters: Math.min(198, Math.max(21, heightMeters)),
          roofColor: palette.roof,
          roofAccentColor: palette.roofAccent,
          wallLitColor: palette.litBottom,
          wallLitTopColor: palette.litTop,
          wallShadeColor: palette.shadeBottom,
          wallShadeTopColor: palette.shadeTop,
          windowTint: palette.window,
          windowGlowColor: palette.glow,
          isLandmark,
          archetype: palette.archetype,
          rooftopFeature,
          setbackScale,
          setbackHeightRatio,
          spireMeters,
          bayCount: Math.max(3, Math.min(8, Math.round(widthM / 6))),
          windowSeed: Math.floor(rand() * 10000),
          isNight,
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
 * so buildings extrude realistically upward with architectural tilt & subtle perspective lean.
 */
export function computeBuilding3DExtrusion(
  baseScreen: Array<{ x: number; y: number }>,
  heightMeters: number,
  pixelsPerMeter: number,
  tiltFactor = 0.62
): ExtrudedBuildingGeometry {
  const extrudePxY = Math.max(5, Math.min(115, heightMeters * pixelsPerMeter * tiltFactor));
  const extrudePxX = extrudePxY * 0.14;
  const roofScreen = baseScreen.map((p) => ({
    x: p.x + extrudePxX,
    y: p.y - extrudePxY,
  }));
  const sortY =
    baseScreen.reduce((acc, p) => acc + p.y, 0) / Math.max(1, baseScreen.length);

  return { baseScreen, roofScreen, extrudePxY, extrudePxX, sortY };
}

/**
 * Checks whether the current browser context supports WebGL2.
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
