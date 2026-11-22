import * as THREE from 'three';
import { CITIES, getCityById } from './cities.js';
import { RaceTrack } from './track.js';
import { DeskWorld, DESK_HALF_W, DESK_HALF_D } from './deskWorld.js';
import { CAR_CATALOG, AI_COLORS, buildVehicleMesh } from './cars.js';
import { Racer, resolveCarCollisions, TOTAL_LAPS } from './physics.js';
import { ParticleSystem } from './particles.js';
import { SoundEngine } from './audio.js';
import { MotionSteeringController } from './motionControls.js';
import { buildRealSky, loadHdriEnvironment, loadTreeLibrary, ensureTreeVariants } from './realWorld.js';
import { preloadCarModel } from './carModels.js';
import { Q } from './quality.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const CAMERA_MODES = ['CHASE', 'HOOD', 'BUMPER', 'DESK TOP'];

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00.00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function ordinalSuffix(n) {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

/**
 * Generates a realistic studio/sunset environment map via PMREMGenerator
 * so clearcoat cars, chrome rims, glass towers, and water gleam realistically!
 */
function buildStudioEnvironment(renderer, topColor, bottomColor) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();

  const skyGeo = new THREE.SphereGeometry(50, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({ color: bottomColor, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  // Overhead warm desk-lamp softbox + cool horizon reflection strips
  const warmPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff0d4, side: THREE.DoubleSide })
  );
  warmPanel.position.set(-14, 24, 10);
  warmPanel.lookAt(0, 0, 0);
  envScene.add(warmPanel);

  const coolPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(38, 16),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc, side: THREE.DoubleSide })
  );
  coolPanel.position.set(22, 16, -20);
  coolPanel.lookAt(0, 0, 0);
  envScene.add(coolPanel);

  const horizonRing = new THREE.Mesh(
    new THREE.TorusGeometry(28, 1.8, 8, 24),
    new THREE.MeshBasicMaterial({ color: topColor })
  );
  horizonRing.rotation.x = Math.PI / 2;
  horizonRing.position.y = 4;
  envScene.add(horizonRing);

  const envRT = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return envRT;
}

export class GameEngine {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Q.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.sky = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.4, 2600);
    this.camModeIdx = 0;
    this.camPos = new THREE.Vector3(0, 45, 110);
    this.camLook = new THREE.Vector3(0, 4, 0);
    this.envRenderTarget = null;

    this.setupLights();

    this.particles = new ParticleSystem(this.scene, 280, 220);
    this.sound = new SoundEngine();

    this.motion = new MotionSteeringController({
      onStatusChange: (status, message) => this.onMotionStatus(status, message),
    });

    this.selectedCityId = CITIES[0].id;
    this.selectedCarId = CAR_CATALOG[0].id;
    this.currentCity = CITIES[0];
    this.track = null;
    this.deskWorld = null;

    this.state = 'MENU';
    this.racers = [];
    this.player = null;
    this.raceTime = 0;
    this.countdownTimer = 0;
    this.lastCountdownBeat = -1;
    this.steamTimer = 0;
    this.clock = new THREE.Clock();
    this.elapsed = 0;

    this.input = {
      up: false,
      down: false,
      left: false,
      right: false,
      drift: false,
      boost: false,
      analogSteer: 0,
      analogThrottle: 0,
      analogBrake: 0,
    };

    // Load initial city (Hyderabad) live on top of the desk!
    this.loadCityWorld(this.selectedCityId);
    this.setupPostProcessing();
    this.loadHdAssets();

    window.addEventListener('resize', () => this.onResize());
    this.loop();
  }

  setupLights() {
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3b2416, 0.85);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffe7c2, 2.05);
    this.dirLight.position.set(-68, 92, 48);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = Q.shadowMapSize;
    this.dirLight.shadow.mapSize.height = Q.shadowMapSize;
    this.dirLight.shadow.normalBias = 0.04;
    this.dirLight.shadow.camera.near = 20;
    this.dirLight.shadow.camera.far = 400;
    const d = 128;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0006;
    this.scene.add(this.dirLight);

    this.lampGlow = new THREE.PointLight(0xffcf87, 130, 145, 1.3);
    this.lampGlow.position.set(-65, 42, -32);
    this.scene.add(this.lampGlow);

    this.rimLight = new THREE.DirectionalLight(0x60a5fa, 0.7);
    this.rimLight.position.set(85, 45, -80);
    this.scene.add(this.rimLight);
  }

  /** Film-style post chain on desktop: ambient occlusion, gentle bloom, SMAA. Phones skip it. */
  setupPostProcessing() {
    this.composer = null;
    if (!Q.post) return;
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(Q.pixelRatio);
      composer.setSize(w, h);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const gtao = new GTAOPass(this.scene, this.camera, w, h);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 2, scale: 1, samples: 12 });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.5, 0.92);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composer.addPass(new SMAAPass(w * Q.pixelRatio, h * Q.pixelRatio));
      this.composer = composer;
    } catch (e) {
      console.warn('Post-processing unavailable, rendering directly', e);
      this.composer = null;
    }
  }

  /** Real car model + EZ-Tree load after the menu is visible, then the city is rebuilt in HD. */
  loadHdAssets() {
    const badge = document.createElement('div');
    badge.textContent = 'Loading real cars & trees…';
    badge.style.cssText =
      'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:50;padding:5px 12px;border-radius:999px;' +
      'background:rgba(10,14,24,.8);color:#f7c948;font:700 11px/1.2 system-ui,sans-serif;letter-spacing:.06em;pointer-events:none';
    document.body.appendChild(badge);
    this.pendingHdRebuild = false;
    Promise.all([preloadCarModel(), loadTreeLibrary()]).then(() => {
      ensureTreeVariants(this.renderer);
      badge.remove();
      if (this.state === 'MENU') this.loadCityWorld(this.selectedCityId);
      else this.pendingHdRebuild = true;
    });
  }

  loadCityWorld(cityId) {
    const city = getCityById(cityId);
    this.selectedCityId = city.id;
    this.currentCity = city;

    // Cleanly tear down previous city track & world
    if (this.track) {
      this.scene.remove(this.track.group);
      this.track = null;
    }
    if (this.deskWorld) {
      this.deskWorld.dispose();
      this.deskWorld = null;
    }
    this.particles.clearSkids();

    // Real-world atmosphere: physical sky, sun position, haze & sky reflections
    if (this.sky) this.scene.remove(this.sky);
    if (this.envRenderTarget) this.envRenderTarget.dispose();
    const atmo = buildRealSky(this.renderer, city);
    this.sky = atmo.sky;
    this.scene.add(this.sky);
    this.envRenderTarget = atmo.envRT;
    this.scene.environment = atmo.envRT.texture;
    this.scene.environmentIntensity = 0.9;
    // Swap in the real-world HDRI for reflections as soon as it's ready
    loadHdriEnvironment(this.renderer, atmo.hdri).then((rt) => {
      if (rt && this.currentCity && this.currentCity.id === city.id) this.scene.environment = rt.texture;
    });
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(atmo.haze, 0.0016);

    this.dirLight.color.copy(atmo.sunColor);
    this.dirLight.intensity = atmo.sunIntensity;
    this.dirLight.position.copy(atmo.sunDir).multiplyScalar(160);
    this.dirLight.target.position.set(0, 0, 0);
    this.scene.add(this.dirLight.target);
    this.hemiLight.color.set(0xbfd6ff);
    this.hemiLight.groundColor.set(0x5b4a36);
    this.hemiLight.intensity = 0.55;
    this.rimLight.color.set(0xffffff);
    this.rimLight.intensity = 0.15;
    this.lampGlow.intensity = 0;

    // Build city's track & desk diorama with all iconic towers and bridges
    this.track = new RaceTrack(city);
    this.scene.add(this.track.group);

    this.deskWorld = new DeskWorld(this.scene, this.track, city);

    // Update city-specific HUD labels
    if (this.ui.boostLabel) this.ui.boostLabel.textContent = city.nitroName;
    if (this.ui.minimapLabel) this.ui.minimapLabel.textContent = `${city.name.toUpperCase()} CIRCUIT`;

    this.spawnRacers();
  }

  spawnRacers() {
    for (const r of this.racers) {
      this.scene.remove(r.rig.root);
    }
    this.racers = [];

    const playerSpec = CAR_CATALOG.find((c) => c.id === this.selectedCarId) || CAR_CATALOG[0];
    const aiNames = this.currentCity.aiNames;
    const aiEntries = AI_COLORS.map((ai, i) => ({
      isPlayer: false,
      name: aiNames[i] || `Rival ${i + 1}`,
      spec: ai,
      id: `ai-${i}`,
    }));

    const entries = [
      ...aiEntries.slice(0, 4),
      { isPlayer: true, name: `YOU (${playerSpec.name})`, spec: playerSpec, id: 'player' },
      aiEntries[4],
    ];

    entries.forEach((entry, gridIdx) => {
      const rig = buildVehicleMesh({
        lite: Q.carLite,
        bodyColor: entry.spec.bodyColor,
        accentColor: entry.spec.accentColor,
        type: entry.spec.type,
        isPlayer: entry.isPlayer,
      });
      this.scene.add(rig.root);

      const racer = new Racer({
        id: entry.id,
        name: entry.name,
        isPlayer: entry.isPlayer,
        spec: entry.spec,
        meshRig: rig,
        track: this.track,
        gridIndex: gridIdx,
      });
      this.racers.push(racer);
      if (entry.isPlayer) this.player = racer;
    });
  }

  selectCity(cityId) {
    if (cityId === this.selectedCityId) return;
    this.loadCityWorld(cityId);
  }

  selectCar(carId) {
    this.selectedCarId = carId;
    this.spawnRacers();
  }

  async toggleMotionSteering() {
    const active = await this.motion.toggle();
    this.updateMotionButtonsUI();
    return active;
  }

  recenterMotionWheel() {
    this.motion.recenter();
  }

  onMotionStatus(status, message) {
    if (this.ui.motionStatusText) {
      this.ui.motionStatusText.textContent = message;
    }
    if (status === 'insecure' || status === 'denied' || status === 'unavailable' || status === 'waiting') {
      this.showToast(message, 6500);
    }
    this.updateMotionButtonsUI();
  }

  updateMotionButtonsUI() {
    const on = this.motion.enabled;
    if (this.ui.btnMotionMenu) {
      this.ui.btnMotionMenu.classList.toggle('active', on);
      this.ui.btnMotionMenu.textContent = on ? 'GYRO WHEEL: ON' : 'MOBILE STEERING WHEEL';
    }
    if (this.ui.btnMotionHud) {
      this.ui.btnMotionHud.classList.toggle('active', on);
      this.ui.btnMotionHud.textContent = on ? 'WHEEL: ON' : 'WHEEL: OFF';
    }
    if (this.ui.gyroWheelHud) {
      this.ui.gyroWheelHud.classList.toggle('hidden', !on);
    }
    if (this.ui.touchSteerArrows) {
      // Hide arrow buttons while steering with phone tilt so screen is unobstructed
      this.ui.touchSteerArrows.classList.toggle('hidden', on);
    }
  }

  startRace() {
    this.sound.init();
    this.particles.clearSkids();
    this.spawnRacers();
    this.state = 'COUNTDOWN';
    this.raceTime = 0;
    this.countdownTimer = 3.2;
    this.lastCountdownBeat = 4;
    this.deskWorld.setGantrySignal('off');

    if (this.motion.enabled) {
      this.motion.recenter();
    }

    this.ui.startOverlay.classList.add('hidden');
    this.ui.finishOverlay.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
    this.ui.countdownOverlay.classList.remove('hidden');
    this.updateMotionButtonsUI();

    this.snapCameraBehindPlayer();
  }

  backToMenu() {
    this.state = 'MENU';
    this.sound.setMusicIntensity('menu');
    if (this.pendingHdRebuild) {
      this.pendingHdRebuild = false;
      this.loadCityWorld(this.selectedCityId);
    }
    this.sound.updateEngine(0, false, false, false);
    this.ui.hud.classList.add('hidden');
    this.ui.countdownOverlay.classList.add('hidden');
    this.ui.finishOverlay.classList.add('hidden');
    this.ui.speedLines.classList.add('hidden');
    this.ui.startOverlay.classList.remove('hidden');
    this.spawnRacers();
  }

  cycleCamera() {
    this.camModeIdx = (this.camModeIdx + 1) % CAMERA_MODES.length;
    this.ui.btnCamera.textContent = `CAM: ${CAMERA_MODES[this.camModeIdx]}`;
  }

  toggleMusic() {
    this.sound.init();
    const next = !this.sound.musicEnabled;
    this.sound.setMusicEnabled(next);
    if (this.ui.btnMusic) this.ui.btnMusic.textContent = `MUSIC: ${next ? 'ON' : 'OFF'}`;
  }

  /** Small transient message over the game (motion sensor problems etc.). */
  showToast(message, ms = 5000) {
    if (!this.toastEl) {
      this.toastEl = document.createElement('div');
      this.toastEl.style.cssText =
        'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:60;max-width:88vw;padding:8px 14px;border-radius:10px;' +
        'background:rgba(127,29,29,.92);color:#fff;font:700 12px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.35);transition:opacity .3s';
      document.body.appendChild(this.toastEl);
    }
    this.toastEl.textContent = message;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastEl.style.opacity = '0'), ms);
  }

  /** Coaching hint for tilt controls: shown at the start and whenever the car sits still. */
  updateTiltCoach(dt) {
    if (!this.coachEl) {
      this.coachEl = document.createElement('div');
      this.coachEl.innerHTML =
        '<div style="font-size:15px;letter-spacing:.06em">TILT PHONE <b style="color:#4ade80">AWAY ▲</b> TO ACCELERATE</div>' +
        '<div style="font-size:11px;opacity:.85;margin-top:3px">tilt back ▼ to brake • turn like a wheel to steer</div>';
      this.coachEl.style.cssText =
        'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:55;padding:10px 18px;border-radius:12px;' +
        'background:rgba(10,14,24,.78);color:#fff;font:800 13px/1.2 system-ui,sans-serif;text-align:center;pointer-events:none;' +
        'border:1px solid rgba(74,222,128,.5);opacity:0;transition:opacity .25s';
      document.body.appendChild(this.coachEl);
    }
    let show = false;
    if (this.motion.enabled && this.player) {
      if (this.state === 'COUNTDOWN') show = true;
      else if (this.state === 'RACING') {
        const idle = Math.abs(this.player.speed) < 4 && this.motion.throttleValue < 0.05;
        this.coachIdle = idle ? (this.coachIdle || 0) + dt : 0;
        show = this.raceTime < 3 || this.coachIdle > 2;
      }
    }
    this.coachEl.style.opacity = show ? '1' : '0';
  }

  toggleAudio() {
    this.sound.init();
    const next = !this.sound.enabled;
    this.sound.setEnabled(next);
    this.ui.btnAudio.textContent = `SFX: ${next ? 'ON' : 'OFF'}`;
  }

  resetPlayerCar() {
    if (this.player && this.state === 'RACING') this.player.resetToRoad();
  }

  snapCameraBehindPlayer() {
    if (!this.player) return;
    const p = this.player;
    const backX = -Math.sin(p.heading);
    const backZ = -Math.cos(p.heading);
    this.camPos.set(p.pos.x + backX * 13, p.pos.y + 6.0, p.pos.z + backZ * 13);
    this.camLook.set(p.pos.x, p.pos.y + 1.8, p.pos.z);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  updateCountdown(dt) {
    this.countdownTimer -= dt;
    const beat = Math.ceil(this.countdownTimer);
    if (beat !== this.lastCountdownBeat && beat >= 0) {
      this.lastCountdownBeat = beat;
      if (beat === 3) {
        this.ui.countdownText.textContent = '3';
        this.deskWorld.setGantrySignal('red1');
        this.sound.playBeep(false);
      } else if (beat === 2) {
        this.ui.countdownText.textContent = '2';
        this.deskWorld.setGantrySignal('red2');
        this.sound.playBeep(false);
      } else if (beat === 1) {
        if (this.motion.enabled) this.motion.recenter();
        this.ui.countdownText.textContent = '1';
        this.deskWorld.setGantrySignal('red3');
        this.sound.playBeep(false);
      } else if (beat === 0) {
        this.sound.setMusicIntensity('race'); // the beat drops on GO
        this.ui.countdownText.textContent = 'GO!';
        this.deskWorld.setGantrySignal('green');
        this.sound.playBeep(true);
        this.state = 'RACING';
        setTimeout(() => this.ui.countdownOverlay.classList.add('hidden'), 650);
      }
      this.ui.countdownText.style.animation = 'none';
      void this.ui.countdownText.offsetWidth;
      this.ui.countdownText.style.animation = '';
    }
  }

  getStandings() {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });
  }

  showFinishModal() {
    const standings = this.getStandings();
    const playerRank = standings.findIndex((r) => r.isPlayer) + 1;

    this.ui.finishBadge.textContent = `CHECKERED FLAG • ${this.currentCity.name.toUpperCase()} GP (${this.currentCity.nativeName})`;
    this.ui.finishTitle.textContent = `${playerRank}${ordinalSuffix(playerRank).toUpperCase()} PLACE!`;
    this.ui.finishTotalTime.textContent = formatTime(this.player.finishTime);
    const bestLap = Number.isFinite(this.player.bestLapTime)
      ? formatTime(this.player.bestLapTime)
      : formatTime(this.player.finishTime / TOTAL_LAPS);
    this.ui.finishBestLap.textContent = bestLap;
    this.ui.finishTopSpeed.textContent = `${this.player.topSpeedKmh} KM/H`;

    this.ui.finishStandings.innerHTML = standings
      .map((r, idx) => {
        const timeStr = r.finished ? formatTime(r.finishTime) : `LAP ${r.lap}/${TOTAL_LAPS}`;
        return `<div class="standing-row ${r.isPlayer ? 'is-player' : ''}">
          <span>#${idx + 1} ${r.name}</span>
          <span class="mono">${timeStr}</span>
        </div>`;
      })
      .join('');

    this.ui.finishOverlay.classList.remove('hidden');
    this.ui.speedLines.classList.add('hidden');
    this.sound.playFanfare();
    this.particles.emitConfetti(this.player.pos, 65);
  }

  updateCamera(dt) {
    if (this.state === 'MENU') {
      const angle = this.elapsed * 0.16 + 0.55;
      const radius = 122;
      this.camera.position.set(
        Math.sin(angle) * radius,
        54 + Math.sin(this.elapsed * 0.4) * 6,
        Math.cos(angle) * radius * 0.82
      );
      this.camera.lookAt(0, 5, -2);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 54, Math.min(1, dt * 4));
      this.camera.updateProjectionMatrix();
      return;
    }

    const p = this.player;
    if (!p) return;

    const mode = CAMERA_MODES[this.camModeIdx];
    const fwdX = Math.sin(p.heading);
    const fwdZ = Math.cos(p.heading);
    const rightX = Math.cos(p.heading);
    const rightZ = -Math.sin(p.heading);

    // Subtle corner look-ahead pan so you naturally see into apexes
    const lookPan = -p.steerAngle * 4.5;

    let desiredPos = new THREE.Vector3();
    let desiredLook = new THREE.Vector3();
    let targetFov = 62;

    if (mode === 'CHASE') {
      const dist = p.isBoosting ? 12.2 : 10.8;
      const height = p.isBoosting ? 4.6 : 4.9;
      desiredPos.set(p.pos.x - fwdX * dist, p.pos.y + height, p.pos.z - fwdZ * dist);
      desiredLook.set(p.pos.x + fwdX * 11 + rightX * lookPan, p.pos.y + 1.85, p.pos.z + fwdZ * 11 + rightZ * lookPan);
      targetFov = p.isBoosting ? 77 : 62 + Math.min(10, (Math.abs(p.speed) / 56) * 10);
    } else if (mode === 'HOOD') {
      // Real car model is longer/lower than the built-in cars: sit over the bonnet, ahead of the windscreen
      const hoodFwd = p.rig.isRealModel ? 1.25 : 0.9;
      const hoodUp = p.rig.isRealModel ? 1.22 : 2.02;
      desiredPos.set(p.pos.x + fwdX * hoodFwd, p.pos.y + hoodUp, p.pos.z + fwdZ * hoodFwd);
      desiredLook.set(p.pos.x + fwdX * 28 + rightX * lookPan * 1.4, p.pos.y + 1.5, p.pos.z + fwdZ * 28 + rightZ * lookPan * 1.4);
      targetFov = p.isBoosting ? 84 : 70 + Math.min(8, (Math.abs(p.speed) / 56) * 8);
    } else if (mode === 'BUMPER') {
      // Raw tarmac-skimming real-time road sensation!
      // Keep the camera in front of the nose (real model nose is at ~2.45 units)
      const bumperFwd = p.rig.isRealModel ? 2.85 : 2.4;
      const bumperUp = p.rig.isRealModel ? 0.7 : 1.12;
      desiredPos.set(p.pos.x + fwdX * bumperFwd, p.pos.y + bumperUp, p.pos.z + fwdZ * bumperFwd);
      desiredLook.set(p.pos.x + fwdX * 32 + rightX * lookPan * 1.5, p.pos.y + 1.1, p.pos.z + fwdZ * 32 + rightZ * lookPan * 1.5);
      targetFov = p.isBoosting ? 88 : 74 + Math.min(9, (Math.abs(p.speed) / 56) * 9);
    } else {
      desiredPos.set(p.pos.x * 0.55, 58, p.pos.z * 0.55 + 58);
      desiredLook.set(p.pos.x * 0.72, 2, p.pos.z * 0.72);
      targetFov = 54;
    }

    const smooth = mode === 'HOOD' || mode === 'BUMPER' ? 22 : 8.2;
    if (mode === 'HOOD' || mode === 'BUMPER') {
      // Onboard cameras are bolted to the car: no positional lag, or they end up inside the body at speed
      this.camPos.copy(desiredPos);
    } else {
      this.camPos.lerp(desiredPos, Math.min(1, smooth * dt));
    }
    this.camLook.lerp(desiredLook, Math.min(1, (smooth + 2.5) * dt));

    // Visceral speed vibration & collision camera shake
    const speedVibration = this.state === 'RACING' && p.isBoosting ? 0.14 : Math.max(0, (Math.abs(p.speed) - 42) * 0.0025);
    const totalShake = (speedVibration + p.impactShake * 0.45) * (mode === 'DESK TOP' ? 0.3 : 1.0);
    const shakeX = (Math.random() - 0.5) * totalShake;
    const shakeY = (Math.random() - 0.5) * totalShake;

    this.camera.position.set(this.camPos.x + shakeX, this.camPos.y + shakeY, this.camPos.z);
    this.camera.lookAt(this.camLook);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 6.5));
    this.camera.updateProjectionMatrix();
  }

  updateHUD() {
    if (!this.player || this.state === 'MENU') return;
    const p = this.player;
    const standings = this.getStandings();
    const pos = standings.findIndex((r) => r.isPlayer) + 1;

    this.ui.hudPos.textContent = String(pos);
    this.ui.hudPosSuffix.textContent = ordinalSuffix(pos);
    this.ui.hudLap.textContent = String(Math.min(TOTAL_LAPS, p.lap));
    this.ui.hudTime.textContent = formatTime(this.raceTime);

    const kmh = Math.round(Math.abs(p.speed) * 3.8);
    this.ui.hudSpeed.textContent = String(kmh);
    const gear = p.speed < -0.5 ? 'R' : String(Math.min(6, Math.max(1, Math.floor(kmh / 36) + 1)));
    this.ui.hudGear.textContent = gear;

    this.ui.boostBarFill.style.width = `${Math.round(p.boostFuel)}%`;
    this.ui.driftBadge.classList.toggle('hidden', !p.isDrifting);
    this.ui.speedLines.classList.toggle('hidden', !(p.isBoosting && this.state === 'RACING'));
    this.ui.toastBanner.classList.toggle('hidden', !p.wrongWay);

    const zone = this.track.getLandmarkAt(p.u);
    this.ui.landmarkTe.textContent = zone.te;
    this.ui.landmarkEn.textContent = zone.en;

    // Live steering wheel indicator when Mobile Motion Sensor is active
    if (this.motion.enabled && this.ui.gyroWheelSvg) {
      const deg = this.motion.getVisualWheelDeg();
      this.ui.gyroWheelSvg.style.transform = `rotate(${deg.toFixed(1)}deg)`;
      if (this.ui.pedalFill) {
        const pv = this.motion.getPedalValue();
        const pct = Math.round(Math.abs(pv) * 50);
        this.ui.pedalFill.style.height = `${pct}%`;
        this.ui.pedalFill.style.bottom = pv >= 0 ? '50%' : `${50 - pct}%`;
        this.ui.pedalFill.classList.toggle('brake', pv < 0);
      }
      if (this.ui.tiltReadout) {
        // Live sensor readout so tilt problems are visible on the phone itself
        const d = this.motion.getDiagnostics();
        this.ui.tiltReadout.textContent =
          d.samples === 0
            ? 'NO SENSOR DATA'
            : `TILT ${d.pitch >= 0 ? '+' : ''}${d.pitch.toFixed(0)}° ${d.pitch > 3 ? 'GAS' : d.pitch < -3 ? 'BRAKE' : 'COAST'}`;
        this.ui.tiltReadout.style.color = d.samples === 0 ? '#f87171' : d.pitch > 3 ? '#4ade80' : d.pitch < -3 ? '#f87171' : '';
      }
    }

    this.drawMinimap();
  }

  drawMinimap() {
    const ctx = this.ui.minimapCtx;
    const w = this.ui.minimapCanvas.width;
    const h = this.ui.minimapCanvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(110, 71, 43, 0.34)';
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    const mapX = (wx) => ((wx + DESK_HALF_W) / (DESK_HALF_W * 2)) * (w - 18) + 9;
    const mapY = (wz) => ((wz + DESK_HALF_D) / (DESK_HALF_D * 2)) * (h - 18) + 9;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= this.track.samples.length; i += 4) {
      const s = this.track.samples[i % this.track.samples.length];
      const px = mapX(s.point.x);
      const py = mapY(s.point.z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    const sf = this.track.getFrameAt(0);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(mapX(sf.point.x) - 2, mapY(sf.point.z) - 5, 4, 10);

    for (const r of this.racers) {
      if (r.isPlayer) continue;
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(mapX(r.pos.x), mapY(r.pos.z), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.player) {
      ctx.fillStyle = this.currentCity.badgeColor;
      ctx.beginPath();
      ctx.arc(mapX(this.player.pos.x), mapY(this.player.pos.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    if (this.paused) return; // debug: frames are stepped manually via tick()
    this.tick();
  }

  tick(fixedDt = null, render = true) {
    const dt = fixedDt !== null ? fixedDt : Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    // Feed live motion sensor steering angle into physics input
    const motionOn = this.motion.enabled;
    this.input.analogSteer = motionOn ? this.motion.steerValue : 0;
    // Hold the car on the grid during the countdown so recentering doesn't launch it
    const pedalLive = motionOn && this.state === 'RACING';
    this.input.analogThrottle = pedalLive ? this.motion.throttleValue : 0;
    this.input.analogBrake = pedalLive ? this.motion.brakeValue : 0;

    this.steamTimer -= dt;
    if (this.steamTimer <= 0 && this.deskWorld && this.deskWorld.mugSteamOrigin) {
      this.steamTimer = 0.22;
      this.particles.emitSteam(this.deskWorld.mugSteamOrigin);
    }

    if (this.track) this.track.update(this.elapsed);
    if (this.deskWorld) this.deskWorld.update(this.elapsed, dt);

    if (this.state === 'COUNTDOWN') {
      this.updateCountdown(dt);
      this.sound.updateEngine(0.2, false, false, true);
    } else if (this.state === 'RACING' || this.state === 'FINISHED') {
      if (this.state === 'RACING') this.raceTime += dt;

      const leaderProgress = Math.max(...this.racers.map((r) => r.totalProgress));
      for (const r of this.racers) {
        r.update(dt, this.input, this.raceTime, this.deskWorld, this.particles, this.sound, leaderProgress);
      }
      resolveCarCollisions(this.racers, this.particles, this.sound);

      if (this.state === 'RACING' && this.player.finished) {
        this.state = 'FINISHED';
        this.showFinishModal();
      }

      const speedRatio = Math.abs(this.player.speed) / this.player.maxSpeed;
      this.sound.updateEngine(speedRatio, this.player.isDrifting, this.player.isBoosting, this.state === 'RACING');
    }

    this.particles.update(dt);
    this.updateTiltCoach(dt);
    this.updateCamera(dt);
    this.updateHUD();

    if (!render) return;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
