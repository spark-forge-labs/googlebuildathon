import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Camera,
  Compass,
  HardDrive,
  Layers,
  LocateFixed,
  Minus,
  Moon,
  Navigation,
  Plus,
  Satellite,
} from 'lucide-react';
import type { CircuitDefinition } from '../game/circuits';
import type { InterpolatedRoadPosition } from '../game/circuitMath';
import {
  buildCircuit3DBuildings,
  computeBuilding3DExtrusion,
  type BuildingFootprint3D,
} from '../game/mapBuildings';
import type { LiveParticipant } from '../types/race';
import type { AuraDimmingLevel, AuraViewMode, XrDrivingInput } from '../game/xrAura';
import {
  Photoreal3DViewport,
  type LiveThreeDTelemetry,
  type ThreeDCameraMode,
  type XrSessionBridge,
} from './Photoreal3DViewport';

export type ViewportLayout = 'split' | 'streetview' | 'map';
type OfflineMapStyleMode = 'hybrid-3d' | 'satellite' | 'architectural-night';
type MapCameraMode = 'follow' | 'circuit';

const THREE_D_CAMERAS: { id: ThreeDCameraMode; label: string }[] = [
  { id: 'CHASE', label: 'Chase Cam' },
  { id: 'HOOD', label: 'Hood Cam' },
  { id: 'BUMPER', label: 'Bumper Cam' },
  { id: 'TV', label: 'TV Cam' },
];

interface LiveStreetViewAndMapProps {
  circuit: CircuitDefinition;
  roadPos: InterpolatedRoadPosition;
  liveTelemetryRef: React.MutableRefObject<LiveThreeDTelemetry>;
  vehicleAccentColor: string;
  participants: LiveParticipant[];
  myParticipantId: string | null;
  layout: ViewportLayout;
  onLayoutChange: (layout: ViewportLayout) => void;
  auraMode?: AuraViewMode;
  auraDimming?: AuraDimmingLevel;
  xrInputRef?: React.MutableRefObject<XrDrivingInput>;
  xrBridgeRef?: React.MutableRefObject<XrSessionBridge | null>;
  onWebXrStateChange?: (activeMode: 'immersive-ar' | 'immersive-vr' | null, error?: string) => void;
}

interface OfflineTileManifest {
  tileCount?: number;
  sat?: string[];
  labels?: string[];
  satTiles?: string[];
  labelTiles?: string[];
}

// Module-level local offline tile cache (reads strictly from bundled /offline-maps/*)
const offlineTileCache: Record<string, HTMLImageElement | 'loading' | 'missing'> = {};
let offlineManifestCache: { sat: Set<string>; labels: Set<string>; count: number } | null = null;
let offlineManifestPromise: Promise<{ sat: Set<string>; labels: Set<string>; count: number }> | null =
  null;

function loadOfflineManifest(): Promise<{ sat: Set<string>; labels: Set<string>; count: number }> {
  if (offlineManifestCache) return Promise.resolve(offlineManifestCache);
  if (offlineManifestPromise) return offlineManifestPromise;
  offlineManifestPromise = fetch('/offline-maps/manifest.json')
    .then((res) => (res.ok ? (res.json() as Promise<OfflineTileManifest>) : null))
    .then((data) => {
      const sat = new Set<string>(data?.sat ?? data?.satTiles ?? []);
      const labels = new Set<string>(data?.labels ?? data?.labelTiles ?? []);
      offlineManifestCache = { sat, labels, count: data?.tileCount ?? sat.size + labels.size };
      return offlineManifestCache;
    })
    .catch(() => {
      offlineManifestCache = { sat: new Set(), labels: new Set(), count: 0 };
      return offlineManifestCache;
    });
  return offlineManifestPromise;
}

function latLngToWorldPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function scalePolygonAroundCentroid(
  pts: Array<{ x: number; y: number }>,
  scale: number
): Array<{ x: number; y: number }> {
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return pts.map((p) => ({
    x: cx + (p.x - cx) * scale,
    y: cy + (p.y - cy) * scale,
  }));
}

/**
 * Renders a single architectural extruded volume (base -> roof) with proper back-face
 * wall culling, sunlit vs shaded sky-reflection gradients, architectural mullions,
 * spandrel bands, and deterministic lit interior office windows.
 */
function drawArchitecturalVolume(
  ctx: CanvasRenderingContext2D,
  baseScreen: Array<{ x: number; y: number }>,
  roofScreen: Array<{ x: number; y: number }>,
  extrudePxY: number,
  b: BuildingFootprint3D,
  nightStyle: boolean
) {
  // Compute signed area in screen space to determine consistent outward normal orientation
  let signedArea2 = 0;
  for (let i = 0; i < baseScreen.length; i++) {
    const a = baseScreen[i];
    const c = baseScreen[(i + 1) % baseScreen.length];
    signedArea2 += a.x * c.y - c.x * a.y;
  }
  const windingSign = signedArea2 >= 0 ? 1 : -1;

  // Extrusion vector points upward-right (+ex, -ey); viewer looks from bottom-left (-ex, +ey)
  const viewX = -0.18;
  const viewY = 0.98;

  // Sort visible front-facing walls back-to-front by edge midpoint Y
  const walls: Array<{
    p0: { x: number; y: number };
    p1: { x: number; y: number };
    r0: { x: number; y: number };
    r1: { x: number; y: number };
    sunDot: number;
    midY: number;
    edgeLen: number;
  }> = [];

  for (let e = 0; e < 4; e++) {
    const n = (e + 1) % 4;
    const p0 = baseScreen[e];
    const p1 = baseScreen[n];
    const r0 = roofScreen[e];
    const r1 = roofScreen[n];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const edgeLen = Math.hypot(dx, dy);
    if (edgeLen < 1.2) continue;

    // Outward 2D normal for edge
    const outX = (dy / edgeLen) * windingSign;
    const outY = (-dx / edgeLen) * windingSign;

    // Only draw walls facing the camera (dot with camera view vector > -0.08)
    const facing = outX * viewX + outY * viewY;
    if (facing < -0.05) continue;

    // Sun comes from upper-left (-0.75, -0.65) or warm lower-left for strong architectural contrast
    const sunDot = outX * -0.78 + outY * 0.62;
    walls.push({
      p0,
      p1,
      r0,
      r1,
      sunDot,
      midY: (p0.y + p1.y) * 0.5,
      edgeLen,
    });
  }

  walls.sort((a, c) => a.midY - c.midY);

  for (let wi = 0; wi < walls.length; wi++) {
    const { p0, p1, r0, r1, sunDot, edgeLen } = walls[wi];
    const isSunlit = sunDot > 0.05;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(r1.x, r1.y);
    ctx.lineTo(r0.x, r0.y);
    ctx.closePath();

    // Vertical architectural sky-reflection / ambient-occlusion facade gradient
    const baseMidY = (p0.y + p1.y) * 0.5;
    const roofMidY = (r0.y + r1.y) * 0.5;
    const wallGrad = ctx.createLinearGradient(0, roofMidY, 0, baseMidY);
    if (nightStyle) {
      wallGrad.addColorStop(0, isSunlit ? '#2e3f59' : '#1b2638');
      wallGrad.addColorStop(1, isSunlit ? '#151f2e' : '#0b111c');
    } else if (isSunlit) {
      wallGrad.addColorStop(0, b.wallLitTopColor);
      wallGrad.addColorStop(0.75, b.wallLitColor);
      wallGrad.addColorStop(1, b.wallShadeColor);
    } else {
      wallGrad.addColorStop(0, b.wallShadeTopColor);
      wallGrad.addColorStop(1, b.wallShadeColor);
    }
    ctx.fillStyle = wallGrad;
    ctx.fill();

    // Clip architectural facade details cleanly to this wall quad
    ctx.clip();

    // Diagonal sky-reflection Fresnel sheen on glass & stepped skyscrapers
    if (
      !nightStyle &&
      (b.archetype === 'glass-tower' || b.archetype === 'stepped-skyscraper') &&
      extrudePxY >= 12
    ) {
      const sheenGrad = ctx.createLinearGradient(r0.x, r0.y, p1.x, p1.y);
      sheenGrad.addColorStop(0, 'rgba(224, 242, 254, 0)');
      sheenGrad.addColorStop(0.45, isSunlit ? 'rgba(224, 242, 254, 0.24)' : 'rgba(148, 163, 184, 0.12)');
      sheenGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.04)');
      sheenGrad.addColorStop(1, 'rgba(224, 242, 254, 0)');
      ctx.fillStyle = sheenGrad;
      ctx.fill();
    }

    // Architectural window grid: horizontal spandrels + vertical mullions + lit interior bays
    if (extrudePxY >= 10 && edgeLen >= 8) {
      const floors = Math.max(2, Math.min(12, Math.floor(extrudePxY / 5.2)));
      const cols = Math.max(2, Math.min(b.bayCount, Math.floor(edgeLen / 4.8)));

      // Floor window ribbons + selective interior illumination
      for (let fl = 0; fl < floors; fl++) {
        const f0 = (fl + 0.22) / floors;
        const f1 = (fl + 0.74) / floors;

        // Subtle lit interior offices/apartments per bay
        for (let col = 0; col < cols; col++) {
          const hash = ((b.windowSeed + fl * 37 + col * 19 + wi * 11) * 2654435761) >>> 0;
          const litChance = nightStyle || b.isNight ? 0.56 : 0.24;
          const isLitBay = (hash % 100) / 100 < litChance;
          if (!isLitBay && !nightStyle && b.archetype !== 'glass-tower') continue;

          const u0 = (col + 0.12) / cols;
          const u1 = (col + 0.88) / cols;

          const interp = (u: number, v: number) => {
            const bx = p0.x + (p1.x - p0.x) * u;
            const by = p0.y + (p1.y - p0.y) * u;
            const rx = r0.x + (r1.x - r0.x) * u;
            const ry = r0.y + (r1.y - r0.y) * u;
            return { x: bx + (rx - bx) * v, y: by + (ry - by) * v };
          };

          const q0 = interp(u0, f0);
          const q1 = interp(u1, f0);
          const q2 = interp(u1, f1);
          const q3 = interp(u0, f1);

          ctx.beginPath();
          ctx.moveTo(q0.x, q0.y);
          ctx.lineTo(q1.x, q1.y);
          ctx.lineTo(q2.x, q2.y);
          ctx.lineTo(q3.x, q3.y);
          ctx.closePath();
          ctx.fillStyle = isLitBay
            ? b.windowGlowColor
            : isSunlit
              ? b.windowTint
              : 'rgba(15, 23, 42, 0.35)';
          ctx.fill();
        }

        // Structural floor spandrel line
        const spFrac = (fl + 1) / floors;
        if (fl < floors - 1) {
          const sx0 = p0.x + (r0.x - p0.x) * spFrac;
          const sy0 = p0.y + (r0.y - p0.y) * spFrac;
          const sx1 = p1.x + (r1.x - p1.x) * spFrac;
          const sy1 = p1.y + (r1.y - p1.y) * spFrac;
          ctx.beginPath();
          ctx.moveTo(sx0, sy0);
          ctx.lineTo(sx1, sy1);
          ctx.strokeStyle =
            b.archetype === 'glass-tower' || b.archetype === 'stepped-skyscraper'
              ? 'rgba(15, 23, 42, 0.42)'
              : 'rgba(15, 23, 42, 0.28)';
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
      }

      // Vertical anodized aluminum mullions / pilasters
      ctx.strokeStyle =
        b.archetype === 'glass-tower' || b.archetype === 'stepped-skyscraper'
          ? isSunlit
            ? 'rgba(203, 213, 225, 0.34)'
            : 'rgba(15, 23, 42, 0.45)'
          : 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = 0.7;
      for (let col = 1; col < cols; col++) {
        const u = col / cols;
        const bx = p0.x + (p1.x - p0.x) * u;
        const by = p0.y + (p1.y - p0.y) * u;
        const rx = r0.x + (r1.x - r0.x) * u;
        const ry = r0.y + (r1.y - r0.y) * u;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      }
    }

    // Ground-floor warm illuminated lobby / retail podium glow
    if (extrudePxY >= 14) {
      const lobbyFrac = Math.min(0.22, 6 / extrudePxY);
      const lx0 = p0.x + (r0.x - p0.x) * lobbyFrac;
      const ly0 = p0.y + (r0.y - p0.y) * lobbyFrac;
      const lx1 = p1.x + (r1.x - p1.x) * lobbyFrac;
      const ly1 = p1.y + (r1.y - p1.y) * lobbyFrac;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(lx1, ly1);
      ctx.lineTo(lx0, ly0);
      ctx.closePath();
      ctx.fillStyle = nightStyle || b.isNight ? 'rgba(251, 191, 36, 0.38)' : 'rgba(15, 23, 42, 0.35)';
      ctx.fill();
    }

    ctx.restore();

    // Crisp architectural corner seam
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(r0.x, r0.y);
    ctx.strokeStyle = isSunlit ? 'rgba(241, 245, 249, 0.25)' : 'rgba(2, 6, 23, 0.55)';
    ctx.lineWidth = 0.85;
    ctx.stroke();
  }

  // Roof deck with recessed parapet border
  ctx.beginPath();
  roofScreen.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  const rcx = roofScreen.reduce((a, p) => a + p.x, 0) / 4;
  const rcy = roofScreen.reduce((a, p) => a + p.y, 0) / 4;
  const roofGrad = ctx.createLinearGradient(
    roofScreen[0].x,
    roofScreen[0].y,
    roofScreen[2].x,
    roofScreen[2].y
  );
  if (nightStyle) {
    roofGrad.addColorStop(0, '#29364a');
    roofGrad.addColorStop(1, '#161e2c');
  } else {
    roofGrad.addColorStop(0, b.roofAccentColor);
    roofGrad.addColorStop(0.4, b.roofColor);
    roofGrad.addColorStop(1, b.wallShadeColor);
  }
  ctx.fillStyle = roofGrad;
  ctx.fill();

  // Parapet coping edge
  ctx.strokeStyle =
    nightStyle || b.isNight
      ? b.isLandmark
        ? b.roofAccentColor
        : 'rgba(148, 163, 184, 0.35)'
      : b.isLandmark
        ? 'rgba(248, 250, 252, 0.55)'
        : 'rgba(226, 232, 240, 0.35)';
  ctx.lineWidth = b.isLandmark ? 1.35 : 0.9;
  ctx.stroke();

  // Recessed inner roof gravel/membrane membrane deck
  const innerDeck = scalePolygonAroundCentroid(roofScreen, 0.78);
  ctx.beginPath();
  innerDeck.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(9, 13, 20, 0.24)';
  ctx.fill();

  return { rcx, rcy, innerDeck };
}

/**
 * Draws detailed rooftop architectural craftsmanship: helipads, glass skylights,
 * mechanical HVAC penthouses, heritage domes, or tapered spires with aviation beacons.
 */
function drawRooftopDetails(
  ctx: CanvasRenderingContext2D,
  roofScreen: Array<{ x: number; y: number }>,
  rcx: number,
  rcy: number,
  b: BuildingFootprint3D,
  pxPerMeter: number,
  nightStyle: boolean
) {
  const spanX = Math.hypot(roofScreen[1].x - roofScreen[0].x, roofScreen[1].y - roofScreen[0].y);
  const spanY = Math.hypot(roofScreen[2].x - roofScreen[1].x, roofScreen[2].y - roofScreen[1].y);
  const minSpan = Math.min(spanX, spanY);
  if (minSpan < 7) return;

  if (b.rooftopFeature === 'dome') {
    const r = Math.min(11, minSpan * 0.34);
    const domeGrad = ctx.createRadialGradient(rcx - r * 0.3, rcy - r * 0.45, r * 0.15, rcx, rcy - r * 0.15, r);
    domeGrad.addColorStop(0, '#fef3c7');
    domeGrad.addColorStop(0.45, '#d97706');
    domeGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.arc(rcx, rcy - r * 0.25, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(254, 243, 199, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  } else if (b.rooftopFeature === 'helipad' && minSpan >= 13) {
    const r = Math.min(9.5, minSpan * 0.32);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.arc(rcx, rcy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Crisp "H" marking
    const hs = r * 0.45;
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rcx - hs * 0.7, rcy - hs);
    ctx.lineTo(rcx - hs * 0.7, rcy + hs);
    ctx.moveTo(rcx + hs * 0.7, rcy - hs);
    ctx.lineTo(rcx + hs * 0.7, rcy + hs);
    ctx.moveTo(rcx - hs * 0.7, rcy);
    ctx.lineTo(rcx + hs * 0.7, rcy);
    ctx.stroke();
  } else if (b.rooftopFeature === 'skylight' && minSpan >= 10) {
    const skyPoly = scalePolygonAroundCentroid(roofScreen, 0.42);
    ctx.beginPath();
    skyPoly.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = nightStyle || b.isNight ? 'rgba(56, 189, 248, 0.55)' : 'rgba(186, 230, 253, 0.52)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.6)';
    ctx.lineWidth = 0.75;
    ctx.stroke();
  } else if (b.rooftopFeature === 'hvac' && minSpan >= 9) {
    const mech = scalePolygonAroundCentroid(roofScreen, 0.34);
    const mechTop = mech.map((p) => ({ x: p.x + 0.8, y: p.y - 3.2 }));
    ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
    ctx.beginPath();
    mech.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x + 2, p.y + 1.5) : ctx.lineTo(p.x + 2, p.y + 1.5)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = nightStyle ? '#334155' : '#94a3b8';
    ctx.beginPath();
    mechTop.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }

  // Architectural tapered spire + aviation warning beacon on supertalls
  if (b.spireMeters > 0) {
    const spirePx = Math.max(8, Math.min(28, b.spireMeters * pxPerMeter * 0.55));
    const tipX = rcx + spirePx * 0.14;
    const tipY = rcy - spirePx;

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(rcx, rcy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Red aviation obstruction beacon
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 100% Local Offline 3D Satellite Map with World-Class Architectural Buildings.
 * Reads satellite imagery and place labels exclusively from bundled `/offline-maps/*`
 * with zero external map API requests.
 */
function Offline3DSatelliteMap({
  circuit,
  roadPos,
  participants,
  myParticipantId,
}: {
  circuit: CircuitDefinition;
  roadPos: InterpolatedRoadPosition;
  participants: LiveParticipant[];
  myParticipantId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mapStyle, setMapStyle] = useState<OfflineMapStyleMode>(() =>
    circuit.night ? 'architectural-night' : 'hybrid-3d'
  );
  const [cameraMode, setCameraMode] = useState<MapCameraMode>('follow');
  const [zoomDelta, setZoomDelta] = useState<number>(0);
  const [tileTick, setTileTick] = useState(0);
  const [offlinePackCount, setOfflinePackCount] = useState<number>(0);

  // Sync night-circuit default aesthetic on circuit switch
  useEffect(() => {
    setMapStyle(circuit.night ? 'architectural-night' : 'hybrid-3d');
  }, [circuit.id, circuit.night]);

  useEffect(() => {
    let active = true;
    loadOfflineManifest().then((m) => {
      if (active) {
        setOfflinePackCount(m.count);
        setTileTick((t) => (t + 1) % 10000);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const buildings3D = useMemo(() => buildCircuit3DBuildings(circuit), [circuit]);

  const circuitCenterAndZoom = useMemo(() => {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const wp of circuit.waypoints) {
      if (wp.lat < minLat) minLat = wp.lat;
      if (wp.lat > maxLat) maxLat = wp.lat;
      if (wp.lng < minLng) minLng = wp.lng;
      if (wp.lng > maxLng) maxLng = wp.lng;
    }
    return {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
      zoom: 14,
    };
  }, [circuit]);

  const lastDrawRef = useRef<{
    at: number;
    style: OfflineMapStyleMode;
    mode: MapCameraMode;
    zoomDelta: number;
    tick: number;
  }>({
    at: 0,
    style: 'hybrid-3d',
    mode: 'follow',
    zoomDelta: 0,
    tick: -1,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const now = performance.now();
    const forceDraw =
      lastDrawRef.current.style !== mapStyle ||
      lastDrawRef.current.mode !== cameraMode ||
      lastDrawRef.current.zoomDelta !== zoomDelta ||
      lastDrawRef.current.tick !== tileTick;
    if (!forceDraw && now - lastDrawRef.current.at < 45) return;
    lastDrawRef.current = {
      at: now,
      style: mapStyle,
      mode: cameraMode,
      zoomDelta,
      tick: tileTick,
    };

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(240, Math.floor(canvas.clientWidth || 480));
    const h = Math.max(200, Math.floor(canvas.clientHeight || 360));
    const targetW = Math.floor(w * dpr);
    const targetH = Math.floor(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = mapStyle === 'architectural-night' ? '#0a101b' : '#0f1722';
    ctx.fillRect(0, 0, w, h);

    const baseZoom = cameraMode === 'follow' ? 16 : circuitCenterAndZoom.zoom;
    const tileZ = Math.max(14, Math.min(17, baseZoom + zoomDelta));
    const centerLat = cameraMode === 'follow' ? roadPos.lat : circuitCenterAndZoom.lat;
    const centerLng = cameraMode === 'follow' ? roadPos.lng : circuitCenterAndZoom.lng;
    const centerWorld = latLngToWorldPx(centerLat, centerLng, tileZ);

    const topLeftX = centerWorld.x - w / 2;
    const topLeftY = centerWorld.y - h / 2;

    const minTileX = Math.floor(topLeftX / 256);
    const maxTileX = Math.floor((topLeftX + w) / 256);
    const minTileY = Math.floor(topLeftY / 256);
    const maxTileY = Math.floor((topLeftY + h) / 256);
    const numTiles = Math.pow(2, tileZ);
    const manifest = offlineManifestCache;

    const requestOfflineImage = (url: string): HTMLImageElement | null => {
      const cached = offlineTileCache[url];
      if (cached instanceof HTMLImageElement) return cached;
      if (cached === 'loading' || cached === 'missing') return null;
      offlineTileCache[url] = 'loading';
      const img = new Image();
      img.onload = () => {
        offlineTileCache[url] = img;
        setTileTick((t) => (t + 1) % 10000);
      };
      img.onerror = () => {
        offlineTileCache[url] = 'missing';
      };
      img.src = url;
      return null;
    };

    // Draw local offline tile with automatic parent-tile sub-rect upscaling (z=16->15->14)
    const drawOfflineLayer = (
      kind: 'sat' | 'labels',
      ext: 'jpg' | 'png',
      maxOfflineZoom: number,
      alpha: number
    ) => {
      const availSet = kind === 'sat' ? manifest?.sat : manifest?.labels;
      ctx.save();
      ctx.globalAlpha = alpha;

      for (let tx = minTileX; tx <= maxTileX; tx++) {
        for (let ty = minTileY; ty <= maxTileY; ty++) {
          if (ty < 0 || ty >= numTiles) continue;
          const wrappedX = ((tx % numTiles) + numTiles) % numTiles;
          const drawX = Math.floor(tx * 256 - topLeftX);
          const drawY = Math.floor(ty * 256 - topLeftY);

          // Find highest-resolution downloaded offline tile covering (tileZ, wrappedX, ty)
          let drawn = false;
          const startZ = Math.min(tileZ, maxOfflineZoom);
          for (let tryZ = startZ; tryZ >= 14; tryZ--) {
            const dz = tileZ - tryZ;
            const px = wrappedX >> dz;
            const py = ty >> dz;
            const key = `${tryZ}/${px}/${py}`;
            if (availSet && availSet.size > 0 && !availSet.has(key)) continue;

            const url = `/offline-maps/${kind}/${key}.${ext}`;
            const img = requestOfflineImage(url);
            if (img) {
              if (dz === 0) {
                ctx.drawImage(img, drawX, drawY, 256, 256);
              } else {
                const factor = 1 << dz;
                const subSize = 256 / factor;
                const sx = (wrappedX % factor) * subSize;
                const sy = (ty % factor) * subSize;
                ctx.drawImage(img, sx, sy, subSize, subSize, drawX, drawY, 256, 256);
              }
              drawn = true;
              break;
            }
          }

          // Subtle architectural slate tile fill while first paint streams in
          if (!drawn && kind === 'sat') {
            ctx.fillStyle = '#101a28';
            ctx.fillRect(drawX, drawY, 256, 256);
          }
        }
      }
      ctx.restore();
    };

    // 1. Bundled Offline Satellite Imagery Layer
    drawOfflineLayer('sat', 'jpg', 16, 1);

    // 2. Color grade & local offline place labels
    if (mapStyle === 'architectural-night') {
      ctx.fillStyle = 'rgba(6, 11, 22, 0.56)';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = 'rgba(8, 13, 22, 0.14)';
      ctx.fillRect(0, 0, w, h);
    }
    drawOfflineLayer('labels', 'png', 15, mapStyle === 'architectural-night' ? 0.78 : 0.92);

    const project = (lat: number, lng: number) => {
      const wp = latLngToWorldPx(lat, lng, tileZ);
      return { x: wp.x - topLeftX, y: wp.y - topLeftY };
    };

    // 3. Circuit Asphalt Route & Glowing Racing Line
    const pts = circuit.waypoints.map((wp) => project(wp.lat, wp.lng));
    if (pts.length >= 2) {
      // Soft outer glow
      ctx.save();
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(9, 11, 16, 0.9)';
      ctx.lineWidth = 11;
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.strokeStyle = circuit.accentColor;
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Subtle dashed white centerline along racing loop
      ctx.setLineDash([7, 9]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }

    // 4. World-Class Photorealistic 3D Architectural Buildings Layer
    if (mapStyle !== 'satellite') {
      const nightBuildings = mapStyle === 'architectural-night' || Boolean(circuit.night);
      const metersPerPx =
        (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, tileZ);
      const pxPerMeter = 1 / Math.max(0.22, metersPerPx);

      const visibleBuildings = buildings3D
        .map((b) => {
          const baseScreen = b.corners.map((c) => project(c.lat, c.lng));
          const mainHeight =
            b.setbackScale > 0 ? b.heightMeters * (1 - b.setbackHeightRatio) : b.heightMeters;
          const geom = computeBuilding3DExtrusion(baseScreen, mainHeight, pxPerMeter, 0.64);
          return { b, geom, mainHeight };
        })
        .filter(({ geom }) =>
          geom.baseScreen.some((p) => p.x >= -110 && p.x <= w + 110 && p.y >= -110 && p.y <= h + 130)
        )
        .sort((a, c) => a.geom.sortY - c.geom.sortY);

      // Pass A: Soft directional sun-cast shadows on satellite ground
      for (const { b, geom } of visibleBuildings) {
        const totalShadowLen = geom.extrudePxY * (b.setbackScale > 0 ? 1.25 : 1);
        ctx.fillStyle = nightBuildings ? 'rgba(2, 6, 14, 0.52)' : 'rgba(5, 10, 20, 0.34)';
        ctx.beginPath();
        geom.baseScreen.forEach((p, idx) => {
          const sx = p.x + totalShadowLen * 0.44;
          const sy = p.y + totalShadowLen * 0.25;
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fill();

        // Dark contact ambient-occlusion halo right under the building footprint
        ctx.strokeStyle = 'rgba(2, 6, 14, 0.55)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        geom.baseScreen.forEach((p, idx) =>
          idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
        );
        ctx.closePath();
        ctx.stroke();
      }

      // Pass B: Back-to-front multi-tier architectural buildings + rooftop details
      for (const { b, geom } of visibleBuildings) {
        const lowerRoof = drawArchitecturalVolume(
          ctx,
          geom.baseScreen,
          geom.roofScreen,
          geom.extrudePxY,
          b,
          nightBuildings
        );

        let topRoofScreen = geom.roofScreen;
        let topRcx = lowerRoof.rcx;
        let topRcy = lowerRoof.rcy;

        // Stepped skyscraper upper setback tier
        if (b.setbackScale > 0 && geom.extrudePxY >= 14) {
          const upperBase = scalePolygonAroundCentroid(geom.roofScreen, b.setbackScale);
          const upperH = b.heightMeters * b.setbackHeightRatio;
          const upperGeom = computeBuilding3DExtrusion(upperBase, upperH, pxPerMeter, 0.64);
          const upperRoof = drawArchitecturalVolume(
            ctx,
            upperBase,
            upperGeom.roofScreen,
            upperGeom.extrudePxY,
            b,
            nightBuildings
          );
          topRoofScreen = upperGeom.roofScreen;
          topRcx = upperRoof.rcx;
          topRcy = upperRoof.rcy;
        }

        // Architectural rooftop details (helipad / glass skylight / HVAC / heritage dome / spire)
        drawRooftopDetails(ctx, topRoofScreen, topRcx, topRcy, b, pxPerMeter, nightBuildings);
      }
    }

    // 5. Live Oriented Car Markers + Headlight Cones
    const listToRender =
      participants.length > 0
        ? participants
        : [
            {
              id: myParticipantId ?? 'local',
              name: 'You',
              locationCode: 'LIVE',
              lat: roadPos.lat,
              lng: roadPos.lng,
              heading: roadPos.heading,
              agenticMode: false,
            } as LiveParticipant,
          ];

    listToRender.forEach((p) => {
      const isMe = p.id === myParticipantId;
      const pos = isMe ? project(roadPos.lat, roadPos.lng) : project(p.lat, p.lng);
      const headingRad = ((isMe ? roadPos.heading : p.heading) - 90) * (Math.PI / 180);
      const clampedX = Math.max(18, Math.min(w - 18, pos.x));
      const clampedY = Math.max(46, Math.min(h - 18, pos.y));

      ctx.save();
      ctx.translate(clampedX, clampedY);
      ctx.rotate(headingRad);

      if (isMe) {
        const beamGrad = ctx.createRadialGradient(8, 0, 2, 18, 0, 40);
        beamGrad.addColorStop(0, 'rgba(250, 204, 21, 0.56)');
        beamGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.arc(4, 0, 40, -0.4, 0.4);
        ctx.closePath();
        ctx.fill();
      }

      // Drop shadow under car
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.roundRect(-8.5, -4, 19, 11.5, 4);
      ctx.fill();

      // Car body
      ctx.fillStyle = isMe ? '#f59e0b' : p.agenticMode ? '#10b981' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(-9.5, -5.5, 19, 11, 3.5);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, -3.5, 4.8, 7);
      ctx.restore();

      const label = `${p.name} · ${p.locationCode}`;
      ctx.font = isMe
        ? '700 11px "Plus Jakarta Sans", sans-serif'
        : '600 10px "Plus Jakarta Sans", sans-serif';
      const tw = ctx.measureText(label).width;
      const lx = Math.min(w - tw - 12, Math.max(10, clampedX + 14));
      const ly = Math.max(54, Math.min(h - 10, clampedY - 8));

      ctx.fillStyle = 'rgba(9, 11, 16, 0.92)';
      ctx.beginPath();
      ctx.roundRect(lx - 5, ly - 12, tw + 10, 17, 4);
      ctx.fill();
      ctx.fillStyle = isMe ? '#fef3c7' : '#f1f5f9';
      ctx.fillText(label, lx, ly);
    });
  }, [
    circuit,
    buildings3D,
    circuitCenterAndZoom,
    roadPos,
    participants,
    myParticipantId,
    mapStyle,
    cameraMode,
    zoomDelta,
    tileTick,
  ]);

  const cycleMapStyle = () => {
    setMapStyle((s) =>
      s === 'hybrid-3d'
        ? 'architectural-night'
        : s === 'architectural-night'
          ? 'satellite'
          : 'hybrid-3d'
    );
  };

  return (
    <div className="relative h-full w-full min-h-[220px] bg-[#0e161d] overflow-hidden">
      <canvas
        ref={canvasRef}
        data-testid="gps-circuit-map"
        data-offline-tiles={offlinePackCount}
        className="h-full w-full block"
      />

      {/* Offline Map Controls */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-[#090b10]/92 border border-white/15 p-1 rounded-lg shadow-lg">
        <button
          type="button"
          onClick={cycleMapStyle}
          className="px-2 py-1 rounded text-[11px] font-medium text-slate-200 hover:bg-white/10 flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          {mapStyle === 'hybrid-3d' ? (
            <>
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Offline 3D</span>
            </>
          ) : mapStyle === 'architectural-night' ? (
            <>
              <Moon className="w-3.5 h-3.5 text-sky-400" />
              <span>Night 3D</span>
            </>
          ) : (
            <>
              <Satellite className="w-3.5 h-3.5 text-emerald-400" />
              <span>Satellite</span>
            </>
          )}
        </button>
        <div className="w-px h-4 bg-white/15" />
        <button
          type="button"
          onClick={() => setCameraMode((c) => (c === 'follow' ? 'circuit' : 'follow'))}
          className="px-2 py-1 rounded text-[11px] font-medium text-slate-200 hover:bg-white/10 flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <LocateFixed className="w-3.5 h-3.5 text-emerald-400" />
          <span>{cameraMode === 'follow' ? 'Follow' : 'Circuit'}</span>
        </button>
        <div className="w-px h-4 bg-white/15" />
        <button
          type="button"
          onClick={() => setZoomDelta((z) => Math.max(-2, z - 1))}
          aria-label="Zoom out offline map"
          className="p-1 rounded text-slate-200 hover:bg-white/10 cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoomDelta((z) => Math.min(1, z + 1))}
          aria-label="Zoom in offline map"
          className="p-1 rounded text-slate-200 hover:bg-white/10 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="hidden sm:block w-px h-4 bg-white/15" />
        <div
          className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300/90 whitespace-nowrap"
          title="Loaded from local bundled offline satellite tiles"
        >
          <HardDrive className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>Local Pack</span>
        </div>
      </div>
    </div>
  );
}

export function LiveStreetViewAndMap({
  circuit,
  roadPos,
  liveTelemetryRef,
  vehicleAccentColor,
  participants,
  myParticipantId,
  layout,
  onLayoutChange,
  auraMode = 'standard',
  auraDimming = 5,
  xrInputRef,
  xrBridgeRef,
  onWebXrStateChange,
}: LiveStreetViewAndMapProps) {
  const [threeDCamIdx, setThreeDCamIdx] = useState(0);

  const isAuraActive = auraMode !== 'standard';
  const effectiveLayout: ViewportLayout = isAuraActive ? 'streetview' : layout;

  const currentCam = THREE_D_CAMERAS[threeDCamIdx];
  const cycleThreeDCam = () => setThreeDCamIdx((i) => (i + 1) % THREE_D_CAMERAS.length);

  // Keyboard 'C' cycles authentic 3D camera angles (Chase -> Hood -> Bumper -> TV)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' && !e.repeat) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        setThreeDCamIdx((i) => (i + 1) % THREE_D_CAMERAS.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const showStreetViewPane = effectiveLayout === 'split' || effectiveLayout === 'streetview';
  const showMap = effectiveLayout === 'split' || effectiveLayout === 'map';

  const streetHudBar = (
    <div
      className={`absolute top-3 left-3 z-20 flex items-center justify-between gap-2 pointer-events-none ${
        effectiveLayout === 'streetview' ? 'right-3 lg:right-[17.75rem]' : 'right-3'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 max-w-[60%]">
        <div className="flex items-center gap-2 bg-[#090b10]/90 border border-white/15 px-3 py-1.5 rounded-lg text-xs min-w-0">
          <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-semibold text-white truncate">{roadPos.currentLandmark}</span>
          <span className="text-slate-500 hidden xl:inline">·</span>
          <span className="text-slate-300 truncate hidden xl:inline">
            Next: {roadPos.nextLandmark}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
        <button
          type="button"
          onClick={cycleThreeDCam}
          title="Switch 3D Camera (C)"
          className="flex items-center gap-1 bg-[#090b10]/90 hover:bg-[#141a26] border border-white/15 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5 text-amber-400" />
          <span>{currentCam.label}</span>
        </button>

        <div className="hidden 2xl:flex items-center gap-1.5 bg-[#090b10]/90 border border-white/12 px-2.5 py-1.5 rounded-lg text-[11px] font-mono-tabular text-slate-300 whitespace-nowrap shrink-0">
          <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            {roadPos.lat.toFixed(4)}°N, {roadPos.lng.toFixed(4)}°E
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative h-full w-full flex flex-col lg:flex-row bg-[#090b10]">
      {/* Viewport Layout Switcher (hidden while XR Aura spatial/stereo mode owns full canvas) */}
      {!isAuraActive && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-1 bg-[#090b10]/92 border border-white/15 p-1 rounded-lg"
          role="group"
          aria-label="Viewport layout mode"
        >
          <Layers className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
          {(
            [
              { id: 'split', label: 'Split View' },
              { id: 'streetview', label: '3D View' },
              { id: 'map', label: 'Offline Map' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onLayoutChange(opt.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layout === opt.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Photorealistic 3D City Driving Viewport */}
      {showStreetViewPane && (
        <div
          className={`relative bg-[#090b10] overflow-hidden ${
            effectiveLayout === 'split'
              ? 'h-[58%] lg:h-full lg:w-[64%] border-b lg:border-b-0 lg:border-r border-white/10'
              : 'h-full w-full'
          }`}
        >
          <Photoreal3DViewport
            circuitId={circuit.id}
            telemetryRef={liveTelemetryRef}
            vehicleAccentColor={vehicleAccentColor}
            participants={participants}
            myParticipantId={myParticipantId}
            cameraMode={currentCam.id}
            active={showStreetViewPane}
            auraMode={auraMode}
            auraDimming={auraDimming}
            xrInputRef={xrInputRef}
            xrBridgeRef={xrBridgeRef}
            onWebXrStateChange={onWebXrStateChange}
          />
          {!isAuraActive && streetHudBar}
        </div>
      )}

      {/* 100% Local Offline 3D Satellite Map Pane */}
      {showMap && (
        <div
          className={`relative bg-[#0e161d] overflow-hidden ${
            effectiveLayout === 'split' ? 'h-[42%] lg:h-full lg:w-[36%]' : 'h-full w-full'
          }`}
        >
          <Offline3DSatelliteMap
            circuit={circuit}
            roadPos={roadPos}
            participants={participants}
            myParticipantId={myParticipantId}
          />
        </div>
      )}
    </div>
  );
}
