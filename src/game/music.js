/**
 * City soundtracks: original procedural music (no samples, no licensing).
 * Every circuit has its own local style (see musicStyles.js): Bollywood sitar in Mumbai,
 * garba in Ahmedabad, santoor in Srinagar, musette accordion in Paris, cumbia trumpets in
 * Mexico City, guzheng in Shanghai, khaen and phin in Bangkok... The original "Desh Drift"
 * (raag Khamaj, 126 BPM) is Mumbai's track.
 *
 * Works with a live AudioContext (lookahead scheduler) or an OfflineAudioContext
 * (scheduleRange) so the exact same track can be rendered into videos.
 */
import { getMusicStyle, buildChords, composeMelody, SCALES, degree } from './musicStyles.js';

const LOOP_BARS = 32;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// "Desh Drift" (Mumbai): D – C – G – A  (I – bVII – IV – V)
const DESH_CHORDS = [
  { root: 38, tones: [62, 66, 69, 74] },
  { root: 36, tones: [60, 64, 67, 72] },
  { root: 43, tones: [62, 67, 71, 74] },
  { root: 45, tones: [61, 64, 69, 73] },
];

// Sitar-style lead, 8 bars: [step, midi note, length in steps, meend?]
const DESH_MELODY = [
  [0, 69, 2], [2, 74, 2, 1], [4, 78, 4, 1], [8, 76, 2], [10, 74, 2], [12, 69, 4],
  [16, 67, 2], [18, 72, 2, 1], [20, 76, 4, 1], [24, 74, 2], [26, 72, 2], [28, 67, 4],
  [32, 71, 2], [34, 74, 2], [36, 79, 3, 1], [39, 78, 1], [40, 76, 2], [42, 74, 2], [44, 71, 4],
  [48, 69, 2], [50, 73, 2, 1], [52, 76, 4], [56, 79, 2], [58, 78, 2], [60, 76, 2], [62, 73, 2],
  [64, 74, 2, 1], [66, 78, 2], [68, 81, 4, 1], [72, 79, 2], [74, 78, 2], [76, 76, 2], [78, 74, 2],
  [80, 72, 2], [82, 76, 2], [84, 79, 4, 1], [88, 76, 2], [90, 74, 2], [92, 72, 4],
  [96, 74, 2], [98, 71, 2], [100, 67, 2], [102, 71, 2], [104, 74, 2], [106, 79, 2, 1], [108, 78, 2], [110, 76, 2],
  [112, 76, 4, 1], [116, 73, 2], [118, 69, 2], [120, 76, 2], [122, 79, 2], [124, 78, 2], [126, 76, 2],
];

export class RaceMusic {
  constructor(ctx, destination, styleId = 'mumbai') {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.3;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;
    this.out.connect(comp);
    comp.connect(destination || ctx.destination);

    // Shared noise buffer for hats, claps, risers, breath
    const len = Math.floor(ctx.sampleRate * 1.0);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 4294967296) * 2 - 1;
    }

    // Feedback delay for the lead (doubles as a spring reverb for surf guitar)
    this.delay = ctx.createDelay(1.0);
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 2400;
    this.delay.connect(delayTone);
    delayTone.connect(fb);
    fb.connect(this.delay);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    delayTone.connect(wet);
    wet.connect(this.out);

    this.intensity = [{ t: 0, level: 'menu' }];
    this.startTime = null;
    this.nextStep = 0;
    this.timer = null;
    this.enabled = true;
    this.level = 0.3;
    this.pendingStyle = null;
    this.applyStyle(getMusicStyle(styleId));
  }

  /** Switch to a city's style at the next bar line (immediately if nothing is playing yet). */
  setStyle(id) {
    const next = getMusicStyle(id);
    if (this.style && next.id === this.style.id) {
      this.pendingStyle = null;
      return;
    }
    if (this.startTime === null) this.applyStyle(next);
    else this.pendingStyle = next;
  }

  applyStyle(style) {
    this.style = style;
    this.meter = style.meter;
    this.stepDur = 60 / style.bpm / (style.triplet ? 3 : 4);
    this.beat = style.triplet ? 3 : 4;
    if (style.fixed === 'desh') {
      this.chords = DESH_CHORDS;
      this.melody = DESH_MELODY;
    } else {
      this.chords = buildChords(style);
      this.melody = composeMelody(style, this.chords);
    }
    this.melodyAt = new Map();
    for (const n of this.melody) this.melodyAt.set(n[0], n);
    this.delay.delayTime.setValueAtTime(Math.min(0.9, this.stepDur * 3), this.ctx.currentTime);
    this.lastLeadFreq = null;
  }

  /** 'menu' = drone, pad and light percussion; 'race' = full arrangement. */
  setIntensity(level, at = this.ctx.currentTime) {
    const last = this.intensity[this.intensity.length - 1];
    if (last.level !== level) this.intensity.push({ t: at, level });
  }

  levelAt(t) {
    let lv = 'menu';
    for (const e of this.intensity) if (e.t <= t) lv = e.level;
    return lv;
  }

  setEnabled(on) {
    this.enabled = on;
    this.out.gain.setTargetAtTime(on ? this.level : 0, this.ctx.currentTime, 0.15);
  }

  /** Live playback with a lookahead scheduler. */
  start() {
    if (this.timer) return;
    if (this.startTime === null) this.startTime = this.ctx.currentTime + 0.1;
    const tick = () => this.scheduleRange(this.ctx.currentTime, this.ctx.currentTime + 0.35);
    tick();
    this.timer = setInterval(tick, 60);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Schedules every step whose start falls in [from, to). Safe to call repeatedly. */
  scheduleRange(from, to) {
    if (this.startTime === null) this.startTime = from;
    for (;;) {
      let t = this.startTime + this.nextStep * this.stepDur;
      if (this.pendingStyle && this.nextStep % this.meter === 0) {
        // new city: restart the form from its intro on this bar line
        this.applyStyle(this.pendingStyle);
        this.pendingStyle = null;
        this.startTime = Math.max(t, from);
        this.nextStep = 0;
        t = this.startTime;
      }
      if (t >= to) break;
      if (t >= from - 0.05) this.scheduleStep(this.nextStep, t);
      this.nextStep++;
    }
  }

  scheduleStep(n, t0) {
    const st = this.style;
    const M = this.meter;
    const S = this.stepDur;
    const s = n % M;
    const bar = Math.floor(n / M) % LOOP_BARS;
    const chord = this.chords[bar % this.chords.length];
    const section = bar < 8 ? 'A' : bar < 24 ? 'B' : 'C';
    const breakdown = section === 'C' && bar < 28;
    const race = this.levelAt(t0) === 'race';
    const g = st.groove || {};
    // swing: push every other sixteenth late
    const t = g.swing && !st.triplet && s % 2 === 1 ? t0 + g.swing * S : t0;
    const onBeat = s % this.beat === 0;
    const beatIdx = Math.floor(s / this.beat);

    // ---- drone ----
    if (st.drone === 'tanpura' && onBeat) this.tanpura([st.root - 17, st.root - 12, st.root - 12, st.root - 24][beatIdx % 4], t);
    if (st.drone === 'ektara' && s % 2 === 0) this.pluck(st.root - 12 + (s % 8 === 4 ? 7 : 0), t, 0.03);
    if (st.drone === 'didge' && s === 0) this.didge(st.root - 24, t, M * S);
    if (st.drone === 'khaen' && s === 0) this.khaen(chord.tones, t, M * S);

    // ---- pad ----
    if (s === 0) this.pad(chord.tones, t, M * S, race ? 0.03 : 0.045);

    if (!race) {
      // Menu: soft shaker and the city's signature percussion, lightly
      if (s % 2 === 1) this.hat(t, 0.012, 0.03);
      const p = g.perc;
      if (p && p[1][s] !== undefined && (s === 0 || s % this.beat === 0 || s === M / 2 + 2)) this.perc(p[0], p[1][s], t, 0.45);
      if (g.ching && g.ching[s]) this.ching(g.ching[s], t, 0.4);
      return;
    }

    // ---- drums ----
    const has = (k) => g[k] && g[k].includes(s);
    if (!breakdown) {
      if (has('kick')) this.kick(t);
      if (has('clap') && (section !== 'A' || bar >= 4)) this.clap(t);
      if (has('snare') && (section !== 'A' || bar >= 4)) this.snare(t);
    }
    if (has('hatO')) this.hat(t, 0.05, 0.09);
    if (has('hatC')) this.hat(t, 0.022, 0.03);
    if (has('brush')) this.noiseHit(t, 'bandpass', 3200, 0.6, s % this.beat === 0 ? 0.05 : 0.025, 0.11);
    if (has('wood')) this.woodblock(t, s % this.beat === 0 ? 1 : 0.7);
    if (has('sticks')) this.woodblock(t, 0.6, 1750);
    if (has('tom')) this.tom(t, s === 0 ? 1 : 0.7);
    if (g.ching && g.ching[s]) this.ching(g.ching[s], t, 0.9);
    if (g.guira && g.guira[s]) this.guira(t, g.guira[s] === 'long');
    if (g.tasha && section !== 'A') this.noiseHit(t, 'bandpass', 3400, 1.2, s % 4 === 0 ? 0.09 : 0.04, 0.05);
    if (g.gong && s === 0 && bar % 4 === 0) this.gong(t);
    if (g.fill && bar % 4 === 3 && s >= M - 4) this.tom(t, 0.9, 150 - (s - (M - 4)) * 18);
    const p = g.perc;
    if (p && p[1][s] !== undefined && (section !== 'A' || bar >= 2)) this.perc(p[0], p[1][s], t, 0.9);

    // ---- bass ----
    if (!(breakdown && bar < 26)) this.bassLine(st.bass, s, chord, t, bar);

    // ---- accompaniment (B and C) ----
    if (section !== 'A') this.accompany(st.accomp, s, chord, t, bar);

    // ---- lead: two 8-bar phrases in B, again after the breakdown ----
    if (section === 'B' || (section === 'C' && bar >= 28)) {
      const local = ((bar - 8) % 8) * M + s;
      const note = this.melodyAt.get(local);
      if (note) {
        const lift = section === 'C' && st.fixed === 'desh' ? 12 : 0;
        this.lead(st.lead, note[1] + lift, t, note[2] * S, !!note[3]);
      }
    }

    // Riser into the drop at the end of the breakdown
    if (bar === 27 && s === 0) this.riser(t, M * S);
  }

  bassLine(kind, s, chord, t, bar) {
    const M = this.meter;
    const S = this.stepDur;
    const r = chord.root;
    const fifth = r + 7;
    switch (kind) {
      case 'roll':
        if (s % 2 === 0) this.bass(s % this.beat === 0 ? r : r + 12, t, S * 1.8);
        break;
      case 'offbeat':
        if (s % 4 === 2) this.bass(r, t, S * 1.7);
        break;
      case 'rolling16':
        if (s % 4 !== 0) this.bass(s % 4 === 2 ? r + 12 : r, t, S * 0.9);
        break;
      case 'boom':
        if (s === 0) this.bass(r, t, S * 3);
        if (s === M / 2) this.bass(fifth - 12 >= 31 ? fifth - 12 : fifth, t, S * 3);
        break;
      case 'tumbao':
        if (s === 0 || s === 8) this.bass(r, t, S * 2.5);
        if (s === 6 || s === 14) this.bass(fifth - 12 >= 31 ? fifth - 12 : fifth, t, S * 1.6);
        break;
      case 'waltz':
        if (s === 0) this.bass(r, t, S * 3.5);
        break;
      case 'walk': {
        if (s % 4 !== 0) break;
        const sc = SCALES[this.style.scale];
        const steps = [0, 2, 4, 5];
        const k = steps[(s / 4) % 4];
        this.bass(r + degree(sc, k) - degree(sc, 0), t, S * 3.6, 0.8);
        break;
      }
      case 'sub':
        if (s === 0 || s === 10) this.bass(r, t, S * (s === 0 ? 5 : 4));
        if (s === 7) this.bass(r + 12, t, S * 1.5);
        break;
      case '808':
        if (s === 0 || s === 7 || s === 10) this.sub808(s === 7 ? r + 12 : r, t, S * (s === 0 ? 6 : 3));
        break;
      case 'drone':
        if (s === 0) this.bass(r, t, S * M * 0.95, 0.6);
        break;
      default:
        break;
    }
  }

  accompany(kind, s, chord, t, bar) {
    const M = this.meter;
    const S = this.stepDur;
    switch (kind) {
      case 'arp': {
        const order = [0, 1, 2, 3, 2, 1, 2, 3];
        if (this.meter === 16 || s % 1 === 0) this.pluck(chord.tones[order[s % 8]] + 12, t, 0.026);
        break;
      }
      case 'stabs':
        if (s % this.beat === this.beat / 2 || (this.beat === 3 && s % 3 === 2)) this.stab(chord.tones, t, S * 1.2);
        break;
      case 'waltz':
        if (s === 4 || s === 8) this.stab(chord.tones, t, S * 2.4, 'accordion');
        break;
      case 'pompe':
        if (s === 4 || s === 12) this.stab(chord.tones, t, S * 1.4, 'guitar');
        break;
      case 'strum':
        if (s % 4 === 0 || s === 6 || s === 14) this.strum(chord.tones, t, S * 3);
        break;
      case 'rhodes':
        if (s === 0 || s === 6 || (s === 10 && bar % 2)) this.rhodesChord(chord.tones, t, S * 5);
        break;
      case 'banjo': {
        const roll = [0, 1, 2, 0, 1, 2, 0, 2];
        this.pluck(chord.tones[roll[s % 8]] + 12, t, 0.02, 'banjo');
        break;
      }
      default:
        break;
    }
  }

  /** Lead voice per city. */
  lead(kind, note, t, dur, orn) {
    switch (kind) {
      case 'sitar':
        return this.sitar(note, t, dur, orn);
      case 'veena':
        return this.veena(note, t, dur, orn);
      case 'santoor':
        return this.santoor(note, t, dur);
      case 'bansuri':
        return this.wind(note, t, dur, orn, { type: 'flute' });
      case 'nadaswaram':
        return this.wind(note, t, dur, orn, { type: 'reed', formant: 1500 });
      case 'sax':
        return this.wind(note - 12, t, dur, orn, { type: 'reed', formant: 900, breath: 0.03 });
      case 'trumpet':
        this.brass(note, t, dur);
        return this.brass(note + this.thirdAbove(note), t, dur, 0.55);
      case 'harmonium':
        return this.reeds(note, t, dur, 6);
      case 'accordion':
        return this.reeds(note, t, dur, 16);
      case 'sarangi':
      case 'erhu':
        return this.bowed(note, t, dur, kind === 'sarangi' ? 1300 : 1900);
      case 'tumbi':
        return this.plucked(note + 12, t, dur, { decay: 0.22, slide: 1, type: 'square', cutoff: 4200 });
      case 'guzheng':
        return this.plucked(note, t, dur, { decay: 1.1, bendDown: orn, tremolo: dur > this.stepDur * 3.5, type: 'triangle', cutoff: 3200 });
      case 'phin':
        return this.plucked(note, t, dur, { decay: 0.45, slide: orn ? 2 : 0, type: 'sawtooth', cutoff: 3600 });
      case 'twang':
        return this.plucked(note - 12, t, dur, { decay: 0.7, slide: orn ? 2 : 0, tremolo: this.style.id === 'sanfrancisco' && dur > this.stepDur * 2, type: 'sawtooth', cutoff: 2600, spring: true });
      case 'synth':
        return this.supersaw(note, t, dur);
      case 'bell':
        return this.bell(note + 12, t, dur);
      case 'mallet':
        return this.mallet(note, t);
      case 'acid':
        return this.acid(note - 12, t, dur);
      default:
        return this.sitar(note, t, dur, orn);
    }
  }

  thirdAbove(note) {
    const sc = SCALES[this.style.chordScale || this.style.scale];
    const pc = (((note - this.style.root) % 12) + 12) % 12;
    let i = sc.findIndex((v) => v === pc);
    if (i < 0) i = 0;
    return degree(sc, i + 2) - degree(sc, i);
  }

  // ---------- Instruments ----------
  env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  kick(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.9, 0.003, 0.32);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.4);
  }

  noiseHit(t, type, freq, q, peak, decay) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, peak, 0.002, decay);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  hat(t, peak, decay) {
    this.noiseHit(t, 'highpass', 7500, 0.7, peak, decay);
  }

  clap(t) {
    this.noiseHit(t, 'bandpass', 1500, 0.9, 0.22, 0.16);
    this.noiseHit(t + 0.012, 'bandpass', 1100, 1.2, 0.12, 0.12);
  }

  tabla(stroke, t, vol) {
    const c = this.ctx;
    const hit = (f0, f1, peak, decay, glide) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + glide);
      this.env(g, t, peak * vol, 0.002, decay);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + decay + 0.05);
    };
    if (stroke === 'ge' || stroke === 'dha') hit(92, 128, 0.42, 0.45, 0.22); // bayan with rising meend
    if (stroke === 'na' || stroke === 'dha') {
      hit(620, 590, 0.16, 0.16, 0.08);
      hit(1240, 1180, 0.05, 0.08, 0.05);
    }
    if (stroke === 'ti') hit(780, 740, 0.1, 0.07, 0.04);
    if (stroke === 'ka') this.noiseHit(t, 'bandpass', 900, 2, 0.06 * vol, 0.04);
  }

  tanpura(note, t) {
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 1.6);
    this.env(g, t, 0.05, 0.02, 2.6);
    for (const det of [-4, 4]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(note);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 2.8);
    }
    f.connect(g).connect(this.out);
  }

  pad(tones, t, dur, vol) {
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const n of tones.slice(0, 3)) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n - 12);
      o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    f.connect(g).connect(this.out);
  }

  bass(note, t, dur, vol = 1) {
    const c = this.ctx;
    const o = c.createOscillator();
    const sub = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = 'sawtooth';
    sub.type = 'sine';
    o.frequency.value = midi(note);
    sub.frequency.value = midi(note);
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    this.env(g, t, 0.2 * vol, 0.004, dur);
    o.connect(f);
    sub.connect(f);
    f.connect(g).connect(this.out);
    o.start(t);
    sub.start(t);
    o.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  pluck(note, t, vol, kind = 'square') {
    const c = this.ctx;
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = kind === 'banjo' ? 'sawtooth' : 'square';
    o.frequency.value = midi(note);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(kind === 'banjo' ? 5200 : 3200, t);
    f.frequency.exponentialRampToValueAtTime(kind === 'banjo' ? 900 : 500, t + 0.12);
    this.env(g, t, vol, 0.002, kind === 'banjo' ? 0.2 : 0.14);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** Sitar-like lead: bright buzzy pluck, optional meend (slide up from a tone below), vibrato. */
  sitar(note, t, dur, meend) {
    const c = this.ctx;
    const freq = midi(note);
    const g = c.createGain();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 320;
    const jawari = c.createBiquadFilter(); // the buzzing bridge resonance
    jawari.type = 'peaking';
    jawari.frequency.value = 2600;
    jawari.Q.value = 2.5;
    jawari.gain.value = 9;
    const vib = c.createOscillator();
    const vibAmt = c.createGain();
    vib.frequency.value = 5.5;
    vibAmt.gain.value = freq * 0.006;
    vib.connect(vibAmt);
    const decay = Math.max(0.5, dur * 1.6);
    this.env(g, t, 0.075, 0.004, decay);
    for (const [type, mul, det] of [['sawtooth', 1, 0], ['square', 2, 5]]) {
      const o = c.createOscillator();
      o.type = type;
      const target = freq * mul;
      if (meend) {
        o.frequency.setValueAtTime(target * Math.pow(2, -2 / 12), t);
        o.frequency.exponentialRampToValueAtTime(target, t + 0.07);
      } else {
        o.frequency.setValueAtTime(target, t);
      }
      o.detune.value = det;
      vibAmt.connect(o.frequency);
      const og = c.createGain();
      og.gain.value = type === 'square' ? 0.25 : 1;
      o.connect(og).connect(hp);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
    vib.start(t);
    vib.stop(t + decay + 0.05);
    hp.connect(jawari).connect(g);
    g.connect(this.out);
    g.connect(this.delay);
  }

  // ---------- More percussion ----------
  tone(t, f0, f1, peak, decay, glide = 0.05, type = 'sine') {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + glide);
    this.env(g, t, peak, 0.002, decay);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  snare(t) {
    this.noiseHit(t, 'bandpass', 1900, 0.8, 0.2, 0.15);
    this.tone(t, 220, 160, 0.12, 0.08);
  }

  woodblock(t, vol = 1, f = 1250) {
    this.tone(t, f, f * 0.97, 0.12 * vol, 0.05, 0.02, 'triangle');
  }

  tom(t, vol = 1, f = 140) {
    this.tone(t, f, f * 0.62, 0.35 * vol, 0.28, 0.2);
  }

  ching(kind, t, vol = 1) {
    const open = kind === 'ching';
    for (const f of [3150, 4720, 6050]) this.tone(t, f, f * 0.995, 0.025 * vol, open ? 0.45 : 0.05, 0.3);
  }

  guira(t, long) {
    // metal scraper: a burst of rapid scrapes
    const n = long ? 5 : 2;
    for (let i = 0; i < n; i++) this.noiseHit(t + i * 0.022, 'highpass', 5200, 0.8, long ? 0.05 : 0.04, 0.03);
  }

  gong(t) {
    for (const [f, a] of [[98, 0.06], [149, 0.04], [211, 0.03], [287, 0.02]]) this.tone(t, f, f * 0.99, a, 2.8, 2.5);
  }

  /** Regional hand drums. */
  perc(kit, stroke, t, vol) {
    switch (kit) {
      case 'tabla':
        return this.tabla(stroke, t, vol);
      case 'dholak':
        if (stroke === 'dh') this.tone(t, 85, 115, 0.4 * vol, 0.35, 0.18);
        if (stroke === 'ta') {
          this.tone(t, 420, 380, 0.14 * vol, 0.09);
          this.noiseHit(t, 'bandpass', 1500, 1.5, 0.08 * vol, 0.05);
        }
        if (stroke === 'tin') this.tone(t, 720, 690, 0.1 * vol, 0.12);
        return;
      case 'dhol':
        if (stroke === 'dagga') {
          this.tone(t, 70, 46, 0.55 * vol, 0.42, 0.15);
          this.noiseHit(t, 'lowpass', 300, 0.7, 0.18 * vol, 0.08);
        } else {
          this.noiseHit(t, 'highpass', 2200, 0.8, 0.16 * vol, 0.05);
          this.tone(t, 900, 820, 0.06 * vol, 0.05);
        }
        return;
      case 'mridangam':
        if (stroke === 'thom') this.tone(t, 110, 92, 0.42 * vol, 0.3, 0.12);
        if (stroke === 'tha') this.tone(t, 340, 320, 0.14 * vol, 0.07);
        if (stroke === 'dhi') this.tone(t, 520, 515, 0.12 * vol, 0.45, 0.3);
        if (stroke === 'nam') this.tone(t, 660, 655, 0.1 * vol, 0.5, 0.3);
        return;
      case 'parai':
        if (stroke === 'dub') this.tone(t, 125, 95, 0.4 * vol, 0.25, 0.1);
        else {
          this.noiseHit(t, 'bandpass', 1250, 1.2, 0.14 * vol, 0.06);
          this.tone(t, 290, 260, 0.1 * vol, 0.06);
        }
        return;
      case 'chenda': {
        const acc = stroke === 'CHEN' ? 1 : 0.45;
        this.noiseHit(t, 'bandpass', 2600, 1.4, 0.13 * vol * acc, 0.04);
        this.tone(t, 760, 700, 0.06 * vol * acc, 0.04);
        return;
      }
      case 'khol':
        if (stroke === 'lo') this.tone(t, 92, 120, 0.36 * vol, 0.4, 0.2);
        else this.tone(t, 540, 530, 0.11 * vol, 0.35, 0.25);
        return;
      case 'tumbak':
        if (stroke === 'dum') this.tone(t, 105, 88, 0.36 * vol, 0.3, 0.12);
        else this.tone(t, 820, 790, 0.09 * vol, 0.06);
        return;
      default:
        return undefined;
    }
  }

  // ---------- Drones & chords ----------
  didge(note, t, dur) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(note);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    const lfo = c.createOscillator();
    const lfoAmt = c.createGain();
    lfo.frequency.value = 60 / this.style.bpm * 2; // the "wah" breathes with the beat
    lfoAmt.gain.value = 260;
    f.frequency.value = 420;
    lfo.connect(lfoAmt).connect(f.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.15);
    g.gain.setValueAtTime(0.09, t + dur - 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  khaen(tones, t, dur) {
    // free-reed mouth organ: sustained chord with a pulsing breath
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.08);
    g.gain.setValueAtTime(0.045, t + dur - 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const trem = c.createOscillator();
    const tremAmt = c.createGain();
    trem.frequency.value = 60 / this.style.bpm * 4;
    tremAmt.gain.value = 0.015;
    trem.connect(tremAmt).connect(g.gain);
    for (const n of [tones[0] - 12, tones[0], tones[2]]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = midi(n);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    trem.start(t);
    trem.stop(t + dur + 0.05);
    f.connect(g).connect(this.out);
  }

  stab(tones, t, dur, voice = 'organ') {
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = voice === 'guitar' ? 2400 : 1800;
    this.env(g, t, voice === 'accordion' ? 0.05 : 0.04, 0.006, dur);
    for (const n of tones.slice(0, 3)) {
      for (const det of voice === 'accordion' ? [-10, 10] : [0]) {
        const o = c.createOscillator();
        o.type = voice === 'guitar' ? 'sawtooth' : 'square';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
    f.connect(g).connect(this.out);
  }

  strum(tones, t, dur) {
    tones.slice(0, 4).forEach((n, i) => this.plucked(n - 12, t + i * 0.012, dur, { decay: 0.5, type: 'sawtooth', cutoff: 2200, vol: 0.035 }));
  }

  rhodesChord(tones, t, dur) {
    tones.slice(0, 4).forEach((n) => this.rhodes(n - 12, t, dur, 0.035));
  }

  rhodes(note, t, dur, vol = 0.06) {
    const c = this.ctx;
    const g = c.createGain();
    this.env(g, t, vol, 0.004, Math.max(0.6, dur * 1.2));
    const trem = c.createOscillator();
    const tremAmt = c.createGain();
    trem.frequency.value = 4.2;
    tremAmt.gain.value = vol * 0.25;
    trem.connect(tremAmt).connect(g.gain);
    for (const [mul, a, d] of [[1, 1, 1], [2, 0.18, 0.5], [7, 0.12, 0.05]]) {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine';
      o.frequency.value = midi(note) * mul;
      this.env(og, t, a, 0.002, Math.max(0.6, dur * 1.2) * d);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur * 1.3 + 0.1);
    }
    trem.start(t);
    trem.stop(t + dur * 1.3 + 0.1);
    g.connect(this.out);
  }

  sub808(note, t, dur) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(midi(note + 12), t);
    o.frequency.exponentialRampToValueAtTime(midi(note), t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.38, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(2.2 * x);
    }
    shaper.curve = curve;
    o.connect(shaper).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- Lead voices ----------
  /** Veena: warm plucked strings, gamaka slide into the note. */
  veena(note, t, dur, orn) {
    this.plucked(note, t, dur, { decay: Math.max(0.8, dur * 1.8), slide: orn ? 2 : 0, type: 'sawtooth', cutoff: 2200, vol: 0.085, vibrato: 0.004 });
  }

  /** Santoor: hammered dulcimer, tremolo strikes on long notes. */
  santoor(note, t, dur) {
    const strikes = Math.max(1, Math.round(dur / (this.stepDur * 0.5)));
    for (let k = 0; k < strikes; k++) {
      const tt = t + k * this.stepDur * 0.5;
      const v = 0.07 * Math.pow(0.82, k);
      for (const [mul, type, a] of [[1, 'triangle', 1], [2, 'sine', 0.3], [3, 'sine', 0.12]]) {
        this.tone(tt, midi(note) * mul, midi(note) * mul * 0.999, v * a, 0.35, 0.3, type);
      }
    }
  }

  /** Flutes and double reeds (bansuri, nadaswaram/shehnai, sax). */
  wind(note, t, dur, orn, { type, formant = 1500, breath = 0.012 }) {
    const c = this.ctx;
    const freq = midi(note);
    const g = c.createGain();
    const atk = type === 'flute' ? 0.06 : 0.03;
    const rel = 0.12;
    const peak = type === 'flute' ? 0.09 : 0.06;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setValueAtTime(peak * 0.85, t + Math.max(atk, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + rel);
    const vib = c.createOscillator();
    const vibAmt = c.createGain();
    vib.frequency.value = type === 'flute' ? 5 : 6;
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(freq * (type === 'flute' ? 0.006 : 0.009), t + Math.min(0.3, dur));
    vib.connect(vibAmt);
    const oscs = type === 'flute' ? [['sine', 1, 1], ['triangle', 1, 0.3]] : [['sawtooth', 1, 1], ['square', 1, 0.4]];
    const f = c.createBiquadFilter();
    if (type === 'flute') {
      f.type = 'lowpass';
      f.frequency.value = 3200;
    } else {
      f.type = 'bandpass';
      f.frequency.value = formant;
      f.Q.value = 1.1;
    }
    for (const [ot, mul, a] of oscs) {
      const o = c.createOscillator();
      o.type = ot;
      const target = freq * mul;
      if (orn && this.lastLeadFreq) {
        o.frequency.setValueAtTime(this.lastLeadFreq * mul, t);
        o.frequency.exponentialRampToValueAtTime(target, t + 0.09);
      } else if (orn) {
        o.frequency.setValueAtTime(target * Math.pow(2, -1 / 12), t);
        o.frequency.exponentialRampToValueAtTime(target, t + 0.07);
      } else o.frequency.setValueAtTime(target, t);
      vibAmt.connect(o.frequency);
      const og = c.createGain();
      og.gain.value = a;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + rel + 0.05);
    }
    // breath noise
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const bf = c.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = freq * 2;
    bf.Q.value = 2;
    const bg = c.createGain();
    this.env(bg, t, breath, 0.02, Math.min(0.25, dur));
    src.connect(bf).connect(bg).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.3);
    vib.start(t);
    vib.stop(t + dur + rel + 0.05);
    f.connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    this.lastLeadFreq = freq;
  }

  /** Mariachi trumpet: brassy filter swell and wide vibrato. */
  brass(note, t, dur, vol = 1) {
    const c = this.ctx;
    const freq = midi(note);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const vib = c.createOscillator();
    const vibAmt = c.createGain();
    vib.frequency.value = 6.2;
    vibAmt.gain.value = freq * 0.008;
    vib.connect(vibAmt).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(3200, t + 0.06);
    f.frequency.linearRampToValueAtTime(2200, t + Math.max(0.1, dur));
    const g = c.createGain();
    const peak = 0.06 * vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.035);
    g.gain.setValueAtTime(peak * 0.8, t + Math.max(0.04, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(f).connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.12);
    vib.stop(t + dur + 0.12);
  }

  /** Harmonium / accordion: free reeds; `wobble` cents of musette detune. */
  reeds(note, t, dur, wobble) {
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.025);
    g.gain.setValueAtTime(0.045, t + Math.max(0.03, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
    for (const [type, mul, det, a] of [['sawtooth', 1, -wobble, 1], ['sawtooth', 1, wobble, 1], ['square', 0.5, 0, 0.5]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = midi(note) * mul;
      o.detune.value = det;
      const og = c.createGain();
      og.gain.value = a;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + 0.12);
    }
    f.connect(g);
    g.connect(this.out);
    g.connect(this.delay);
  }

  /** Bowed strings (erhu, sarangi): slow bow attack, portamento, deep vibrato. */
  bowed(note, t, dur, body) {
    const c = this.ctx;
    const freq = midi(note);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    if (this.lastLeadFreq) {
      o.frequency.setValueAtTime(this.lastLeadFreq, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    } else o.frequency.setValueAtTime(freq, t);
    const vib = c.createOscillator();
    const vibAmt = c.createGain();
    vib.frequency.value = 6;
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(freq * 0.013, t + Math.min(0.35, dur));
    vib.connect(vibAmt).connect(o.frequency);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const peak = c.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = body;
    peak.Q.value = 2;
    peak.gain.value = 8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.08);
    g.gain.setValueAtTime(0.06, t + Math.max(0.09, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
    o.connect(lp).connect(peak).connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.15);
    vib.stop(t + dur + 0.15);
    this.lastLeadFreq = freq;
  }

  /** Generic plucked string: guzheng, phin, tumbi, surf/country guitar, strums. */
  plucked(note, t, dur, { decay = 0.6, slide = 0, bendDown = false, tremolo = false, type = 'sawtooth', cutoff = 3000, vol = 0.07, spring = false, vibrato = 0 }) {
    const c = this.ctx;
    const freq = midi(note);
    const strikes = tremolo ? Math.max(1, Math.round(dur / (this.stepDur * 0.5))) : 1;
    for (let k = 0; k < strikes; k++) {
      const tt = t + k * this.stepDur * 0.5;
      const o = c.createOscillator();
      o.type = type;
      if (slide && k === 0) {
        o.frequency.setValueAtTime(freq * Math.pow(2, -slide / 12), tt);
        o.frequency.exponentialRampToValueAtTime(freq, tt + 0.1);
      } else o.frequency.setValueAtTime(freq, tt);
      if (bendDown && k === 0 && dur > 0.2) {
        o.frequency.setValueAtTime(freq, tt + dur * 0.55);
        o.frequency.exponentialRampToValueAtTime(freq * Math.pow(2, -1 / 12), tt + dur * 0.75);
        o.frequency.exponentialRampToValueAtTime(freq, tt + dur * 0.95);
      }
      if (vibrato) {
        const vib = c.createOscillator();
        const va = c.createGain();
        vib.frequency.value = 5.5;
        va.gain.value = freq * vibrato;
        vib.connect(va).connect(o.frequency);
        vib.start(tt);
        vib.stop(tt + decay + 0.05);
      }
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff, tt);
      f.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.25), tt + decay * 0.6);
      const g = c.createGain();
      const v = vol * (tremolo ? Math.pow(0.85, k) : 1);
      this.env(g, tt, v, 0.003, tremolo ? 0.3 : decay);
      o.connect(f).connect(g);
      g.connect(this.out);
      if (spring || k === 0) g.connect(this.delay);
      o.start(tt);
      o.stop(tt + (tremolo ? 0.35 : decay) + 0.05);
    }
  }

  supersaw(note, t, dur) {
    const c = this.ctx;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(1200, t);
    f.frequency.linearRampToValueAtTime(3600, t + 0.04);
    f.frequency.exponentialRampToValueAtTime(1500, t + Math.max(0.1, dur));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.01);
    g.gain.setValueAtTime(0.04, t + Math.max(0.02, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
    for (const det of [-14, 0, 14]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(note);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.15);
    }
    f.connect(g);
    g.connect(this.out);
    g.connect(this.delay);
  }

  bell(note, t, dur) {
    const len = Math.max(0.8, dur * 1.5);
    this.tone(t, midi(note), midi(note), 0.07, len, 0.5);
    this.tone(t, midi(note) * 2.76, midi(note) * 2.76, 0.025, len * 0.4, 0.3);
    this.tone(t, midi(note) * 5.4, midi(note) * 5.4, 0.01, len * 0.15, 0.1);
  }

  mallet(note, t) {
    this.tone(t, midi(note), midi(note), 0.09, 0.45, 0.3);
    this.tone(t, midi(note) * 4, midi(note) * 4, 0.025, 0.08, 0.05);
  }

  /** 303-style acid line for Goa trance. */
  acid(note, t, dur) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(note);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 14;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.03);
    f.frequency.exponentialRampToValueAtTime(380, t + Math.max(0.08, dur));
    const g = c.createGain();
    this.env(g, t, 0.06, 0.004, Math.max(0.12, dur));
    o.connect(f).connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.2);
  }

  riser(t, dur) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}
