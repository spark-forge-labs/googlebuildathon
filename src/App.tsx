import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CIRCUITS,
  GLOBAL_LOCATIONS,
  VEHICLES,
  type GlobalLocation,
} from './game/circuits';
import { haversineMeters } from './game/circuitMath';
import { LobbyScreen } from './components/LobbyScreen';
import { RaceCockpit } from './components/RaceCockpit';
import { ResultsAnnouncement } from './components/ResultsAnnouncement';
import { useRaceSocket } from './hooks/useRaceSocket';
import { useWebAudio } from './hooks/useWebAudio';
import type { AnnouncedRaceResult } from './types/race';

const GLOBAL_ROOM_ID = 'global-gp';

function readStoredString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function readStoredLocation(): GlobalLocation {
  try {
    const raw = localStorage.getItem('svgp_location');
    if (raw) {
      const parsed = JSON.parse(raw) as GlobalLocation;
      if (parsed && typeof parsed.city === 'string' && typeof parsed.lat === 'number') {
        return parsed;
      }
    }
  } catch {
    // Ignore storage error
  }
  return GLOBAL_LOCATIONS[0];
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

  const [activeRoomId, setActiveRoomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || GLOBAL_ROOM_ID;
  });
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);
  const [fallbackHistory, setFallbackHistory] = useState<AnnouncedRaceResult[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const autoInitRef = useRef(false);

  // Synced high-frequency clock (150ms) for smooth 10-min schedule, 10s countdown & 5-min race timers
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now() + serverTimeOffsetMs);
    }, 150);
    return () => window.clearInterval(id);
  }, [serverTimeOffsetMs]);

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

  const performJoin = useCallback(
    (targetRoomId: string, circuitOverride?: string) => {
      const cleanName = playerName.trim() || 'Apex Racer';
      const targetCircuit = circuitOverride || selectedCircuitId;
      setActiveRoomId(targetRoomId);
      setHasJoinedRoom(true);
      clearAgenticEvent();
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
      window.history.replaceState({}, '', url);
    },
    [
      clearAgenticEvent,
      joinRoom,
      playerName,
      selectedCircuitId,
      selectedLocation,
      selectedVehicleId,
    ]
  );

  const handleJoinGlobalGp = useCallback(() => {
    unlockAudio();
    performJoin(GLOBAL_ROOM_ID);
  }, [performJoin, unlockAudio]);

  const handleCreatePrivateRoom = useCallback(async () => {
    unlockAudio();
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circuitId: selectedCircuitId, type: 'private' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.roomId) {
        performJoin(data.roomId, selectedCircuitId);
      }
    } catch {
      // Network error ignored
    }
  }, [performJoin, selectedCircuitId, unlockAudio]);

  const handleStartSoloPractice = useCallback(async () => {
    unlockAudio();
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circuitId: selectedCircuitId, type: 'practice' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.roomId) {
        performJoin(data.roomId, selectedCircuitId);
      }
    } catch {
      // Network error ignored
    }
  }, [performJoin, selectedCircuitId, unlockAudio]);

  // Handle direct invite URL (?room=...) or ?autostart=1 on first connection
  useEffect(() => {
    if (!connected || autoInitRef.current) return;
    autoInitRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const autostart = params.get('autostart') === '1';

    if (autostart) {
      handleStartSoloPractice();
    } else if (roomParam && roomParam.trim()) {
      performJoin(roomParam.trim());
    }
  }, [connected, handleStartSoloPractice, performJoin]);

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
      if (hasJoinedRoom && roomState?.phase === 'lobby') {
        selectCircuit(id);
      }
    },
    [hasJoinedRoom, roomState?.phase, selectCircuit, unlockAudio]
  );

  const handleReturnToLobby = useCallback(() => {
    setHasJoinedRoom(false);
    setActiveRoomId(GLOBAL_ROOM_ID);
    clearAgenticEvent();
    window.history.replaceState({}, '', '/');
    // Reconnect quietly to global room only when user chooses to join again;
    // leaving a private/practice room moves them back to the global lobby state.
    if (roomState && roomState.roomId !== GLOBAL_ROOM_ID) {
      joinRoom({
        roomId: GLOBAL_ROOM_ID,
        circuitId: selectedCircuitId,
        name: playerName.trim() || 'Apex Racer',
        locationName: `${selectedLocation.city}, ${selectedLocation.country}`,
        locationCode: selectedLocation.code,
        originLat: selectedLocation.lat,
        originLng: selectedLocation.lng,
        vehicleId: selectedVehicleId,
      });
      setHasJoinedRoom(true);
    }
  }, [
    clearAgenticEvent,
    joinRoom,
    playerName,
    roomState,
    selectedCircuitId,
    selectedLocation,
    selectedVehicleId,
  ]);

  // Determine current active screen phase
  const currentPhase = useMemo<'lobby' | 'countdown' | 'racing' | 'results'>(() => {
    if (!hasJoinedRoom || !roomState) return 'lobby';
    return roomState.phase;
  }, [hasJoinedRoom, roomState]);

  // Expose live app state on body dataset for deterministic telemetry & inspection
  useEffect(() => {
    document.body.dataset.state = currentPhase;
  }, [currentPhase]);

  // Keep city soundtrack style synced with active circuit across all 27 cities
  const activeCityId = roomState?.circuitId ?? selectedCircuitId;
  useEffect(() => {
    setCityMusic(activeCityId);
  }, [activeCityId, setCityMusic]);

  // Switch adaptive music intensity between ambient menu groove and full race arrangement
  useEffect(() => {
    setMusicIntensity(currentPhase === 'countdown' || currentPhase === 'racing' ? 'race' : 'menu');
  }, [currentPhase, setMusicIntensity]);

  // Play celebratory fanfare when 5-minute official results are announced
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
        roomState?.roomType === 'private' &&
        (roomState.participants.length ?? 0) >= 2
      ) {
        launchNow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPhase, hasJoinedRoom, handleJoinGlobalGp, launchNow, roomState]);

  const activeRoomUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return activeRoomId === GLOBAL_ROOM_ID
      ? `${window.location.origin}/?room=${GLOBAL_ROOM_ID}`
      : `${window.location.origin}/?room=${encodeURIComponent(activeRoomId)}`;
  }, [activeRoomId]);

  const recentHistory = roomState?.history?.length ? roomState.history : fallbackHistory;

  if (currentPhase === 'results' && roomState?.lastAnnouncement) {
    return (
      <ResultsAnnouncement
        result={roomState.lastAnnouncement}
        myParticipantId={participantId}
        nextGlobalSlotAtMs={roomState.nextGlobalSlotAtMs}
        nowMs={nowMs}
        onReturnToLobby={handleReturnToLobby}
      />
    );
  }

  if ((currentPhase === 'countdown' || currentPhase === 'racing') && roomState) {
    return (
      <RaceCockpit
        roomState={roomState}
        myParticipantId={participantId}
        nowMs={nowMs}
        selectedVehicleId={selectedVehicleId}
        muted={muted}
        onToggleMute={toggleMute}
        musicMuted={musicMuted}
        onToggleMusic={toggleMusic}
        onUpdateEngine={updateEngine}
        onPlayBoost={playBoost}
        onLeaveRace={handleReturnToLobby}
        onFinishEarly={finishNow}
        onSendTelemetry={sendTelemetry}
        lastAgenticEvent={lastAgenticEvent}
        onAgenticHoldStart={sendAgenticHoldStart}
        onAgenticHoldCancel={sendAgenticHoldCancel}
        onAgenticHoldCommit={sendAgenticHoldCommit}
        onAgenticDisengage={sendAgenticDisengage}
        onCountdownBeep={playCountdownBeep}
        onAgenticChargeTick={playAgenticChargeTick}
        onAgenticEngagedAudio={playAgenticEngaged}
      />
    );
  }

  return (
    <LobbyScreen
      connected={connected}
      nowMs={nowMs}
      roomState={hasJoinedRoom ? roomState : null}
      myParticipantId={participantId}
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
      onLaunchPrivateRace={launchNow}
      onToggleReady={setReady}
      onStartSoloPractice={handleStartSoloPractice}
      isJoinedToRoom={hasJoinedRoom}
      activeRoomUrl={activeRoomUrl}
      recentHistory={recentHistory}
      muted={muted}
      onToggleMute={toggleMute}
      musicMuted={musicMuted}
      onToggleMusic={toggleMusic}
    />
  );
}
