import React from 'react';
import { Bot, Clock, Flag, MapPin, RotateCcw, Trophy, User } from 'lucide-react';
import { getVehicleById } from '../game/circuits';
import { formatClockMs } from '../game/raceSchedule';
import { getCircuitImage } from '../data/circuitImages';
import type { AnnouncedRaceResult } from '../types/race';

interface ResultsAnnouncementProps {
  result: AnnouncedRaceResult;
  myParticipantId: string | null;
  nextGlobalSlotAtMs: number;
  nowMs: number;
  onReturnToLobby: () => void;
}

export function ResultsAnnouncement({
  result,
  myParticipantId,
  nextGlobalSlotAtMs,
  nowMs,
  onReturnToLobby,
}: ResultsAnnouncementProps) {
  const winner = result.standings[0];
  const myResult = result.standings.find((s) => s.id === myParticipantId) ?? null;
  const msUntilNext = Math.max(0, nextGlobalSlotAtMs - nowMs);
  const heroImg = getCircuitImage(result.circuitId);

  return (
    <div
      data-testid="results-announcement"
      className="min-h-screen w-full bg-[#090b10] text-slate-100 flex flex-col"
    >
      {/* Winner Banner with Photorealistic Circuit Backdrop */}
      <div className="relative w-full min-h-[260px] flex items-end border-b border-white/10 overflow-hidden">
        <img
          src={heroImg}
          alt={`${result.circuitName} Grand Prix finish`}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-[#090b10]/75 to-[#090b10]/45" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 py-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-amber-400 tracking-wide mb-2 flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5" />
              <span>Official 5-Minute Race Results Announced · {result.circuitName} GP</span>
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold text-white leading-tight">
              {winner ? `${winner.name} Wins ${result.circuitName} GP` : 'Checkered Flag'}
            </h1>
            {winner && (
              <p className="text-sm text-slate-300 mt-2">
                Joining from <strong className="text-white">{winner.locationName}</strong> ·{' '}
                <span className="font-mono-tabular">{winner.distanceKm.toFixed(2)} km</span> covered ·{' '}
                {winner.controlMode === 'AGENTIC' ? 'Agentic Mode' : 'Manual Drive'}
              </p>
            )}
          </div>

          <div className="bg-[#111621]/92 border border-white/12 rounded-xl px-4 py-3 shrink-0">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Next 10-Min Global Start</span>
            </div>
            <div className="font-mono-tabular text-2xl font-bold text-white mt-0.5">
              {formatClockMs(msUntilNext)}
            </div>
          </div>
        </div>
      </div>

      {/* Standings & Personal Telemetry */}
      <main className="w-full max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-6 flex-1">
        {myResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-[#111621] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-400">Your Finish</div>
              <div className="font-display text-2xl font-bold text-amber-400 font-mono-tabular mt-1">
                #{myResult.rank} / {result.standings.length}
              </div>
            </div>
            <div className="bg-[#111621] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-400">Distance Covered</div>
              <div className="font-display text-2xl font-bold text-white font-mono-tabular mt-1">
                {myResult.distanceKm.toFixed(2)} km
              </div>
            </div>
            <div className="bg-[#111621] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-400">Top Speed</div>
              <div className="font-display text-2xl font-bold text-white font-mono-tabular mt-1">
                {myResult.topSpeedKmh} km/h
              </div>
            </div>
            <div className="bg-[#111621] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-400">Control Mode</div>
              <div className="font-display text-2xl font-bold text-emerald-400 mt-1">
                {myResult.controlMode === 'AGENTIC' ? 'Agentic' : 'Manual'}
              </div>
            </div>
          </div>
        )}

        {/* Complete Official Multi-Location Standings Table */}
        <section className="bg-[#111621] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <h2 className="font-display text-base font-bold text-white">
                Final Classification
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono-tabular">
              {result.participantCount} Participants · 5:00 Official Time
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-slate-400">
                  <th className="py-3 px-4 font-medium">Pos</th>
                  <th className="py-3 px-4 font-medium">Driver</th>
                  <th className="py-3 px-4 font-medium">Location</th>
                  <th className="py-3 px-4 font-medium">Vehicle</th>
                  <th className="py-3 px-4 font-medium">Mode</th>
                  <th className="py-3 px-4 font-medium text-right">Distance</th>
                  <th className="py-3 px-4 font-medium text-right">Top Speed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {result.standings.map((row) => {
                  const isMe = row.id === myParticipantId;
                  return (
                    <tr
                      key={row.id}
                      className={isMe ? 'bg-amber-500/10' : 'hover:bg-white/[0.02]'}
                    >
                      <td className="py-3 px-4 font-mono-tabular font-bold text-amber-400">
                        #{row.rank}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {row.name} {isMe && <span className="text-xs text-amber-400">(You)</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          <span>{row.locationName}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {getVehicleById(row.vehicleId).name}
                      </td>
                      <td className="py-3 px-4">
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
                      <td className="py-3 px-4 text-right font-mono-tabular text-white">
                        {row.distanceKm.toFixed(2)} km
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-300">
                        {row.topSpeedKmh} km/h
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            data-start="true"
            onClick={onReturnToLobby}
            className="min-h-[46px] px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Return to Global Lobby</span>
          </button>
        </div>
      </main>
    </div>
  );
}
