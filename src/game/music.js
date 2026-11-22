/**
 * "Desh Drift" — original procedural racing soundtrack (no samples, no licensing).
 * Indian-fusion electronic: tanpura drone, tabla, sitar-style lead in raag Khamaj
 * (D Mixolydian), four-on-the-floor kick, rolling bass and arpeggios. 126 BPM.
 *
 * Works with a live AudioContext (lookahead scheduler) or an OfflineAudioContext
 * (scheduleRange) so the exact same track can be rendered into videos.
 */
const BPM = 126;
const STEP = 60 / BPM / 4; // 16th note
const BAR = 16;
const LOOP_BARS = 32;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// One chord per bar, 4-bar cycle: D – C – G – A  (I – bVII – IV – V)
const CHORDS = [
  { root: 38, tones: [62, 66, 69, 74] }, // D
  { root: 36, tones: [60, 64, 67, 72] }, // C
  { root: 43, tones: [62, 67, 71, 74] }, // G
  { root: 45, tones: [61, 64, 69, 73] }, // A
];

// Sitar-style lead, 8 bars: [step, midi note, length in steps, meend?]
const MELODY = [
  [0, 69, 2], [2, 74, 2, 1], [4, 78, 4, 1], [8, 76, 2], [10, 74, 2], [12, 69, 4],
  [16, 67, 2], [18, 72, 2, 1], [20, 76, 4, 1], [24, 74, 2], [26, 72, 2], [28, 67, 4],
  [32, 71, 2], [34, 74, 2], [36, 79, 3, 1], [39, 78, 1], [40, 76, 2], [42, 74, 2], [44, 71, 4],
  [48, 69, 2], [50, 73, 2, 1], [52, 76, 4], [56, 79, 2], [58, 78, 2], [60, 76, 2], [62, 73, 2],
  [64, 74, 2, 1], [66, 78, 2], [68, 81, 4, 1], [72, 79, 2], [74, 78, 2], [76, 76, 2], [78, 74, 2],
  [80, 72, 2], [82, 76, 2], [84, 79, 4, 1], [88, 76, 2], [90, 74, 2], [92, 72, 4],
  [96, 74, 2], [98, 71, 2], [100, 67, 2], [102, 71, 2], [104, 74, 2], [106, 79, 2, 1], [108, 78, 2], [110, 76, 2],
  [112, 76, 4, 1], [116, 73, 2], [118, 69, 2], [120, 76, 2], [122, 79, 2], [124, 78, 2], [126, 76, 2],
];

// Keherwa-style tabla over one bar: 'dha' = bayan+dayan, 'ge' = bayan, 'na' = dayan, 'ti' = high dayan, 'ka' = muted
const TABLA = { 0: 'dha', 2: 'ge', 4: 'na', 6: 'ti', 7: 'ti', 8: 'na', 10: 'ka', 12: 'dha', 13: 'ge', 14: 'na' };

export class RaceMusic {
  constructor(ctx, destination) {
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

    // Shared noise buffer for hats, claps, risers
    const len = Math.floor(ctx.sampleRate * 1.0);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 4294967296) * 2 - 1;
    }

    // Short stereo-less room: feedback delay for the lead
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = STEP * 3;
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
      const t = this.startTime + this.nextStep * STEP;
      if (t >= to) break;
      if (t >= from - 0.05) this.scheduleStep(this.nextStep, t);
      this.nextStep++;
    }
  }

  scheduleStep(n, t) {
    const lv = this.levelAt(t);
    const race = lv === 'race';
    const s = n % BAR;
    const bar = Math.floor(n / BAR) % LOOP_BARS;
    const chord = CHORDS[bar % 4];
    const section = bar < 8 ? 'A' : bar < 24 ? 'B' : 'C';
    const breakdown = section === 'C' && bar < 28;

    // Tanpura drone: Pa Sa Sa Sa (A2 D3 D3 D2), one pluck per beat, always on D
    if (s % 4 === 0) this.tanpura([45, 50, 50, 38][s / 4], t);

    // Pad on each bar
    if (s === 0) this.pad(chord.tones, t, BAR * STEP, race ? 0.035 : 0.05);

    if (!race) {
      // Menu: soft shaker + gentle tabla accents
      if (s % 2 === 1) this.hat(t, 0.012, 0.03);
      if (s === 0 || s === 12) this.tabla('ge', t, 0.5);
      if (s === 6 || s === 14) this.tabla('na', t, 0.4);
      return;
    }

    // --- Race arrangement ---
    if (!breakdown && s % 4 === 0) this.kick(t);
    if (!breakdown && (s === 4 || s === 12) && (section !== 'A' || bar >= 4)) this.clap(t);
    if (s % 4 === 2) this.hat(t, 0.05, 0.09);
    else if (s % 2 === 1) this.hat(t, 0.02, 0.03);

    // Rolling bass: root / octave 8ths (muted in breakdown first half)
    if (!(breakdown && bar < 26) && s % 2 === 0) {
      const note = s % 4 === 0 ? chord.root : chord.root + 12;
      this.bass(note, t, STEP * 1.8);
    }

    // Tabla groove in B and C sections
    if (section !== 'A' && TABLA[s] !== undefined) this.tabla(TABLA[s], t, 0.9);

    // Arpeggio (16ths) in B and C
    if (section !== 'A') {
      const order = [0, 1, 2, 3, 2, 1, 2, 3];
      this.pluck(chord.tones[order[s % 8]] + 12, t, 0.028);
    }

    // Lead melody: two 8-bar phrases in B; up an octave feel in C (after breakdown)
    if (section === 'B' || (section === 'C' && bar >= 28)) {
      const local = ((bar - 8) % 8) * BAR + s;
      for (const [st, note, len, meend] of MELODY) {
        if (st === local) this.sitar(note + (section === 'C' ? 12 : 0), t, len * STEP, !!meend);
      }
    }

    // Riser into the drop at the end of the breakdown
    if (bar === 27 && s === 0) this.riser(t, BAR * STEP);
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

  bass(note, t, dur) {
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
    this.env(g, t, 0.2, 0.004, dur);
    o.connect(f);
    sub.connect(f);
    f.connect(g).connect(this.out);
    o.start(t);
    sub.start(t);
    o.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  pluck(note, t, vol) {
    const c = this.ctx;
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.value = midi(note);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    this.env(g, t, vol, 0.002, 0.14);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.18);
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
