/**
 * Enhanced Procedural Web Audio Racing Sound Engine:
 *  - Multi-harmonic engine note with realistic 6-speed gear-shift RPM steps
 *  - Aerodynamic wind rush at high speed
 *  - Filtered tire screech when drifting
 *  - Nitro afterburner chirp, collision thud, countdown beeps, and victory fanfare
 */
import { RaceMusic } from './music.js';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.initialized = false;
    this.lastGear = 1;

    this.engineOsc = null;
    this.engineSub = null;
    this.engineHarm = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.driftGain = null;
    this.windGain = null;
    this.music = null;
    this.musicEnabled = true;
    try {
      this.musicEnabled = localStorage.getItem('hydrace-music') !== 'off';
    } catch (e) {
      /* storage unavailable */
    }
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.32 : 0.0;
    this.master.connect(this.ctx.destination);

    // Rich 3-oscillator V8/GT engine synth
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 380;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 65;

    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = 'triangle';
    this.engineSub.frequency.value = 32;

    this.engineHarm = this.ctx.createOscillator();
    this.engineHarm.type = 'square';
    this.engineHarm.frequency.value = 130;
    const harmGain = this.ctx.createGain();
    harmGain.gain.value = 0.16;

    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineHarm.connect(harmGain);
    harmGain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    this.engineOsc.start();
    this.engineSub.start();
    this.engineHarm.start();

    // Shared white-noise buffer for drift tire screech + high-speed wind rush
    const bufSize = this.ctx.sampleRate * 1.5;
    const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    // Tire screech chain
    const noise1 = this.ctx.createBufferSource();
    noise1.buffer = noiseBuf;
    noise1.loop = true;
    const driftFilter = this.ctx.createBiquadFilter();
    driftFilter.type = 'bandpass';
    driftFilter.frequency.value = 1520;
    driftFilter.Q.value = 3.6;
    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.value = 0.0;
    noise1.connect(driftFilter);
    driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.master);
    noise1.start();

    // High-speed wind rush chain
    const noise2 = this.ctx.createBufferSource();
    noise2.buffer = noiseBuf;
    noise2.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 460;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;
    noise2.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noise2.start();

    // Background soundtrack on its own bus (independent of the SFX toggle)
    try {
      this.music = new RaceMusic(this.ctx, this.ctx.destination, this.musicStyleId || 'mumbai');
      this.music.setEnabled(this.musicEnabled);
      this.music.start();
    } catch (e) {
      console.warn('Music unavailable', e);
      this.music = null;
    }

    this.initialized = true;
  }

  /** Each city has its own local soundtrack; switches on the next bar line. */
  setMusicStyle(cityId) {
    this.musicStyleId = cityId;
    if (this.music) this.music.setStyle(cityId);
  }

  setMusicIntensity(level) {
    if (this.music) this.music.setIntensity(level);
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    try {
      localStorage.setItem('hydrace-music', on ? 'on' : 'off');
    } catch (e) {
      /* storage unavailable */
    }
    if (this.music) this.music.setEnabled(on);
  }

  /** Pause audio while the tab is hidden so the music scheduler can't stutter. */
  setSuspended(hidden) {
    if (!this.ctx) return;
    if (hidden && this.ctx.state === 'running') this.ctx.suspend();
    else if (!hidden && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.32 : 0.0, this.ctx.currentTime, 0.04);
    }
  }

  updateEngine(speedRatio, isDrifting, isBoosting, active) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (!active) {
      this.engineGain.gain.setTargetAtTime(0.0, now, 0.08);
      this.driftGain.gain.setTargetAtTime(0.0, now, 0.05);
      this.windGain.gain.setTargetAtTime(0.0, now, 0.08);
      return;
    }

    const clamped = Math.max(0, Math.min(1.45, speedRatio));
    const gear = Math.min(6, Math.max(1, Math.floor(clamped * 5.2) + 1));
    const gearMin = (gear - 1) / 5.2;
    const rpmInGear = Math.max(0, Math.min(1.2, (clamped - gearMin) * 4.2));

    if (gear > this.lastGear && clamped > 0.25) {
      this._playShiftPop();
    }
    this.lastGear = gear;

    const baseFreq = 56 + gear * 15 + rpmInGear * 88 + (isBoosting ? 36 : 0);
    this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.04);
    this.engineHarm.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(340 + clamped * 640 + (isBoosting ? 350 : 0), now, 0.06);
    this.engineGain.gain.setTargetAtTime(0.14 + clamped * 0.15, now, 0.05);

    this.driftGain.gain.setTargetAtTime(isDrifting && clamped > 0.25 ? 0.17 : 0.0, now, 0.05);
    const windLevel = Math.max(0, clamped - 0.55) * (isBoosting ? 0.26 : 0.14);
    this.windGain.gain.setTargetAtTime(windLevel, now, 0.08);
  }

  _playShiftPop() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.06);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playBeep(high = false) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 880 : 440, now);
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (high ? 0.38 : 0.18));
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playBoost() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.22);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playBump(intensity = 0.6) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
    g.gain.setValueAtTime(Math.min(0.4, intensity * 0.35), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playFanfare() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const now = this.ctx.currentTime + idx * 0.11;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.26, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(g);
      g.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.38);
    });
  }
}
