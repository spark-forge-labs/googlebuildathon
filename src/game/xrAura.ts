import * as THREE from 'three';

/**
 * XREAL Aura (Project Aura / Android XR) Spatial Engine Module
 *
 * Supports all real-world deployment modes on XREAL Aura glasses & Android XR:
 *  - Native WebXR `immersive-ar` (optical see-through on Aura dual Sony Micro-OLEDs with alpha sky)
 *  - Native WebXR `immersive-vr` (dimmed full-immersion Grand Prix cockpit)
 *  - USB-C DisplayPort-in (DP-in) 3D Side-by-Side Stereo (`aura-sbs`) for tethered laptops/PCs/handhelds
 *  - 70° Spatial Glasses Preview (`aura-spatial`) with curved 3D holographic HUD & 5-level electrochromic dimming
 *  - 6DoF Hand Tracking (two-hand virtual steering wheel + air-pinch Nitro/Brake)
 *  - Companion Puck Touchpad & Bluetooth Gamepad controls
 */

export type AuraViewMode =
  | 'standard'
  | 'aura-spatial'
  | 'aura-sbs'
  | 'aura-webxr-ar'
  | 'aura-webxr-vr';

export type AuraDimmingLevel = 1 | 2 | 3 | 4 | 5;

export interface AuraDimmingConfig {
  level: AuraDimmingLevel;
  label: string;
  shortLabel: string;
  /** 0 = optical see-through transparent sky, 1 = full opaque sky dome */
  skyOpacity: number;
  /** Background dimming alpha for non-WebXR optical preview */
  backdropAlpha: number;
  /** Whether to hide the sky dome completely in immersive-ar passthrough */
  transparentPassthrough: boolean;
}

export interface XrAuraCapabilities {
  webXrAvailable: boolean;
  supportsImmersiveAr: boolean;
  supportsImmersiveVr: boolean;
  recommendedMode: 'aura-webxr-ar' | 'aura-webxr-vr' | 'aura-spatial';
}

export interface XrDrivingInput {
  active: boolean;
  source: 'none' | 'hands' | 'puck' | 'gamepad';
  steer: number; // -1..1
  throttle: number; // 0..1
  brake: number; // 0..1
  nitro: boolean;
  dualPinchHold: boolean;
  handsTracked: number; // 0, 1, or 2
}

export interface SpatialHudSnapshot {
  speedKmh: number;
  gear: number;
  nitroPercent: number;
  isNitroActive: boolean;
  rank: number;
  totalRacers: number;
  lap: number;
  remainingClock: string;
  circuitName: string;
  landmark: string;
  steeringOffset: number;
  dimmingLevel: AuraDimmingLevel;
  inputSource: XrDrivingInput['source'];
  handsTracked: number;
  modeLabel: string;
  isCountdown: boolean;
  countdownSec: number;
}

export const AURA_OPTICAL_FOV_DEG = 70;
export const AURA_IPD_METERS = 0.064;
export const AURA_PINCH_THRESHOLD_METERS = 0.028;

const DIMMING_TABLE: Record<AuraDimmingLevel, AuraDimmingConfig> = {
  1: {
    level: 1,
    label: 'L1 · Optical AR Clear',
    shortLabel: 'L1 AR',
    skyOpacity: 0.0,
    backdropAlpha: 0.12,
    transparentPassthrough: true,
  },
  2: {
    level: 2,
    label: 'L2 · Light See-Through',
    shortLabel: 'L2',
    skyOpacity: 0.25,
    backdropAlpha: 0.35,
    transparentPassthrough: true,
  },
  3: {
    level: 3,
    label: 'L3 · Balanced Mixed',
    shortLabel: 'L3',
    skyOpacity: 0.58,
    backdropAlpha: 0.62,
    transparentPassthrough: false,
  },
  4: {
    level: 4,
    label: 'L4 · Deep Dimmed',
    shortLabel: 'L4',
    skyOpacity: 0.85,
    backdropAlpha: 0.86,
    transparentPassthrough: false,
  },
  5: {
    level: 5,
    label: 'L5 · Full Cockpit Shade',
    shortLabel: 'L5 Full',
    skyOpacity: 1.0,
    backdropAlpha: 1.0,
    transparentPassthrough: false,
  },
};

export function getAuraDimmingConfig(level: AuraDimmingLevel): AuraDimmingConfig {
  return DIMMING_TABLE[level] ?? DIMMING_TABLE[3];
}

export async function detectXrAuraCapabilities(): Promise<XrAuraCapabilities> {
  if (typeof navigator === 'undefined') {
    return {
      webXrAvailable: false,
      supportsImmersiveAr: false,
      supportsImmersiveVr: false,
      recommendedMode: 'aura-spatial',
    };
  }

  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr || typeof xr.isSessionSupported !== 'function') {
    return {
      webXrAvailable: false,
      supportsImmersiveAr: false,
      supportsImmersiveVr: false,
      recommendedMode: 'aura-spatial',
    };
  }

  let supportsImmersiveAr = false;
  let supportsImmersiveVr = false;

  try {
    supportsImmersiveAr = await xr.isSessionSupported('immersive-ar');
  } catch {
    supportsImmersiveAr = false;
  }

  try {
    supportsImmersiveVr = await xr.isSessionSupported('immersive-vr');
  } catch {
    supportsImmersiveVr = false;
  }

  const recommendedMode = supportsImmersiveAr
    ? 'aura-webxr-ar'
    : supportsImmersiveVr
      ? 'aura-webxr-vr'
      : 'aura-spatial';

  return {
    webXrAvailable: true,
    supportsImmersiveAr,
    supportsImmersiveVr,
    recommendedMode,
  };
}

export interface Point3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Computes normalized steering (-1 left .. +1 right) from two tracked 6DoF wrists
 * acting as a virtual Formula/GT steering wheel in front of the user.
 * Raising the left hand & lowering the right turns right (+1), matching a real steering wheel.
 */
export function computeTwoHandSteering(
  leftWrist: Point3Like,
  rightWrist: Point3Like,
  maxWheelAngleRad = 0.72
): number {
  const dx = Math.hypot(rightWrist.x - leftWrist.x, rightWrist.z - leftWrist.z);
  if (dx < 0.08) return 0;
  // Clockwise wheel rotation (left hand higher than right hand) steers right (+1)
  const dy = leftWrist.y - rightWrist.y;
  const angleRad = Math.atan2(dy, dx);
  const raw = angleRad / maxWheelAngleRad;
  if (Math.abs(raw) < 0.08) return 0;
  return Math.max(-1, Math.min(1, raw));
}

export function isHandPinching(
  thumbTip: Point3Like,
  indexTip: Point3Like,
  thresholdMeters = AURA_PINCH_THRESHOLD_METERS
): boolean {
  const dist = Math.hypot(
    thumbTip.x - indexTip.x,
    thumbTip.y - indexTip.y,
    thumbTip.z - indexTip.z
  );
  return dist <= thresholdMeters;
}

function applyDeadzone(value: number, deadzone = 0.14): number {
  if (!Number.isFinite(value) || Math.abs(value) < deadzone) return 0;
  const sign = Math.sign(value);
  const scaled = (Math.abs(value) - deadzone) / (1 - deadzone);
  return Math.max(-1, Math.min(1, sign * scaled));
}

/**
 * Reads driving inputs from standard Bluetooth gamepads (paired to XREAL Aura puck / Android XR)
 * or WebXR controller/puck gamepads.
 */
export function extractGamepadDrivingInput(
  gamepads: ArrayLike<Gamepad | null | undefined>,
  sourceLabel: 'gamepad' | 'puck' = 'gamepad'
): XrDrivingInput {
  let steer = 0;
  let throttle = 0;
  let brake = 0;
  let nitro = false;
  let active = false;

  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i];
    if (!gp || (gp.connected === false)) continue;

    // Thumbstick / Puck touchpad X-axis (WebXR thumbsticks often map to axes[2], standard pads to axes[0])
    const ax0 = gp.axes[0] ?? 0;
    const ax2 = gp.axes[2] ?? 0;
    const axisSteer = Math.abs(ax2) > Math.abs(ax0) ? applyDeadzone(ax2) : applyDeadzone(ax0);
    if (axisSteer !== 0) {
      steer = axisSteer;
      active = true;
    }

    // D-pad left/right fallback (buttons 14/15)
    if (gp.buttons[14]?.pressed) {
      steer = -1;
      active = true;
    } else if (gp.buttons[15]?.pressed) {
      steer = 1;
      active = true;
    }

    // Triggers & Face buttons: RT (7), A/Cross (0), Puck Select (0) for throttle
    const rt = gp.buttons[7]?.value ?? 0;
    const btnA = gp.buttons[0]?.pressed ? 1 : 0;
    const yUp = -(gp.axes[3] ?? gp.axes[1] ?? 0);
    const padGas = Math.max(rt, btnA, yUp > 0.25 ? yUp : 0);
    if (padGas > 0.08) {
      throttle = Math.max(throttle, Math.min(1, padGas));
      active = true;
    }

    // LT (6) or B/Circle (1) for brake
    const lt = gp.buttons[6]?.value ?? 0;
    const btnB = gp.buttons[1]?.pressed ? 1 : 0;
    const padBrake = Math.max(lt, btnB);
    if (padBrake > 0.08) {
      brake = Math.max(brake, Math.min(1, padBrake));
      active = true;
    }

    // RB (5) / LB (4) / X (2) / Y (3) for Nitro boost
    if (
      gp.buttons[5]?.pressed ||
      gp.buttons[4]?.pressed ||
      gp.buttons[2]?.pressed ||
      gp.buttons[3]?.pressed
    ) {
      nitro = true;
      active = true;
    }
  }

  return {
    active,
    source: active ? sourceLabel : 'none',
    steer,
    throttle,
    brake,
    nitro,
    dualPinchHold: false,
    handsTracked: 0,
  };
}

/**
 * Extracts 6DoF hand-tracking virtual steering + air-pinch controls AND XR puck/controller inputs
 * from a live WebXR `XRFrame` (runs natively in Chrome on Android XR / XREAL Aura).
 */
export function extractXrFrameDrivingInput(
  session: XRSession,
  frame: XRFrame,
  refSpace: XRReferenceSpace
): XrDrivingInput {
  let leftWrist: Point3Like | null = null;
  let rightWrist: Point3Like | null = null;
  let leftPinch = false;
  let rightPinch = false;
  let handsTracked = 0;
  const xrGamepads: Gamepad[] = [];

  for (const inputSource of session.inputSources) {
    if (inputSource.gamepad) {
      xrGamepads.push(inputSource.gamepad);
    }

    const hand = (inputSource as XRInputSource & { hand?: XRHand }).hand;
    if (hand && typeof frame.getJointPose === 'function') {
      const wristSpace = hand.get('wrist');
      const thumbSpace = hand.get('thumb-tip');
      const indexSpace = hand.get('index-finger-tip');

      const wristPose = wristSpace ? frame.getJointPose(wristSpace, refSpace) : null;
      const thumbPose = thumbSpace ? frame.getJointPose(thumbSpace, refSpace) : null;
      const indexPose = indexSpace ? frame.getJointPose(indexSpace, refSpace) : null;

      if (wristPose) {
        handsTracked++;
        const p = wristPose.transform.position;
        const pinching =
          thumbPose && indexPose
            ? isHandPinching(thumbPose.transform.position, indexPose.transform.position)
            : false;

        if (inputSource.handedness === 'left') {
          leftWrist = { x: p.x, y: p.y, z: p.z };
          leftPinch = pinching;
        } else if (inputSource.handedness === 'right') {
          rightWrist = { x: p.x, y: p.y, z: p.z };
          rightPinch = pinching;
        }
      }
    }
  }

  // Two-hand virtual steering wheel takes highest priority when both hands are visible in Aura's 6DoF cameras
  if (leftWrist && rightWrist) {
    const steer = computeTwoHandSteering(leftWrist, rightWrist);
    const dualPinchHold = leftPinch && rightPinch;
    return {
      active: true,
      source: 'hands',
      steer,
      throttle: leftPinch && !rightPinch ? 0 : 1, // Smooth auto-throttle while holding virtual wheel; pinch left to brake
      brake: leftPinch && !rightPinch ? 0.9 : 0,
      nitro: rightPinch && !leftPinch,
      dualPinchHold,
      handsTracked,
    };
  }

  // Fallback to XR puck touchpad / XR controllers
  if (xrGamepads.length > 0) {
    const puckInput = extractGamepadDrivingInput(xrGamepads, 'puck');
    if (puckInput.active) {
      return { ...puckInput, handsTracked };
    }
  }

  // Single-hand pinch still triggers Nitro (right) or Brake (left)
  if (handsTracked === 1) {
    return {
      active: leftPinch || rightPinch,
      source: leftPinch || rightPinch ? 'hands' : 'none',
      steer: 0,
      throttle: leftPinch ? 0 : 0.85,
      brake: leftPinch ? 0.85 : 0,
      nitro: rightPinch,
      dualPinchHold: false,
      handsTracked,
    };
  }

  return {
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

/**
 * Diegetic Curved 3D Spatial Windshield HUD designed specifically for XREAL Aura's 70° optical FOV.
 * Renders crisp motorsport telemetry (speed, gear, position, lap, clock, nitro, steering arc, dimming)
 * onto a gently curved transparent hologram hovering at 1.42m comfortable eye vergence distance.
 */
export class AuraSpatialHud3D {
  public readonly group: THREE.Group;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private lastRedrawMs = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'AuraSpatialHud3D';

    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 256;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D context for AuraSpatialHud3D');
    }
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    // Gently curved cylindrical arc positioned in the upper heads-up visor zone inside Aura's 70° FOV
    // so the Ferrari 458 and upcoming apexes remain 100% unobstructed
    const radius = 1.62;
    const arcWidthRad = 0.64; // ~37° arc centered comfortably inside 70° Micro-OLED optics
    const height = 0.24;
    this.geometry = new THREE.CylinderGeometry(
      radius,
      radius,
      height,
      32,
      1,
      true,
      Math.PI - arcWidthRad / 2,
      arcWidthRad
    );
    // Flip inward-facing cylinder normals/UVs so texture reads left-to-right from inside the cockpit
    this.geometry.scale(-1, 1, 1);

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.set(0, 0.48, 0.12);
    this.mesh.renderOrder = 999;
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  public update(snapshot: SpatialHudSnapshot, nowMs: number) {
    if (!this.group.visible) return;
    // Throttle canvas repaint to ~20Hz (50ms) for zero frame stutter on 120Hz Sony Micro-OLEDs
    if (nowMs - this.lastRedrawMs < 48) return;
    this.lastRedrawMs = nowMs;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Subtle dark optical backing bar (high contrast on transparent see-through glasses)
    ctx.fillStyle = 'rgba(7, 11, 19, 0.72)';
    ctx.beginPath();
    ctx.roundRect(16, 18, w - 32, h - 36, 28);
    ctx.fill();

    // Amber optical accent rim
    ctx.strokeStyle = snapshot.isNitroActive
      ? 'rgba(56, 189, 248, 0.85)'
      : 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Left cluster: Position, Lap, Remaining Clock
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('POS', 54, 68);
    ctx.fillText('LAP', 176, 68);
    ctx.fillText('CLOCK', 274, 68);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '700 54px "JetBrains Mono", monospace';
    ctx.fillText(`${snapshot.rank}`, 54, 128);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 28px "JetBrains Mono", monospace';
    ctx.fillText(`/${Math.max(1, snapshot.totalRacers)}`, 92, 128);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 54px "JetBrains Mono", monospace';
    ctx.fillText(`${snapshot.lap}`, 176, 128);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 42px "JetBrains Mono", monospace';
    ctx.fillText(snapshot.remainingClock, 274, 124);

    // Circuit & Landmark subtitle (clamped cleanly left of center nitro gauge)
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
    const rawSub = `${snapshot.circuitName.toUpperCase()} GP · ${snapshot.landmark}`;
    const subText = rawSub.length > 30 ? `${rawSub.slice(0, 29)}…` : rawSub;
    ctx.fillText(subText, 54, 184);

    // XR Aura mode & Dimming / Hand badge
    const inputBadge =
      snapshot.inputSource === 'hands'
        ? `6DoF HANDS (${snapshot.handsTracked})`
        : snapshot.inputSource === 'puck'
          ? 'AURA PUCK'
          : snapshot.inputSource === 'gamepad'
            ? 'GAMEPAD'
            : `XR AURA · L${snapshot.dimmingLevel}`;
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillText(`${snapshot.modeLabel} · ${inputBadge}`, 54, 218);

    // Center: Steering horizon indicator arc + countdown callout
    const cx = w * 0.56;
    if (snapshot.isCountdown) {
      ctx.fillStyle = '#ef4444';
      ctx.font = '700 72px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${snapshot.countdownSec}`, cx, 130);
      ctx.fillStyle = '#fde68a';
      ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('LIGHTS OUT', cx, 174);
    } else {
      // Steering balance track
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - 95, 118);
      ctx.lineTo(cx + 95, 118);
      ctx.stroke();

      const steerPx = cx + Math.max(-1, Math.min(1, snapshot.steeringOffset)) * 85;
      ctx.fillStyle = snapshot.isNitroActive ? '#38bdf8' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(steerPx, 118, 12, 0, Math.PI * 2);
      ctx.fill();

      // Nitro gauge bar directly under steering indicator
      const barW = 190;
      const barX = cx - barW / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.roundRect(barX, 150, barW, 18, 9);
      ctx.fill();

      const fillW = Math.max(0, Math.min(1, snapshot.nitroPercent / 100)) * barW;
      ctx.fillStyle = snapshot.isNitroActive ? '#f59e0b' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(barX, 150, fillW, 18, 9);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        snapshot.isNitroActive ? 'NITRO ENGAGED' : `NITRO ${Math.round(snapshot.nitroPercent)}%`,
        cx,
        196
      );
    }

    // Right cluster: Large high-contrast digital speedometer & Gear
    ctx.textAlign = 'right';
    ctx.fillStyle = snapshot.speedKmh >= 200 ? '#fbbf24' : '#ffffff';
    ctx.font = '700 96px "JetBrains Mono", monospace';
    ctx.fillText(`${Math.round(snapshot.speedKmh)}`, w - 58, 138);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.fillText('KM/H', w - 142, 188);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '700 32px "JetBrains Mono", monospace';
    ctx.fillText(`G${snapshot.gear}`, w - 58, 190);

    this.texture.needsUpdate = true;
  }

  public dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
