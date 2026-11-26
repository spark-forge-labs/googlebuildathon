import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Fingerprint, Hand, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  AGENTIC_REQUIRED_HOLD_MS,
  MIN_PARTICIPANTS_FOR_RACE,
  type AgenticInputType,
  type RaceTimeline,
} from '../game/raceSchedule';
import type { AgenticServerEvent } from '../types/race';

interface AgenticIgnitionPadProps {
  timeline: RaceTimeline;
  participantCount: number;
  agenticMode: boolean;
  agenticDecision: string;
  lastAgenticEvent: AgenticServerEvent | null;
  onHoldStart: (inputType: AgenticInputType, isTrusted: boolean, pressure?: number) => void;
  onHoldCancel: () => void;
  onHoldCommit: (isTrusted: boolean, pressure?: number) => void;
  onDisengage: () => void;
  onChargeTick: (progress01: number) => void;
}

export function AgenticIgnitionPad({
  timeline,
  participantCount,
  agenticMode,
  agenticDecision,
  lastAgenticEvent,
  onHoldStart,
  onHoldCancel,
  onHoldCommit,
  onDisengage,
  onChargeTick,
}: AgenticIgnitionPadProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0..1
  const [localError, setLocalError] = useState<string | null>(null);
  const [livePressure, setLivePressure] = useState<number | null>(null);

  const holdActiveRef = useRef(false);
  const holdStartedAtPerfRef = useRef<number>(0);
  const holdInputTypeRef = useRef<AgenticInputType>('desktop_key_p');
  const holdTrustedRef = useRef<boolean>(false);
  const holdPeakPressureRef = useRef<number | undefined>(undefined);
  const rafRef = useRef<number | null>(null);
  const lastSoundStepRef = useRef<number>(0);

  const hasEnoughRacers = participantCount >= MIN_PARTICIPANTS_FOR_RACE;
  const windowOpen = timeline.isAgenticWindowOpen;
  const windowClosedForever =
    timeline.phase === 'racing' && !timeline.isAgenticWindowOpen && !agenticMode;

  const cancelHold = useCallback(
    (notifyServer: boolean) => {
      if (!holdActiveRef.current) return;
      holdActiveRef.current = false;
      setIsHolding(false);
      setHoldProgress(0);
      setLivePressure(null);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (notifyServer) {
        onHoldCancel();
      }
    },
    [onHoldCancel]
  );

  const beginHold = useCallback(
    (inputType: AgenticInputType, isTrusted: boolean, pressure?: number) => {
      if (agenticMode || holdActiveRef.current) return;

      // Strict anti-automation check: even if an AI agent / script clicks or dispatches P,
      // reject any non-trusted synthetic event immediately.
      if (!isTrusted) {
        setLocalError('Automation blocked — physical human hand press required.');
        onHoldStart(inputType, false, pressure);
        return;
      }

      if (!hasEnoughRacers) {
        setLocalError(`Agentic Mode requires ${MIN_PARTICIPANTS_FOR_RACE}+ participants.`);
        return;
      }

      if (!windowOpen) {
        setLocalError(
          timeline.agenticWindowOpensInMs > 0
            ? `Hold window opens in ${(timeline.agenticWindowOpensInMs / 1000).toFixed(1)}s (3s before start).`
            : 'Activation window closed (5s after race start).'
        );
        return;
      }

      setLocalError(null);
      holdActiveRef.current = true;
      holdStartedAtPerfRef.current = performance.now();
      holdInputTypeRef.current = inputType;
      holdTrustedRef.current = isTrusted;
      holdPeakPressureRef.current = pressure;
      lastSoundStepRef.current = 0;

      setIsHolding(true);
      setHoldProgress(0);
      if (typeof pressure === 'number' && pressure > 0) {
        setLivePressure(pressure);
      }

      if (navigator.vibrate) {
        navigator.vibrate(25);
      }

      onHoldStart(inputType, true, pressure);

      const tick = () => {
        if (!holdActiveRef.current) return;
        const elapsed = performance.now() - holdStartedAtPerfRef.current;
        const pct = Math.min(1, elapsed / AGENTIC_REQUIRED_HOLD_MS);
        setHoldProgress(pct);

        const soundStep = Math.floor(pct * 5);
        if (soundStep > lastSoundStepRef.current) {
          lastSoundStepRef.current = soundStep;
          onChargeTick(pct);
          if (navigator.vibrate) navigator.vibrate(15);
        }

        if (elapsed >= AGENTIC_REQUIRED_HOLD_MS) {
          holdActiveRef.current = false;
          setIsHolding(false);
          setHoldProgress(1);
          if (navigator.vibrate) navigator.vibrate([40, 30, 70]);
          onHoldCommit(holdTrustedRef.current, holdPeakPressureRef.current);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [
      agenticMode,
      hasEnoughRacers,
      windowOpen,
      timeline.agenticWindowOpensInMs,
      onHoldStart,
      onHoldCommit,
      onChargeTick,
    ]
  );

  const beginHoldRef = useRef(beginHold);
  beginHoldRef.current = beginHold;
  const cancelHoldRef = useRef(cancelHold);
  cancelHoldRef.current = cancelHold;

  // Cleanup active RAF only when component unmounts
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // Desktop physical key "P" listener (strictly requires event.isTrusted)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyP' && e.key !== 'p' && e.key !== 'P') return;
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      beginHoldRef.current('desktop_key_p', e.isTrusted);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyP' && e.key !== 'p' && e.key !== 'P') return;
      if (holdActiveRef.current && holdInputTypeRef.current === 'desktop_key_p') {
        cancelHoldRef.current(true);
      }
    };

    const onBlur = () => cancelHoldRef.current(true);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const isTouch = e.pointerType === 'touch';
    const pressure = isTouch ? (e.pressure > 0 ? e.pressure : 0.65) : undefined;
    beginHold(isTouch ? 'touch_hard_press' : 'pointer_hold', e.isTrusted, pressure);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!holdActiveRef.current || e.pointerType !== 'touch') return;
    if (e.pressure > 0) {
      setLivePressure(e.pressure);
      holdPeakPressureRef.current = Math.max(holdPeakPressureRef.current ?? 0, e.pressure);
    }
  };

  const handlePointerUpOrLeave = () => {
    if (holdActiveRef.current && holdInputTypeRef.current !== 'desktop_key_p') {
      cancelHold(true);
    }
  };

  const statusNotice =
    localError ||
    (lastAgenticEvent?.status === 'rejected' || lastAgenticEvent?.status === 'cancelled'
      ? lastAgenticEvent.message
      : null);

  // SVG radial progress ring math
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - (agenticMode ? 1 : holdProgress));

  if (agenticMode) {
    return (
      <div
        data-testid="agentic-pad"
        data-agentic-state="engaged"
        className="w-full max-w-[330px] bg-[#0e141c]/95 border border-emerald-500/40 rounded-xl p-3.5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Agentic Mode Active</span>
              </div>
              <p className="text-xs text-slate-300 truncate mt-0.5">{agenticDecision}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDisengage}
            className="px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            Manual
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="agentic-pad"
      data-agentic-state={
        !hasEnoughRacers
          ? 'locked-solo'
          : windowOpen
            ? isHolding
              ? 'holding'
              : 'window-open'
            : windowClosedForever
              ? 'window-closed'
              : 'standby'
      }
      className={`w-full max-w-[340px] rounded-xl p-3.5 border transition-colors ${
        windowOpen
          ? 'bg-[#121620]/95 border-amber-400/60 shadow-xl'
          : 'bg-[#0e121a]/92 border-white/10'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Interactive Physical Hard-Press / Hold Button */}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrLeave}
          onPointerCancel={handlePointerUpOrLeave}
          onPointerLeave={handlePointerUpOrLeave}
          disabled={!hasEnoughRacers || windowClosedForever}
          aria-label="Hold for 2 seconds or press and hold P key to activate Agentic Mode"
          className={`relative w-16 h-16 rounded-full flex items-center justify-center shrink-0 select-none touch-none transition-transform cursor-pointer disabled:cursor-not-allowed ${
            windowOpen
              ? isHolding
                ? 'bg-amber-500/20 scale-95'
                : 'bg-amber-500/10 hover:bg-amber-500/20 animate-hold-pulse'
              : 'bg-slate-800/70 opacity-65'
          }`}
        >
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="4"
            />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke={isHolding ? '#10b981' : '#f59e0b'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          {!hasEnoughRacers || windowClosedForever ? (
            <Lock className="w-5 h-5 text-slate-400" />
          ) : isHolding ? (
            <Fingerprint className="w-6 h-6 text-emerald-400" />
          ) : (
            <Hand className="w-6 h-6 text-amber-400" />
          )}
        </button>

        {/* Clear timing & hand-press status copy */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">Agentic Mode</span>
            {windowOpen && (
              <span className="font-mono-tabular text-[11px] font-semibold text-amber-300">
                {(timeline.agenticWindowRemainingMs / 1000).toFixed(1)}s left
              </span>
            )}
          </div>

          {!hasEnoughRacers ? (
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              Locked in solo mode · Requires {MIN_PARTICIPANTS_FOR_RACE}+ participants.
            </p>
          ) : isHolding ? (
            <div className="mt-1">
              <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                <span className="text-emerald-300 font-semibold">Verifying human press…</span>
                <span className="text-white">
                  {((holdProgress * AGENTIC_REQUIRED_HOLD_MS) / 1000).toFixed(2)}s / 2.00s
                </span>
              </div>
              {livePressure !== null && (
                <p className="text-[10px] text-slate-400 mt-0.5 font-mono-tabular">
                  Touch force: {Math.round(livePressure * 100)}%
                </p>
              )}
            </div>
          ) : windowOpen ? (
            <p className="text-[11px] text-amber-200/90 mt-0.5 leading-snug">
              Hold <kbd className="px-1 py-0.5 bg-white/10 rounded text-[10px] font-mono text-white">P</kbd> or hard-press pad for <strong>2.0s</strong> now. Physical hand press required.
            </p>
          ) : windowClosedForever ? (
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              Activation window closed (+5s passed) · Racing in Manual Drive.
            </p>
          ) : (
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              Opens in{' '}
              <span className="font-mono-tabular text-amber-300 font-semibold">
                {(timeline.agenticWindowOpensInMs / 1000).toFixed(1)}s
              </span>{' '}
              (3s before start to 5s after). Hold <kbd className="px-1 bg-white/10 rounded text-[10px] font-mono">P</kbd> / Hard Press 2s.
            </p>
          )}
        </div>
      </div>

      {statusNotice && (
        <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5 text-[11px] text-rose-300">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}
    </div>
  );
}
