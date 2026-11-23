import * as THREE from 'three';
import { TOTAL_LAPS } from './physics.js';

/**
 * Live-TV presentation, like a Grand Prix broadcast:
 *  - timing tower (position, driver code, gap to the leader) with a LIVE bug
 *  - purple "fastest lap" caption
 *  - TV director camera: fixed trackside cameras along the lap with long lenses that pan
 *    to follow you and cut to the next camera as you pass, plus an occasional high crane shot
 */
export class Broadcast {
  constructor(engine) {
    this.e = engine;
    this.tick = 0;
    this.fastest = Infinity;
    this.cams = null;
    this.camIdx = -1;
    this.build();
  }

  build() {
    const tower = document.createElement('div');
    tower.className = 'tv-tower hidden';
    tower.innerHTML =
      '<div class="tv-head"><span class="tv-live">● LIVE</span><span class="tv-race"></span></div><div class="tv-lap"></div><div class="tv-rows"></div>';
    document.body.appendChild(tower);
    this.tower = tower;
    this.rowsEl = tower.querySelector('.tv-rows');
    this.lapEl = tower.querySelector('.tv-lap');
    this.raceEl = tower.querySelector('.tv-race');
    const fl = document.createElement('div');
    fl.className = 'tv-fastest hidden';
    fl.innerHTML = '<i>⏱</i><div><small>FASTEST LAP</small><b></b></div><span></span>';
    document.body.appendChild(fl);
    this.fastestEl = fl;
  }

  reset() {
    this.fastest = Infinity;
    this.camIdx = -1;
    this.cams = null;
    this.fastestEl.classList.add('hidden');
  }

  static code(r) {
    if (r.isPlayer) return 'YOU';
    const words = r.name.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/);
    return (words[words.length - 1] || r.name).slice(0, 3).toUpperCase();
  }

  /** Called every frame; DOM refreshes 5 times a second. */
  update(dt) {
    const e = this.e;
    const live = e.state === 'RACING' || e.state === 'COUNTDOWN' || e.state === 'FINISHED';
    this.tower.classList.toggle('hidden', !live || !e.player);
    if (!live || !e.player) return;
    this.tick -= dt;
    this.checkFastestLap();
    if (this.tick > 0) return;
    this.tick = 0.2;
    const standings = e.getStandings();
    const leader = standings[0];
    const L = e.track.totalLength || 400;
    // gap in seconds ≈ distance behind the leader at the leader's pace
    const pace = Math.max(18, Math.abs(leader.speed) || 40);
    this.raceEl.textContent = `${e.currentCity.name.toUpperCase()} GP`;
    this.lapEl.textContent = `LAP ${Math.min(TOTAL_LAPS, leader.lap)}/${TOTAL_LAPS}`;
    this.rowsEl.innerHTML = standings
      .map((r, i) => {
        let gap;
        if (r.dsq) gap = '<em class="dsq">DSQ</em>';
        else if (i === 0) gap = r.finished ? '<em class="flag">🏁</em>' : 'LEADER';
        else if (r.finished && leader.finished) gap = `+${(r.finishTime - leader.finishTime).toFixed(3)}`;
        else {
          const laps = Math.floor(leader.totalProgress - r.totalProgress);
          gap = laps >= 1 ? `+${laps} LAP` : `+${(((leader.totalProgress - r.totalProgress) * L) / pace).toFixed(3)}`;
        }
        const col = '#' + (r.teamColor || 0x888888).toString(16).padStart(6, '0');
        return `<div class="tv-row ${r.isPlayer ? 'me' : ''} ${r.dsq ? 'out' : ''}"><span class="p">${r.dsq ? '–' : i + 1}</span><i style="background:${col}"></i><span class="c">${Broadcast.code(r)}</span><span class="g">${gap}</span></div>`;
      })
      .join('');
  }

  checkFastestLap() {
    for (const r of this.e.racers) {
      if (!Number.isFinite(r.bestLapTime) || r.bestLapTime >= this.fastest - 1e-6) continue;
      const first = !Number.isFinite(this.fastest);
      this.fastest = r.bestLapTime;
      if (first && !r.isPlayer) continue; // the first completed lap isn't news
      const el = this.fastestEl;
      el.querySelector('b').textContent = r.isPlayer ? 'YOU' : r.name.toUpperCase();
      const t = r.bestLapTime;
      el.querySelector('span').textContent = `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
      el.classList.remove('hidden');
      clearTimeout(this.flTimer);
      this.flTimer = setTimeout(() => el.classList.add('hidden'), 3200);
    }
  }

  /* ---------------- TV director camera ---------------- */
  buildCams() {
    const tr = this.e.track;
    const cams = [];
    const N = 22;
    // infield side of the circuit: crane shots go there (no buildings or billboards in the way)
    const centre = new THREE.Vector3();
    for (const smp of tr.samples) centre.add(smp.point);
    centre.divideScalar(tr.samples.length);
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const f = tr.getFrameAt(u);
      const crane = i % 6 === 3;
      const inside = Math.sign(centre.clone().sub(f.point).dot(f.right)) || 1;
      const side = crane ? inside : (i * 7) % 3 === 0 ? -1 : 1;
      const p = f.point.clone().addScaledVector(f.right, side * (crane ? 20 : 11.6));
      p.y = Math.max(0, f.point.y) + (crane ? 24 : 5.4);
      cams.push({ u, pos: p, crane });
    }
    this.cams = cams;
  }

  /** Picks the live camera and returns { pos, look, fov, cut }. */
  tvShot(p) {
    if (!this.cams) this.buildCams();
    const ahead = (u) => {
      let d = u - p.u;
      if (d < -0.5) d += 1;
      if (d > 0.5) d -= 1;
      return d;
    };
    let cut = false;
    const cur = this.cams[this.camIdx];
    // keep the shot until the car is well past the camera, then cut to the next one ahead
    if (!cur || ahead(cur.u) < -0.022 || ahead(cur.u) > 0.12) {
      let best = -1;
      let bestD = Infinity;
      this.cams.forEach((c, i) => {
        const d = ahead(c.u);
        if (d > 0.012 && d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best !== this.camIdx) cut = true;
      this.camIdx = best;
    }
    const cam = this.cams[this.camIdx];
    const lead = new THREE.Vector3(p.vel.x, 0, p.vel.z).multiplyScalar(0.12);
    const look = p.pos.clone().add(lead);
    look.y += 0.8;
    const dist = cam.pos.distanceTo(look);
    // long lens: hold the car at a steady size on screen
    const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan((cam.crane ? 16 : 7.5) / dist)), 9, 58);
    return { pos: cam.pos, look, fov, cut };
  }
}
