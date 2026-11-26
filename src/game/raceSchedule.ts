/**
 * Pure deterministic race scheduling, 5-minute timeline (including 10s countdown),
 * 2-participant minimum launch rule, and human hand-press verified Agentic Mode gate.
 */

export const SCHEDULE_INTERVAL_MS = 10 * 60 * 1000; // Every 10 minutes (:00, :10, :20, :30, :40, :50)
export const RACE_DURATION_MS = 5 * 60 * 1000; // 5 minutes total race duration
export const COUNTDOWN_DURATION_MS = 10 * 1000; // 10-second countdown INCLUDED in the 5-minute race
export const MIN_PARTICIPANTS_FOR_RACE = 2;

// Agentic mode engagement window relative to Race Green-Light (T_go = raceStartAt + 10s):
// Opens 3 seconds BEFORE race start (T_go - 3000ms) and closes 5 seconds AFTER race start (T_go + 5000ms).
export const AGENTIC_WINDOW_BEFORE_START_MS = 3000;
export const AGENTIC_WINDOW_AFTER_START_MS = 5000;
export const AGENTIC_REQUIRED_HOLD_MS = 2000;
export const AGENTIC_SERVER_HOLD_TOLERANCE_MS = 120; // Network RTT margin on server verification

export type RacePhase = 'lobby' | 'countdown' | 'racing' | 'results';

export type AgenticInputType = 'desktop_key_p' | 'touch_hard_press' | 'pointer_hold';

export interface RaceTimeline {
  phase: RacePhase;
  raceStartAtMs: number;
  goAtMs: number;
  raceEndAtMs: number;
  elapsedMs: number;
  remainingMs: number;
  countdownSecondsLeft: number; // 10..1 during countdown, 0 once racing
  msRelativeToGo: number; // Negative during countdown, 0 at GO, positive while racing
  isAgenticWindowOpen: boolean;
  agenticWindowOpensInMs: number; // > 0 before T_go - 3s
  agenticWindowRemainingMs: number; // > 0 while inside [-3s, +5s]
}

export interface AgenticHoldValidationInput {
  participantCount: number;
  holdStartedRelativeToGoMs: number;
  holdDurationMs: number;
  isTrusted: boolean;
  inputType: AgenticInputType;
  pressure?: number; // 0..1 on touch/pointer devices supporting force/pressure
  isServerCheck?: boolean;
}

export interface AgenticHoldValidationResult {
  allowed: boolean;
  reason:
    | 'OK'
    | 'INSUFFICIENT_PARTICIPANTS'
    | 'UNTRUSTED_AUTOMATION_BLOCKED'
    | 'OUTSIDE_ACTIVATION_WINDOW'
    | 'HOLD_TOO_SHORT'
    | 'INSUFFICIENT_HARD_PRESS_FORCE';
  message: string;
}

export interface RaceParticipantSnapshot {
  id: string;
  name: string;
  locationName: string;
  locationCode: string;
  vehicleId: string;
  distanceMeters: number;
  speedKmh: number;
  topSpeedKmh: number;
  lap: number;
  agenticMode: boolean;
  joinedAtMs: number;
}

export interface OfficialStanding {
  rank: number;
  id: string;
  name: string;
  locationName: string;
  locationCode: string;
  vehicleId: string;
  distanceKm: number;
  distanceMeters: number;
  averageSpeedKmh: number;
  topSpeedKmh: number;
  lapsCompleted: number;
  controlMode: 'AGENTIC' | 'MANUAL';
  gapMeters: number;
}

/**
 * Floors a timestamp to the start of the current 10-minute global Grand Prix slot.
 */
export function getCurrentSlotStart(nowMs: number): number {
  return Math.floor(nowMs / SCHEDULE_INTERVAL_MS) * SCHEDULE_INTERVAL_MS;
}

/**
 * Returns the timestamp of the next scheduled 10-minute Grand Prix start.
 */
export function getNextSlotStart(nowMs: number): number {
  const current = getCurrentSlotStart(nowMs);
  return current + SCHEDULE_INTERVAL_MS;
}

/**
 * Computes exact race phase, 5-minute clock (including 10-second countdown),
 * and the [-3s, +5s] Agentic Mode activation window around T_go.
 */
export function getRaceTimeline(raceStartAtMs: number, nowMs: number): RaceTimeline {
  const goAtMs = raceStartAtMs + COUNTDOWN_DURATION_MS;
  const raceEndAtMs = raceStartAtMs + RACE_DURATION_MS;
  const elapsedMs = Math.max(0, nowMs - raceStartAtMs);
  const remainingMs = Math.max(0, raceEndAtMs - nowMs);
  const msRelativeToGo = nowMs - goAtMs;

  let phase: RacePhase;
  if (nowMs < raceStartAtMs) {
    phase = 'lobby';
  } else if (nowMs < goAtMs) {
    phase = 'countdown';
  } else if (nowMs < raceEndAtMs) {
    phase = 'racing';
  } else {
    phase = 'results';
  }

  const countdownSecondsLeft =
    phase === 'countdown' ? Math.max(1, Math.ceil((goAtMs - nowMs) / 1000)) : 0;

  const windowStartMs = goAtMs - AGENTIC_WINDOW_BEFORE_START_MS;
  const windowEndMs = goAtMs + AGENTIC_WINDOW_AFTER_START_MS;
  const isAgenticWindowOpen =
    (phase === 'countdown' || phase === 'racing') &&
    nowMs >= windowStartMs &&
    nowMs <= windowEndMs;

  const agenticWindowOpensInMs = nowMs < windowStartMs ? windowStartMs - nowMs : 0;
  const agenticWindowRemainingMs = isAgenticWindowOpen ? Math.max(0, windowEndMs - nowMs) : 0;

  return {
    phase,
    raceStartAtMs,
    goAtMs,
    raceEndAtMs,
    elapsedMs,
    remainingMs,
    countdownSecondsLeft,
    msRelativeToGo,
    isAgenticWindowOpen,
    agenticWindowOpensInMs,
    agenticWindowRemainingMs,
  };
}

/**
 * Determines whether a scheduled 10-minute race can start based on participant count.
 */
export function canStartScheduledRace(participantCount: number): boolean {
  return participantCount >= MIN_PARTICIPANTS_FOR_RACE;
}

/**
 * Validates whether a human hand-press qualifies to activate Agentic Mode.
 * Strict anti-automation gate: requires trusted physical input, >= 2 participants,
 * press initiated within [-3s, +5s] of race start (T_go), and >= 2.0s continuous hold.
 */
export function evaluateAgenticActivation(
  input: AgenticHoldValidationInput
): AgenticHoldValidationResult {
  if (input.participantCount < MIN_PARTICIPANTS_FOR_RACE) {
    return {
      allowed: false,
      reason: 'INSUFFICIENT_PARTICIPANTS',
      message: 'Agentic Mode requires at least 2 participants in the race.',
    };
  }

  if (!input.isTrusted) {
    return {
      allowed: false,
      reason: 'UNTRUSTED_AUTOMATION_BLOCKED',
      message: 'Automated trigger blocked. Physical human hand press required to load Agentic Mode.',
    };
  }

  const inWindow =
    input.holdStartedRelativeToGoMs >= -AGENTIC_WINDOW_BEFORE_START_MS &&
    input.holdStartedRelativeToGoMs <= AGENTIC_WINDOW_AFTER_START_MS;

  if (!inWindow) {
    return {
      allowed: false,
      reason: 'OUTSIDE_ACTIVATION_WINDOW',
      message: 'Agentic ignition is only available from 3s before to 5s after race start.',
    };
  }

  // On touch devices that report pressure > 0, ensure firm hard press (>= 0.22)
  if (
    input.inputType === 'touch_hard_press' &&
    typeof input.pressure === 'number' &&
    input.pressure > 0 &&
    input.pressure < 0.22
  ) {
    return {
      allowed: false,
      reason: 'INSUFFICIENT_HARD_PRESS_FORCE',
      message: 'Press harder on the screen for 2 full seconds to engage Agentic Mode.',
    };
  }

  const requiredMs = input.isServerCheck
    ? AGENTIC_REQUIRED_HOLD_MS - AGENTIC_SERVER_HOLD_TOLERANCE_MS
    : AGENTIC_REQUIRED_HOLD_MS;

  if (input.holdDurationMs < requiredMs) {
    return {
      allowed: false,
      reason: 'HOLD_TOO_SHORT',
      message: 'Hold continuously for a full 2.0 seconds without releasing.',
    };
  }

  return {
    allowed: true,
    reason: 'OK',
    message: 'Human hand-press verified. Agentic Mode engaged.',
  };
}

/**
 * Computes official final standings when the 5-minute race concludes.
 * Racing time is 4m 50s (290s) after the 10-second countdown.
 */
export function computeOfficialStandings(
  participants: RaceParticipantSnapshot[],
  drivingDurationMs = RACE_DURATION_MS - COUNTDOWN_DURATION_MS
): OfficialStanding[] {
  const sorted = [...participants].sort((a, b) => {
    if (b.distanceMeters !== a.distanceMeters) return b.distanceMeters - a.distanceMeters;
    return b.topSpeedKmh - a.topSpeedKmh;
  });

  const leaderDist = sorted[0]?.distanceMeters ?? 0;
  const drivingHours = Math.max(drivingDurationMs / 3_600_000, 1 / 3600);

  return sorted.map((p, idx) => {
    const distanceKm = Math.round((p.distanceMeters / 1000) * 100) / 100;
    const avgSpeed = Math.round((p.distanceMeters / 1000) / drivingHours);
    return {
      rank: idx + 1,
      id: p.id,
      name: p.name,
      locationName: p.locationName,
      locationCode: p.locationCode,
      vehicleId: p.vehicleId,
      distanceKm,
      distanceMeters: Math.round(p.distanceMeters),
      averageSpeedKmh: Math.max(0, avgSpeed),
      topSpeedKmh: Math.round(p.topSpeedKmh),
      lapsCompleted: Math.max(0, p.lap - 1),
      controlMode: p.agenticMode ? 'AGENTIC' : 'MANUAL',
      gapMeters: Math.round(Math.max(0, leaderDist - p.distanceMeters)),
    };
  });
}

export function formatClockMs(ms: number): string {
  const clamped = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
