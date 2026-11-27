import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { getCityById, type LegacyCityConfig } from '../game/cities.js';
import { RaceTrack } from '../game/track.js';
import { DeskWorld } from '../game/deskWorld.js';
import { AI_COLORS, buildVehicleMesh, type LegacyVehicleRig } from '../game/cars.js';
import { isCarModelReady, preloadCarModel } from '../game/carModels.js';
import {
  buildRealSky,
  ensureTreeVariants,
  loadHdriEnvironment,
  loadTreeLibrary,
} from '../game/realWorld.js';
import { applyNightCity, buildNightSky, setCarNightLights } from '../game/nightCity.js';
import { ParticleSystem } from '../game/particles.js';
import { mergeStaticMeshes } from '../game/staticMerge.js';
import { CameraLookShader } from '../game/cameraLook.js';
import type { LiveParticipant } from '../types/race';
import type { RacePhase } from '../game/raceSchedule';
import {
  computeSpeedCameraFeel,
  distanceMetersToTrackU,
  paceSpeedKmhToUPerSec,
  speedKmhToWorldUnitsPerSec,
} from '../game/speedVisuals';
import {
  AURA_IPD_METERS,
  AURA_OPTICAL_FOV_DEG,
  AuraSpatialHud3D,
  extractXrFrameDrivingInput,
  getAuraDimmingConfig,
  type AuraDimmingLevel,
  type AuraViewMode,
  type XrDrivingInput,
} from '../game/xrAura';

export type ThreeDCameraMode = 'CHASE' | 'HOOD' | 'BUMPER' | 'TV';

export interface LiveThreeDTelemetry {
  lapProgress01: number;
  distanceMeters: number;
  lapLengthMeters: number;
  speedKmh: number;
  steeringOffset: number;
  isNitroActive: boolean;
  isBraking: boolean;
  phase: RacePhase;
  countdownSecondsLeft: number;
  gear?: number;
  nitroPercent?: number;
  rank?: number;
  totalRacers?: number;
  lap?: number;
  remainingClock?: string;
  circuitName?: string;
  landmark?: string;
}

export interface XrSessionBridge {
  startWebXrSession: (mode: 'immersive-ar' | 'immersive-vr') => Promise<boolean>;
  endWebXrSession: () => Promise<void>;
}

interface Photoreal3DViewportProps {
  circuitId: string;
  vehicleAccentColor: string;
  telemetryRef: React.MutableRefObject<LiveThreeDTelemetry>;
  participants: LiveParticipant[];
  myParticipantId: string | null;
  cameraMode: ThreeDCameraMode;
  active: boolean;
  auraMode?: AuraViewMode;
  auraDimming?: AuraDimmingLevel;
  xrInputRef?: React.MutableRefObject<XrDrivingInput>;
  xrBridgeRef?: React.MutableRefObject<XrSessionBridge | null>;
  onWebXrStateChange?: (activeMode: 'immersive-ar' | 'immersive-vr' | null, error?: string) => void;
}

interface PaceCarState {
  id: string;
  u: number;
  laneOffset: number;
  targetLaneOffset: number;
  speedKmh: number;
  colorHex: number;
  accentHex: number;
  rig: LegacyVehicleRig;
  wheelSpin: number;
  laneTimer: number;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function hexStringToNumber(hex: string, fallback = 0xff6b1a): number {
  const clean = hex.replace('#', '').trim();
  const parsed = Number.parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Module-scope reusable vectors & matrices to avoid GC allocations inside the render loop
const _pos = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _orthoFwd = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _desiredCamPos = new THREE.Vector3();
const _desiredCamLook = new THREE.Vector3();
const _exhaustPos = new THREE.Vector3();
const _exhaustVel = new THREE.Vector3();

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData?.shared) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m.userData?.shared) continue;
        const std = m as THREE.MeshStandardMaterial;
        for (const tex of [std.map, std.emissiveMap, std.roughnessMap, std.normalMap, std.bumpMap]) {
          if (tex && !tex.userData?.shared) tex.dispose();
        }
        m.dispose();
      }
    }
  });
}

function orientCarOnTrack(
  rig: LegacyVehicleRig,
  track: RaceTrack,
  u: number,
  lateralOffset: number,
  steerVisualRad: number,
  bodyPitch: number,
  bodyRoll: number,
  speedUnits: number,
  dt: number,
  isBraking: boolean,
  isNitro: boolean,
  isNight: boolean,
  outPos?: THREE.Vector3,
  outHeading?: { value: number }
) {
  const frame = track.getFrameAt(u);
  _pos.copy(frame.point).addScaledVector(frame.right, lateralOffset);
  _pos.y += 0.04;
  rig.root.position.copy(_pos);
  if (outPos) outPos.copy(_pos);

  const trackHeading = Math.atan2(frame.tangent.x, frame.tangent.z);
  const visualHeading = trackHeading - steerVisualRad * 0.16;
  if (outHeading) outHeading.value = trackHeading;

  _fwd.set(Math.sin(visualHeading), 0, Math.cos(visualHeading));
  _up.copy(frame.normal);
  _right.crossVectors(_up, _fwd).normalize();
  _orthoFwd.crossVectors(_right, _up).normalize();
  _mat4.makeBasis(_right, _up, _orthoFwd);
  rig.root.quaternion.setFromRotationMatrix(_mat4);

  if (rig.bodyGroup) {
    rig.bodyGroup.rotation.x = bodyPitch;
    rig.bodyGroup.rotation.z = bodyRoll;
  }

  const wheelDelta = speedUnits * dt * 2.15;
  for (const w of rig.wheelMeshes) {
    w.rotation.x += wheelDelta * ((w.userData.spinSign as number | undefined) || 1);
  }
  for (const pivot of rig.frontWheelPivots) {
    pivot.rotation.y = THREE.MathUtils.clamp(-steerVisualRad * 0.45, -0.42, 0.42);
  }

  if (rig.tailLightMat) {
    rig.tailLightMat.emissiveIntensity = (isBraking ? 2.8 : 0.9) * (isNight ? 1.9 : 1);
  }

  for (const flame of rig.nitroFlames) {
    flame.visible = isNitro;
    if (isNitro) {
      flame.scale.set(1, 1, 0.85 + Math.random() * 0.65);
    }
  }
}

/**
 * Photorealistic Three.js 3D Street Circuit Viewport.
 * Reuses the original repository's Ferrari 458 Italia GLB, HDRI sky reflections,
 * physical Preetham sky, 1024px weathered asphalt track, iconic city landmarks & bridges,
 * EZ-Tree swaying trees, and film-grade post-processing, synced live to the race state.
 */
export function Photoreal3DViewport({
  circuitId,
  vehicleAccentColor,
  telemetryRef,
  participants,
  myParticipantId,
  cameraMode,
  active,
  auraMode = 'standard',
  auraDimming = 5,
  xrInputRef,
  xrBridgeRef,
  onWebXrStateChange,
}: Photoreal3DViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const speedLinesRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const propsRef = useRef({
    circuitId,
    vehicleAccentColor,
    participants,
    myParticipantId,
    cameraMode,
    active,
    auraMode,
    auraDimming,
    xrInputRef,
    onWebXrStateChange,
  });
  propsRef.current = {
    circuitId,
    vehicleAccentColor,
    participants,
    myParticipantId,
    cameraMode,
    active,
    auraMode,
    auraDimming,
    xrInputRef,
    onWebXrStateChange,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const initialW = Math.max(320, container.clientWidth || 720);
    const initialH = Math.max(240, container.clientHeight || 540);
    const pixelRatio = isSoftwareGl ? 0.65 : Math.min(window.devicePixelRatio || 1, 2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false, // SMAA handles AA on GPU; WebXR uses native MSAA swapchain
        alpha: true, // Required for optical see-through immersive-ar on XREAL Aura glasses
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('3D WebGL context unavailable — use Offline Map view to continue racing.');
      return;
    }
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(initialW, initialH);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, initialW / initialH, 0.25, 2400);

    // Camera rig enables natural 6DoF head tracking inside XREAL Aura while riding with the Ferrari 458
    const cameraRig = new THREE.Group();
    cameraRig.name = 'AuraCameraRig';
    cameraRig.add(camera);
    scene.add(cameraRig);

    // Curved 3D holographic telemetry HUD anchored inside Aura's 70° optical FOV
    const spatialHud = new AuraSpatialHud3D();
    camera.add(spatialHud.group);

    // StereoCamera for direct USB-C DisplayPort-in (DP-in) 3D Side-by-Side (SBS) output on XREAL Aura
    const stereoCam = new THREE.StereoCamera();
    stereoCam.eyeSep = AURA_IPD_METERS;
    stereoCam.aspect = 0.5;

    // Gentle head-look parallax offset when previewing 70° Spatial Mode with mouse or device orientation
    const headLook = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
    const onPointerMove = (e: PointerEvent) => {
      const m = propsRef.current.auraMode;
      if (m !== 'aura-spatial' && m !== 'aura-sbs') return;
      const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      headLook.targetYaw = THREE.MathUtils.clamp(-nx * 0.14, -0.16, 0.16);
      headLook.targetPitch = THREE.MathUtils.clamp(-ny * 0.08, -0.1, 0.1);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // 3-point outdoor lighting rig matching original engine.js
    const hemiLight = new THREE.HemisphereLight(0xbfd6ff, 0x5b4a36, 0.58);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffe7c2, 2.05);
    dirLight.position.set(-68, 92, 48);
    dirLight.castShadow = !isSoftwareGl;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.normalBias = 0.04;
    dirLight.shadow.bias = -0.0006;
    dirLight.shadow.camera.near = 20;
    dirLight.shadow.camera.far = 360;
    const d = 128;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);
    scene.add(dirLight.target);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.18);
    rimLight.position.set(85, 45, -80);
    scene.add(rimLight);

    const particles = new ParticleSystem(scene, isSoftwareGl ? 90 : 220, isSoftwareGl ? 60 : 180);

    // GPU-only filmic post-processing pipeline (UnrealBloom + SMAA + CameraLookShader)
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let cameraLookPass: ShaderPass | null = null;

    if (!isSoftwareGl) {
      try {
        const comp = new EffectComposer(renderer);
        comp.setPixelRatio(pixelRatio);
        comp.setSize(initialW, initialH);
        comp.addPass(new RenderPass(scene, camera));
        bloomPass = new UnrealBloomPass(new THREE.Vector2(initialW, initialH), 0.16, 0.45, 0.92);
        comp.addPass(bloomPass);
        comp.addPass(new OutputPass());
        comp.addPass(new SMAAPass());
        cameraLookPass = new ShaderPass(CameraLookShader);
        (cameraLookPass.uniforms.resolution.value as THREE.Vector2).set(
          initialW * pixelRatio,
          initialH * pixelRatio
        );
        comp.addPass(cameraLookPass);
        composer = comp;
      } catch {
        composer = null;
      }
    }

    let disposed = false;
    let loadedCityId = '';
    let loadedCarColor = '';
    let currentCity: LegacyCityConfig | null = null;
    let track: RaceTrack | null = null;
    let deskWorld: DeskWorld | null = null;
    let skyObj: THREE.Object3D | null = null;
    let envRT: THREE.WebGLRenderTarget | null = null;
    let playerRig: LegacyVehicleRig | null = null;
    let paceCars: PaceCarState[] = [];
    const rivalRigs = new Map<string, { rig: LegacyVehicleRig; colorHex: number; smoothU: number; lane: number }>();
    let carsBuiltWithRealModel = isCarModelReady();

    // Smooth camera & motion state
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const smoothChaseFwd = new THREE.Vector3(0, 0, 1);
    let camInitialized = false;
    let smoothU = 0;
    let smoothLateral = 0;
    let smoothPitch = 0;
    let smoothRoll = 0;
    let smoothSteer = 0;
    let prevSpeedKmh = 0;
    let elapsed = 0;
    let particleEmitAcc = 0;

    const rebuildPlayerAndPaceCars = (city: LegacyCityConfig, accentHexStr: string) => {
      const isNight = !!city.night;
      if (playerRig) {
        scene.remove(playerRig.root);
        playerRig = null;
      }
      for (const pc of paceCars) {
        scene.remove(pc.rig.root);
      }
      paceCars = [];
      for (const [, entry] of rivalRigs) {
        scene.remove(entry.rig.root);
      }
      rivalRigs.clear();

      const bodyHex = hexStringToNumber(accentHexStr, city.accentHex || 0xff6b1a);
      playerRig = buildVehicleMesh({
        bodyColor: bodyHex,
        accentColor: 0xf7c948,
        type: 'sports',
        isPlayer: true,
        lite: false,
      });
      setCarNightLights(playerRig.root, isNight);
      scene.add(playerRig.root);

      // 5 authentic Ferrari / GT street racers paced at 135-188 km/h so pushing 200-300+ km/h delivers thrilling overtakes
      const initialOffsets = [
        { u: 0.015, lane: -3.2, speedKmh: 138 },
        { u: 0.036, lane: 3.1, speedKmh: 156 },
        { u: 0.062, lane: -2.4, speedKmh: 170 },
        { u: 0.092, lane: 2.9, speedKmh: 148 },
        { u: 0.135, lane: -0.4, speedKmh: 184 },
      ];
      initialOffsets.forEach((cfg, idx) => {
        const spec = AI_COLORS[idx % AI_COLORS.length];
        const rig = buildVehicleMesh({
          bodyColor: spec.bodyColor,
          accentColor: spec.accentColor,
          type: 'sports',
          isPlayer: false,
          lite: isSoftwareGl,
        });
        setCarNightLights(rig.root, isNight);
        scene.add(rig.root);
        paceCars.push({
          id: `pace-${idx}`,
          u: cfg.u,
          laneOffset: cfg.lane,
          targetLaneOffset: cfg.lane,
          speedKmh: cfg.speedKmh,
          colorHex: spec.bodyColor,
          accentHex: spec.accentColor,
          rig,
          wheelSpin: 0,
          laneTimer: 3 + idx * 1.7,
        });
      });

      carsBuiltWithRealModel = isCarModelReady();
      loadedCarColor = accentHexStr;
    };

    const loadCityScene = (cityId: string) => {
      const city = getCityById(cityId);
      currentCity = city;
      loadedCityId = cityId;

      if (track) {
        scene.remove(track.group);
        disposeObjectTree(track.group);
        track = null;
      }
      if (deskWorld) {
        deskWorld.dispose();
        deskWorld = null;
      }
      if (skyObj) {
        scene.remove(skyObj);
        skyObj = null;
      }
      if (envRT) {
        envRT.dispose();
        envRT = null;
      }
      particles.clearSkids();

      const atmo = buildRealSky(renderer, city);
      const isNight = !!city.night;
      if (isNight) {
        atmo.envRT.dispose();
        const ns = buildNightSky(renderer);
        skyObj = ns.sky;
        envRT = ns.envRT;
      } else {
        skyObj = atmo.sky;
        envRT = atmo.envRT;
      }
      if (skyObj) scene.add(skyObj);
      if (envRT) scene.environment = envRT.texture;
      scene.environmentIntensity = isNight ? 0.9 : 1.18;

      if (atmo.hdri) {
        loadHdriEnvironment(renderer, atmo.hdri).then((rt) => {
          if (disposed || !rt || !currentCity || currentCity.id !== city.id) return;
          scene.environment = rt.texture;
        });
      }

      scene.background = null;
      scene.fog = isNight
        ? new THREE.FogExp2(0x0d0a16, 0.0019)
        : new THREE.FogExp2(atmo.haze.getHex(), 0.0014);

      dirLight.color.copy(isNight ? new THREE.Color(0xe6edff) : atmo.sunColor);
      dirLight.intensity = isNight ? 1.7 : Math.max(2.35, atmo.sunIntensity * 1.18);
      dirLight.position.copy(atmo.sunDir).multiplyScalar(160);
      dirLight.target.position.set(0, 0, 0);
      hemiLight.color.set(isNight ? 0x4b5c94 : 0xd6e8ff);
      hemiLight.groundColor.set(isNight ? 0x1d1712 : 0x705e48);
      hemiLight.intensity = isNight ? 0.48 : 0.92;
      rimLight.color.set(isNight ? 0xc58cff : 0xeef6ff);
      rimLight.intensity = isNight ? 0.45 : 0.65;

      renderer.toneMappingExposure = isNight ? 0.92 : 1.04;
      if (bloomPass) {
        bloomPass.strength = isNight ? 0.52 : 0.14;
        bloomPass.threshold = isNight ? 0.8 : 0.94;
      }

      track = new RaceTrack(city);
      scene.add(track.group);
      if (isNight) applyNightCity(track.group);
      mergeStaticMeshes(
        track.group,
        new Set(track.boostPadMeshes.map((p) => p.mesh))
      );

      deskWorld = new DeskWorld(scene, track, city);
      rebuildPlayerAndPaceCars(city, propsRef.current.vehicleAccentColor);
      camInitialized = false;
    };

    // Defer initial heavy 3D scene construction by 1 frame so clicking Solo Practice
    // paints the RaceCockpit HUD + Offline 3D Satellite Map immediately (< 30ms) with zero UI freeze!
    const initFrameId = requestAnimationFrame(() => {
      if (disposed) return;
      try {
        loadCityScene(propsRef.current.circuitId);
        setSceneReady(true);
        startFlatLoop();
      } catch {
        setWebglError('3D viewport failed to initialize — switch to Offline Map view.');
        return;
      }

      // Preload real Ferrari 458 Italia GLB + EZ-Tree foliage and seamlessly upgrade scene
      preloadCarModel().then(() => {
        if (disposed || !currentCity) return;
        if (isCarModelReady() && !carsBuiltWithRealModel) {
          rebuildPlayerAndPaceCars(currentCity, propsRef.current.vehicleAccentColor);
        }
      });

      if (!isSoftwareGl) {
        loadTreeLibrary().then((mod) => {
          if (disposed || !mod || !currentCity) return;
          ensureTreeVariants(renderer);
          loadCityScene(propsRef.current.circuitId);
        });
      }
    });

    // ResizeObserver keeps aspect ratio & composer crisp across Split View / Full View toggles
    let lastSizedW = initialW;
    let lastSizedH = initialH;
    const applySize = () => {
      if (disposed || !container) return;
      const w = Math.max(160, container.clientWidth);
      const h = Math.max(160, container.clientHeight);
      if (w === lastSizedW && h === lastSizedH) return;
      lastSizedW = w;
      lastSizedH = h;
      const effectivePr = isSoftwareGl ? (w > 1000 ? 0.5 : 0.65) : pixelRatio;
      renderer.setPixelRatio(effectivePr);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (composer) {
        composer.setPixelRatio(effectivePr);
        composer.setSize(w, h);
        if (cameraLookPass) {
          (cameraLookPass.uniforms.resolution.value as THREE.Vector2).set(
            w * effectivePr,
            h * effectivePr
          );
        }
      }
      // On real GPUs, repaint immediately so toggling Split / Full View never flashes black
      if (!isSoftwareGl && track && playerRig && propsRef.current.active) {
        if (composer) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }
      }
    };

    const resizeObs = new ResizeObserver(() => applySize());
    resizeObs.observe(container);

    // Render loop with mandatory software-WebGL pacing (afterDraw fenceSync) + Native WebXR loop support
    let frameId = 0;
    let lastTs = performance.now();
    const headingOut = { value: 0 };
    let activeXrSession: XRSession | null = null;
    let activeXrMode: 'immersive-ar' | 'immersive-vr' | null = null;
    const _rigEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 16);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 16);
      } else {
        frameId = window.setTimeout(cb, 100);
      }
    };

    const renderFrame = (xrFrame?: XRFrame) => {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const props = propsRef.current;
      const isWebXrPresenting = renderer.xr.isPresenting;

      // Skip heavy drawing when viewport is hidden (unless presenting natively in XR glasses)
      if (!props.active && !isWebXrPresenting) {
        if (!isWebXrPresenting) {
          frameId = window.setTimeout(() => renderFrame(), 180);
        }
        return;
      }

      if (props.circuitId !== loadedCityId) {
        loadCityScene(props.circuitId);
      } else if (currentCity && props.vehicleAccentColor !== loadedCarColor) {
        rebuildPlayerAndPaceCars(currentCity, props.vehicleAccentColor);
      }

      if (!track || !deskWorld || !currentCity || !playerRig) {
        if (!isWebXrPresenting) {
          frameId = requestAnimationFrame(() => renderFrame());
        }
        return;
      }

      // Extract live 6DoF hand-tracking / puck controls during active WebXR session
      if (isWebXrPresenting && activeXrSession && xrFrame && props.xrInputRef) {
        const refSpace = renderer.xr.getReferenceSpace();
        if (refSpace) {
          props.xrInputRef.current = extractXrFrameDrivingInput(
            activeXrSession,
            xrFrame,
            refSpace
          );
        }
      }

      elapsed += dt;
      const tel = telemetryRef.current;
      const isNight = !!currentCity.night;

      // Sync 3D F1 Start Gantry Lights with 10-second race countdown
      if (tel.phase === 'countdown') {
        const s = tel.countdownSecondsLeft;
        deskWorld.setGantrySignal(s <= 3 ? 'red3' : s <= 6 ? 'red2' : s <= 9 ? 'red1' : 'off');
      } else {
        deskWorld.setGantrySignal('off');
      }

      // Map real traveled distance 1:1 onto the 3D circuit (true ~68 u/s at 200 km/h instead of compressed GPS progress)
      smoothU = distanceMetersToTrackU(tel.distanceMeters, track.totalLength);

      const speedUnits = speedKmhToWorldUnitsPerSec(tel.speedKmh);
      const accelKmh = (tel.speedKmh - prevSpeedKmh) / Math.max(dt, 0.008);
      prevSpeedKmh = tel.speedKmh;

      const targetLateral = THREE.MathUtils.clamp(tel.steeringOffset * 4.4, -5.2, 5.2);
      smoothLateral = THREE.MathUtils.damp(smoothLateral, targetLateral, 7.5, dt);
      smoothSteer = THREE.MathUtils.damp(smoothSteer, tel.steeringOffset, 9, dt);

      const targetPitch = THREE.MathUtils.clamp(
        -accelKmh * 0.00065 - (tel.isNitroActive ? 0.05 : 0) + (tel.isBraking ? 0.06 : 0),
        -0.09,
        0.09
      );
      const targetRoll = THREE.MathUtils.clamp(
        tel.steeringOffset * Math.min(1, tel.speedKmh / 140) * 0.095,
        -0.13,
        0.13
      );
      smoothPitch = THREE.MathUtils.damp(smoothPitch, targetPitch, 8, dt);
      smoothRoll = THREE.MathUtils.damp(smoothRoll, targetRoll, 9, dt);

      // Place & animate player's Ferrari 458 Italia
      const playerPos = new THREE.Vector3();
      orientCarOnTrack(
        playerRig,
        track,
        smoothU,
        smoothLateral,
        smoothSteer,
        smoothPitch,
        smoothRoll,
        speedUnits,
        dt,
        tel.isBraking,
        tel.isNitroActive,
        isNight,
        playerPos,
        headingOut
      );

      // Sync real multiplayer rivals using the exact same 1:1 physical meter scale so meter gaps match the map
      const activeRivalIds = new Set<string>();
      props.participants.forEach((p, idx) => {
        if (p.id === props.myParticipantId) return;
        activeRivalIds.add(p.id);
        let entry = rivalRigs.get(p.id);
        const rivalTargetU = distanceMetersToTrackU(p.distanceMeters, track!.totalLength);
        if (!entry) {
          const spec = AI_COLORS[idx % AI_COLORS.length];
          const rig = buildVehicleMesh({
            bodyColor: spec.bodyColor,
            accentColor: spec.accentColor,
            type: 'sports',
            isPlayer: false,
            lite: isSoftwareGl,
          });
          setCarNightLights(rig.root, isNight);
          scene.add(rig.root);
          entry = {
            rig,
            colorHex: spec.bodyColor,
            smoothU: rivalTargetU,
            lane: idx % 2 === 0 ? -3.0 : 3.0,
          };
          rivalRigs.set(p.id, entry);
        }
        let du = rivalTargetU - entry.smoothU;
        if (du > 0.5) du -= 1;
        if (du < -0.5) du += 1;
        if (Math.abs(du) > 0.25) {
          entry.smoothU = rivalTargetU;
        } else {
          entry.smoothU = (entry.smoothU + du * Math.min(1, dt * 10) + 1) % 1;
        }
        orientCarOnTrack(
          entry.rig,
          track!,
          entry.smoothU,
          entry.lane,
          0,
          0,
          0,
          speedKmhToWorldUnitsPerSec(p.speedKmh || 0),
          dt,
          false,
          p.agenticMode && (p.speedKmh || 0) > 220,
          isNight
        );
      });

      for (const [id, entry] of rivalRigs) {
        if (!activeRivalIds.has(id)) {
          scene.remove(entry.rig.root);
          rivalRigs.delete(id);
        }
      }

      // Animate dynamic pace/traffic 3D Ferraris at true real-world speeds (138-184 km/h) so 200+ km/h blows past them
      for (const pc of paceCars) {
        const pcUPerSec = paceSpeedKmhToUPerSec(pc.speedKmh, track.totalLength);
        if (tel.phase !== 'countdown') {
          pc.u = (pc.u + pcUPerSec * dt) % 1;
          pc.laneTimer -= dt;
          if (pc.laneTimer <= 0) {
            pc.laneTimer = 4 + Math.random() * 5;
            pc.targetLaneOffset = (Math.random() - 0.5) * 7.8;
          }
          // Avoid colliding visually into the player's lane
          let duPlayer = pc.u - smoothU;
          if (duPlayer > 0.5) duPlayer -= 1;
          if (duPlayer < -0.5) duPlayer += 1;
          if (Math.abs(duPlayer) < 0.022 && Math.abs(pc.laneOffset - smoothLateral) < 3.0) {
            pc.targetLaneOffset = smoothLateral >= 0 ? -3.9 : 3.9;
          }
          pc.laneOffset = THREE.MathUtils.damp(pc.laneOffset, pc.targetLaneOffset, 3.0, dt);
        }
        const pcSpeedUnits = tel.phase === 'countdown' ? 0 : speedKmhToWorldUnitsPerSec(pc.speedKmh);
        orientCarOnTrack(
          pc.rig,
          track,
          pc.u,
          pc.laneOffset,
          (pc.targetLaneOffset - pc.laneOffset) * 0.14,
          0,
          0,
          pcSpeedUnits,
          dt,
          false,
          false,
          isNight
        );
      }

      // Emit realistic nitro flames, high-speed exhaust heat & tire smoke behind player Ferrari
      particleEmitAcc += dt;
      if (tel.phase === 'racing' && particleEmitAcc >= 0.035) {
        particleEmitAcc = 0;
        const fwdX = Math.sin(headingOut.value);
        const fwdZ = Math.cos(headingOut.value);
        if (tel.isNitroActive) {
          _exhaustPos.set(playerPos.x - fwdX * 2.45, playerPos.y + 0.42, playerPos.z - fwdZ * 2.45);
          _exhaustVel.set(-fwdX * 9, 0.55, -fwdZ * 9);
          particles.spawn({
            pos: _exhaustPos,
            vel: _exhaustVel,
            color: 0x38bdf8,
            scale: 0.18,
            grow: 0.75,
            life: 0.14,
            opacity: 0.55,
          });
        } else if (tel.isBraking && tel.speedKmh > 70) {
          _exhaustPos.set(playerPos.x - fwdX * 1.8, playerPos.y + 0.25, playerPos.z - fwdZ * 1.8);
          _exhaustVel.set(fwdX * speedUnits * 0.15, 0, fwdZ * speedUnits * 0.15);
          particles.emitSmoke(_exhaustPos, _exhaustVel);
        } else if (tel.speedKmh > 195) {
          // Subtle high-speed tarmac wash streaks rushing backward past rear diffuser
          _exhaustPos.set(
            playerPos.x - fwdX * 2.55 + (Math.random() - 0.5) * 1.2,
            playerPos.y + 0.18,
            playerPos.z - fwdZ * 2.55 + (Math.random() - 0.5) * 1.2
          );
          _exhaustVel.set(-fwdX * 7, 0.25, -fwdZ * 7);
          particles.spawn({
            pos: _exhaustPos,
            vel: _exhaustVel,
            color: 0xe2e8f0,
            scale: 0.14,
            grow: 0.65,
            life: 0.14,
            opacity: 0.22,
          });
        }
      }

      // Update world animations (swaying EZ-Trees, animated water, pulsing boost pads, particles)
      track.update(elapsed);
      deskWorld.update(elapsed, dt);
      particles.update(dt);

      // Update dynamic racing camera (CHASE / HOOD / BUMPER / TV) with genuine 200+ km/h sensation
      const fwdX = Math.sin(headingOut.value);
      const fwdZ = Math.cos(headingOut.value);
      const rightX = Math.cos(headingOut.value);
      const rightZ = -Math.sin(headingOut.value);
      const lookPan = smoothSteer * 3.8;
      const mode = props.cameraMode;
      const feel = computeSpeedCameraFeel(mode, tel.speedKmh, tel.isNitroActive);
      const targetFov = feel.fov;

      // Update peripheral speed-lines wind streak overlay directly on DOM (zero React re-renders)
      if (speedLinesRef.current) {
        speedLinesRef.current.style.opacity =
          tel.phase === 'racing' ? feel.speedLinesOpacity.toFixed(3) : '0';
      }

      // High-frequency suspension & road-rush micro-shake at 135-320 km/h
      const shakeX =
        feel.shakeAmplitude *
        (Math.sin(elapsed * 47.3) * 0.65 + Math.cos(elapsed * 83.1) * 0.35);
      const shakeY =
        feel.shakeAmplitude *
        (Math.cos(elapsed * 59.7) * 0.65 + Math.sin(elapsed * 97.4) * 0.35);

      if (mode === 'CHASE') {
        const dist = feel.chaseDistance;
        const height = feel.chaseHeight;
        if (!camInitialized) {
          smoothChaseFwd.set(fwdX, 0, fwdZ).normalize();
        } else {
          const alphaYaw = 1 - Math.exp(-10 * dt);
          smoothChaseFwd.x += (fwdX - smoothChaseFwd.x) * alphaYaw;
          smoothChaseFwd.z += (fwdZ - smoothChaseFwd.z) * alphaYaw;
          if (smoothChaseFwd.lengthSq() > 0.0001) {
            smoothChaseFwd.normalize();
          } else {
            smoothChaseFwd.set(fwdX, 0, fwdZ).normalize();
          }
        }
        _desiredCamPos.set(
          playerPos.x - smoothChaseFwd.x * dist + rightX * shakeX,
          playerPos.y + height + shakeY,
          playerPos.z - smoothChaseFwd.z * dist + rightZ * shakeX
        );
        _desiredCamLook.set(
          playerPos.x + fwdX * 18 + rightX * lookPan,
          playerPos.y + 1.45,
          playerPos.z + fwdZ * 18 + rightZ * lookPan
        );
      } else if (mode === 'HOOD') {
        const hoodFwd = playerRig.isRealModel ? 1.25 : 0.9;
        const hoodUp = playerRig.isRealModel ? 1.2 : 1.9;
        _desiredCamPos.set(
          playerPos.x + fwdX * hoodFwd + rightX * shakeX * 0.65,
          playerPos.y + hoodUp + shakeY * 0.65,
          playerPos.z + fwdZ * hoodFwd + rightZ * shakeX * 0.65
        );
        _desiredCamLook.set(
          playerPos.x + fwdX * 36 + rightX * lookPan * 1.3,
          playerPos.y + 1.35,
          playerPos.z + fwdZ * 36 + rightZ * lookPan * 1.3
        );
      } else if (mode === 'BUMPER') {
        const bumperFwd = playerRig.isRealModel ? 2.8 : 2.35;
        const bumperUp = playerRig.isRealModel ? 0.68 : 1.05;
        _desiredCamPos.set(
          playerPos.x + fwdX * bumperFwd + rightX * shakeX * 0.7,
          playerPos.y + bumperUp + shakeY * 0.7,
          playerPos.z + fwdZ * bumperFwd + rightZ * shakeX * 0.7
        );
        _desiredCamLook.set(
          playerPos.x + fwdX * 40 + rightX * lookPan * 1.4,
          playerPos.y + 0.98,
          playerPos.z + fwdZ * 40 + rightZ * lookPan * 1.4
        );
      } else {
        // Trackside TV telephoto broadcast angle ahead of the Ferrari
        const tvFrame = track.getFrameAt((smoothU + 0.036) % 1);
        _desiredCamPos
          .copy(tvFrame.point)
          .addScaledVector(tvFrame.right, 11.5);
        _desiredCamPos.y += 5.2;
        _desiredCamLook.set(playerPos.x, playerPos.y + 1.3, playerPos.z);
      }

      if (!camInitialized || mode === 'CHASE' || mode === 'HOOD' || mode === 'BUMPER') {
        camPos.copy(_desiredCamPos);
        camLook.copy(_desiredCamLook);
        camInitialized = true;
      } else {
        const alphaPos = 1 - Math.exp(-8 * dt);
        const alphaLook = 1 - Math.exp(-18 * dt);
        camPos.lerp(_desiredCamPos, alphaPos);
        camLook.lerp(_desiredCamLook, alphaLook);
      }

      // Apply XREAL Aura 5-Level Electrochromic Dimming (optical see-through AR vs dimmed full-immersion sky)
      const isAuraActive = props.auraMode !== 'standard' || isWebXrPresenting;
      const dimmingCfg = getAuraDimmingConfig(props.auraDimming);
      if (skyObj) {
        if (isWebXrPresenting && activeXrMode === 'immersive-ar' && dimmingCfg.transparentPassthrough) {
          skyObj.visible = false;
          renderer.setClearColor(0x000000, 0);
        } else if (isAuraActive && dimmingCfg.skyOpacity < 0.99) {
          skyObj.visible = dimmingCfg.skyOpacity > 0.05;
          renderer.setClearColor(0x060911, isWebXrPresenting && activeXrMode === 'immersive-ar' ? 0 : 1);
          const skyMesh = skyObj as THREE.Mesh;
          if (skyMesh.material && !Array.isArray(skyMesh.material)) {
            skyMesh.material.transparent = true;
            skyMesh.material.opacity = dimmingCfg.skyOpacity;
          }
        } else {
          skyObj.visible = true;
          renderer.setClearColor(0x090b10, 1);
          const skyMesh = skyObj as THREE.Mesh;
          if (skyMesh.material && !Array.isArray(skyMesh.material)) {
            skyMesh.material.transparent = false;
            skyMesh.material.opacity = 1;
          }
        }
      }

      // Position cameraRig (in WebXR, user's 6DoF head rotates freely relative to the car!)
      if (isWebXrPresenting) {
        // Place XR rider comfortably in Ferrari cockpit / hood vantage for natural 6DoF stereo depth
        const xrFwd = mode === 'HOOD' || mode === 'BUMPER' ? 0.55 : -4.4;
        const xrUp = mode === 'HOOD' || mode === 'BUMPER' ? 1.18 : 2.15;
        cameraRig.position.set(
          playerPos.x + fwdX * xrFwd,
          playerPos.y + xrUp,
          playerPos.z + fwdZ * xrFwd
        );
        // Three.js camera looks down -Z, while car forward is +headingOut -> orient rig +Math.PI
        _rigEuler.set(0, headingOut.value + Math.PI, 0, 'YXZ');
        cameraRig.quaternion.setFromEuler(_rigEuler);
      } else {
        cameraRig.position.set(0, 0, 0);
        cameraRig.quaternion.identity();
        camera.position.copy(camPos);
        camera.lookAt(camLook);

        if (props.auraMode === 'aura-spatial' || props.auraMode === 'aura-sbs') {
          headLook.yaw = THREE.MathUtils.damp(headLook.yaw, headLook.targetYaw, 6, dt);
          headLook.pitch = THREE.MathUtils.damp(headLook.pitch, headLook.targetPitch, 6, dt);
          camera.rotateY(headLook.yaw);
          camera.rotateX(headLook.pitch);
        }

        const effectiveFov =
          props.auraMode === 'aura-spatial' || props.auraMode === 'aura-sbs'
            ? Math.max(AURA_OPTICAL_FOV_DEG, targetFov + 4)
            : targetFov;
        camera.fov = THREE.MathUtils.damp(camera.fov, effectiveFov, 7, dt);
        camera.updateProjectionMatrix();
      }

      // Update floating curved 3D holographic telemetry visor in all XR Aura modes
      spatialHud.setVisible(isAuraActive);
      if (isAuraActive) {
        const xrIn = props.xrInputRef?.current;
        spatialHud.update(
          {
            speedKmh: tel.speedKmh,
            gear: tel.gear ?? 1,
            nitroPercent: tel.nitroPercent ?? 0,
            isNitroActive: tel.isNitroActive,
            rank: tel.rank ?? 1,
            totalRacers: tel.totalRacers ?? 1,
            lap: tel.lap ?? 1,
            remainingClock: tel.remainingClock ?? '05:00',
            circuitName: tel.circuitName ?? currentCity.name,
            landmark: tel.landmark ?? currentCity.name,
            steeringOffset: tel.steeringOffset,
            dimmingLevel: props.auraDimming,
            inputSource: xrIn?.source ?? 'none',
            handsTracked: xrIn?.handsTracked ?? 0,
            modeLabel: isWebXrPresenting
              ? activeXrMode === 'immersive-ar'
                ? 'AURA AR'
                : 'AURA VR'
              : props.auraMode === 'aura-sbs'
                ? 'DP-IN 3D SBS'
                : 'AURA 70°',
            isCountdown: tel.phase === 'countdown',
            countdownSec: tel.countdownSecondsLeft,
          },
          now
        );
      }

      // Render pipeline: Native WebXR stereo | DP-in 3D Side-by-Side Stereo | Standard GPU/Software
      if (isWebXrPresenting) {
        renderer.render(scene, camera);
      } else if (props.auraMode === 'aura-sbs') {
        const w = lastSizedW;
        const h = lastSizedH;
        camera.updateMatrixWorld();
        stereoCam.aspect = (w * 0.5) / Math.max(1, h);
        stereoCam.update(camera);

        renderer.setScissorTest(true);
        // Left Sony Micro-OLED eye
        renderer.setScissor(0, 0, Math.floor(w / 2), h);
        renderer.setViewport(0, 0, Math.floor(w / 2), h);
        renderer.render(scene, stereoCam.cameraL);
        // Right Sony Micro-OLED eye
        renderer.setScissor(Math.floor(w / 2), 0, Math.ceil(w / 2), h);
        renderer.setViewport(Math.floor(w / 2), 0, Math.ceil(w / 2), h);
        renderer.render(scene, stereoCam.cameraR);

        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, w, h);
      } else if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      if (!isWebXrPresenting) {
        if (isSoftwareGl) {
          afterDraw(() => renderFrame());
        } else {
          frameId = requestAnimationFrame(() => renderFrame());
        }
      }
    };

    const startFlatLoop = () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      if (isSoftwareGl) {
        frameId = window.setTimeout(() => renderFrame(), 30);
      } else {
        frameId = requestAnimationFrame(() => renderFrame());
      }
    };

    // Expose WebXR session launcher directly tied to this WebGLRenderer (must be called inside user click gesture)
    const startWebXrSession = async (
      mode: 'immersive-ar' | 'immersive-vr'
    ): Promise<boolean> => {
      const navXr = (navigator as Navigator & { xr?: XRSystem }).xr;
      if (!navXr) {
        propsRef.current.onWebXrStateChange?.(
          null,
          'WebXR not available in this browser — using Aura 70° Spatial / DP-in Stereo mode.'
        );
        return false;
      }
      try {
        if (activeXrSession) {
          await activeXrSession.end().catch(() => {});
        }
        const optionalFeatures = ['local-floor', 'bounded-floor', 'hand-tracking'];
        const overlayRoot = document.getElementById('aura-xr-dom-overlay');
        const sessionInit: XRSessionInit = {
          optionalFeatures: overlayRoot
            ? [...optionalFeatures, 'dom-overlay']
            : optionalFeatures,
          ...(overlayRoot ? { domOverlay: { root: overlayRoot } } : {}),
        };
        const session = await navXr.requestSession(mode, sessionInit);
        activeXrSession = session;
        activeXrMode = mode;

        cancelAnimationFrame(frameId);
        clearTimeout(frameId);

        const onSessionEnd = () => {
          session.removeEventListener('end', onSessionEnd);
          activeXrSession = null;
          activeXrMode = null;
          renderer.setAnimationLoop(null);
          if (propsRef.current.xrInputRef) {
            propsRef.current.xrInputRef.current = {
              active: false,
              source: 'none',
              steer: 0,
              throttle: 0,
              brake: 0,
              nitro: false,
              dualPinchHold: false,
              handsTracked: 0,
            };
          }
          propsRef.current.onWebXrStateChange?.(null);
          if (!disposed) {
            startFlatLoop();
          }
        };
        session.addEventListener('end', onSessionEnd);

        await renderer.xr.setSession(session);
        renderer.setAnimationLoop((_time, xrFrame) => {
          renderFrame(xrFrame);
        });
        propsRef.current.onWebXrStateChange?.(mode);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to start WebXR session';
        propsRef.current.onWebXrStateChange?.(null, msg);
        return false;
      }
    };

    const endWebXrSession = async () => {
      if (activeXrSession) {
        await activeXrSession.end().catch(() => {});
      }
    };

    if (xrBridgeRef) {
      xrBridgeRef.current = { startWebXrSession, endWebXrSession };
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(initFrameId);
      if (xrBridgeRef) xrBridgeRef.current = null;
      if (activeXrSession) {
        activeXrSession.end().catch(() => {});
        activeXrSession = null;
      }
      renderer.setAnimationLoop(null);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', onPointerMove);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      spatialHud.dispose();
      if (deskWorld) deskWorld.dispose();
      if (track) {
        scene.remove(track.group);
        disposeObjectTree(track.group);
      }
      if (envRT) envRT.dispose();
      if (composer) composer.dispose();
      renderer.dispose();
      if (container) container.innerHTML = '';
    };
  }, [telemetryRef, xrBridgeRef]);

  return (
    <div className="relative w-full h-full bg-[#090b10] overflow-hidden">
      <div
        ref={mountRef}
        data-testid="photoreal-3d-viewport"
        className="w-full h-full"
      />
      {/* Peripheral high-speed wind-streak vignette (opacity driven at 60Hz above 155 km/h) */}
      <div
        ref={speedLinesRef}
        aria-hidden="true"
        className="speed-lines-overlay pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-75"
      />
      {!sceneReady && !webglError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#090b10] text-slate-300 text-xs font-medium pointer-events-none">
          Building 3D Street Circuit…
        </div>
      )}
      {webglError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#090b10]/95 p-6 text-center text-slate-200 text-xs font-medium">
          {webglError}
        </div>
      )}
      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#090b10]/90 text-slate-200 text-xs font-medium">
          Restoring 3D WebGL renderer…
        </div>
      )}
    </div>
  );
}
