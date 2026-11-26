import { useCallback, useEffect, useRef, useState } from 'react';
import { SoundEngine } from '../game/audio.js';

export type MusicIntensity = 'menu' | 'race';

export function useWebAudio() {
  const engineRef = useRef<SoundEngine | null>(null);
  const desiredCityRef = useRef<string>('hyderabad');
  const desiredIntensityRef = useRef<MusicIntensity>('menu');

  const getEngine = useCallback((): SoundEngine => {
    if (!engineRef.current) {
      engineRef.current = new SoundEngine();
    }
    return engineRef.current;
  }, []);

  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hydrace-music') === 'off';
    } catch {
      return false;
    }
  });

  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const ensureUnlocked = useCallback((): SoundEngine | null => {
    if (typeof window === 'undefined') return null;
    const engine = getEngine();
    engine.setMusicStyle(desiredCityRef.current);
    if (!engine.initialized) {
      try {
        engine.init();
      } catch {
        return null;
      }
      engine.setEnabled(!mutedRef.current);
      engine.setMusicIntensity(desiredIntensityRef.current);
    } else if (engine.ctx && engine.ctx.state === 'suspended') {
      engine.ctx.resume().catch(() => {});
    }
    return engine;
  }, [getEngine]);

  // Auto-unlock browser Web Audio on first user interaction & pause cleanly when tab is hidden
  useEffect(() => {
    const onFirstGesture = () => {
      ensureUnlocked();
    };
    const onVisibility = () => {
      if (engineRef.current) {
        engineRef.current.setSuspended(document.hidden);
      }
    };

    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('keydown', onFirstGesture, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      document.removeEventListener('visibilitychange', onVisibility);
      if (engineRef.current) {
        engineRef.current.updateEngine(0, false, false, false);
        engineRef.current.setSuspended(true);
      }
    };
  }, [ensureUnlocked]);

  const toggleMute = useCallback(() => {
    const engine = ensureUnlocked();
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (engine) {
        engine.setEnabled(!next);
      } else if (engineRef.current) {
        engineRef.current.setEnabled(!next);
      }
      return next;
    });
  }, [ensureUnlocked]);

  const toggleMusic = useCallback(() => {
    const engine = ensureUnlocked();
    setMusicMuted((prev) => {
      const next = !prev;
      const target = engine ?? getEngine();
      target.setMusicEnabled(!next);
      return next;
    });
  }, [ensureUnlocked, getEngine]);

  const setCityMusic = useCallback(
    (cityId: string) => {
      desiredCityRef.current = cityId;
      const engine = getEngine();
      engine.setMusicStyle(cityId);
    },
    [getEngine]
  );

  const setMusicIntensity = useCallback(
    (level: MusicIntensity) => {
      desiredIntensityRef.current = level;
      if (engineRef.current) {
        engineRef.current.setMusicIntensity(level);
      }
    },
    []
  );

  const updateEngine = useCallback(
    (speedRatio: number, isDrifting: boolean, isBoosting: boolean, active: boolean) => {
      const engine = engineRef.current;
      if (!engine || !engine.initialized) return;
      engine.updateEngine(speedRatio, isDrifting, isBoosting, active);
    },
    []
  );

  const playBoost = useCallback(() => {
    const engine = ensureUnlocked();
    if (!engine || mutedRef.current) return;
    engine.playBoost();
  }, [ensureUnlocked]);

  const playCountdownBeep = useCallback(
    (isGo: boolean) => {
      const engine = ensureUnlocked();
      if (!engine || mutedRef.current) return;
      engine.playBeep(isGo);
    },
    [ensureUnlocked]
  );

  const playTone = useCallback(
    (freq: number, durationSec: number, type: OscillatorType = 'sine', gainPeak = 0.09) => {
      const engine = ensureUnlocked();
      if (!engine || mutedRef.current || !engine.ctx) return;
      const ctx = engine.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
      osc.connect(gain);
      gain.connect(engine.master ?? ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationSec + 0.02);
    },
    [ensureUnlocked]
  );

  const playAgenticChargeTick = useCallback(
    (progress01: number) => {
      playTone(320 + progress01 * 560, 0.07, 'sine', 0.12);
    },
    [playTone]
  );

  const playAgenticEngaged = useCallback(() => {
    playTone(523.25, 0.16, 'triangle', 0.18);
    window.setTimeout(() => playTone(659.25, 0.16, 'triangle', 0.18), 90);
    window.setTimeout(() => playTone(1046.5, 0.32, 'sine', 0.2), 180);
  }, [playTone]);

  const playResultsFanfare = useCallback(() => {
    const engine = ensureUnlocked();
    if (!engine || mutedRef.current) return;
    engine.playFanfare();
  }, [ensureUnlocked]);

  return {
    muted,
    toggleMute,
    musicMuted,
    toggleMusic,
    unlockAudio: ensureUnlocked,
    setCityMusic,
    setMusicIntensity,
    updateEngine,
    playBoost,
    playCountdownBeep,
    playAgenticChargeTick,
    playAgenticEngaged,
    playResultsFanfare,
  };
}
