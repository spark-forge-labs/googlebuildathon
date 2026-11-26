declare module '*/game/cities.js' {
  import type * as THREE from 'three';
  import type { LegacyCityConfig, LegacyCityZone } from '../types/legacy3d';

  export type { LegacyCityConfig, LegacyCityZone };
  export const CITIES: LegacyCityConfig[];
  export function getCityById(id: string): LegacyCityConfig;
  export function getCityWaypointVectors(city: LegacyCityConfig): THREE.Vector3[];
}

declare module '*/game/track.js' {
  import type * as THREE from 'three';
  import type { LegacyCityConfig, LegacyCityZone, TrackFrame } from '../types/legacy3d';

  export type { TrackFrame };
  export const ROAD_WIDTH: number;
  export const ROAD_HALF_WIDTH: number;
  export const TRACK_SAMPLES: number;

  export class RaceTrack {
    city: LegacyCityConfig;
    totalLength: number;
    group: THREE.Group;
    boostPadsU: number[];
    boostPadMeshes: Array<{ u: number; mesh: THREE.Mesh; pos: THREE.Vector3 }>;
    samples: TrackFrame[];
    mergeStats?: unknown;
    constructor(city: LegacyCityConfig);
    getFrameAt(u: number): TrackFrame;
    getLandmarkAt(u: number): LegacyCityZone;
    update(time: number): void;
  }
}

declare module '*/game/deskWorld.js' {
  import type * as THREE from 'three';
  import type { LegacyCityConfig } from '../types/legacy3d';

  export const DESK_HALF_W: number;
  export const DESK_HALF_D: number;

  export class DeskWorld {
    scene: THREE.Scene;
    track: unknown;
    city: LegacyCityConfig;
    group: THREE.Group;
    constructor(scene: THREE.Scene, track: unknown, city: LegacyCityConfig);
    setGantrySignal(state: 'off' | 'red1' | 'red2' | 'red3'): void;
    update(time: number, dt?: number): void;
    dispose(): void;
  }
}

declare module '*/game/cars.js' {
  import type { LegacyVehicleRig } from '../types/legacy3d';

  export type { LegacyVehicleRig };
  export const AI_COLORS: Array<{
    bodyColor: number;
    accentColor: number;
    type: string;
    skill: number;
  }>;

  export function buildVehicleMesh(opts: {
    bodyColor: number;
    accentColor: number;
    type?: string;
    isPlayer?: boolean;
    lite?: boolean;
  }): LegacyVehicleRig;
}

declare module '*/game/carModels.js' {
  export function isCarModelReady(): boolean;
  export function preloadCarModel(): Promise<unknown>;
}

declare module '*/game/realWorld.js' {
  import type * as THREE from 'three';
  import type { LegacyCityConfig, RealSkyResult } from '../types/legacy3d';

  export type { RealSkyResult };
  export function buildRealSky(renderer: THREE.WebGLRenderer, city: LegacyCityConfig): RealSkyResult;
  export function loadHdriEnvironment(
    renderer: THREE.WebGLRenderer,
    file: string
  ): Promise<THREE.WebGLRenderTarget | null>;
  export function loadTreeLibrary(): Promise<unknown>;
  export function ensureTreeVariants(renderer: THREE.WebGLRenderer): unknown;
}

declare module '*/game/nightCity.js' {
  import type * as THREE from 'three';

  export function buildNightSky(renderer: THREE.WebGLRenderer): {
    sky: THREE.Mesh;
    envRT: THREE.WebGLRenderTarget;
  };
  export function applyNightCity(root: THREE.Object3D): void;
  export function setCarNightLights(root: THREE.Object3D, enabled: boolean): void;
}

declare module '*/game/particles.js' {
  import type * as THREE from 'three';

  export class ParticleSystem {
    group: THREE.Group;
    constructor(scene: THREE.Scene, maxParticles?: number, maxSkids?: number);
    clearSkids(): void;
    emitSkidPair(pos: THREE.Vector3, heading: number, normal?: THREE.Vector3): void;
    emitSmoke(pos: THREE.Vector3, carVel: THREE.Vector3): void;
    emitSparks(pos: THREE.Vector3, count?: number): void;
    spawn(opts: {
      pos: THREE.Vector3;
      vel: THREE.Vector3;
      color?: number;
      scale?: number;
      grow?: number;
      life?: number;
      gravity?: number;
      opacity?: number;
    }): void;
    update(dt: number): void;
  }
}

declare module '*/game/staticMerge.js' {
  import type * as THREE from 'three';
  export function mergeStaticMeshes(root: THREE.Object3D, exclude?: Set<THREE.Object3D>): unknown;
}

declare module '*/game/cameraLook.js' {
  export const CameraLookShader: {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
  };
}

declare module '*/game/audio.js' {
  export class SoundEngine {
    ctx: AudioContext | null;
    master?: GainNode;
    enabled: boolean;
    initialized: boolean;
    musicEnabled: boolean;
    musicStyleId?: string;
    constructor();
    init(): void;
    setMusicStyle(cityId: string): void;
    setMusicIntensity(level: 'menu' | 'race'): void;
    setMusicEnabled(on: boolean): void;
    setSuspended(hidden: boolean): void;
    setEnabled(on: boolean): void;
    updateEngine(
      speedRatio: number,
      isDrifting: boolean,
      isBoosting: boolean,
      active: boolean
    ): void;
    playBeep(high?: boolean): void;
    playBoost(): void;
    playBump(intensity?: number): void;
    playCrash(intensity?: number): void;
    playFanfare(): void;
  }
}
