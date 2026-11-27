import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Flag,
  Flame,
  Glasses,
  LogOut,
  Music,
  Sun,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { getCircuitById, getVehicleById } from '../game/circuits';
import {
  buildCircuitMetrics,
  computeAgenticDrive,
  createInitialPhysicsState,
  interpolateCircuitPosition,
  stepVehiclePhysics,
  type DrivingInput,
  type VehiclePhysicsState,
} from '../game/circuitMath';
import {
  formatClockMs,
  getRaceTimeline,
  type AgenticInputType,
} from '../game/raceSchedule';
import {
  detectXrAuraCapabilities,
  extractGamepadDrivingInput,
  getAuraDimmingConfig,
  type AuraDimmingLevel,
  type AuraViewMode,
  type XrAuraCapabilities,
  type XrDrivingInput,
} from '../game/xrAura';
import type { AgenticServerEvent, LiveParticipant, RoomStatePayload } from '../types/race';
import { AgenticIgnitionPad } from './AgenticIgnitionPad';
import { LiveStreetViewAndMap, type ViewportLayout } from './LiveStreetViewAndMap';
import type { LiveThreeDTelemetry, XrSessionBridge } from './Photoreal3DViewport';

interface RaceCockpitProps {
  roomState: RoomStatePayload;
  myParticipantId: string | null;
  nowMs: number;
  selectedVehicleId: string;
  muted: boolean;
  onToggleMute: () => void;
  musicMuted: boolean;
  onToggleMusic: () => void;
  onUpdateEngine: (
    speedRatio: number,
    isDrifting: boolean,
    isBoosting: boolean,
    active: boolean
  ) => void;
  onPlayBoost: () => void;
  onLeaveRace: () => void;
  onFinishEarly?: () => void;
  onSendTelemetry: (data: {
    distanceMeters: number;
    speedKmh: number;
    lat: number;
    lng: number;
    heading: number;
    lap: number;
    agenticDecision?: string;
  }) => void;
  lastAgenticEvent: AgenticServerEvent | null;
  onAgenticHoldStart: (inputType: AgenticInputType, isTrusted: boolean, pressure?: number) => void;
  onAgenticHoldCancel: () => void;
  onAgenticHoldCommit: (isTrusted: boolean, pressure?: number) => void;
  onAgenticDisengage: () => void;
  onCountdownBeep: (isGo: boolean) => void;
  onAgenticChargeTick: (progress01: number) => void;
  onAgenticEngagedAudio: () => void;
  initialAuraMode?: AuraViewMode;
  onAuraModeChange?: (mode: AuraViewMode) => void;
}

export function RaceCockpit({
  roomState,
  myParticipantId,
  nowMs,
  selectedVehicleId,
  muted,
  onToggleMute,
  musicMuted,
  onToggleMusic,
  onUpdateEngine,
  onPlayBoost,
  onLeaveRace,
  onFinishEarly,
  onSendTelemetry,
  lastAgenticEvent,
  onAgenticHoldStart,
  onAgenticHoldCancel,
  onAgenticHoldCommit,
  onAgenticDisengage,
  onCountdownBeep,
  onAgenticChargeTick,
  onAgenticEngagedAudio,
  initialAuraMode = 'standard',
  onAuraModeChange,
}: RaceCockpitProps) {
  const circuit = useMemo(() => getCircuitById(roomState.circuitId), [roomState.circuitId]);
  const metrics = useMemo(() => buildCircuitMetrics(circuit.waypoints), [circuit]);
  const vehicle = useMemo(() => getVehicleById(selectedVehicleId), [selectedVehicleId]);

  const [layout, setLayout] = useState<ViewportLayout>('split');
  const [showMobileStandings, setShowMobileStandings] = useState(false);

  // XREAL Aura / Android XR Spatial State
  const [auraMode, setAuraModeState] = useState<AuraViewMode>(initialAuraMode);
  const [auraDimming, setAuraDimming] = useState<AuraDimmingLevel>(5);
  const [xrCaps, setXrCaps] = useState<XrAuraCapabilities>({
    webXrAvailable: false,
    supportsImmersiveAr: false,
    supportsImmersiveVr: false,
    recommendedMode: 'aura-spatial',
  });
  const [xrNotice, setXrNotice] = useState<string | null>(null);
  const xrBridgeRef = useRef<XrSessionBridge | null>(null);
  const xrInputRef = useRef<XrDrivingInput>({
    active: false,
    source: 'none',
    steer: 0,
    throttle: 0,
    brake: 0,
    nitro: false,
    dualPinchHold: false,
    handsTracked: 0,
  });

  const setAuraMode = useCallback(
    (next: AuraViewMode) => {
      setAuraModeState(next);
      onAuraModeChange?.(next);
    },
    [onAuraModeChange]
  );

  useEffect(() => {
    let active = true;
    detectXrAuraCapabilities().then((caps) => {
      if (active) setXrCaps(caps);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleWebXrStateChange = useCallback(
    (activeMode: 'immersive-ar' | 'immersive-vr' | null, error?: string) => {
      if (activeMode === 'immersive-ar') {
        setAuraMode('aura-webxr-ar');
        setAuraDimming(1);
        setXrNotice(null);
      } else if (activeMode === 'immersive-vr') {
        setAuraMode('aura-webxr-vr');
        setAuraDimming(5);
        setXrNotice(null);
      } else {
        setAuraModeState((prev) =>
          prev === 'aura-webxr-ar' || prev === 'aura-webxr-vr' ? 'aura-spatial' : prev
        );
        if (error) setXrNotice(error);
      }
    },
    [setAuraMode]
  );

  const handleToggleAuraMode = useCallback(() => {
    setXrNotice(null);
    if (auraMode !== 'standard') {
      xrBridgeRef.current?.endWebXrSession().catch(() => {});
      setAuraMode('standard');
      setAuraDimming(5);
    } else {
      setAuraMode('aura-spatial');
      setAuraDimming(5);
    }
  }, [auraMode, setAuraMode]);

  const handleLaunchWebXr = useCallback(
    async (mode: 'immersive-ar' | 'immersive-vr') => {
      setXrNotice(null);
      const ok = await xrBridgeRef.current?.startWebXrSession(mode);
      if (!ok) {
        setAuraMode('aura-spatial');
      }
    },
    [setAuraMode]
  );

  const me = useMemo(
    () => roomState.participants.find((p) => p.id === myParticipantId) ?? null,
    [roomState.participants, myParticipantId]
  );

  const agenticMode = me?.agenticMode ?? false;
  const agenticModeRef = useRef(agenticMode);
  agenticModeRef.current = agenticMode;

  const prevAgenticRef = useRef(false);
  useEffect(() => {
    if (agenticMode && !prevAgenticRef.current) {
      onAgenticEngagedAudio();
    }
    prevAgenticRef.current = agenticMode;
  }, [agenticMode, onAgenticEngagedAudio]);

  const timeline = useMemo(
    () => getRaceTimeline(roomState.raceStartAtMs ?? nowMs, nowMs),
    [roomState.raceStartAtMs, nowMs]
  );
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  // Countdown audio cues (3, 2, 1, GO!)
  const lastBeepRef = useRef<number | null>(null);
  useEffect(() => {
    if (timeline.phase === 'countdown' && timeline.countdownSecondsLeft <= 3) {
      if (lastBeepRef.current !== timeline.countdownSecondsLeft) {
        lastBeepRef.current = timeline.countdownSecondsLeft;
        onCountdownBeep(false);
      }
    } else if (timeline.phase === 'racing' && lastBeepRef.current !== 0) {
      lastBeepRef.current = 0;
      onCountdownBeep(true);
    }
  }, [timeline.phase, timeline.countdownSecondsLeft, onCountdownBeep]);

  // Real-time vehicle physics & input state
  const physicsRef = useRef<VehiclePhysicsState>(createInitialPhysicsState());
  const keysRef = useRef<Set<string>>(new Set());
  const touchInputRef = useRef<DrivingInput>({ throttle: 0, brake: 0, steer: 0, nitro: false });
  const participantsRef = useRef<LiveParticipant[]>(roomState.participants);
  participantsRef.current = roomState.participants;

  // 60Hz mutable telemetry ref read directly by Photoreal3DViewport (zero React re-renders)
  const liveTelemetryRef = useRef<LiveThreeDTelemetry>({
    lapProgress01: 0,
    distanceMeters: 0,
    lapLengthMeters: metrics.totalLapMeters,
    speedKmh: 0,
    steeringOffset: 0,
    isNitroActive: false,
    isBraking: false,
    phase: timeline.phase,
    countdownSecondsLeft: timeline.countdownSecondsLeft,
  });

  const [hudPhysics, setHudPhysics] = useState<VehiclePhysicsState>(() =>
    createInitialPhysicsState()
  );
  const [agenticDecision, setAgenticDecision] = useState<string>('Autonomous Racing Line Active');

  // Keyboard driving controls (WASD / Arrows / Shift Nitro / M SFX Mute / B Music Toggle / X XR Aura / Esc Exit XR)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && !e.repeat) {
        onToggleMute();
        return;
      }
      if (e.code === 'KeyB' && !e.repeat) {
        onToggleMusic();
        return;
      }
      if (e.code === 'KeyX' && !e.repeat) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          handleToggleAuraMode();
          return;
        }
      }
      if (e.code === 'Escape' && auraMode !== 'standard') {
        handleToggleAuraMode();
        return;
      }
      keysRef.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    const onBlur = () => {
      keysRef.current.clear();
      touchInputRef.current = { throttle: 0, brake: 0, steer: 0, nitro: false };
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [onToggleMute, onToggleMusic, handleToggleAuraMode, auraMode]);

  // Reset physics on new race start
  useEffect(() => {
    physicsRef.current = createInitialPhysicsState();
    setHudPhysics(createInitialPhysicsState());
  }, [roomState.raceStartAtMs, circuit.id]);

  // 60Hz local physics loop with throttled React HUD update (15Hz) and WebSocket upload (8Hz)
  useEffect(() => {
    let rafId = 0;
    let lastFrameTs = performance.now();
    let lastHudUpdateTs = 0;
    let lastNetSendTs = 0;

    let prevNitroActive = false;

    const loop = (ts: number) => {
      const dtSec = Math.min(0.05, Math.max(0.001, (ts - lastFrameTs) / 1000));
      lastFrameTs = ts;

      const phase = timelineRef.current.phase;
      const road = interpolateCircuitPosition(
        circuit.waypoints,
        physicsRef.current.distanceMeters,
        metrics
      );

      if (phase === 'racing') {
        // Compute nearest rival ahead for slipstream drafting
        let nearestAhead: number | null = null;
        for (const p of participantsRef.current) {
          if (p.id === myParticipantId) continue;
          const gap = p.distanceMeters - physicsRef.current.distanceMeters;
          if (gap > 5 && gap < 80 && (nearestAhead === null || gap < nearestAhead)) {
            nearestAhead = gap;
          }
        }
        const hasSlipstream = nearestAhead !== null && nearestAhead < 65;

        let input: DrivingInput;
        let currentDecision = 'Manual Control';

        if (agenticModeRef.current) {
          const ai = computeAgenticDrive(physicsRef.current, road, nearestAhead);
          input = ai.input;
          currentDecision = ai.decision;
        } else {
          const k = keysRef.current;
          const t = touchInputRef.current;
          const xr = xrInputRef.current;
          const btPad =
            typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
              ? extractGamepadDrivingInput(navigator.getGamepads(), 'gamepad')
              : null;

          const kbGas = k.has('KeyW') || k.has('ArrowUp') ? 1 : t.throttle;
          const kbBrake = k.has('KeyS') || k.has('ArrowDown') ? 1 : t.brake;
          const left = k.has('KeyA') || k.has('ArrowLeft') ? -1 : 0;
          const right = k.has('KeyD') || k.has('ArrowRight') ? 1 : 0;
          const kbSteer = left + right !== 0 ? left + right : t.steer;
          const kbNitro = k.has('ShiftLeft') || k.has('ShiftRight') || t.nitro;

          // Blend XREAL Aura 6DoF hand-tracking / puck touchpad / Bluetooth gamepad seamlessly with keyboard & touch
          const extInput = xr.active ? xr : btPad && btPad.active ? btPad : null;
          const gas = Math.max(kbGas, extInput ? extInput.throttle : 0);
          const brake = Math.max(kbBrake, extInput ? extInput.brake : 0);
          const steer = kbSteer !== 0 ? kbSteer : extInput ? extInput.steer : 0;
          const nitro = kbNitro || (extInput ? extInput.nitro : false);

          // Gentle auto-cruise baseline if player hasn't pressed pedals yet so Street View stays alive,
          // while full throttle / braking / nitro gives competitive racing pace
          input = {
            throttle: gas > 0 ? gas : brake > 0 ? 0 : 0.35,
            brake,
            steer,
            nitro,
          };
        }

        physicsRef.current = stepVehiclePhysics(
          physicsRef.current,
          input,
          vehicle,
          dtSec,
          road.curveSharpness,
          road.speedLimitKmh,
          hasSlipstream
        );

        // Trigger Nitro ignition sound on rising edge
        if (physicsRef.current.isNitroActive && !prevNitroActive) {
          onPlayBoost();
        }
        prevNitroActive = physicsRef.current.isNitroActive;

        if (ts - lastHudUpdateTs >= 65) {
          lastHudUpdateTs = ts;
          setHudPhysics({ ...physicsRef.current });
          if (agenticModeRef.current) {
            setAgenticDecision(currentDecision);
          }
        }

        if (ts - lastNetSendTs >= 125) {
          lastNetSendTs = ts;
          const updatedRoad = interpolateCircuitPosition(
            circuit.waypoints,
            physicsRef.current.distanceMeters,
            metrics
          );
          onSendTelemetry({
            distanceMeters: physicsRef.current.distanceMeters,
            speedKmh: physicsRef.current.speedKmh,
            lat: updatedRoad.lat,
            lng: updatedRoad.lng,
            heading: updatedRoad.heading,
            lap: updatedRoad.lap,
            agenticDecision: agenticModeRef.current ? currentDecision : undefined,
          });
        }
      } else {
        prevNitroActive = false;
      }

      // Drive live 60Hz V8/GT engine, gear-shift pop, wind rush, and tire screech audio
      const isEngineActive =
        phase === 'racing' ||
        (phase === 'countdown' && timelineRef.current.countdownSecondsLeft <= 3);
      const speedRatio =
        phase === 'racing'
          ? Math.min(1.45, physicsRef.current.speedKmh / 240)
          : 0.16 + Math.sin(ts * 0.012) * 0.05;
      const isDrifting =
        phase === 'racing' &&
        ((Math.abs(physicsRef.current.steeringOffset) > 0.42 &&
          physicsRef.current.speedKmh > 95) ||
          (physicsRef.current.isBraking && physicsRef.current.speedKmh > 120));
      onUpdateEngine(
        speedRatio,
        isDrifting,
        physicsRef.current.isNitroActive,
        isEngineActive
      );

      // Always keep 3D & XR Aura Spatial HUD telemetry ref updated at full 60Hz (countdown + racing)
      const latestRoad = interpolateCircuitPosition(
        circuit.waypoints,
        physicsRef.current.distanceMeters,
        metrics
      );
      const myDist = physicsRef.current.distanceMeters;
      let liveRank = 1;
      for (const p of participantsRef.current) {
        if (p.id !== myParticipantId && p.distanceMeters > myDist) {
          liveRank++;
        }
      }
      liveTelemetryRef.current = {
        lapProgress01: latestRoad.lapProgress,
        distanceMeters: myDist,
        lapLengthMeters: metrics.totalLapMeters,
        speedKmh: physicsRef.current.speedKmh,
        steeringOffset: physicsRef.current.steeringOffset,
        isNitroActive: physicsRef.current.isNitroActive,
        isBraking: physicsRef.current.isBraking,
        phase: timelineRef.current.phase,
        countdownSecondsLeft: timelineRef.current.countdownSecondsLeft,
        gear: physicsRef.current.gear,
        nitroPercent: physicsRef.current.nitroPercent,
        rank: liveRank,
        totalRacers: Math.max(1, participantsRef.current.length),
        lap: latestRoad.lap,
        remainingClock: formatClockMs(timelineRef.current.remainingMs),
        circuitName: circuit.name,
        landmark: latestRoad.currentLandmark,
      };

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      onUpdateEngine(0, false, false, false);
    };
  }, [circuit, metrics, vehicle, myParticipantId, onSendTelemetry, onUpdateEngine, onPlayBoost]);

  const roadPos = useMemo(
    () => interpolateCircuitPosition(circuit.waypoints, hudPhysics.distanceMeters, metrics),
    [circuit, hudPhysics.distanceMeters, metrics]
  );

  // Live sorted standings combining server rivals + instant local player distance
  const liveStandings = useMemo(() => {
    const merged = roomState.participants.map((p) =>
      p.id === myParticipantId
        ? {
            ...p,
            distanceMeters: Math.max(p.distanceMeters, hudPhysics.distanceMeters),
            speedKmh: hudPhysics.speedKmh,
            lap: roadPos.lap,
          }
        : p
    );
    return merged.sort((a, b) => b.distanceMeters - a.distanceMeters);
  }, [roomState.participants, myParticipantId, hudPhysics.distanceMeters, hudPhysics.speedKmh, roadPos.lap]);

  const myRank = Math.max(
    1,
    liveStandings.findIndex((p) => p.id === myParticipantId) + 1
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#090b10] text-slate-100 flex flex-col">
      {/* Compact Top Motorsport Telemetry Bar */}
      <header className="relative z-30 h-14 px-3 sm:px-5 bg-[#0b0f17] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Position, Lap & 5-Min Race Clock */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Pos
            </span>
            <span className="font-display text-xl sm:text-2xl font-bold text-amber-400 font-mono-tabular">
              {myRank}
            </span>
            <span className="text-xs text-slate-400 font-mono-tabular">
              /{Math.max(1, liveStandings.length)}
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Lap
            </span>
            <span className="font-display text-lg sm:text-xl font-bold text-white font-mono-tabular">
              {roadPos.lap}
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-center gap-2">
            <Flag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <div
                data-testid="race-clock-remaining"
                className="font-mono-tabular text-sm sm:text-base font-bold text-white leading-none"
              >
                {formatClockMs(timeline.remainingMs)}
              </div>
              <div className="text-[10px] text-slate-400 leading-none mt-0.5 hidden sm:block">
                5:00 GP · {timeline.phase === 'countdown' ? 'Countdown' : 'Live'}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Circuit Name */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-300 truncate">
          <span className="font-display font-bold text-white">{circuit.name} GP</span>
          <span className="text-slate-500">·</span>
          <span>{roomState.roomLabel}</span>
        </div>

        {/* Right: Utility Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowMobileStandings((v) => !v)}
            className="lg:hidden min-h-[36px] px-2.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1 cursor-pointer"
            aria-label="Toggle live standings"
          >
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono-tabular">{liveStandings.length}</span>
          </button>

          {onFinishEarly && (roomState.roomType === 'practice' || roomState.roomType === 'private') && (
            <button
              type="button"
              onClick={onFinishEarly}
              className="hidden sm:inline-flex min-h-[36px] px-2.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 items-center gap-1.5 cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5 text-emerald-400" />
              <span>Announce Results</span>
            </button>
          )}

          <button
            type="button"
            data-testid="toggle-xr-aura-btn"
            onClick={handleToggleAuraMode}
            title="Toggle XREAL Aura Spatial / WebXR Mode (X)"
            aria-pressed={auraMode !== 'standard'}
            className={`min-h-[36px] px-2.5 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              auraMode !== 'standard'
                ? 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-400/50 text-sky-200'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
            }`}
          >
            <Glasses className={`w-3.5 h-3.5 ${auraMode !== 'standard' ? 'text-sky-300' : 'text-sky-400'}`} />
            <span className="hidden sm:inline">
              {auraMode !== 'standard' ? 'XR Aura On' : 'XR Aura'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleMusic}
            title={musicMuted ? 'Enable city soundtrack (B)' : 'Mute city soundtrack (B)'}
            aria-label={musicMuted ? 'Enable city soundtrack' : 'Mute city soundtrack'}
            aria-pressed={!musicMuted}
            className={`w-9 h-9 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
              musicMuted
                ? 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-400'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/40 text-amber-300'
            }`}
          >
            <Music className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'Unmute engine & SFX (M)' : 'Mute engine & SFX (M)'}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            aria-pressed={!muted}
            className="w-9 h-9 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <button
            type="button"
            onClick={onLeaveRace}
            aria-label="Leave race and return to lobby"
            className="min-h-[36px] px-2.5 rounded-md bg-white/5 hover:bg-rose-500/20 border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lobby</span>
          </button>
        </div>
      </header>

      {/* Main Racing Viewport (Realtime Street View + Synchronized Google Map + XREAL Aura WebXR/SBS) */}
      <div className="relative flex-1 min-h-0 w-full">
        <LiveStreetViewAndMap
          circuit={circuit}
          roadPos={roadPos}
          liveTelemetryRef={liveTelemetryRef}
          vehicleAccentColor={vehicle.accentColor}
          participants={liveStandings}
          myParticipantId={myParticipantId}
          layout={layout}
          onLayoutChange={setLayout}
          auraMode={auraMode}
          auraDimming={auraDimming}
          xrInputRef={xrInputRef}
          xrBridgeRef={xrBridgeRef}
          onWebXrStateChange={handleWebXrStateChange}
        />

        {/* XREAL Aura Spatial Control Bar & WebXR DOM Overlay */}
        {auraMode !== 'standard' && (
          <div
            id="aura-xr-dom-overlay"
            data-testid="xr-aura-control-bar"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-2 bg-[#090d16]/94 border border-sky-400/35 rounded-xl px-3 py-2 shadow-2xl max-w-[94vw]"
          >
            <div className="flex items-center gap-1.5 pr-2 border-r border-white/12">
              <Glasses className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="font-display text-xs font-bold text-white whitespace-nowrap">
                XREAL Aura
              </span>
              <span className="text-[10px] font-mono-tabular text-sky-300 whitespace-nowrap">
                70° Micro-OLED
              </span>
            </div>

            {/* Spatial Output Modes: Native Android XR WebXR AR/VR | 70° Spatial | DP-in 3D Stereo SBS */}
            <div className="flex items-center gap-1" role="group" aria-label="XR Aura display mode">
              {xrCaps.supportsImmersiveAr && (
                <button
                  type="button"
                  onClick={() => handleLaunchWebXr('immersive-ar')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                    auraMode === 'aura-webxr-ar'
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-white/5 hover:bg-white/10 text-sky-200'
                  }`}
                >
                  WebXR AR
                </button>
              )}
              {xrCaps.supportsImmersiveVr && (
                <button
                  type="button"
                  onClick={() => handleLaunchWebXr('immersive-vr')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                    auraMode === 'aura-webxr-vr'
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-white/5 hover:bg-white/10 text-sky-200'
                  }`}
                >
                  WebXR VR
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  xrBridgeRef.current?.endWebXrSession().catch(() => {});
                  setAuraMode('aura-spatial');
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                  auraMode === 'aura-spatial'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-white/5 hover:bg-white/10 text-slate-200'
                }`}
              >
                70° Spatial
              </button>
              <button
                type="button"
                data-testid="aura-sbs-btn"
                onClick={() => {
                  xrBridgeRef.current?.endWebXrSession().catch(() => {});
                  setAuraMode('aura-sbs');
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  auraMode === 'aura-sbs'
                    ? 'bg-sky-400 text-slate-950'
                    : 'bg-white/5 hover:bg-white/10 text-slate-200'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>DP-in 3D SBS</span>
              </button>
            </div>

            {/* 5-Level Electrochromic Dimmer */}
            <div
              className="flex items-center gap-1 pl-2 border-l border-white/12"
              role="group"
              aria-label="Electrochromic dimming level"
              title={`Electrochromic Dimmer: ${getAuraDimmingConfig(auraDimming).label}`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-400 mr-0.5 shrink-0" />
              {([1, 2, 3, 4, 5] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setAuraDimming(lvl)}
                  aria-pressed={auraDimming === lvl}
                  title={getAuraDimmingConfig(lvl).label}
                  className={`w-6 h-6 rounded text-[10px] font-mono-tabular font-bold transition-colors cursor-pointer ${
                    auraDimming === lvl
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-white/8 hover:bg-white/15 text-slate-300'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleToggleAuraMode}
              title="Exit XR Aura Mode (Esc)"
              aria-label="Exit XR Aura Mode"
              className="w-7 h-7 rounded-md bg-white/8 hover:bg-rose-500/25 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {xrNotice && (
              <div className="w-full text-center text-[10px] text-amber-300 pt-0.5">
                {xrNotice}
              </div>
            )}
          </div>
        )}

        {/* 10-Second Starting Lights Countdown Overlay (rendered in 3D holographic visor during DP-in SBS) */}
        {timeline.phase === 'countdown' && auraMode !== 'aura-sbs' && (
          <div
            data-testid="countdown-overlay"
            className="pointer-events-none absolute inset-x-0 top-20 sm:top-16 z-20 flex flex-col items-center px-4"
          >
            <div className="bg-[#090b10]/92 border border-white/15 rounded-2xl px-6 sm:px-7 py-3.5 sm:py-4 text-center shadow-2xl">
              <div className="flex items-center justify-center gap-2 mb-2">
                {[5, 4, 3, 2, 1].map((light) => {
                  const lit = timeline.countdownSecondsLeft <= light * 2;
                  return (
                    <span
                      key={light}
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border ${
                        lit
                          ? 'bg-red-500 border-red-300 shadow-[0_0_12px_rgba(239,68,68,0.75)]'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    />
                  );
                })}
              </div>
              <div className="font-display text-4xl sm:text-6xl font-bold text-white font-mono-tabular leading-none">
                {timeline.countdownSecondsLeft}
              </div>
              <div className="text-[11px] sm:text-xs font-medium text-amber-300 mt-1.5">
                {timeline.isAgenticWindowOpen
                  ? 'Agentic Hand-Press Window OPEN · Hold P or Hard Press 2s'
                  : '10-Second Starting Grid Countdown (Included in 5:00 Race)'}
              </div>
            </div>
          </div>
        )}

        {/* Live Multi-Location Standings Rail (Desktop top-right, hidden in DP-in 3D Stereo SBS) */}
        {auraMode !== 'aura-sbs' && (
          <aside
            className={`absolute top-3 right-3 z-20 w-64 bg-[#0b0f17]/92 border border-white/12 rounded-xl p-3 shadow-xl ${
              showMobileStandings ? 'block' : 'hidden lg:block'
            }`}
            aria-label="Live race standings"
          >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 pb-2 border-b border-white/8">
            <span>Live Standings</span>
            <span className="font-mono-tabular text-slate-400">
              {liveStandings.length} driver{liveStandings.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="divide-y divide-white/6 mt-1 max-h-48 overflow-y-auto">
            {liveStandings.map((p, idx) => (
              <li
                key={p.id}
                className={`py-1.5 flex items-center justify-between gap-2 text-xs ${
                  p.id === myParticipantId ? 'text-amber-300 font-semibold' : 'text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono-tabular text-[11px] w-4 text-slate-400">
                    {idx + 1}
                  </span>
                  <span className="truncate">{p.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono-tabular shrink-0">
                    {p.locationCode}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular text-[11px]">
                  <span className={p.agenticMode ? 'text-emerald-400' : 'text-slate-400'}>
                    {p.agenticMode ? 'AI' : 'MAN'}
                  </span>
                  <span>{(p.distanceMeters / 1000).toFixed(2)}k</span>
                </div>
              </li>
            ))}
          </ul>
          </aside>
        )}
      </div>

      {/* Responsive Bottom Controls: Hidden in DP-in 3D Stereo SBS so dual eyes show pure stereoscopic 3D HUD */}
      {auraMode !== 'aura-sbs' && (
        <div className="relative z-20 shrink-0 bg-[#0b0f17] border-t border-white/10 p-2.5 flex flex-col-reverse gap-2 md:pointer-events-none md:absolute md:inset-x-0 md:bottom-0 md:bg-transparent md:border-t-0 md:p-4 md:flex-row md:items-end md:justify-between">
        {/* Human Hand-Press Agentic Ignition Pad (Thumb Zone on Mobile, Bottom-Left on Desktop) */}
        <div className="w-full md:pointer-events-auto md:w-auto md:max-w-[340px]">
          <AgenticIgnitionPad
            timeline={timeline}
            participantCount={roomState.participants.length}
            agenticMode={agenticMode}
            agenticDecision={agenticDecision}
            lastAgenticEvent={lastAgenticEvent}
            onHoldStart={onAgenticHoldStart}
            onHoldCancel={onAgenticHoldCancel}
            onHoldCommit={onAgenticHoldCommit}
            onDisengage={onAgenticDisengage}
            onChargeTick={onAgenticChargeTick}
          />
        </div>

        {/* Speedometer, Nitro & Mobile Touch Pedals */}
        <div className="w-full md:pointer-events-auto md:w-auto flex items-center justify-between md:flex-col md:items-end gap-2">
          {/* Mobile / Touch Driving Pedals when in Manual Mode */}
          {!agenticMode && (
            <div className="flex md:hidden items-center gap-1.5">
              <button
                type="button"
                aria-label="Steer left"
                onPointerDown={() => (touchInputRef.current.steer = -1)}
                onPointerUp={() => (touchInputRef.current.steer = 0)}
                onPointerLeave={() => (touchInputRef.current.steer = 0)}
                className="w-10 h-10 rounded-lg bg-[#141a26] border border-white/15 flex items-center justify-center text-white active:bg-amber-500 active:text-slate-950"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Steer right"
                onPointerDown={() => (touchInputRef.current.steer = 1)}
                onPointerUp={() => (touchInputRef.current.steer = 0)}
                onPointerLeave={() => (touchInputRef.current.steer = 0)}
                className="w-10 h-10 rounded-lg bg-[#141a26] border border-white/15 flex items-center justify-center text-white active:bg-amber-500 active:text-slate-950"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                type="button"
                onPointerDown={() => (touchInputRef.current.nitro = true)}
                onPointerUp={() => (touchInputRef.current.nitro = false)}
                onPointerLeave={() => (touchInputRef.current.nitro = false)}
                className="h-10 px-2.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-[11px] font-bold text-amber-300"
              >
                NITRO
              </button>
              <button
                type="button"
                onPointerDown={() => (touchInputRef.current.throttle = 1)}
                onPointerUp={() => (touchInputRef.current.throttle = 0)}
                onPointerLeave={() => (touchInputRef.current.throttle = 0)}
                className="h-10 px-3 rounded-lg bg-emerald-500/25 border border-emerald-400/50 text-[11px] font-bold text-emerald-200"
              >
                GAS
              </button>
            </div>
          )}

          {/* Compact Telemetry Cluster */}
          <div className="bg-[#121722] md:bg-[#0b0f17]/92 border border-white/12 rounded-xl px-3 py-2 md:px-4 md:py-3 flex items-center gap-3 md:gap-4 shadow-xl ml-auto">
            <div className="hidden sm:block w-28 sm:w-32">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="flex items-center gap-1 text-slate-300 font-medium">
                  <Flame className="w-3 h-3 text-amber-400" />
                  <span>Nitro</span>
                </span>
                <span className="font-mono-tabular text-slate-400">
                  {Math.round(hudPhysics.nitroPercent)}%
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    hudPhysics.isNitroActive ? 'bg-amber-400' : 'bg-sky-400'
                  }`}
                  style={{ width: `${Math.round(hudPhysics.nitroPercent)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5 hidden md:block">
                WASD Drive · Shift Nitro · M SFX · B Music
              </div>
            </div>

            <div className="hidden sm:block h-10 w-px bg-white/10" />

            <div className="text-right min-w-[60px] md:min-w-[74px]">
              <div
                data-testid="speedometer-value"
                className="font-display text-2xl md:text-3xl font-bold text-white font-mono-tabular leading-none"
              >
                {Math.round(hudPhysics.speedKmh)}
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-0.5 md:mt-1 text-[10px] font-mono-tabular text-slate-400">
                <span>KM/H</span>
                <span className="text-amber-400 font-bold">G{hudPhysics.gear}</span>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
