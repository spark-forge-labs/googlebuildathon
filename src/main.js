import { GameEngine } from './game/engine.js';
import { CITIES, getCityById } from './game/cities.js';
import { CAR_CATALOG } from './game/cars.js';

const ui = {
  startOverlay: document.getElementById('start-overlay'),
  finishOverlay: document.getElementById('finish-overlay'),
  countdownOverlay: document.getElementById('countdown-overlay'),
  countdownText: document.getElementById('countdown-text'),
  hud: document.getElementById('hud'),
  speedLines: document.getElementById('speed-lines'),
  cityGrid: document.getElementById('city-grid'),
  citySubtitle: document.getElementById('city-subtitle'),
  carGrid: document.getElementById('car-grid'),

  hudPos: document.getElementById('hud-pos'),
  hudPosSuffix: document.getElementById('hud-pos-suffix'),
  hudLap: document.getElementById('hud-lap'),
  hudTime: document.getElementById('hud-time'),
  hudSpeed: document.getElementById('hud-speed'),
  hudGear: document.getElementById('hud-gear'),
  boostLabel: document.getElementById('boost-label'),
  boostBarFill: document.getElementById('boost-bar-fill'),
  driftBadge: document.getElementById('drift-badge'),
  toastBanner: document.getElementById('toast-banner'),
  landmarkTe: document.getElementById('landmark-te'),
  landmarkEn: document.getElementById('landmark-en'),
  minimapLabel: document.getElementById('minimap-label'),

  btnCamera: document.getElementById('btn-camera'),
  btnAudio: document.getElementById('btn-audio'),
  btnMusic: document.getElementById('btn-music'),
  btnReset: document.getElementById('btn-reset'),
  btnMenu: document.getElementById('btn-menu'),
  btnMotionMenu: document.getElementById('btn-motion-menu'),
  btnMotionHud: document.getElementById('btn-motion-hud'),
  motionStatusText: document.getElementById('motion-status-text'),
  pedalFill: document.getElementById('pedal-fill'),
  tiltReadout: document.getElementById('tilt-readout'),
  gyroWheelHud: document.getElementById('gyro-wheel-hud'),
  gyroWheelSvg: document.getElementById('gyro-wheel-svg'),
  touchSteerArrows: document.getElementById('touch-steer-arrows'),

  finishBadge: document.getElementById('finish-badge'),
  finishTitle: document.getElementById('finish-title'),
  finishTotalTime: document.getElementById('finish-total-time'),
  finishBestLap: document.getElementById('finish-best-lap'),
  finishTopSpeed: document.getElementById('finish-top-speed'),
  finishStandings: document.getElementById('finish-standings'),

  minimapCanvas: document.getElementById('minimap-canvas'),
  minimapCtx: document.getElementById('minimap-canvas').getContext('2d'),
};

const canvas = document.getElementById('game-canvas');
const engine = new GameEngine(canvas, ui);
if (new URLSearchParams(location.search).has('debug')) window.__engine = engine;

// Populate 7 Indian City Circuits
function renderCitySelector() {
  const activeCity = getCityById(engine.selectedCityId);
  ui.citySubtitle.textContent = `${activeCity.name} (${activeCity.nativeName}) — ${activeCity.subtitle}`;

  ui.cityGrid.innerHTML = CITIES.map(
    (city) => `
    <div class="city-chip ${city.id === engine.selectedCityId ? 'selected' : ''}" data-city-id="${city.id}">
      <div class="city-dot" style="background:${city.badgeColor};"></div>
      <div class="city-en">${city.name}</div>
      <div class="city-native">${city.nativeName}</div>
    </div>`
  ).join('');

  ui.cityGrid.querySelectorAll('.city-chip').forEach((el) => {
    el.addEventListener('click', () => {
      engine.selectCity(el.dataset.cityId);
      renderCitySelector();
    });
  });
}

// Populate 5 Selectable Rides
function renderCarSelector() {
  ui.carGrid.innerHTML = CAR_CATALOG.map(
    (car) => `
    <div class="car-option ${car.id === engine.selectedCarId ? 'selected' : ''}" data-car-id="${car.id}">
      <div class="car-swatch" style="background:${car.swatch};"></div>
      <div class="car-name">${car.name}</div>
      <div class="car-tag">${car.tag}</div>
      <div class="stat-mini">
        <span>SPD</span>
        <div class="stat-mini-bar"><div class="stat-mini-fill" style="width:${car.stats.speed}%"></div></div>
      </div>
      <div class="stat-mini">
        <span>ACC</span>
        <div class="stat-mini-bar"><div class="stat-mini-fill" style="width:${car.stats.accel}%"></div></div>
      </div>
      <div class="stat-mini">
        <span>HND</span>
        <div class="stat-mini-bar"><div class="stat-mini-fill" style="width:${car.stats.handling}%"></div></div>
      </div>
    </div>`
  ).join('');

  ui.carGrid.querySelectorAll('.car-option').forEach((el) => {
    el.addEventListener('click', () => {
      engine.selectCar(el.dataset.carId);
      renderCarSelector();
    });
  });
}

renderCitySelector();
renderCarSelector();

// UI Buttons
// On phones, starting a race switches tilt controls on automatically (inside the tap, so
// iOS can show its motion-permission prompt).
const isTouchDevice = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
function startRaceFromTap() {
  if (isTouchDevice && !engine.motion.enabled) engine.toggleMotionSteering();
  engine.startRace();
}
document.getElementById('btn-start-race').addEventListener('click', startRaceFromTap);
document.getElementById('btn-race-again').addEventListener('click', startRaceFromTap);
document.getElementById('btn-back-menu').addEventListener('click', () => engine.backToMenu());

ui.btnCamera.addEventListener('click', () => engine.cycleCamera());
ui.btnAudio.addEventListener('click', () => engine.toggleAudio());
ui.btnMusic.addEventListener('click', () => engine.toggleMusic());
if (!engine.sound.musicEnabled) ui.btnMusic.textContent = 'MUSIC: OFF';

// Start the menu music on the first interaction (browsers block audio until then)
const unlockAudio = () => engine.sound.init();
['pointerdown', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, unlockAudio, { once: true }));
document.addEventListener('visibilitychange', () => engine.sound.setSuspended(document.hidden));
ui.btnReset.addEventListener('click', () => engine.resetPlayerCar());
ui.btnMenu.addEventListener('click', () => engine.backToMenu());

// Mobile Motion Sensor Steering Wheel buttons (must be invoked inside click gesture for iOS!)
ui.btnMotionMenu.addEventListener('click', () => engine.toggleMotionSteering());
ui.btnMotionHud.addEventListener('click', () => engine.toggleMotionSteering());
document.getElementById('btn-recenter-wheel').addEventListener('click', () => engine.recenterMotionWheel());

// Keyboard controls
function setKey(code, pressed) {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      engine.input.up = pressed;
      break;
    case 'ArrowDown':
    case 'KeyS':
      engine.input.down = pressed;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      engine.input.left = pressed;
      break;
    case 'ArrowRight':
    case 'KeyD':
      engine.input.right = pressed;
      break;
    case 'Space':
      engine.input.drift = pressed;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
    case 'KeyN':
      engine.input.boost = pressed;
      break;
    default:
      break;
  }
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  setKey(e.code, true);
  if (!e.repeat) {
    if (e.code === 'KeyC') engine.cycleCamera();
    if (e.code === 'KeyM') engine.toggleAudio();
    if (e.code === 'KeyB') engine.toggleMusic();
    if (e.code === 'KeyR') engine.resetPlayerCar();
    if (e.code === 'Enter' && engine.state === 'MENU') engine.startRace();
  }
});

window.addEventListener('keyup', (e) => setKey(e.code, false));
window.addEventListener('blur', () => {
  engine.input.up = false;
  engine.input.down = false;
  engine.input.left = false;
  engine.input.right = false;
  engine.input.drift = false;
  engine.input.boost = false;
});

// Touch controls
function bindTouch(id, field) {
  const el = document.getElementById(id);
  if (!el) return;
  const on = (e) => {
    e.preventDefault();
    engine.input[field] = true;
  };
  const off = (e) => {
    e.preventDefault();
    engine.input[field] = false;
  };
  el.addEventListener('touchstart', on, { passive: false });
  el.addEventListener('touchend', off, { passive: false });
  el.addEventListener('touchcancel', off, { passive: false });
}

bindTouch('touch-left-btn', 'left');
bindTouch('touch-right-btn', 'right');
bindTouch('touch-brake-btn', 'down');
bindTouch('touch-gas-btn', 'up');
bindTouch('touch-drift-btn', 'drift');
bindTouch('touch-boost-btn', 'boost');
