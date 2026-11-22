/**
 * Local music for every city: original procedural arrangements (no samples, no licensing).
 * Each style picks a scale/raga, tempo, groove, bass line, accompaniment and a lead
 * instrument that belongs to the place. Melodies are composed algorithmically per city.
 */

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], // raag Khamaj
  dorian: [0, 2, 3, 5, 7, 9, 10], // Kafi / Kharaharapriya
  aeolian: [0, 2, 3, 5, 7, 8, 10], // Natabhairavi
  phrygian: [0, 1, 3, 5, 7, 8, 10], // Bhairavi-like
  phrygianDom: [0, 1, 4, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  doubleHarmonic: [0, 1, 4, 5, 7, 8, 11], // Mayamalavagowla / Bhairav
  lydian: [0, 2, 4, 6, 7, 9, 11], // Kalyani / Yaman
  majPent: [0, 2, 4, 7, 9], // Mohanam / Bhoopali / gong mode / Thai
  minPent: [0, 3, 5, 7, 10],
  hindolam: [0, 3, 5, 8, 10],
};

// Drum grooves, steps within one bar (16 = 4/4 in sixteenths, 12 = 3/4 or 12/8)
const HOUSE = { kick: [0, 4, 8, 12], clap: [4, 12], hatO: [2, 6, 10, 14], hatC: [1, 3, 5, 7, 9, 11, 13, 15] };
const KEHERWA = { 0: 'dha', 2: 'ge', 4: 'na', 6: 'ti', 7: 'ti', 8: 'na', 10: 'ka', 12: 'dha', 13: 'ge', 14: 'na' };

export const MUSIC_STYLES = {
  /* ---------------- India ---------------- */
  mumbai: {
    name: 'Bollywood dance', bpm: 126, root: 62, scale: 'mixolydian', drone: 'tanpura', lead: 'sitar', ornament: true,
    groove: { ...HOUSE, perc: ['tabla', KEHERWA] }, bass: 'roll', accomp: 'arp', fixed: 'desh',
  },
  hyderabad: {
    name: 'Deccani qawwali', bpm: 112, root: 60, scale: 'dorian', prog: [0, 6, 3, 0], drone: 'tanpura', lead: 'sarangi', ornament: true,
    groove: { kick: [0, 8], clap: [4, 12], hatC: [2, 6, 10, 14], perc: ['dholak', { 0: 'dh', 3: 'ta', 6: 'dh', 8: 'tin', 10: 'ta', 12: 'dh', 14: 'ta' }] },
    bass: 'drone', accomp: 'stabs', feel: 'flow',
  },
  bangalore: {
    name: 'Carnatic techno', bpm: 128, root: 64, scale: 'doubleHarmonic', prog: [0, 1, 4, 0], drone: 'tanpura', lead: 'veena', ornament: true,
    groove: { ...HOUSE, perc: ['mridangam', { 0: 'thom', 2: 'tha', 3: 'tha', 5: 'dhi', 6: 'tha', 8: 'thom', 10: 'nam', 11: 'tha', 13: 'dhi', 14: 'tha' }] },
    bass: 'offbeat', accomp: 'arp', feel: 'busy',
  },
  kolkata: {
    name: 'Baul & Rabindra', bpm: 104, root: 65, scale: 'major', prog: [0, 3, 4, 0], drone: 'ektara', lead: 'bansuri', ornament: true,
    groove: { kick: [0, 8], hatC: [2, 6, 10, 14], perc: ['khol', { 0: 'lo', 4: 'hi', 6: 'lo', 8: 'lo', 11: 'hi', 12: 'hi', 14: 'lo' }] },
    bass: 'boom', accomp: 'arp', feel: 'flow',
  },
  delhi: {
    name: 'Bhangra', bpm: 128, root: 67, scale: 'mixolydian', prog: [0, 6, 3, 0], lead: 'tumbi',
    groove: { clap: [4, 12], hatC: [2, 6, 10, 14], perc: ['dhol', { 0: 'dagga', 3: 'tilli', 4: 'tilli', 6: 'dagga', 7: 'tilli', 8: 'dagga', 11: 'tilli', 12: 'tilli', 14: 'dagga', 15: 'tilli' }] },
    bass: 'roll', accomp: 'stabs', feel: 'busy',
  },
  chennai: {
    name: 'Gaana kuthu', bpm: 140, root: 62, scale: 'aeolian', prog: [0, 5, 6, 0], drone: 'tanpura', lead: 'nadaswaram', ornament: true,
    groove: { kick: [0, 8], clap: [4, 12], perc: ['parai', { 0: 'dub', 2: 'thap', 3: 'thap', 4: 'thap', 6: 'dub', 7: 'thap', 8: 'dub', 10: 'thap', 11: 'thap', 12: 'thap', 14: 'dub', 15: 'thap' }] },
    bass: 'roll', accomp: 'stabs', feel: 'busy',
  },
  pondicherry: {
    name: 'French-Tamil café', bpm: 108, root: 67, scale: 'major', prog: [0, 5, 1, 4], lead: 'accordion',
    groove: { kick: [0, 8], snare: [4, 12], brush: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0.2, perc: ['mridangam', { 0: 'thom', 6: 'tha', 10: 'dhi', 14: 'tha' }] },
    bass: 'boom', accomp: 'pompe', feel: 'flow',
  },
  vijayawada: {
    name: 'Telugu classical pop', bpm: 120, root: 62, scale: 'majPent', chordScale: 'major', prog: [0, 3, 4, 3], drone: 'tanpura', lead: 'veena', ornament: true,
    groove: { kick: [0, 8], clap: [4, 12], perc: ['mridangam', { 0: 'thom', 2: 'tha', 4: 'dhi', 6: 'tha', 8: 'thom', 9: 'tha', 10: 'nam', 12: 'dhi', 14: 'tha', 15: 'tha' }] },
    bass: 'offbeat', accomp: 'arp', feel: 'flow',
  },
  vizag: {
    name: 'Coastal Andhra', bpm: 124, root: 64, scale: 'hindolam', chordScale: 'aeolian', prog: [0, 5, 2, 6], drone: 'tanpura', lead: 'bansuri', ornament: true,
    groove: { ...HOUSE, perc: ['tabla', KEHERWA] }, bass: 'offbeat', accomp: 'arp', feel: 'flow',
  },
  warangal: {
    name: 'Dappu folk', bpm: 130, root: 62, scale: 'lydian', prog: [0, 1, 4, 0], drone: 'tanpura', lead: 'nadaswaram', ornament: true,
    groove: { kick: [0, 4, 8, 12], clap: [4, 12], perc: ['parai', { 0: 'dub', 3: 'thap', 4: 'thap', 6: 'dub', 8: 'dub', 10: 'thap', 11: 'thap', 12: 'dub', 14: 'thap' }] },
    bass: 'roll', accomp: 'stabs', feel: 'busy',
  },
  kochi: {
    name: 'Chenda melam', bpm: 134, root: 62, scale: 'dorian', prog: [0, 3, 6, 0], drone: 'tanpura', lead: 'nadaswaram', ornament: true,
    groove: { kick: [0, 8, 10], clap: [4, 12], perc: ['chenda', Object.fromEntries([...Array(16).keys()].map((i) => [i, [0, 3, 6, 8, 11, 14].includes(i) ? 'CHEN' : 'chen']))] },
    bass: 'roll', accomp: 'arp', feel: 'busy',
  },
  goa: {
    name: 'Goa trance', bpm: 140, root: 64, scale: 'phrygian', prog: [0, 1, 0, 6], lead: 'acid',
    groove: { ...HOUSE }, bass: 'rolling16', accomp: 'none', feel: 'busy',
  },
  pune: {
    name: 'Dhol-tasha', bpm: 126, root: 62, scale: 'majPent', chordScale: 'major', prog: [0, 3, 4, 0], lead: 'harmonium',
    groove: { perc: ['dhol', { 0: 'dagga', 4: 'dagga', 8: 'dagga', 10: 'dagga', 12: 'dagga', 2: 'tilli', 6: 'tilli', 14: 'tilli' }], tasha: true },
    bass: 'roll', accomp: 'stabs', feel: 'flow',
  },
  ahmedabad: {
    name: 'Garba', bpm: 132, meter: 12, triplet: true, root: 67, scale: 'major', prog: [0, 3, 4, 0], lead: 'bansuri', ornament: true,
    groove: { kick: [0, 6], wood: [3, 9], perc: ['dholak', { 0: 'dh', 3: 'ta', 5: 'dh', 6: 'dh', 9: 'ta', 11: 'dh' }] },
    bass: 'roll', accomp: 'stabs', feel: 'flow',
  },
  srinagar: {
    name: 'Kashmiri sufiyana', bpm: 100, meter: 12, triplet: true, root: 64, scale: 'majPent', chordScale: 'major', prog: [0, 3, 0, 4], drone: 'tanpura', lead: 'santoor',
    groove: { kick: [0, 6], perc: ['tumbak', { 0: 'dum', 3: 'tak', 4: 'tak', 6: 'dum', 9: 'tak', 10: 'tak' }] },
    bass: 'roll', accomp: 'arp', feel: 'flow',
  },
  /* ---------------- World Tour ---------------- */
  london: {
    name: 'UK garage', bpm: 132, root: 63, scale: 'dorian', prog: [0, 4, 6, 3], lead: 'synth',
    groove: { kick: [0, 10], snare: [4, 12], hatC: [2, 6, 10, 14, 15], swing: 0.18 }, bass: 'sub', accomp: 'stabs', feel: 'busy',
  },
  paris: {
    name: 'Bal-musette waltz', bpm: 168, meter: 12, root: 62, scale: 'harmonicMinor', prog: [0, 3, 4, 0], lead: 'accordion',
    groove: { kick: [0], brush: [0, 4, 8] }, bass: 'waltz', accomp: 'waltz', feel: 'flow',
  },
  newyork: {
    name: 'Boom-bap jazz', bpm: 92, root: 65, scale: 'dorian', prog: [0, 3, 6, 4], lead: 'sax',
    groove: { kick: [0, 7, 10], snare: [4, 12], hatC: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0.22 }, bass: 'walk', accomp: 'rhodes', feel: 'flow',
  },
  mexicocity: {
    name: 'Cumbia & mariachi', bpm: 100, root: 67, scale: 'major', prog: [0, 3, 4, 0], lead: 'trumpet',
    groove: { kick: [0, 8], snare: [4, 12], guira: { 0: 'long', 2: 's', 3: 's', 4: 'long', 6: 's', 7: 's', 8: 'long', 10: 's', 11: 's', 12: 'long', 14: 's', 15: 's' } },
    bass: 'tumbao', accomp: 'stabs', feel: 'flow',
  },
  sanfrancisco: {
    name: 'Psychedelic surf', bpm: 150, root: 64, scale: 'phrygianDom', prog: [0, 1, 0, 1], lead: 'twang',
    groove: { kick: [0, 8, 10], snare: [4, 12], hatC: [0, 2, 4, 6, 8, 10, 12, 14], fill: true }, bass: 'roll', accomp: 'strum', feel: 'busy',
  },
  dallas: {
    name: 'Texas country', bpm: 120, root: 67, scale: 'majPent', chordScale: 'major', prog: [0, 3, 4, 0], lead: 'twang', ornament: true,
    groove: { kick: [0, 8], snare: [4, 12], brush: [...Array(16).keys()], swing: 0.12 }, bass: 'boom', accomp: 'banjo', feel: 'flow',
  },
  toronto: {
    name: 'Toronto R&B', bpm: 140, root: 61, scale: 'aeolian', prog: [0, 5, 2, 6], lead: 'bell',
    groove: { kick: [0, 7, 10], clap: [8], hatC: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15] }, bass: '808', accomp: 'none', feel: 'sparse',
  },
  sydney: {
    name: 'Didgeridoo surf rock', bpm: 120, root: 62, scale: 'mixolydian', prog: [0, 6, 3, 0], drone: 'didge', lead: 'mallet',
    groove: { kick: [0, 10], snare: [4, 12], hatC: [0, 2, 4, 6, 8, 10, 12, 14], sticks: [0, 4, 8, 12, 6, 14] }, bass: 'roll', accomp: 'strum', feel: 'flow',
  },
  shanghai: {
    name: 'Guzheng jazz-age', bpm: 116, root: 62, scale: 'majPent', chordScale: 'major', prog: [0, 5, 3, 4], lead: 'guzheng',
    groove: { kick: [0, 8], brush: [4, 12], wood: [0, 4, 6, 8, 12, 14], gong: true }, bass: 'roll', accomp: 'arp', feel: 'flow',
  },
  hongkong: {
    name: 'Cantopop', bpm: 108, root: 65, scale: 'minPent', chordScale: 'aeolian', prog: [0, 5, 2, 6], lead: 'erhu',
    groove: { kick: [0, 6, 8], snare: [4, 12], hatC: [0, 2, 4, 6, 8, 10, 12, 14] }, bass: 'roll', accomp: 'rhodes', feel: 'flow',
  },
  bangkok: {
    name: 'Luk thung & molam', bpm: 130, root: 67, scale: 'majPent', chordScale: 'major', prog: [0, 3, 0, 4], drone: 'khaen', lead: 'phin',
    groove: { kick: [0, 6, 8], ching: { 2: 'chap', 4: 'ching', 6: 'chap', 10: 'chap', 12: 'ching', 14: 'chap' }, tom: [0, 6, 8, 11] },
    bass: 'roll', accomp: 'none', feel: 'busy',
  },
};

export function getMusicStyle(id) {
  const s = MUSIC_STYLES[id] || MUSIC_STYLES.mumbai;
  return { id: MUSIC_STYLES[id] ? id : 'mumbai', meter: 16, ...s };
}

/* ---------------- composition helpers ---------------- */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

/** Semitone offset of a scale degree (wraps octaves). */
export function degree(scale, d) {
  const n = scale.length;
  const o = Math.floor(d / n);
  return scale[((d % n) + n) % n] + 12 * o;
}

/** One chord per bar: { root (bass MIDI), tones (pad MIDI) }. */
export function buildChords(style) {
  const cs = SCALES[style.chordScale || (SCALES[style.scale].length === 7 ? style.scale : 'major')];
  return (style.prog || [0, 6, 3, 4]).map((d) => {
    const tones = [d, d + 2, d + 4, d + 7].map((k) => style.root + degree(cs, k));
    let bass = style.root - 24 + degree(cs, d);
    while (bass > 47) bass -= 12;
    while (bass < 33) bass += 12;
    return { root: bass, tones };
  });
}

const CELLS = {
  4: {
    flow: [[[4], 3], [[2, 2], 3], [[3, 1], 2], [[1, 1, 2], 1], [[2, 1, 1], 1]],
    busy: [[[2, 2], 2], [[1, 1, 2], 3], [[2, 1, 1], 3], [[1, 1, 1, 1], 2], [[3, 1], 1]],
    sparse: [[[4], 4], [[3, 1], 1], [[2, 2], 1]],
  },
  3: {
    flow: [[[3], 3], [[2, 1], 3], [[1, 1, 1], 1]],
    busy: [[[2, 1], 2], [[1, 1, 1], 3], [[1, 2], 1]],
    sparse: [[[3], 4], [[2, 1], 1]],
  },
};

/** Algorithmic 8-bar melody: [step, midi, lengthInSteps, ornament] (phrase form A A' A B). */
export function composeMelody(style, chords) {
  const r = seeded(style.id + ':melody');
  const scale = SCALES[style.scale];
  const meter = style.meter;
  const beat = style.triplet ? 3 : 4;
  const beatsPerBar = meter / beat;
  const pitches = [];
  for (let d = 0; d <= scale.length * 2 + 2; d++) pitches.push(style.root + degree(scale, d));
  const cells = CELLS[beat][style.feel || 'flow'];
  const pick = () => {
    const total = cells.reduce((a, c) => a + c[1], 0);
    let x = r() * total;
    for (const [cell, w] of cells) if ((x -= w) <= 0) return cell;
    return cells[0][0];
  };
  const rhythm = (bars) => {
    const out = [];
    const beats = bars * beatsPerBar;
    for (let b = 0; b < beats - 2; b++) out.push(...pick());
    out.push(beat * 2); // phrase ends on a held note
    return out;
  };
  const nearestChordTone = (idx, chord) => {
    const pcs = chord.tones.map((t) => ((t % 12) + 12) % 12);
    let best = idx;
    for (let dist = 0; dist < pitches.length; dist++) {
      for (const c of [idx - dist, idx + dist]) {
        if (c >= 0 && c < pitches.length && pcs.includes(pitches[c] % 12)) return c;
      }
    }
    return best;
  };
  const phrase = (startBar, rh, startIdx, cadence) => {
    const notes = [];
    let idx = startIdx;
    let step = 0;
    const len = rh.reduce((a, b) => a + b, 0);
    rh.forEach((dur, i) => {
      const bar = startBar + Math.floor(step / meter);
      const chord = chords[bar % chords.length];
      const strong = step % (beat * 2) === 0;
      const prevIdx = idx;
      if (i === rh.length - 1) {
        // cadence: tonic, or the fifth for an open ending
        const target = cadence ? 0 : 2;
        idx = nearestChordTone(Math.max(0, Math.min(pitches.length - 1, idx)), { tones: [style.root + degree(scale, target)] });
      } else if (strong) {
        idx = nearestChordTone(idx, chord);
      } else {
        const up = step < len / 2 ? 0.62 : 0.38;
        const x = r();
        const dir = r() < up ? 1 : -1;
        idx += x < 0.55 ? dir : x < 0.8 ? dir * 2 : x < 0.9 ? 0 : dir * 3;
      }
      idx = Math.max(2, Math.min(pitches.length - 3, idx));
      const orn = !!style.ornament && (idx - prevIdx >= 2 || (dur >= beat && r() < 0.35));
      notes.push([step, pitches[idx], dur, orn ? 1 : 0]);
      step += dur;
    });
    return { notes, end: idx };
  };
  const bars2 = meter * 2;
  const rA = rhythm(2);
  const rB = rhythm(2);
  const start = Math.floor(scale.length * 0.9);
  const A = phrase(0, rA, start, false);
  // A': same rhythm, new second half
  const A2 = phrase(2, rA, start, false);
  A2.notes = A.notes.filter((n) => n[0] < meter).concat(A2.notes.filter((n) => n[0] >= meter));
  const A3 = phrase(4, rA, start + 1, false);
  const B = phrase(6, rB, A3.end, true);
  const out = [];
  [A, A2, A3, B].forEach((p, k) => p.notes.forEach(([s, m, l, o]) => out.push([s + k * bars2, m, l, o])));
  return out;
}
