import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CIRCUITS,
  GLOBAL_LOCATIONS,
  VEHICLES,
  getCircuitById,
  type GlobalLocation,
} from './game/circuits';
import { haversineMeters } from './game/circuitMath';
import {
  COUNTDOWN_DURATION_MS,
  RACE_DURATION_MS,
  computeOfficialStandings,
  getNextSlotStart,
} from './game/raceSchedule';
import { LobbyScreen } from './components/LobbyScreen';
import { RaceCockpit } from './components/RaceCockpit';
import { ResultsAnnouncement } from './components/ResultsAnnouncement';
import { useRaceSocket } from './hooks/useRaceSocket';
import { useWebAudio } from './hooks/useWebAudio';
import type { AuraViewMode } from './game/xrAura';
import type { AnnouncedRaceResult, LiveParticipant, RoomStatePayload } from './types/race';

const GLOBAL_ROOM_ID = 'global-gp';

const SOLO_COUNTDOWN_MS = 3000;

function safeReplaceUrl(url: string): void {
  try {
    window.history.replaceState({}, '', url);
  } catch {
    // Ignore SecurityError in sandboxed or restricted iframes
  }
}

function readStoredString(key: string, fallback: string): string {
  try {
    const val = localStorage.getItem(key);
    return val && val.trim() ? val : fallback;
  } catch {
    return fallback;
  }
}

function readStoredLocation(): GlobalLocation {
  try {
    const raw = localStorage.getItem('svgp_location');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GlobalLocation>;
      if (
        parsed &&
        typeof parsed.id === 'string' &&
        typeof parsed.city === 'string' &&
        typeof parsed.country === 'string' &&
        typeof parsed.code === 'string' &&
        typeof parsed.lat === 'number' &&
        Number.isFinite(parsed.lat) &&
        typeof parsed.lng === 'number' &&
        Number.isFinite(parsed.lng)
      ) {
        return parsed as GlobalLocation;
      }
    }
  } catch {
    // Ignore storage error
  }
  return GLOBAL_LOCATIONS[0];
}

class CockpitErrorBoundary extends React.Component<
  { onReset: () => void; children: React.ReactNode },
  { errorMessage: string | null }
> {
  state = { errorMessage: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      errorMessage: error instanceof Error ? error.message : 'Unable to initialize race cockpit.',
    };
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="min-h-screen w-full bg-[#090b10] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#111621] border border-white/12 rounded-xl p-6 text-center space-y-4">
            <h2 className="font-display text-lg font-bold text-white">
              Race Cockpit Recovery
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ errorMessage: null });
                this.props.onReset();
              }}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs rounded-lg cursor-pointer"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function makeShortCode(prefix: 'gp' | 'practice'): string {
  const bytes = new Uint8Array(3);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}-${hex}`;
}

export default function App() {
  const {
    connected,
    participantId,
    roomState,
    serverTimeOffsetMs,
    lastAgenticEvent,
    joinRoom,
    selectCircuit,
    setReady,
    launchNow,
    finishNow,
    sendTelemetry,
    sendAgenticHoldStart,
    sendAgenticHoldCancel,
    sendAgenticHoldCommit,
    sendAgenticDisengage,
    clearAgenticEvent,
  } = useRaceSocket();

  const {
    muted,
    toggleMute,
    musicMuted,
    toggleMusic,
    unlockAudio,
    setCityMusic,
    setMusicIntensity,
    updateEngine,
    playBoost,
    playCountdownBeep,
    playAgenticChargeTick,
    playAgenticEngaged,
    playResultsFanfare,
  } = useWebAudio();

  const [playerName, setPlayerName] = useState<string>(() =>
    readStoredString('svgp_player_name', 'Apex Racer')
  );
  const [selectedCircuitId, setSelectedCircuitId] = useState<string>(() =>
    readStoredString('svgp_circuit_id', CIRCUITS[0].id)
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(() =>
    readStoredString('svgp_vehicle_id', VEHICLES[0].id)
  );
  const [selectedLocation, setSelectedLocation] = useState<GlobalLocation>(readStoredLocation);
  const [detectingGps, setDetectingGps] = useState(false);
  const [preferredAuraMode, setPreferredAuraMode] = useState<AuraViewMode>(() => {
    if (typeof window === 'undefined') return 'standard';
    const params = new URLSearchParams(window.location.search);
    if (params.get('xr') === 'sbs') return 'aura-sbs';
    if (params.get('xr') === '1' || params.get('source') === 'xr') return 'aura-spatial';
    return 'standard';
  });

  const [activeRoomId, setActiveRoomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || GLOBAL_ROOM_ID;
  });
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);
  const [localRoom, setLocalRoom] = useState<RoomStatePayload | null>(null);
  const [fallbackHistory, setFallbackHistory] = useState<AnnouncedRaceResult[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const autoInitRef = useRef(false);
  const localParticipantId = participantId || 'local-driver';

  // Keep a high-frequency synced clock (150ms) for 10-min schedule, 10s countdown & 5-min race timers
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now() + (localRoom?.roomType === 'practice' ? 0 : serverTimeOffsetMs));
    }, 150);
    return () => window.clearInterval(id);
  }, [serverTimeOffsetMs, localRoom?.roomType]);

  // Persist driver profile locally
  useEffect(() => {
    try {
      localStorage.setItem('svgp_player_name', playerName);
    } catch {
      // ignore
    }
  }, [playerName]);

  useEffect(() => {
    try {
      localStorage.setItem('svgp_circuit_id', selectedCircuitId);
    } catch {
      // ignore
    }
  }, [selectedCircuitId]);

  useEffect(() => {
    try {
      localStorage.setItem('svgp_vehicle_id', selectedVehicleId);
    } catch {
      // ignore
    }
  }, [selectedVehicleId]);

  useEffect(() => {
    try {
      localStorage.setItem('svgp_location', JSON.stringify(selectedLocation));
    } catch {
      // ignore
    }
  }, [selectedLocation]);

  // Initial REST fetch for recent announced results before joining WS room
  useEffect(() => {
    fetch('/api/schedule')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.recentResults)) {
          setFallbackHistory(data.recentResults);
        }
      })
      .catch(() => {});
  }, []);

  // Build an immediate local participant snapshot for instant Solo Practice or optimistic room entry
  const buildLocalParticipant = useCallback(
    (circuitId: string, now: number): LiveParticipant => {
      const circuit = getCircuitById(circuitId);
      const startWp = circuit.waypoints[0];
      return {
        id: localParticipantId,
        name: playerName.trim() || 'Apex Racer',
        locationName: `${selectedLocation.city}, ${selectedLocation.country}`,
        locationCode: selectedLocation.code,
        originLat: selectedLocation.lat,
        originLng: selectedLocation.lng,
        vehicleId: selectedVehicleId,
        distanceMeters: 0,
        speedKmh: 0,
        topSpeedKmh: 0,
        lap: 1,
        lat: startWp.lat,
        lng: startWp.lng,
        heading: circuit.streetViewStartHeading,
        agenticMode: false,
        agenticDecision: 'Manual Driver Control',
        ready: true,
        joinedAtMs: now,
      };
    },
    [localParticipantId, playerName, selectedLocation, selectedVehicleId]
  );

  // Finalize a local practice/offline room into an official results announcement
  const finalizeLocalRoom = useCallback((room: RoomStatePayload, now: number): RoomStatePayload => {
    const circuit = getCircuitById(room.circuitId);
    const racingStartMs = (room.raceStartAtMs ?? now - RACE_DURATION_MS) + COUNTDOWN_DURATION_MS;
    const elapsedDrivingMs = Math.max(1000, now - racingStartMs);
    const standings = computeOfficialStandings(room.participants, elapsedDrivingMs);
    const announcement: AnnouncedRaceResult = {
      raceId: `local-${room.roomId}-${now}`,
      roomId: room.roomId,
      roomLabel: room.roomLabel,
      circuitId: circuit.id,
      circuitName: circuit.name,
      startedAtMs: room.raceStartAtMs ?? now,
      finishedAtMs: now,
      participantCount: standings.length,
      standings,
    };
    return {
      ...room,
      serverNowMs: now,
      phase: 'results',
      lastAnnouncement: announcement,
      notice: `Session finished on ${circuit.name} GP.`,
    };
  }, []);

  // Advance local room timeline cleanly: countdown -> racing -> results
  useEffect(() => {
    if (!localRoom || !localRoom.raceStartAtMs) return;
    if (localRoom.phase === 'countdown' && nowMs >= localRoom.raceStartAtMs + COUNTDOWN_DURATION_MS) {
      setLocalRoom((prev) => (prev ? { ...prev, phase: 'racing', serverNowMs: nowMs } : prev));
    } else if (
      localRoom.phase === 'racing' &&
      nowMs >= localRoom.raceStartAtMs + RACE_DURATION_MS
    ) {
      setLocalRoom((prev) => (prev ? finalizeLocalRoom(prev, nowMs) : prev));
    }
  }, [localRoom, nowMs, finalizeLocalRoom]);

  // Decide active authoritative room state:
  // - Practice rooms always run immediately via localRoom (0ms start, works even offline/static)
  // - Global/Private rooms prefer live server roomState once synced for the same roomId,
  //   with immediate optimistic localRoom feedback before WS responds.
  const isUsingServerRoom = Boolean(
    roomState &&
      roomState.roomId === activeRoomId &&
      localRoom?.roomType !== 'practice'
  );
  const effectiveRoomState: RoomStatePayload | null = isUsingServerRoom ? roomState : localRoom;
  const effectiveParticipantId = isUsingServerRoom ? participantId : localParticipantId;

  const performJoin = useCallback(
    (
      targetRoomId: string,
      circuitOverride?: string,
      optimisticType: 'global' | 'private' = 'global'
    ) => {
      autoInitRef.current = true;
      const cleanName = playerName.trim() || 'Apex Racer';
      const targetCircuit = circuitOverride || selectedCircuitId;
      const now = Date.now();
      setActiveRoomId(targetRoomId);
      setHasJoinedRoom(true);
      clearAgenticEvent();

      // Immediate optimistic room state so buttons ALWAYS respond instantaneously even if WS is reconnecting
      const me = buildLocalParticipant(targetCircuit, now);
      setLocalRoom({
        serverNowMs: now,
        roomId: targetRoomId,
        roomLabel:
          optimisticType === 'global'
            ? 'Global 10-Min Grand Prix'
            : `Synced Room · ${targetRoomId.toUpperCase()}`,
        roomType: optimisticType,
        circuitId: targetCircuit,
        phase: 'lobby',
        raceStartAtMs: null,
        nextGlobalSlotAtMs: getNextSlotStart(now),
        notice:
          optimisticType === 'private'
            ? 'Synced room created! Share the invite link below with other racers.'
            : null,
        participants: [me],
        lastAnnouncement: null,
        history: fallbackHistory,
      });

      joinRoom({
        roomId: targetRoomId,
        circuitId: targetCircuit,
        name: cleanName,
        locationName: `${selectedLocation.city}, ${selectedLocation.country}`,
        locationCode: selectedLocation.code,
        originLat: selectedLocation.lat,
        originLng: selectedLocation.lng,
        vehicleId: selectedVehicleId,
      });

      const url = targetRoomId === GLOBAL_ROOM_ID ? '/' : `/?room=${encodeURIComponent(targetRoomId)}`;
      safeReplaceUrl(url);
    },
    [
      buildLocalParticipant,
      clearAgenticEvent,
      fallbackHistory,
      joinRoom,
      playerName,
      selectedCircuitId,
      selectedLocation,
      selectedVehicleId,
    ]
  );

  const handleJoinGlobalGp = useCallback(() => {
    try {
      unlockAudio();
    } catch {
      // Ignore restricted autoplay contexts
    }
    performJoin(GLOBAL_ROOM_ID, selectedCircuitId, 'global');
  }, [performJoin, selectedCircuitId, unlockAudio]);

  const handleCreatePrivateRoom = useCallback(async () => {
    try {
      unlockAudio();
    } catch {
      // Ignore restricted autoplay contexts
    }
    let targetRoomId = makeShortCode('gp');
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 1400);
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circuitId: selectedCircuitId, type: 'private' }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data?.roomId) {
          targetRoomId = data.roomId;
        }
      }
    } catch {
      // Fall back seamlessly to locally generated room code
    }
    performJoin(targetRoomId, selectedCircuitId, 'private');
  }, [performJoin, selectedCircuitId, unlockAudio]);

  // Solo Practice Drive ALWAYS launches immediately (zero network/WS/iframe blocker)
  const handleStartSoloPractice = useCallback(
    (auraStartMode?: AuraViewMode) => {
      autoInitRef.current = true;
      try {
        unlockAudio();
      } catch {
        // Ignore restricted audio policies so click always transitions to cockpit
      }
      if (auraStartMode) {
        setPreferredAuraMode(auraStartMode);
      }
      const now = Date.now();
      const practiceRoomId = makeShortCode('practice');
      const me = buildLocalParticipant(selectedCircuitId, now);

      setNowMs(now);
      setActiveRoomId(practiceRoomId);
      setHasJoinedRoom(true);
      clearAgenticEvent();

      setLocalRoom({
        serverNowMs: now,
        roomId: practiceRoomId,
        roomLabel: 'Solo Practice Session',
        roomType: 'practice',
        circuitId: selectedCircuitId,
        phase: 'countdown',
        // Snappy 3-2-1 launch countdown for Solo Practice (while multiplayer retains full 10s grid countdown)
        raceStartAtMs: now - (COUNTDOWN_DURATION_MS - SOLO_COUNTDOWN_MS),
        nextGlobalSlotAtMs: getNextSlotStart(now),
        notice: null,
        participants: [me],
        lastAnnouncement: null,
        history: fallbackHistory,
      });

      safeReplaceUrl(`/?room=${encodeURIComponent(practiceRoomId)}`);
    },
    [buildLocalParticipant, clearAgenticEvent, fallbackHistory, selectedCircuitId, unlockAudio]
  );

  // Handle direct invite URL (?room=...) or ?autostart=1 on load
  useEffect(() => {
    if (autoInitRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const autostart = params.get('autostart') === '1';

    if (autostart) {
      autoInitRef.current = true;
      handleStartSoloPractice();
      return;
    }

    if (roomParam && roomParam.trim() && connected) {
      autoInitRef.current = true;
      const clean = roomParam.trim();
      if (clean.startsWith('practice-')) {
        handleStartSoloPractice();
      } else {
        performJoin(clean, selectedCircuitId, clean === GLOBAL_ROOM_ID ? 'global' : 'private');
      }
    }
  }, [connected, handleStartSoloPractice, performJoin, selectedCircuitId]);

  // Detect driver origin via browser GPS geolocation
  const handleDetectGpsLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let nearest = GLOBAL_LOCATIONS[0];
        let bestDist = Infinity;
        for (const loc of GLOBAL_LOCATIONS) {
          const d = haversineMeters({ lat, lng }, { lat: loc.lat, lng: loc.lng });
          if (d < bestDist) {
            bestDist = d;
            nearest = loc;
          }
        }
        const detected: GlobalLocation =
          bestDist < 120_000
            ? { ...nearest, lat, lng }
            : {
                id: 'gps-custom',
                city: `GPS ${lat.toFixed(2)}, ${lng.toFixed(2)}`,
                country: nearest.country,
                code: nearest.code,
                lat,
                lng,
              };
        setSelectedLocation(detected);
        setDetectingGps(false);
      },
      () => {
        setDetectingGps(false);
      },
      { enableHighAccuracy: false, timeout: 6000 }
    );
  }, []);

  const handleSelectCircuit = useCallback(
    (id: string) => {
      unlockAudio();
      setSelectedCircuitId(id);
      if (localRoom && localRoom.phase === 'lobby') {
        setLocalRoom((prev) => (prev ? { ...prev, circuitId: id } : prev));
      }
      if (hasJoinedRoom && effectiveRoomState?.phase === 'lobby' && isUsingServerRoom) {
        selectCircuit(id);
      }
    },
    [effectiveRoomState?.phase, hasJoinedRoom, isUsingServerRoom, localRoom, selectCircuit, unlockAudio]
  );

  const handleToggleReady = useCallback(
    (ready: boolean) => {
      if (isUsingServerRoom) {
        setReady(ready);
      }
      setLocalRoom((prev) =>
        prev
          ? {
              ...prev,
              participants: prev.participants.map((p) =>
                p.id === localParticipantId ? { ...p, ready } : p
              ),
            }
          : prev
      );
    },
    [isUsingServerRoom, localParticipantId, setReady]
  );

  const handleLaunchPrivateRace = useCallback(() => {
    if (isUsingServerRoom) {
      launchNow();
    } else if (localRoom) {
      const now = Date.now();
      setNowMs(now);
      setLocalRoom((prev) =>
        prev ? { ...prev, phase: 'countdown', raceStartAtMs: now, serverNowMs: now } : prev
      );
    }
  }, [isUsingServerRoom, launchNow, localRoom]);

  const handleFinishEarly = useCallback(() => {
    if (isUsingServerRoom) {
      finishNow();
    } else if (localRoom) {
      const now = Date.now();
      setLocalRoom((prev) => (prev ? finalizeLocalRoom(prev, now) : prev));
    }
  }, [finalizeLocalRoom, finishNow, isUsingServerRoom, localRoom]);

  const handleSendTelemetry = useCallback(
    (payload: {
      distanceMeters: number;
      speedKmh: number;
      lat: number;
      lng: number;
      heading: number;
      lap: number;
      agenticDecision?: string;
    }) => {
      if (isUsingServerRoom) {
        sendTelemetry(payload);
      } else {
        setLocalRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            participants: prev.participants.map((p) =>
              p.id === localParticipantId
                ? {
                    ...p,
                    distanceMeters: payload.distanceMeters,
                    speedKmh: payload.speedKmh,
                    topSpeedKmh: Math.max(p.topSpeedKmh, payload.speedKmh),
                    lat: payload.lat,
                    lng: payload.lng,
                    heading: payload.heading,
                    lap: payload.lap,
                    agenticDecision: payload.agenticDecision ?? p.agenticDecision,
                  }
                : p
            ),
          };
        });
      }
    },
    [isUsingServerRoom, localParticipantId, sendTelemetry]
  );

  const handleReturnToLobby = useCallback(() => {
    setHasJoinedRoom(false);
    setLocalRoom(null);
    setActiveRoomId(GLOBAL_ROOM_ID);
    clearAgenticEvent();
    updateEngine(0, false, false, false);
    safeReplaceUrl('/');
  }, [clearAgenticEvent, updateEngine]);

  // Determine current active screen phase
  const currentPhase = useMemo<'lobby' | 'countdown' | 'racing' | 'results'>(() => {
    if (!hasJoinedRoom || !effectiveRoomState) return 'lobby';
    return effectiveRoomState.phase;
  }, [hasJoinedRoom, effectiveRoomState]);

  // Expose live app state on body dataset for deterministic telemetry & inspection
  useEffect(() => {
    document.body.dataset.state = currentPhase;
  }, [currentPhase]);

  // Keep city soundtrack style synced with active circuit across all 27 cities
  const activeCityId = effectiveRoomState?.circuitId ?? selectedCircuitId;
  useEffect(() => {
    setCityMusic(activeCityId);
  }, [activeCityId, setCityMusic]);

  // Switch adaptive music intensity between ambient menu groove and full race arrangement
  useEffect(() => {
    setMusicIntensity(currentPhase === 'countdown' || currentPhase === 'racing' ? 'race' : 'menu');
  }, [currentPhase, setMusicIntensity]);

  // Play celebratory fanfare when official results are announced
  const prevPhaseRef = useRef<string>('lobby');
  useEffect(() => {
    if (currentPhase === 'results' && prevPhaseRef.current !== 'results') {
      updateEngine(0, false, false, false);
      playResultsFanfare();
    }
    prevPhaseRef.current = currentPhase;
  }, [currentPhase, playResultsFanfare, updateEngine]);

  // Keyboard Enter shortcut in lobby when not focused in a form field
  useEffect(() => {
    if (currentPhase !== 'lobby') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
        return;
      }
      if (!hasJoinedRoom) {
        handleJoinGlobalGp();
      } else if (
        effectiveRoomState?.roomType === 'private' &&
        (effectiveRoomState.participants.length ?? 0) >= 2
      ) {
        handleLaunchPrivateRace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPhase, hasJoinedRoom, handleJoinGlobalGp, handleLaunchPrivateRace, effectiveRoomState]);

  const activeRoomUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return activeRoomId === GLOBAL_ROOM_ID
      ? `${window.location.origin}/?room=${GLOBAL_ROOM_ID}`
      : `${window.location.origin}/?room=${encodeURIComponent(activeRoomId)}`;
  }, [activeRoomId]);

  const recentHistory = effectiveRoomState?.history?.length
    ? effectiveRoomState.history
    : fallbackHistory;

  if (currentPhase === 'results' && effectiveRoomState?.lastAnnouncement) {
    return (
      <ResultsAnnouncement
        result={effectiveRoomState.lastAnnouncement}
        myParticipantId={effectiveParticipantId}
        nextGlobalSlotAtMs={effectiveRoomState.nextGlobalSlotAtMs}
        nowMs={nowMs}
        onReturnToLobby={handleReturnToLobby}
      />
    );
  }

  if ((currentPhase === 'countdown' || currentPhase === 'racing') && effectiveRoomState) {
    return (
      <CockpitErrorBoundary onReset={handleReturnToLobby}>
        <RaceCockpit
          roomState={effectiveRoomState}
          myParticipantId={effectiveParticipantId}
          nowMs={nowMs}
          selectedVehicleId={selectedVehicleId}
          muted={muted}
          onToggleMute={toggleMute}
          musicMuted={musicMuted}
          onToggleMusic={toggleMusic}
          onUpdateEngine={updateEngine}
          onPlayBoost={playBoost}
          onLeaveRace={handleReturnToLobby}
          onFinishEarly={handleFinishEarly}
          onSendTelemetry={handleSendTelemetry}
          lastAgenticEvent={lastAgenticEvent}
          onAgenticHoldStart={sendAgenticHoldStart}
          onAgenticHoldCancel={sendAgenticHoldCancel}
          onAgenticHoldCommit={sendAgenticHoldCommit}
          onAgenticDisengage={sendAgenticDisengage}
          onCountdownBeep={playCountdownBeep}
          onAgenticChargeTick={playAgenticChargeTick}
          onAgenticEngagedAudio={playAgenticEngaged}
          initialAuraMode={preferredAuraMode}
          onAuraModeChange={setPreferredAuraMode}
        />
      </CockpitErrorBoundary>
    );
  }

  return (
    <LobbyScreen
      connected={connected}
      nowMs={nowMs}
      roomState={hasJoinedRoom ? effectiveRoomState : null}
      myParticipantId={effectiveParticipantId}
      playerName={playerName}
      onPlayerNameChange={setPlayerName}
      selectedCircuitId={selectedCircuitId}
      onSelectCircuit={handleSelectCircuit}
      selectedVehicleId={selectedVehicleId}
      onSelectVehicle={setSelectedVehicleId}
      selectedLocation={selectedLocation}
      onSelectLocation={setSelectedLocation}
      onDetectGpsLocation={handleDetectGpsLocation}
      detectingGps={detectingGps}
      onJoinGlobalGp={handleJoinGlobalGp}
      onCreatePrivateRoom={handleCreatePrivateRoom}
      onLaunchPrivateRace={handleLaunchPrivateRace}
      onToggleReady={handleToggleReady}
      onStartSoloPractice={handleStartSoloPractice}
      isJoinedToRoom={hasJoinedRoom}
      activeRoomUrl={activeRoomUrl}
      recentHistory={recentHistory}
      muted={muted}
      onToggleMute={toggleMute}
      musicMuted={musicMuted}
      onToggleMusic={toggleMusic}
      preferredAuraMode={preferredAuraMode}
      onPreferredAuraModeChange={setPreferredAuraMode}
    />
  );
}
