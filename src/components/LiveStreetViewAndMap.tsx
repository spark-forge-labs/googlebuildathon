import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Building2,
  Camera,
  Compass,
  Eye,
  Layers,
  LocateFixed,
  Map as MapIcon,
  Navigation,
  Satellite,
} from 'lucide-react';
import type { CircuitDefinition } from '../game/circuits';
import type { InterpolatedRoadPosition } from '../game/circuitMath';
import {
  buildCircuit3DBuildings,
  computeBuilding3DExtrusion,
  isWebGL2Available,
} from '../game/mapBuildings';
import type { LiveParticipant } from '../types/race';
import {
  Photoreal3DViewport,
  type LiveThreeDTelemetry,
  type ThreeDCameraMode,
} from './Photoreal3DViewport';

export type ViewportLayout = 'split' | 'streetview' | 'map';
type FallbackMapStyleMode = 'hybrid-3d' | 'satellite' | 'street';
type GoogleMapViewMode = '3d-hybrid' | '3d-satellite' | '2d-hybrid';
type MapCameraMode = 'follow' | 'circuit';
type DriveFeedMode = '3d' | 'streetview';

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
}

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

// Module-level tile cache so real satellite & street map tiles never flicker across frames
const tileImageCache: Record<string, HTMLImageElement | 'loading' | 'error'> = {};

function latLngToWorldPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function getTileUrl(style: FallbackMapStyleMode, z: number, x: number, y: number): string {
  if (style === 'street') {
    const sub = ['a', 'b', 'c', 'd'][Math.abs(x + y) % 4];
    return `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`;
  }
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

function getSatelliteLabelsUrl(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`;
}

function getSatelliteRoadsUrl(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`;
}

class MapsErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Independent realtime Google Street View controller mounted directly inside <APIProvider>
 * so switching Map layers (3D Hybrid / 3D Satellite / 2D Hybrid) never resets Street View.
 */
function GoogleStreetViewController({
  circuit,
  roadPos,
  panoContainerRef,
  onStreetViewStatus,
}: {
  circuit: CircuitDefinition;
  roadPos: InterpolatedRoadPosition;
  panoContainerRef: React.RefObject<HTMLDivElement | null>;
  onStreetViewStatus: (status: 'loading' | 'live' | 'fallback') => void;
}) {
  const streetViewLib = useMapsLibrary('streetView');
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const lastLookupPosRef = useRef<{ lat: number; lng: number; at: number }>({
    lat: 0,
    lng: 0,
    at: 0,
  });

  useEffect(() => {
    if (!streetViewLib || !panoContainerRef.current) return;
    let cancelled = false;

    const svService = new streetViewLib.StreetViewService();
    svServiceRef.current = svService;

    let pano: google.maps.StreetViewPanorama | null = null;
    try {
      pano = new streetViewLib.StreetViewPanorama(panoContainerRef.current, {
        position: circuit.waypoints[0],
        pov: { heading: circuit.streetViewStartHeading, pitch: 2 },
        zoom: 1,
        disableDefaultUI: true,
        addressControl: false,
        linksControl: false,
        panControl: false,
        enableCloseButton: false,
        motionTracking: false,
        motionTrackingControl: false,
        showRoadLabels: true,
      });
      panoramaRef.current = pano;
    } catch {
      onStreetViewStatus('fallback');
      return;
    }

    const requestInitialPanorama = (source: google.maps.StreetViewSource, radius: number, allowRetry: boolean) => {
      svService.getPanorama(
        {
          location: circuit.waypoints[0],
          radius,
          source,
          preference: streetViewLib.StreetViewPreference.NEAREST,
        },
        (data, status) => {
          if (cancelled || !panoramaRef.current) return;
          if (status === 'OK' && data?.location?.pano) {
            panoramaRef.current.setPano(data.location.pano);
            panoramaRef.current.setPov({ heading: circuit.streetViewStartHeading, pitch: 2 });
            onStreetViewStatus('live');
          } else if (allowRetry) {
            requestInitialPanorama(streetViewLib.StreetViewSource.DEFAULT, 350, false);
          } else {
            onStreetViewStatus('fallback');
          }
        }
      );
    };

    requestInitialPanorama(streetViewLib.StreetViewSource.OUTDOOR, 220, true);

    return () => {
      cancelled = true;
      panoramaRef.current = null;
    };
  }, [streetViewLib, circuit, panoContainerRef, onStreetViewStatus]);

  useEffect(() => {
    const pano = panoramaRef.current;
    const sv = svServiceRef.current;
    if (!pano || !sv || !streetViewLib) return;

    try {
      pano.setPov({ heading: roadPos.heading, pitch: 1.5 });
    } catch {
      return;
    }

    const now = Date.now();
    const dLat = Math.abs(roadPos.lat - lastLookupPosRef.current.lat);
    const dLng = Math.abs(roadPos.lng - lastLookupPosRef.current.lng);
    const approxMeters = Math.hypot(dLat, dLng) * 111_000;

    if (approxMeters > 16 || now - lastLookupPosRef.current.at > 850) {
      lastLookupPosRef.current = { lat: roadPos.lat, lng: roadPos.lng, at: now };
      sv.getPanorama(
        {
          location: { lat: roadPos.lat, lng: roadPos.lng },
          radius: 160,
          source: streetViewLib.StreetViewSource.OUTDOOR,
          preference: streetViewLib.StreetViewPreference.NEAREST,
        },
        (data, status) => {
          if (status === 'OK' && data?.location?.pano && panoramaRef.current) {
            panoramaRef.current.setPano(data.location.pano);
            panoramaRef.current.setPov({ heading: roadPos.heading, pitch: 1.5 });
            onStreetViewStatus('live');
          }
        }
      );
    }
  }, [roadPos.lat, roadPos.lng, roadPos.heading, streetViewLib, onStreetViewStatus]);

  return null;
}

/**
 * 2D Tilted Hybrid Google Maps controller (45° oblique satellite + imperative AdvancedMarkerElement).
 */
function Google2DHybridController({
  circuit,
  roadPos,
  participants,
  myParticipantId,
  cameraMode,
  onAuthFailure,
}: {
  circuit: CircuitDefinition;
  roadPos: InterpolatedRoadPosition;
  participants: LiveParticipant[];
  myParticipantId: string | null;
  cameraMode: MapCameraMode;
  onAuthFailure: () => void;
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const markerLib = useMapsLibrary('marker');
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<Record<string, google.maps.marker.AdvancedMarkerElement>>({});

  useEffect(() => {
    if (!map || !mapsLib) return;
    if (polylineRef.current) {
      try {
        polylineRef.current.setMap(null);
      } catch {
        // ignore
      }
    }
    const path = [...circuit.waypoints, circuit.waypoints[0]].map((wp) => ({
      lat: wp.lat,
      lng: wp.lng,
    }));
    const poly = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: circuit.accentColor,
      strokeOpacity: 0.95,
      strokeWeight: 5,
    });
    poly.setMap(map);
    polylineRef.current = poly;
    map.setCenter(circuit.center);
    map.setZoom(Math.max(16, circuit.defaultZoom + 1));
    map.setTilt(45);

    return () => {
      try {
        poly.setMap(null);
      } catch {
        // ignore
      }
    };
  }, [map, mapsLib, circuit]);

  useEffect(() => {
    if (!map) return;
    try {
      if (cameraMode === 'follow') {
        map.panTo({ lat: roadPos.lat, lng: roadPos.lng });
        map.setHeading(roadPos.heading);
        map.setTilt(45);
      } else {
        map.panTo(circuit.center);
        map.setHeading(0);
        map.setTilt(45);
      }
    } catch {
      // ignore
    }
  }, [map, roadPos.lat, roadPos.lng, roadPos.heading, cameraMode, circuit.center]);

  useEffect(() => {
    if (!map || !markerLib) return;
    const activeIds: Record<string, boolean> = {};

    try {
      for (const p of participants) {
        activeIds[p.id] = true;
        const isMe = p.id === myParticipantId;
        const pos = isMe ? { lat: roadPos.lat, lng: roadPos.lng } : { lat: p.lat, lng: p.lng };
        const existing = markersRef.current[p.id];

        if (existing) {
          existing.position = pos;
        } else {
          const badge = document.createElement('div');
          badge.style.padding = '3px 8px';
          badge.style.borderRadius = '6px';
          badge.style.fontSize = '11px';
          badge.style.fontWeight = '700';
          badge.style.whiteSpace = 'nowrap';
          badge.style.boxShadow = '0 4px 12px rgba(0,0,0,0.45)';
          badge.style.border = isMe
            ? '1.5px solid #fef3c7'
            : p.agenticMode
              ? '1.5px solid #a7f3d0'
              : '1.5px solid #38bdf8';
          badge.style.background = isMe
            ? '#f59e0b'
            : p.agenticMode
              ? '#10b981'
              : 'rgba(15, 23, 42, 0.94)';
          badge.style.color = isMe || p.agenticMode ? '#090b10' : '#f8fafc';
          badge.textContent = `${p.name} · ${p.locationCode}`;

          const marker = new markerLib.AdvancedMarkerElement({
            map,
            position: pos,
            content: badge,
            title: `${p.name} (${p.locationName})`,
          });
          markersRef.current[p.id] = marker;
        }
      }

      for (const id of Object.keys(markersRef.current)) {
        if (!activeIds[id]) {
          try {
            markersRef.current[id].map = null;
          } catch {
            // ignore
          }
          delete markersRef.current[id];
        }
      }
    } catch {
      onAuthFailure();
    }
  }, [map, markerLib, participants, myParticipantId, roadPos.lat, roadPos.lng, onAuthFailure]);

  useEffect(() => {
    const store = markersRef.current;
    return () => {
      for (const id of Object.keys(store)) {
        try {
          store[id].map = null;
        } catch {
          // ignore
        }
        delete store[id];
      }
    };
  }, []);

  return null;
}

/**
 * Photorealistic Satellite 3D Hybrid Map powered by Google Maps JS `maps3d` (`Map3DElement`).
 * Mounted imperatively via `useMapsLibrary('maps3d')` (CF8 compliant, zero duplicate React hooks)
 * to render real 3D buildings, bridges, terrain, satellite imagery + street labels (`HYBRID`).
 */
function GooglePhotorealistic3DMap({
  circuit,
  roadPos,
  participants,
  myParticipantId,
  mapMode,
  cameraMode,
  onFallback2D,
}: {
  circuit: CircuitDefinition;
  roadPos: InterpolatedRoadPosition;
  participants: LiveParticipant[];
  myParticipantId: string | null;
  mapMode: '3d-hybrid' | '3d-satellite';
  cameraMode: MapCameraMode;
  onFallback2D: () => void;
}) {
  const maps3dLib = useMapsLibrary('maps3d');
  const markerLib = useMapsLibrary('marker');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const map3dRef = useRef<google.maps.maps3d.Map3DElement | null>(null);
  const polylineRef = useRef<google.maps.maps3d.Polyline3DElement | null>(null);
  const markersRef = useRef<Record<string, google.maps.maps3d.Marker3DElement>>({});

  // Mount Map3DElement once when maps3d library is loaded
  useEffect(() => {
    if (!maps3dLib || !containerRef.current) return;
    const host = containerRef.current;

    let map3d: google.maps.maps3d.Map3DElement;
    try {
      map3d = new maps3dLib.Map3DElement({
        center: { lat: circuit.center.lat, lng: circuit.center.lng, altitude: 0 },
        range: 420,
        tilt: 62,
        heading: circuit.streetViewStartHeading,
        roll: 0,
        mode:
          mapMode === '3d-satellite'
            ? maps3dLib.MapMode.SATELLITE
            : maps3dLib.MapMode.HYBRID,
        gestureHandling: maps3dLib.GestureHandling.GREEDY,
        internalUsageAttributionIds: ATTRIBUTION_IDS,
      });
    } catch {
      onFallback2D();
      return;
    }

    map3d.style.display = 'block';
    map3d.style.width = '100%';
    map3d.style.height = '100%';

    const handleError = () => onFallback2D();
    map3d.addEventListener('gmp-error', handleError);
    host.appendChild(map3d);
    map3dRef.current = map3d;

    return () => {
      map3d.removeEventListener('gmp-error', handleError);
      if (map3d.parentNode === host) {
        host.removeChild(map3d);
      }
      map3dRef.current = null;
      polylineRef.current = null;
      markersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps3dLib, onFallback2D]);

  // Update 3D map mode (HYBRID with 3D buildings & labels vs SATELLITE)
  useEffect(() => {
    const map3d = map3dRef.current;
    if (!map3d || !maps3dLib) return;
    try {
      map3d.mode =
        mapMode === '3d-satellite'
          ? maps3dLib.MapMode.SATELLITE
          : maps3dLib.MapMode.HYBRID;
    } catch {
      // ignore
    }
  }, [mapMode, maps3dLib]);

  // Update 3D chase / circuit overview camera smoothly
  useEffect(() => {
    const map3d = map3dRef.current;
    if (!map3d) return;
    try {
      if (cameraMode === 'follow') {
        map3d.center = { lat: roadPos.lat, lng: roadPos.lng, altitude: 0 };
        map3d.range = 420;
        map3d.tilt = 62;
        map3d.heading = roadPos.heading;
      } else {
        map3d.center = { lat: circuit.center.lat, lng: circuit.center.lng, altitude: 0 };
        map3d.range = 2100;
        map3d.tilt = 52;
        map3d.heading = 0;
      }
    } catch {
      // ignore
    }
  }, [roadPos.lat, roadPos.lng, roadPos.heading, cameraMode, circuit.center]);

  // Render glowing 3D circuit polyline
  useEffect(() => {
    const map3d = map3dRef.current;
    if (!map3d || !maps3dLib) return;

    if (polylineRef.current && polylineRef.current.parentNode === map3d) {
      map3d.removeChild(polylineRef.current);
      polylineRef.current = null;
    }

    try {
      const poly = new maps3dLib.Polyline3DElement({
        strokeColor: circuit.accentColor,
        strokeWidth: 9,
        outerColor: '#090b10',
        outerWidth: 0.35,
        altitudeMode: maps3dLib.AltitudeMode.CLAMP_TO_GROUND,
        drawsOccludedSegments: true,
      });
      const routePoints = [...circuit.waypoints, circuit.waypoints[0]].map((wp) => ({
        lat: wp.lat,
        lng: wp.lng,
        altitude: 4,
      }));
      poly.path = routePoints;
      map3d.appendChild(poly);
      polylineRef.current = poly;
    } catch {
      // ignore
    }

    return () => {
      if (polylineRef.current && polylineRef.current.parentNode === map3d) {
        map3d.removeChild(polylineRef.current);
        polylineRef.current = null;
      }
    };
  }, [circuit, maps3dLib]);

  // Render extruded 3D markers for all connected racers
  useEffect(() => {
    const map3d = map3dRef.current;
    if (!map3d || !maps3dLib) return;

    const activeRacers =
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

    const activeIds: Record<string, boolean> = {};

    try {
      for (const p of activeRacers) {
        activeIds[p.id] = true;
        const isMe = p.id === myParticipantId;
        const pos = isMe
          ? { lat: roadPos.lat, lng: roadPos.lng, altitude: 18 }
          : { lat: p.lat, lng: p.lng, altitude: 18 };
        const existing = markersRef.current[p.id];

        if (existing) {
          existing.position = pos;
        } else {
          const marker = new maps3dLib.Marker3DElement({
            position: pos,
            altitudeMode: maps3dLib.AltitudeMode.RELATIVE_TO_GROUND,
            extruded: true,
            drawsWhenOccluded: true,
            label: `${p.name} · ${p.locationCode}`,
          });
          if (markerLib?.PinElement) {
            const pin = new markerLib.PinElement({
              background: isMe ? '#f59e0b' : p.agenticMode ? '#10b981' : '#38bdf8',
              borderColor: isMe ? '#fef3c7' : '#ffffff',
              glyphColor: '#090b10',
              scale: isMe ? 1.15 : 0.95,
            });
            marker.append(pin);
          }
          map3d.appendChild(marker);
          markersRef.current[p.id] = marker;
        }
      }

      for (const id of Object.keys(markersRef.current)) {
        if (!activeIds[id]) {
          const el = markersRef.current[id];
          if (el.parentNode === map3d) {
            map3d.removeChild(el);
          }
          delete markersRef.current[id];
        }
      }
    } catch {
      // ignore
    }
  }, [maps3dLib, markerLib, participants, myParticipantId, roadPos.lat, roadPos.lng, roadPos.heading]);

  return (
    <div
      ref={containerRef}
      data-testid="google-map-3d"
      className="h-full w-full min-h-[220px] bg-[#0e161d]"
    />
  );
}

/**
 * Real-World Satellite 3D Hybrid Tile Map with Realistic Depth-Sorted 3D Extruded Buildings.
 * Uses real Esri World Imagery satellite tiles + Reference Road/Place Labels (zero gridlines),
 * plus architectural 3D building extrusions with sunlit roofs, shaded facades, window grids,
 * and ground shadows whenever Google Maps is unavailable.
 */
function RealWorldTileMap({
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
  const [mapStyle, setMapStyle] = useState<FallbackMapStyleMode>('hybrid-3d');
  const [cameraMode, setCameraMode] = useState<MapCameraMode>('follow');
  const [tileTick, setTileTick] = useState(0);

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
      zoom: Math.max(13, circuit.defaultZoom - 1),
    };
  }, [circuit]);

  const lastDrawRef = useRef<{
    at: number;
    style: FallbackMapStyleMode;
    mode: MapCameraMode;
    tick: number;
  }>({
    at: 0,
    style: 'hybrid-3d',
    mode: 'follow',
    tick: -1,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const now = performance.now();
    const forceDraw =
      lastDrawRef.current.style !== mapStyle ||
      lastDrawRef.current.mode !== cameraMode ||
      lastDrawRef.current.tick !== tileTick;
    if (!forceDraw && now - lastDrawRef.current.at < 50) return;
    lastDrawRef.current = { at: now, style: mapStyle, mode: cameraMode, tick: tileTick };

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(240, Math.floor(canvas.clientWidth || 480));
    const h = Math.max(200, Math.floor(canvas.clientHeight || 360));
    const targetW = Math.floor(w * dpr);
    const targetH = Math.floor(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = mapStyle === 'street' ? '#dfe7ef' : '#0e161d';
    ctx.fillRect(0, 0, w, h);

    const tileZ = Math.round(cameraMode === 'follow' ? 16 : circuitCenterAndZoom.zoom);
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

    const drawTileLayer = (urlBuilder: (z: number, x: number, y: number) => string, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        for (let ty = minTileY; ty <= maxTileY; ty++) {
          if (ty < 0 || ty >= numTiles) continue;
          const wrappedX = ((tx % numTiles) + numTiles) % numTiles;
          const url = urlBuilder(tileZ, wrappedX, ty);
          const cached = tileImageCache[url];
          const drawX = Math.floor(tx * 256 - topLeftX);
          const drawY = Math.floor(ty * 256 - topLeftY);

          if (cached instanceof HTMLImageElement) {
            ctx.drawImage(cached, drawX, drawY, 256, 256);
          } else if (!cached) {
            tileImageCache[url] = 'loading';
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.referrerPolicy = 'no-referrer';
            img.onload = () => {
              tileImageCache[url] = img;
              setTileTick((t) => (t + 1) % 10000);
            };
            img.onerror = () => {
              tileImageCache[url] = 'error';
            };
            img.src = url;
          }
        }
      }
      ctx.restore();
    };

    // Base real-world satellite or street tiles
    drawTileLayer((z, x, y) => getTileUrl(mapStyle, z, x, y), 1);

    // Hybrid roads + city/landmark labels overlay on Satellite & 3D Hybrid
    if (mapStyle !== 'street') {
      drawTileLayer(getSatelliteRoadsUrl, 0.72);
      drawTileLayer(getSatelliteLabelsUrl, 0.9);
      ctx.fillStyle = 'rgba(9, 13, 20, 0.14)';
      ctx.fillRect(0, 0, w, h);
    }

    const project = (lat: number, lng: number) => {
      const wp = latLngToWorldPx(lat, lng, tileZ);
      return { x: wp.x - topLeftX, y: wp.y - topLeftY };
    };

    // Circuit track polyline on ground plane
    const pts = circuit.waypoints.map((wp) => project(wp.lat, wp.lng));
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(9, 11, 16, 0.85)';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = circuit.accentColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Realistic 3D Building Extrusion Layer (when in 3D Hybrid mode)
    if (mapStyle === 'hybrid-3d') {
      const metersPerPx =
        (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, tileZ);
      const pxPerMeter = 1 / Math.max(0.25, metersPerPx);

      const visibleBuildings = buildings3D
        .map((b) => {
          const baseScreen = b.corners.map((c) => project(c.lat, c.lng));
          const geom = computeBuilding3DExtrusion(baseScreen, b.heightMeters, pxPerMeter, 0.56);
          return { b, geom };
        })
        .filter(({ geom }) =>
          geom.baseScreen.some((p) => p.x >= -90 && p.x <= w + 90 && p.y >= -90 && p.y <= h + 110)
        )
        .sort((a, b) => a.geom.sortY - b.geom.sortY);

      for (const { b, geom } of visibleBuildings) {
        const { baseScreen, roofScreen, extrudePxY } = geom;

        // Directional architectural cast shadow on satellite ground
        ctx.fillStyle = 'rgba(4, 8, 16, 0.36)';
        ctx.beginPath();
        baseScreen.forEach((p, idx) => {
          const sx = p.x + extrudePxY * 0.42;
          const sy = p.y + extrudePxY * 0.24;
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fill();

        // Extruded vertical walls (back-to-front faces with sunlit vs shaded facades)
        for (let e = 0; e < 4; e++) {
          const n = (e + 1) % 4;
          const p0 = baseScreen[e];
          const p1 = baseScreen[n];
          const r0 = roofScreen[e];
          const r1 = roofScreen[n];

          // Draw front-facing vertical facades
          const edgeDx = p1.x - p0.x;
          const edgeDy = p1.y - p0.y;
          const isLit = edgeDx + edgeDy > 0;

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(r1.x, r1.y);
          ctx.lineTo(r0.x, r0.y);
          ctx.closePath();
          ctx.fillStyle = isLit ? b.wallLitColor : b.wallShadeColor;
          ctx.fill();
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // Architectural window floor strips on tall buildings
          if (extrudePxY >= 14) {
            const floors = Math.min(7, Math.floor(extrudePxY / 6.5));
            ctx.strokeStyle = b.windowTint;
            ctx.lineWidth = 1.1;
            for (let fl = 1; fl <= floors; fl++) {
              const frac = fl / (floors + 1);
              const wx0 = p0.x + (r0.x - p0.x) * frac;
              const wy0 = p0.y + (r0.y - p0.y) * frac;
              const wx1 = p1.x + (r1.x - p1.x) * frac;
              const wy1 = p1.y + (r1.y - p1.y) * frac;
              ctx.beginPath();
              ctx.moveTo(wx0, wy0);
              ctx.lineTo(wx1, wy1);
              ctx.stroke();
            }
          }
        }

        // Roof cap with crisp parapet bevel
        ctx.beginPath();
        roofScreen.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = b.roofColor;
        ctx.fill();
        ctx.strokeStyle = b.isLandmark
          ? 'rgba(251, 191, 36, 0.55)'
          : 'rgba(226, 232, 240, 0.28)';
        ctx.lineWidth = b.isLandmark ? 1.4 : 0.9;
        ctx.stroke();
      }
    }

    // Live oriented car markers on top of the 3D scene
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
        const beamGrad = ctx.createRadialGradient(8, 0, 2, 16, 0, 34);
        beamGrad.addColorStop(0, 'rgba(250, 204, 21, 0.48)');
        beamGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.arc(4, 0, 34, -0.42, 0.42);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = isMe ? '#f59e0b' : p.agenticMode ? '#10b981' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(-9, -5.5, 18, 11, 3.5);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, -3.5, 4.5, 7);
      ctx.restore();

      const label = `${p.name} · ${p.locationCode}`;
      ctx.font = isMe
        ? '700 11px "Plus Jakarta Sans", sans-serif'
        : '600 10px "Plus Jakarta Sans", sans-serif';
      const tw = ctx.measureText(label).width;
      const lx = Math.min(w - tw - 12, Math.max(10, clampedX + 14));
      const ly = Math.max(54, Math.min(h - 10, clampedY - 8));

      ctx.fillStyle = 'rgba(9, 11, 16, 0.9)';
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
    tileTick,
  ]);

  const cycleMapStyle = () => {
    setMapStyle((s) =>
      s === 'hybrid-3d' ? 'satellite' : s === 'satellite' ? 'street' : 'hybrid-3d'
    );
  };

  return (
    <div className="relative h-full w-full min-h-[220px] bg-[#0e161d] overflow-hidden">
      <canvas ref={canvasRef} data-testid="gps-circuit-map" className="h-full w-full block" />
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-[#090b10]/90 border border-white/15 p-1 rounded-lg shadow-lg">
        <button
          type="button"
          onClick={cycleMapStyle}
          className="px-2 py-1 rounded text-[11px] font-medium text-slate-200 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
        >
          {mapStyle === 'hybrid-3d' ? (
            <>
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>3D Hybrid</span>
            </>
          ) : mapStyle === 'satellite' ? (
            <>
              <Satellite className="w-3.5 h-3.5 text-emerald-400" />
              <span>Satellite</span>
            </>
          ) : (
            <>
              <MapIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>Street Map</span>
            </>
          )}
        </button>
        <div className="w-px h-4 bg-white/15" />
        <button
          type="button"
          onClick={() => setCameraMode((c) => (c === 'follow' ? 'circuit' : 'follow'))}
          className="px-2 py-1 rounded text-[11px] font-medium text-slate-200 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
        >
          <LocateFixed className="w-3.5 h-3.5 text-emerald-400" />
          <span>{cameraMode === 'follow' ? 'Follow' : 'Circuit'}</span>
        </button>
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
}: LiveStreetViewAndMapProps) {
  const panoContainerRef = useRef<HTMLDivElement | null>(null);
  const [svStatus, setSvStatus] = useState<'loading' | 'live' | 'fallback'>(
    MAPS_API_KEY ? 'loading' : 'fallback'
  );
  const [mapsAuthFailed, setMapsAuthFailed] = useState(false);
  const [driveFeed, setDriveFeed] = useState<DriveFeedMode>('3d');
  const [threeDCamIdx, setThreeDCamIdx] = useState(0);
  const [googleMapMode, setGoogleMapMode] = useState<GoogleMapViewMode>(() =>
    isWebGL2Available() ? '3d-hybrid' : '2d-hybrid'
  );
  const [googleCameraMode, setGoogleCameraMode] = useState<MapCameraMode>('follow');

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

  useEffect(() => {
    if (!MAPS_API_KEY) return;
    const win = window as unknown as { gm_authFailure?: () => void };
    const prev = win.gm_authFailure;
    win.gm_authFailure = () => {
      setMapsAuthFailed(true);
      setSvStatus('fallback');
      if (typeof prev === 'function') prev();
    };
    return () => {
      win.gm_authFailure = prev;
    };
  }, []);

  const showStreetViewPane = layout === 'split' || layout === 'streetview';
  const showMap = layout === 'split' || layout === 'map';
  const canShowGoogleStreetView =
    Boolean(MAPS_API_KEY) && !mapsAuthFailed && svStatus === 'live';
  const showingLiveStreetView = driveFeed === 'streetview' && canShowGoogleStreetView;

  const streetHudBar = (
    <div
      className={`absolute top-3 left-3 z-20 flex items-center justify-between gap-2 pointer-events-none ${
        layout === 'streetview' ? 'right-3 lg:right-[17.75rem]' : 'right-3'
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
        {/* Clean 2-mode feed selector: Photoreal 3D Circuit vs Real Google Street View */}
        <div
          className="flex items-center bg-[#090b10]/90 border border-white/15 p-0.5 rounded-lg"
          role="group"
          aria-label="Driving visual feed"
        >
          <button
            type="button"
            onClick={() => setDriveFeed('3d')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !showingLiveStreetView
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            3D Circuit
          </button>
          {canShowGoogleStreetView && (
            <button
              type="button"
              onClick={() => setDriveFeed('streetview')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                showingLiveStreetView
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Street View</span>
            </button>
          )}
        </div>

        {/* Camera angle selector when in Photoreal 3D Circuit mode */}
        {!showingLiveStreetView && (
          <button
            type="button"
            onClick={cycleThreeDCam}
            title="Switch 3D Camera (C)"
            className="flex items-center gap-1 bg-[#090b10]/90 hover:bg-[#141a26] border border-white/15 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>{currentCam.label}</span>
          </button>
        )}

        <div className="hidden 2xl:flex items-center gap-1.5 bg-[#090b10]/90 border border-white/12 px-2.5 py-1.5 rounded-lg text-[11px] font-mono-tabular text-slate-300 whitespace-nowrap shrink-0">
          <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            {roadPos.lat.toFixed(4)}°N, {roadPos.lng.toFixed(4)}°E
          </span>
        </div>
      </div>
    </div>
  );

  const drivingViewportShell = (withGooglePano: boolean) => (
    <div
      data-testid="streetview-viewport"
      className={`relative overflow-hidden bg-[#090b10] ${
        layout === 'split'
          ? 'h-[58%] lg:h-full lg:w-[60%] border-b lg:border-b-0 lg:border-r border-white/10'
          : showStreetViewPane
            ? 'h-full w-full'
            : 'hidden'
      }`}
    >
      {/* Original Photorealistic Three.js Ferrari 458 + HDRI + 3D City Landmarks */}
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${
          showingLiveStreetView ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <Photoreal3DViewport
          circuitId={circuit.id}
          vehicleAccentColor={vehicleAccentColor}
          telemetryRef={liveTelemetryRef}
          participants={participants}
          myParticipantId={myParticipantId}
          cameraMode={currentCam.id}
          active={showStreetViewPane && !showingLiveStreetView}
        />
      </div>

      {/* Unobstructed Real Google Street View Panorama (zero 2D cartoon overlay) */}
      {withGooglePano && (
        <div
          ref={panoContainerRef}
          data-testid="google-streetview-pano"
          className={`absolute inset-0 h-full w-full min-h-[240px] transition-opacity duration-200 ${
            showingLiveStreetView
              ? 'opacity-100 z-[5]'
              : 'opacity-0 pointer-events-none z-0'
          }`}
        />
      )}

      {streetHudBar}
    </div>
  );

  const fallbackSplitView = (
    <>
      {drivingViewportShell(false)}
      <div
        className={`relative ${
          layout === 'split'
            ? 'h-[42%] lg:h-full lg:w-[40%]'
            : showMap
              ? 'h-full w-full'
              : 'hidden'
        }`}
      >
        <RealWorldTileMap
          circuit={circuit}
          roadPos={roadPos}
          participants={participants}
          myParticipantId={myParticipantId}
        />
      </div>
    </>
  );

  const cycleGoogleMapMode = () => {
    setGoogleMapMode((m) =>
      m === '3d-hybrid' ? '3d-satellite' : m === '3d-satellite' ? '2d-hybrid' : '3d-hybrid'
    );
  };

  return (
    <div className="relative h-full w-full flex flex-col lg:flex-row bg-[#090b10]">
      {/* Viewport Layout Switcher */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-1 bg-[#090b10]/92 border border-white/15 p-1 rounded-lg"
        role="group"
        aria-label="Viewport layout mode"
      >
        <Layers className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
        {(
          [
            { id: 'split', label: 'Split View' },
            { id: 'streetview', label: '3D / Street View' },
            { id: 'map', label: 'Map View' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onLayoutChange(opt.id)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              layout === opt.id
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {MAPS_API_KEY && !mapsAuthFailed ? (
        <MapsErrorBoundary fallback={fallbackSplitView}>
          <APIProvider
            apiKey={MAPS_API_KEY}
            libraries={['maps3d', 'marker', 'streetView', 'maps']}
            language="en"
            region="US"
          >
            {/* Decoupled Google Street View controller (never resets on map layer switch) */}
            <GoogleStreetViewController
              circuit={circuit}
              roadPos={roadPos}
              panoContainerRef={panoContainerRef}
              onStreetViewStatus={setSvStatus}
            />

            {/* Photoreal 3D Circuit / Clean Realtime Google Street View Pane */}
            {drivingViewportShell(true)}

            {/* Photorealistic Satellite 3D Hybrid Map with Real 3D Buildings */}
            <div
              data-testid="google-map-container"
              className={`relative transition-all duration-200 ${
                layout === 'split'
                  ? 'h-[42%] lg:h-full lg:w-[40%]'
                  : showMap
                    ? 'h-full w-full'
                    : 'hidden'
              }`}
            >
              {googleMapMode === '2d-hybrid' ? (
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  defaultCenter={circuit.center}
                  defaultZoom={Math.max(16, circuit.defaultZoom + 1)}
                  defaultTilt={45}
                  mapTypeId="hybrid"
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  streetViewControl={true}
                  mapTypeControl={true}
                  internalUsageAttributionIds={ATTRIBUTION_IDS}
                  className="h-full w-full min-h-[220px]"
                >
                  <Google2DHybridController
                    circuit={circuit}
                    roadPos={roadPos}
                    participants={participants}
                    myParticipantId={myParticipantId}
                    cameraMode={googleCameraMode}
                    onAuthFailure={() => setMapsAuthFailed(true)}
                  />
                </GoogleMap>
              ) : (
                <GooglePhotorealistic3DMap
                  circuit={circuit}
                  roadPos={roadPos}
                  participants={participants}
                  myParticipantId={myParticipantId}
                  mapMode={googleMapMode}
                  cameraMode={googleCameraMode}
                  onFallback2D={() => setGoogleMapMode('2d-hybrid')}
                />
              )}

              {/* Satellite 3D Hybrid / 3D Satellite / 2D Hybrid & Camera Controls */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-[#090b10]/90 border border-white/15 p-1 rounded-lg shadow-lg">
                <button
                  type="button"
                  onClick={cycleGoogleMapMode}
                  className="px-2 py-1 rounded text-[11px] font-medium text-slate-200 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
                >
                  {googleMapMode === '3d-hybrid' ? (
                    <>
                      <Building2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>3D Hybrid</span>
                    </>
                  ) : googleMapMode === '3d-satellite' ? (
                    <>
                      <Satellite className="w-3.5 h-3.5 text-emerald-400" />
                      <span>3D Satellite</span>
                    </>
                  ) : (
                    <>
                      <MapIcon className="w-3.5 h-3.5 text-sky-400" />
                      <span>2D Hybrid</span>
                    </>
                  )}
                </button>
                <div className="w-px h-4 bg-white/15" />
                <button
                  type="button"
                  onClick={() =>
                    setGoogleCameraMode((c) => (c === 'follow' ? 'circuit' : 'follow'))
                  }
                  className="px-2 py-1 rounded text-[11px] font-medium text-slate-200 hover:bg-white/10 flex items-center gap-1 cursor-pointer"
                >
                  <LocateFixed className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{googleCameraMode === 'follow' ? 'Follow' : 'Circuit'}</span>
                </button>
              </div>
            </div>
          </APIProvider>
        </MapsErrorBoundary>
      ) : (
        fallbackSplitView
      )}
    </div>
  );
}
