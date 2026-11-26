import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Calendar,
  Flag,
  Gauge,
  MapPin,
  RefreshCw,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { CIRCUITS, getVehicleById } from '../game/circuits';
import {
  formatLapTimeMs,
  type WeeklyLeaderboardResponse,
} from '../game/weeklyLeaderboard';

interface GlobalLeaderboardOverlayProps {
  open: boolean;
  onClose: () => void;
  currentPlayerName: string;
}

export function GlobalLeaderboardOverlay({
  open,
  onClose,
  currentPlayerName,
}: GlobalLeaderboardOverlayProps) {
  const [selectedCircuit, setSelectedCircuit] = useState<string>('all');
  const [data, setData] = useState<WeeklyLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (circuitId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/leaderboard/weekly?circuit=${encodeURIComponent(circuitId)}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = (await res.json()) as WeeklyLeaderboardResponse;
      setData(payload);
    } catch {
      setError('Unable to load weekly leaderboard from the database. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchLeaderboard(selectedCircuit);
  }, [open, selectedCircuit, fetchLeaderboard]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const entries = data?.entries ?? [];
  const normalizedMe = currentPlayerName.trim().toLowerCase();

  return (
    <div
      data-testid="weekly-leaderboard-overlay"
      className="fixed inset-0 z-50 bg-black/78 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="weekly-leaderboard-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl bg-[#0f141e] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-[#131926] flex items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
              <h2
                id="weekly-leaderboard-title"
                className="font-display text-base sm:text-xl font-bold text-white"
              >
                <span className="hidden sm:inline">Global Weekly Leaderboard · Top 10 Fastest</span>
                <span className="sm:hidden">Weekly Top 10 Fastest</span>
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400/80" />
                <span>{data?.weekLabel ? `Week of ${data.weekLabel} (UTC)` : 'Current Week (UTC)'}</span>
              </span>
              {data && (
                <>
                  <span>·</span>
                  <span className="font-mono-tabular">
                    {data.totalRunsThisWeek} verified run{data.totalRunsThisWeek === 1 ? '' : 's'} this week
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchLeaderboard(selectedCircuit)}
              disabled={loading}
              aria-label="Refresh weekly leaderboard"
              className="min-h-[36px] px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close global weekly leaderboard"
              className="w-9 h-9 rounded-lg hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Circuit Filter Strip */}
        <div
          className="px-5 py-3 border-b border-white/8 bg-[#0b0f17] flex items-center gap-1.5 overflow-x-auto shrink-0"
          role="tablist"
          aria-label="Filter leaderboard by street circuit"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCircuit === 'all'}
            onClick={() => setSelectedCircuit('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              selectedCircuit === 'all'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-white/8'
            }`}
          >
            All Circuits
          </button>
          {CIRCUITS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={selectedCircuit === c.id}
              onClick={() => setSelectedCircuit(c.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedCircuit === c.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-white/8'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Leaderboard Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading && !data ? (
            <div className="space-y-2.5 py-4" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-lg bg-white/[0.04] border border-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => fetchLeaderboard(selectedCircuit)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Retry Database Fetch
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div
              data-testid="weekly-leaderboard-empty"
              className="py-12 px-4 text-center border border-dashed border-white/12 rounded-xl bg-[#0b0f17]/70 space-y-2"
            >
              <Flag className="w-7 h-7 text-amber-400/80 mx-auto" />
              <p className="text-sm font-semibold text-white">
                No verified runs recorded yet this week
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Finish a 5-minute Grand Prix or Synced Room race to log your official lap pace and top speed to the weekly global leaderboard.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/8 bg-[#0b0f17]">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400 bg-white/[0.02]">
                    <th className="py-3 px-3 sm:px-3.5 font-semibold">Rank</th>
                    <th className="py-3 px-3 sm:px-3.5 font-semibold">Driver</th>
                    <th className="py-3 px-3.5 font-semibold hidden md:table-cell">Origin</th>
                    <th className="py-3 px-3.5 font-semibold hidden sm:table-cell">Circuit &amp; Car</th>
                    <th className="py-3 px-3.5 font-semibold hidden sm:table-cell">Mode</th>
                    <th className="py-3 px-3.5 font-semibold text-right hidden sm:table-cell">Top Speed</th>
                    <th className="py-3 px-3 sm:px-3.5 font-semibold text-right">Pace / Lap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {entries.map((row, idx) => {
                    const rank = idx + 1;
                    const isMe =
                      normalizedMe.length > 0 &&
                      row.driverName.trim().toLowerCase() === normalizedMe;
                    const rankColor =
                      rank === 1
                        ? 'text-amber-400'
                        : rank === 2
                          ? 'text-slate-200'
                          : rank === 3
                            ? 'text-orange-400'
                            : 'text-slate-400';

                    return (
                      <tr
                        key={row.id}
                        data-testid="weekly-leaderboard-row"
                        className={isMe ? 'bg-amber-500/10' : 'hover:bg-white/[0.025]'}
                      >
                        <td className={`py-3 px-3 sm:px-3.5 font-mono-tabular font-bold ${rankColor}`}>
                          #{rank}
                        </td>
                        <td className="py-3 px-3 sm:px-3.5">
                          <div className="font-semibold text-white">
                            {row.driverName}{' '}
                            {isMe && <span className="text-[11px] text-amber-400">(You)</span>}
                          </div>
                          <div className="text-[11px] text-slate-400 md:hidden flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="truncate">
                              {row.locationName} · {row.circuitName}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-slate-300 hidden md:table-cell">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{row.locationName}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3.5 hidden sm:table-cell">
                          <div className="font-medium text-slate-200">{row.circuitName}</div>
                          <div className="text-[11px] text-slate-400">
                            {getVehicleById(row.vehicleId).name}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 hidden sm:table-cell">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              row.controlMode === 'AGENTIC' ? 'text-emerald-400' : 'text-slate-300'
                            }`}
                          >
                            {row.controlMode === 'AGENTIC' ? (
                              <Bot className="w-3.5 h-3.5" />
                            ) : (
                              <User className="w-3.5 h-3.5" />
                            )}
                            <span>{row.controlMode === 'AGENTIC' ? 'Agentic' : 'Manual'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono-tabular text-slate-200 whitespace-nowrap hidden sm:table-cell">
                          <span className="inline-flex items-center gap-1">
                            <Gauge className="w-3.5 h-3.5 text-amber-400/80" />
                            <span>{row.topSpeedKmh} km/h</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:px-3.5 text-right font-mono-tabular whitespace-nowrap">
                          <div className="font-bold text-white">{formatLapTimeMs(row.bestLapMs)}</div>
                          <div className="sm:hidden text-[11px] text-amber-300/90 mt-0.5">
                            {row.topSpeedKmh} km/h
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
