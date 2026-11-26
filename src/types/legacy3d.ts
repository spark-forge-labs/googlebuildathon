import type * as THREE from 'three';

export interface LegacyCityZone {
  uStart: number;
  uEnd: number;
  te: string;
  en: string;
}

export interface LegacyCityConfig {
  id: string;
  name: string;
  nativeName: string;
  subtitle: string;
  nitroName: string;
  badgeColor: string;
  accentHex: number;
  secondaryHex: number;
  skyTop: number;
  skyBottom: number;
  fogColor: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  night?: boolean;
  region?: string;
  bridgeStyle?: string;
  bridgeUs?: number[];
  bridgeWaterU?: number | null;
  boostPadsU: number[];
  aiNames: string[];
  zones: LegacyCityZone[];
  waypoints: [number, number, number][];
}

export interface TrackFrame {
  u: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  normal: THREE.Vector3;
  curvature: number;
}

export interface LegacyVehicleRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontWheelPivots: THREE.Object3D[];
  wheelMeshes: THREE.Object3D[];
  tailLightMat: THREE.MeshStandardMaterial | null;
  nitroFlames: THREE.Object3D[];
  isRealModel?: boolean;
}

export interface RealSkyResult {
  sky: THREE.Object3D;
  envRT: THREE.WebGLRenderTarget;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  haze: THREE.Color;
  elev: number;
  hdri?: string;
}
