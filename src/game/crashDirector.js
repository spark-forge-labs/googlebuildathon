import * as THREE from 'three';
import { Q } from './quality.js';

/**
 * Real-time crash cinematics, like a TV broadcast director.
 *
 * Your crash: the game drops into slow motion, letterbox bars slide in and the
 * director cuts between a long-lens trackside camera, an orbit around the wreck
 * and a rising crane shot, then the stewards' verdict.
 *
 * A rival's crash: a "LIVE" replay window cuts in at the side of the screen and
 * follows the wreck from a trackside camera while you keep racing.
 */
export class CrashDirector {
  constructor(engine) {
    this.e = engine;
    this.active = null;
    this.pip = null;
    this.pipCam = new THREE.PerspectiveCamera(30, 16 / 9, 0.4, 2600);
    this.buildDom();
  }

  buildDom() {
    const mk = (cls, html = '') => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = html;
      document.body.appendChild(el);
      return el;
    };
    this.barTop = mk('cine-bar top');
    this.barBottom = mk('cine-bar bottom');
    this.card = mk('cine-card', '<small></small><b></b><span></span>');
    this.pipFrame = mk('pip-frame hidden', '<span class="pip-live">● LIVE</span><span class="pip-label"></span>');
    this.flag = mk('race-flag hidden', '<i></i><div><b></b><span></span></div>');
  }

  reset() {
    this.active = null;
    this.pip = null;
    this.e.timeScale = 1;
    document.body.classList.remove('cinematic');
    this.card.classList.remove('show');
    this.pipFrame.classList.add('hidden');
    this.flag.classList.add('hidden');
  }

  /** Trackside camera spot near u, behind the barrier on the given side, looking at the action. */
  tracksideSpot(u, side, height = 5.2) {
    const f = this.e.track.getFrameAt(u);
    // on a camera platform just inside the barrier, above the catch fence and clear of the trees
    const p = f.point.clone().addScaledVector(f.right, side * 11.6);
    p.y = Math.max(f.point.y, 0) + height;
    return p;
  }

  /** Flag marshal message (track limits warning, black flag). */
  showFlag(kind, title, sub, ms = 2600) {
    const f = this.flag;
    f.className = `race-flag ${kind}`;
    f.querySelector('b').textContent = title;
    f.querySelector('span').textContent = sub;
    clearTimeout(this.flagTimer);
    this.flagTimer = setTimeout(() => f.classList.add('hidden'), ms);
  }

  /* ---------------- your crash ---------------- */
  playerCrash(racer, reason, impact, strict) {
    const e = this.e;
    const proj = e.track.project(racer.pos, racer.u);
    const side = Math.sign(proj.lateral) || 1;
    const spotA = this.tracksideSpot(proj.u + 0.028, side, 5.2); // camera platform above the catch fence
    this.active = {
      t: 0,
      racer,
      strict,
      spotA,
      orbit0: Math.atan2(spotA.x - racer.pos.x, spotA.z - racer.pos.z) + 0.6,
      crane0: null,
      done: false,
    };
    e.timeScale = 0.3;
    document.body.classList.add('cinematic');
    const c = this.card;
    c.querySelector('small').textContent = strict ? 'RACE CONTROL • INCIDENT' : 'INCIDENT';
    c.querySelector('b').textContent = 'CRASH!';
    c.querySelector('span').textContent = `${racer.name} ${reason}`;
    c.classList.remove('dsq');
    c.classList.add('show');
    e.sound.playCrash(Math.min(1, 0.45 + impact / 40));
    e.haptic(1, 260);
  }

  /** Called every frame with real (unscaled) time; returns true while it owns the camera. */
  updateCamera(dt) {
    const a = this.active;
    if (!a) return false;
    a.t += dt;
    const e = this.e;
    const cam = e.camera;
    const r = a.racer;
    const target = r.pos.clone();
    target.y += 0.7;
    // slow motion through the impact, then ease back towards real time
    e.timeScale = a.t < 2.4 ? 0.3 : Math.min(1, 0.3 + (a.t - 2.4) * 0.5);

    if (a.t < 1.6) {
      // shot 1: long lens from the trackside camera behind the fence
      cam.position.lerp(a.spotA, a.t < 0.05 ? 1 : Math.min(1, dt * 6));
      cam.fov = THREE.MathUtils.lerp(34, 22, a.t / 1.6);
    } else if (a.t < 3.6) {
      // shot 2: slow orbit around the wreck
      const ang = a.orbit0 + (a.t - 1.6) * 0.55;
      const radius = 7.5;
      const want = new THREE.Vector3(r.pos.x + Math.sin(ang) * radius, r.pos.y + 2.2, r.pos.z + Math.cos(ang) * radius);
      if (a.t - dt < 1.6) cam.position.copy(want);
      else cam.position.lerp(want, Math.min(1, dt * 5));
      cam.fov = 46;
    } else {
      // shot 3: crane up and away as the marshals' flags come out
      if (!a.crane0) a.crane0 = cam.position.clone();
      const k = Math.min(1, (a.t - 3.6) / 1.6);
      const ease = k * k * (3 - 2 * k);
      const up = a.crane0.clone().lerp(new THREE.Vector3(r.pos.x, r.pos.y + 24, r.pos.z).addScaledVector(r.vel.clone().setY(0).normalize(), -14), ease);
      cam.position.copy(up);
      cam.fov = 52;
      if (a.t > 3.9 && !a.verdict) {
        a.verdict = true;
        const c = this.card;
        c.querySelector('small').textContent = a.strict ? 'STEWARDS DECISION' : 'RACE CONTROL';
        c.querySelector('b').textContent = a.strict ? 'DISQUALIFIED' : 'BACK ON TRACK';
        c.querySelector('span').textContent = a.strict ? 'A crash ends your race.' : 'Arcade rules: you rejoin where you crashed.';
        c.classList.toggle('dsq', a.strict);
      }
    }
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    if (a.t > (a.strict ? 5.6 : 4.6) && !a.done) {
      a.done = true;
      this.finishPlayerCrash();
    }
    return true;
  }

  finishPlayerCrash() {
    const a = this.active;
    this.active = null;
    this.e.timeScale = 1;
    document.body.classList.remove('cinematic');
    this.card.classList.remove('show');
    this.e.afterPlayerCrash(a ? a.strict : true);
  }

  /* ---------------- a rival's crash: live replay window ---------------- */
  rivalCrash(racer, reason) {
    this.e.showToast(`⚠ ${racer.name} ${reason} — DISQUALIFIED`, 3800);
    if (this.active || Q.tier === 'low') return; // phones: keep the frame rate for your own driving
    const proj = this.e.track.project(racer.pos, racer.u);
    const side = Math.sign(proj.lateral) || 1;
    this.pip = { t: 0, racer, spot: this.tracksideSpot(proj.u + 0.025, side, 5.4) };
    this.pipFrame.querySelector('.pip-label').textContent = `${racer.name.toUpperCase()} CRASHES`;
    this.pipFrame.classList.remove('hidden');
  }

  /** Draws the replay window after the main frame. */
  renderPip(dt) {
    const p = this.pip;
    if (!p) return;
    p.t += dt;
    if (p.t > 4.2 || this.active) {
      this.pip = null;
      this.pipFrame.classList.add('hidden');
      return;
    }
    const e = this.e;
    const r = e.renderer;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.round(Math.min(380, vw * 0.3));
    const h = Math.round((w * 9) / 16);
    const x = vw - w - 14;
    const yTop = Math.round(vh * 0.36);
    const target = p.racer.pos.clone();
    target.y += 0.6;
    this.pipCam.position.copy(p.spot);
    this.pipCam.fov = THREE.MathUtils.lerp(26, 18, Math.min(1, p.t / 3));
    this.pipCam.aspect = w / h;
    this.pipCam.lookAt(target);
    this.pipCam.updateProjectionMatrix();
    const fy = vh - yTop - h; // WebGL viewport origin is bottom-left
    const shadowAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false; // the main pass just drew the shadow map
    r.setScissorTest(true);
    r.setScissor(x, fy, w, h);
    r.setViewport(x, fy, w, h);
    r.render(e.scene, this.pipCam);
    r.setScissorTest(false);
    r.setViewport(0, 0, vw, vh);
    r.shadowMap.autoUpdate = shadowAuto;
    const s = this.pipFrame.style;
    s.left = `${x}px`;
    s.top = `${yTop}px`;
    s.width = `${w}px`;
    s.height = `${h}px`;
  }
}
