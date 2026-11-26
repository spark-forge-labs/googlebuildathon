import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Flag,
  Globe,
  Hand,
  History,
  LocateFixed,
  MapPin,
  Moon,
  Music,
  Play,
  Share2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CIRCUITS,
  GLOBAL_LOCATIONS,
  VEHICLES,
  getCircuitById,
  getVehicleById,
  type GlobalLocation,
} from '../game/circuits';
import { buildCircuitMetrics } from '../game/circuitMath';
import { MIN_PARTICIPANTS_FOR_RACE, formatClockMs } from '../game/raceSchedule';
import { getCircuitImage } from '../data/circuitImages';
import type { AnnouncedRaceResult, RoomStatePayload } from '../types/race';
import { GlobalLeaderboardOverlay } from './GlobalLeaderboardOverlay';

interface LobbyScreenProps {
  connected: boolean;
  nowMs: number;
  roomState: RoomStatePayload | null;
  myParticipantId: string | null;
  playerName: string;
  onPlayerNameChange: (v: string) => void;
  selectedCircuitId: string;
  onSelectCircuit: (id: string) => void;
  selectedVehicleId: string;
  onSelectVehicle: (id: string) => void;
  selectedLocation: GlobalLocation;
  onSelectLocation: (loc: GlobalLocation) => void;
  onDetectGpsLocation: () => void;
  detectingGps: boolean;
  onJoinGlobalGp: () => void;
  onCreatePrivateRoom: () => void;
  onLaunchPrivateRace: () => void;
  onToggleReady: (ready: boolean) => void;
  onStartSoloPractice: () => void;
  isJoinedToRoom: boolean;
  activeRoomUrl: string;
  recentHistory: AnnouncedRaceResult[];
  muted: boolean;
  onToggleMute: () => void;
  musicMuted: boolean;
  onToggleMusic: () => void;
}

type RegionFilter = 'all' | 'india' | 'world';

export function LobbyScreen({
  connected,
  nowMs,
  roomState,
  myParticipantId,
  playerName,
  onPlayerNameChange,
  selectedCircuitId,
  onSelectCircuit,
  selectedVehicleId,
  onSelectVehicle,
  selectedLocation,
  onSelectLocation,
  onDetectGpsLocation,
  detectingGps,
  onJoinGlobalGp,
  onCreatePrivateRoom,
  onLaunchPrivateRace,
  onToggleReady,
  onStartSoloPractice,
  isJoinedToRoom,
  activeRoomUrl,
  recentHistory,
  muted,
  onToggleMute,
  musicMuted,
  onToggleMusic,
}: LobbyScreenProps) {
  const [nameError, setNameError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showWeeklyLeaderboard, setShowWeeklyLeaderboard] = useState(false);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');

  const indiaCount = useMemo(() => CIRCUITS.filter((c) => c.region === 'india').length, []);
  const worldCount = useMemo(() => CIRCUITS.filter((c) => c.region === 'world').length, []);
  const filteredCircuits = useMemo(() => {
    if (regionFilter === 'all') return CIRCUITS;
    return CIRCUITS.filter((c) => c.region === regionFilter);
  }, [regionFilter]);

  const activeCircuit = getCircuitById(roomState?.circuitId ?? selectedCircuitId);
  const circuitHero = getCircuitImage(activeCircuit.id);
  const lapMeters = useMemo(
    () => Math.round(buildCircuitMetrics(activeCircuit.waypoints).totalLapMeters),
    [activeCircuit]
  );

  const nextSlotMs = roomState?.nextGlobalSlotAtMs ?? Math.ceil(nowMs / 600_000) * 600_000;
  const msUntilNextGlobal = Math.max(0, nextSlotMs - nowMs);
  const nextSlotClockStr = useMemo(() => {
    const d = new Date(nextSlotMs);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [nextSlotMs]);

  const participants = roomState?.participants ?? [];
  const me = participants.find((p) => p.id === myParticipantId) ?? null;
  const hasMinRacers = participants.length >= MIN_PARTICIPANTS_FOR_RACE;
  const isPrivateRoom = roomState?.roomType === 'private';

  const validateName = (): boolean => {
    if (!playerName.trim()) {
      setNameError('Enter your racer name before joining the grid.');
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleJoinGlobal = () => {
    if (!validateName()) return;
    onJoinGlobalGp();
  };

  const handleCreatePrivate = () => {
    if (!validateName()) return;
    onCreatePrivateRoom();
  };

  const handleSolo = () => {
    if (!validateName()) return;
    onStartSoloPractice();
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(activeRoomUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#090b10] text-slate-100 flex flex-col">
      {/* Full-bleed Photorealistic Hero Stage */}
      <section className="relative w-full min-h-[340px] lg:min-h-[390px] flex flex-col justify-between overflow-hidden border-b border-white/10">
        <img
          src={circuitHero}
          alt={`${activeCircuit.name} real-world Grand Prix street circuit`}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-[#090b10]/65 to-[#090b10]/35" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090b10]/90 via-[#090b10]/35 to-transparent" />

        {/* Top minimalist status bar inside hero */}
        <div className="relative z-20 w-full max-w-7xl mx-auto px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
              <rect x="2" y="2" width="28" height="28" rx="6" fill="#f59e0b" />
              <path d="M8 22L14 10H19L13 22H8Z" fill="#090b10" />
              <path d="M16 22L20 14H24L20 22H16Z" fill="#090b10" />
            </svg>
            <span className="font-display text-base sm:text-xl font-bold tracking-wide text-white whitespace-nowrap">
              STREETVIEW GP
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-300">
            <div className="hidden md:flex items-center gap-1.5 mr-1">
              <span
                className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
              />
              <span>{connected ? 'Live Race Server Synced' : 'Connecting…'}</span>
            </div>
            <button
              type="button"
              onClick={onToggleMute}
              title={muted ? 'Unmute engine & SFX' : 'Mute engine & SFX'}
              aria-label={muted ? 'Unmute engine and sound effects' : 'Mute engine and sound effects'}
              aria-pressed={!muted}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                muted
                  ? 'text-slate-400 bg-[#090b10]/75 border-white/10 hover:bg-[#141a26]'
                  : 'text-slate-100 bg-[#090b10]/80 border-white/20 hover:bg-[#141a26]'
              }`}
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="hidden sm:inline">{muted ? 'SFX Off' : 'SFX On'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleMusic}
              title={musicMuted ? 'Enable city soundtrack' : 'Mute city soundtrack'}
              aria-label={musicMuted ? 'Enable city soundtrack' : 'Mute city soundtrack'}
              aria-pressed={!musicMuted}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                musicMuted
                  ? 'text-slate-400 bg-[#090b10]/75 border-white/10 hover:bg-[#141a26]'
                  : 'text-amber-200 bg-amber-500/15 border-amber-400/40 hover:bg-amber-500/25'
              }`}
            >
              <Music className={`w-3.5 h-3.5 shrink-0 ${musicMuted ? 'text-slate-500' : 'text-amber-400'}`} />
              <span className="hidden sm:inline">{musicMuted ? 'Music Off' : 'City Music'}</span>
            </button>
            <button
              type="button"
              data-testid="open-weekly-leaderboard-btn"
              onClick={() => setShowWeeklyLeaderboard(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[38px] text-xs font-semibold text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Weekly Top 10</span>
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[38px] text-xs font-medium text-slate-200 bg-[#090b10]/75 hover:bg-[#141a26] border border-white/15 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Race Results ({recentHistory.length})</span>
              <span className="sm:hidden">Results ({recentHistory.length})</span>
            </button>
          </div>
        </div>

        {/* Hero Title & Synchronized 10-Minute Global Clock */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-8 pt-6 sm:pt-12 pb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-amber-400 tracking-wide mb-2">
              {activeCircuit.name} · {activeCircuit.country} · {(lapMeters / 1000).toFixed(2)} km Real GPS Loop
              {activeCircuit.night ? ' · Night Race' : ''}
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold text-white tracking-tight leading-[1.08] [text-wrap:balance]">
              Real Streets. Global 10-Minute Grand Prix.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mt-3 max-w-xl leading-relaxed">
              Race live across {CIRCUITS.length} real-world street circuits in India &amp; around the globe with 3D landmarks, Google Maps 3D Hybrid, live Street View, V8 engine audio, and bespoke city soundtracks.
            </p>
          </div>

          {/* Synchronized 10-Min Grand Prix Countdown Block */}
          <div className="bg-[#0e121a]/92 border border-white/12 rounded-xl px-5 py-4 min-w-[280px] sm:min-w-[320px] shrink-0">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Next Global Start ({nextSlotClockStr})
              </span>
              <span className="font-mono-tabular text-slate-300">Every 10 min</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <div
                data-testid="next-race-clock"
                className="font-mono-tabular text-4xl font-bold text-white tracking-tight"
              >
                {formatClockMs(msUntilNextGlobal)}
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold text-white font-mono-tabular">
                  {participants.length} / {MIN_PARTICIPANTS_FOR_RACE}+ Racers
                </div>
                <div className={hasMinRacers ? 'text-emerald-400' : 'text-amber-400'}>
                  {hasMinRacers ? 'Grid Ready to Launch' : 'Waiting for 2+ drivers'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main 1440px Grid: Left Configuration & Circuits | Right Live Global Grid & Rules */}
      <main className="w-full max-w-7xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Left Column (7 cols): Driver Identity, Location, Circuit & Vehicle Selection */}
        <div className="lg:col-span-7 space-y-8">
          {/* 01. Driver Profile & Origin Location */}
          <section aria-labelledby="driver-setup-heading">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 mb-3">
              <h2 id="driver-setup-heading" className="font-display text-lg font-semibold text-white">
                01. Driver &amp; Origin Location
              </h2>
              <span className="text-xs text-slate-400">Shown live on map &amp; results</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="racer-name-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Racer Name
                </label>
                <input
                  id="racer-name-input"
                  type="text"
                  maxLength={20}
                  value={playerName}
                  onChange={(e) => {
                    onPlayerNameChange(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Enter your racing name"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#131823] border border-white/12 focus:border-amber-400 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors"
                />
                {nameError && (
                  <p className="text-xs text-rose-400 mt-1.5" role="alert">
                    {nameError}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="origin-location-select" className="text-xs font-medium text-slate-300">
                    Joining From (Location)
                  </label>
                  <button
                    type="button"
                    onClick={onDetectGpsLocation}
                    disabled={detectingGps}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 cursor-pointer disabled:opacity-50"
                  >
                    <LocateFixed className="w-3 h-3" />
                    <span>{detectingGps ? 'Locating…' : 'Use My GPS'}</span>
                  </button>
                </div>
                <select
                  id="origin-location-select"
                  value={selectedLocation.id}
                  onChange={(e) => {
                    const found = GLOBAL_LOCATIONS.find((l) => l.id === e.target.value);
                    if (found) onSelectLocation(found);
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#131823] border border-white/12 focus:border-amber-400 rounded-lg text-sm text-white focus:outline-none transition-colors"
                >
                  {GLOBAL_LOCATIONS.map((loc) => (
                    <option key={loc.id} value={loc.id} className="bg-[#131823]">
                      {loc.city}, {loc.country} ({loc.code})
                    </option>
                  ))}
                  {!GLOBAL_LOCATIONS.some((l) => l.id === selectedLocation.id) && (
                    <option value={selectedLocation.id} className="bg-[#131823]">
                      {selectedLocation.city} ({selectedLocation.code})
                    </option>
                  )}
                </select>
              </div>
            </div>
          </section>

          {/* 02. Real-World Street Circuit Selector with Photorealistic Imagery (All 27 Cities) */}
          <section aria-labelledby="circuit-select-heading">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <h2 id="circuit-select-heading" className="font-display text-lg font-semibold text-white">
                  02. Real-World Street Circuit ({CIRCUITS.length} Cities)
                </h2>
                <span className="text-xs text-slate-400">
                  3D Landmarks · City Soundtracks · Google Maps 3D + Street View
                </span>
              </div>

              {/* Region Filter Tabs */}
              <div
                role="tablist"
                aria-label="Filter circuits by region"
                className="inline-flex items-center p-1 bg-[#111621] border border-white/10 rounded-lg self-start sm:self-auto"
              >
                {(
                  [
                    { id: 'all', label: `All (${CIRCUITS.length})` },
                    { id: 'india', label: `India GP (${indiaCount})` },
                    { id: 'world', label: `World Tour (${worldCount})` },
                  ] as const
                ).map((tab) => {
                  const active = regionFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setRegionFilter(tab.id)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[388px] overflow-y-auto pr-1">
              {filteredCircuits.map((c) => {
                const isSelected = c.id === activeCircuit.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-circuit-id={c.id}
                    onClick={() => onSelectCircuit(c.id)}
                    aria-pressed={isSelected}
                    className={`group relative text-left rounded-xl overflow-hidden border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      isSelected
                        ? 'border-amber-400 ring-1 ring-amber-400/40'
                        : 'border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-[#131823]">
                      <img
                        src={getCircuitImage(c.id)}
                        alt={`${c.name} street circuit`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-[#090b10]/35 to-transparent" />
                      {c.night && (
                        <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#090b10]/85 border border-fuchsia-400/45 text-[10px] font-semibold text-fuchsia-200">
                          <Moon className="w-2.5 h-2.5 text-fuchsia-300" />
                          <span>Night GP</span>
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2.5 right-2.5">
                        <div className="font-display text-sm font-bold text-white leading-tight truncate">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-slate-300 truncate">
                          {c.nativeName} · {c.country}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 03. Supercar Selection */}
          <section aria-labelledby="vehicle-select-heading">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 mb-3">
              <h2 id="vehicle-select-heading" className="font-display text-lg font-semibold text-white">
                03. Choose Your Car
              </h2>
              <span className="text-xs text-slate-400">Tuned for street circuit physics</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VEHICLES.map((v) => {
                const isSelected = v.id === selectedVehicleId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSelectVehicle(v.id)}
                    aria-pressed={isSelected}
                    className={`p-3.5 rounded-xl text-left border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#161c29] border-amber-400'
                        : 'bg-[#11151f] border-white/8 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-display text-sm font-bold text-white">{v.name}</span>
                      <span className="font-mono-tabular text-xs text-slate-300">
                        {v.topSpeedKmh} km/h
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{v.category}</p>
                    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono-tabular">
                      <div>
                        <div className="text-slate-400">SPD {v.stats.speed}</div>
                        <div className="h-1 bg-white/10 rounded mt-1 overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{ width: `${v.stats.speed}%`, backgroundColor: v.accentColor }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">ACC {v.stats.accel}</div>
                        <div className="h-1 bg-white/10 rounded mt-1 overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{ width: `${v.stats.accel}%`, backgroundColor: v.accentColor }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">GRP {v.stats.grip}</div>
                        <div className="h-1 bg-white/10 rounded mt-1 overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{ width: `${v.stats.grip}%`, backgroundColor: v.accentColor }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column (5 cols): Live Global Grid, Launch Controls & Agentic Protocol */}
        <aside className="lg:col-span-5 space-y-6">
          {/* Primary Action & Live Grid Panel */}
          <div className="bg-[#111621] border border-white/10 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-white/8">
              <div>
                <h2 className="font-display text-base font-bold text-white">
                  {roomState?.roomLabel ?? 'Global 10-Min Grand Prix'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  5:00 race duration · Includes 10-second countdown · Results announced at 05:00
                </p>
              </div>
              <Users className="w-5 h-5 text-amber-400 shrink-0" />
            </div>

            {roomState?.notice && (
              <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded-lg px-3 py-2.5">
                {roomState.notice}
              </div>
            )}

            {/* Primary CTA Stack */}
            <div className="space-y-2.5">
              {!isJoinedToRoom ? (
                <button
                  type="button"
                  data-start="true"
                  onClick={handleJoinGlobal}
                  className="w-full min-h-[48px] px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm tracking-wide rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Flag className="w-4 h-4" />
                  <span>Join Global 10-Min Grand Prix</span>
                </button>
              ) : isPrivateRoom ? (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    data-start="true"
                    disabled={!hasMinRacers}
                    onClick={onLaunchPrivateRace}
                    className="w-full min-h-[48px] px-5 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-display font-bold text-sm tracking-wide rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4" />
                    <span>
                      {hasMinRacers
                        ? `Launch Synced 5-Min Race (${participants.length} Racers)`
                        : `Waiting for 2+ Racers (${participants.length}/2)`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleReady(!me?.ready)}
                    className={`w-full min-h-[42px] px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      me?.ready
                        ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                        : 'bg-white/5 border-white/12 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {me?.ready ? 'Marked Ready · Auto-starts when all ready' : 'Mark Ready'}
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex items-center justify-between gap-2">
                  <span>
                    Queued on Global Grid for <strong>{nextSlotClockStr}</strong> ({formatClockMs(msUntilNextGlobal)})
                  </span>
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleCreatePrivate}
                  className="min-h-[44px] px-3.5 py-2.5 bg-[#181f2e] hover:bg-[#1f283b] border border-white/12 text-xs font-semibold text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Create Synced Room</span>
                </button>
                <button
                  type="button"
                  onClick={handleSolo}
                  className="min-h-[44px] px-3.5 py-2.5 bg-[#131823] hover:bg-[#1b2232] border border-white/10 text-xs font-medium text-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-slate-400" />
                  <span>Solo Practice Drive</span>
                </button>
              </div>
            </div>

            {/* Shareable Multi-Location Invite Link */}
            <div className="pt-3 border-t border-white/8">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>Invite drivers from any location</span>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Copy Invite Link'}</span>
                </button>
              </div>
              <div className="px-3 py-2 rounded-lg bg-[#090b10] border border-white/8 text-[11px] font-mono-tabular text-slate-400 truncate">
                {activeRoomUrl}
              </div>
            </div>

            {/* Live Connected Multi-Location Participants */}
            <div className="pt-3 border-t border-white/8">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>Racers on the Grid ({participants.length})</span>
                </h3>
                <span className="text-[11px] text-slate-400">Multi-location live roster</span>
              </div>

              {participants.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-white/10 rounded-lg">
                  No racers queued yet. Enter your name and join the Global 10-Min Grand Prix or create a Synced Room.
                </div>
              ) : (
                <ul className="divide-y divide-white/8">
                  {participants.map((p) => (
                    <li key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">
                          {p.name} {p.id === myParticipantId && <span className="text-amber-400">(You)</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{p.locationName}</span>
                          <span>·</span>
                          <span>{getVehicleById(p.vehicleId).name}</span>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-medium shrink-0 ${
                          p.ready || roomState?.roomType === 'global'
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {roomState?.roomType === 'global'
                          ? 'Queued'
                          : p.ready
                            ? 'Ready'
                            : 'Waiting'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Human Hand-Press Agentic Mode Rules Summary */}
          <div className="bg-[#111621] border border-white/10 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-white font-display text-sm font-bold">
              <Hand className="w-4 h-4 text-amber-400" />
              <span>Human-Verified Agentic Mode Protocol</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <li>
                <strong className="text-white">2+ Participants Required:</strong> Agentic Mode unlocks only in live multiplayer races with at least 2 participants.
              </li>
              <li>
                <strong className="text-white">Strict 8-Second Window:</strong> Initiate your hold between <strong>3 seconds before</strong> and <strong>5 seconds after</strong> the race green light.
              </li>
              <li>
                <strong className="text-white">Manual 2-Second Hand Press:</strong> Hold <kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-[10px] text-white">P</kbd> on desktop or hard-press the ignition pad on mobile for <strong>2.0 full seconds</strong>. Automated scripts and AI agents cannot bypass physical verification.
              </li>
            </ul>
          </div>
        </aside>
      </main>

      {/* Past Race Results Modal */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-modal-title"
        >
          <div className="w-full max-w-2xl bg-[#111621] border border-white/15 rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h2 id="history-modal-title" className="font-display text-lg font-bold text-white">
                  Announced Grand Prix Results
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                aria-label="Close race results archive"
                className="w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              {recentHistory.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  No completed 5-minute Grand Prix results recorded yet. Complete a multiplayer race to publish official standings here.
                </p>
              ) : (
                recentHistory.map((race) => (
                  <div
                    key={race.raceId}
                    className="p-4 rounded-xl bg-[#0b0f17] border border-white/8 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-display font-bold text-white">
                        {race.circuitName} GP · {race.roomLabel}
                      </span>
                      <span className="font-mono-tabular text-slate-400">
                        {new Date(race.finishedAtMs).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="divide-y divide-white/6 text-xs">
                      {race.standings.slice(0, 5).map((s) => (
                        <div key={s.id} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono-tabular font-bold text-amber-400 w-5">
                              #{s.rank}
                            </span>
                            <span className="font-medium text-white truncate">{s.name}</span>
                            <span className="text-slate-400 truncate">· {s.locationName}</span>
                          </div>
                          <div className="font-mono-tabular text-slate-300 shrink-0">
                            {s.distanceKm.toFixed(2)} km · {s.controlMode}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Global Weekly Top 10 Leaderboard Overlay */}
      <GlobalLeaderboardOverlay
        open={showWeeklyLeaderboard}
        onClose={() => setShowWeeklyLeaderboard(false)}
        currentPlayerName={playerName}
      />
    </div>
  );
}
