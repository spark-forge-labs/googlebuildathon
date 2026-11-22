import { GameEngine } from './game/engine.js';
import { CITIES, getCityById } from './game/cities.js';
import { CAR_CATALOG } from './game/cars.js';
import { fetchTop10, renderLeaderboard, sanitizeName, leaderboardOnline } from './game/leaderboard.js';

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
  finishLbTitle: document.getElementById('finish-lb-title'),
  finishLbList: document.getElementById('finish-lb-list'),
  finishLbStatus: document.getElementById('finish-lb-status'),
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

// Populate the 15 Indian city circuits
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
// ---------- Player name (required before racing) ----------
const nameInput = document.getElementById('player-name');
const nameHint = document.getElementById('name-hint');
nameInput.value = engine.playerName || '';
nameInput.addEventListener('input', () => {
  nameInput.classList.remove('invalid');
  nameHint.classList.remove('error');
  nameHint.textContent = 'Shown on the leaderboard';
  engine.setPlayerName(nameInput.value);
});

function ensurePlayerName() {
  const name = sanitizeName(nameInput.value);
  if (name) {
    engine.setPlayerName(name);
    return true;
  }
  nameInput.classList.remove('invalid');
  void nameInput.offsetWidth; // restart the shake animation
  nameInput.classList.add('invalid');
  nameHint.classList.add('error');
  nameHint.textContent = 'Enter your name to race';
  nameInput.focus();
  return false;
}

function startRaceFromTap() {
  if (engine.state === 'MENU' && !ensurePlayerName()) return;
  if (isTouchDevice && !engine.motion.enabled) engine.toggleMotionSteering();
  engine.startRace();
}

// ---------- Leaderboard overlay ----------
const lbOverlay = document.getElementById('lb-overlay');
let lbCityIndex = 0;
async function showLeaderboard(cityId) {
  lbCityIndex = Math.max(0, CITIES.findIndex((c) => c.id === cityId));
  lbOverlay.classList.remove('hidden');
  await refreshLeaderboard();
}
async function refreshLeaderboard() {
  const city = CITIES[lbCityIndex];
  document.getElementById('lb-city').textContent = `${city.name.toUpperCase()}`;
  const list = document.getElementById('lb-list');
  const status = document.getElementById('lb-status');
  list.innerHTML = '<div class="lb-empty">Loading…</div>';
  status.textContent = '';
  const { rows, source } = await fetchTop10(city.id);
  if (CITIES[lbCityIndex].id !== city.id) return; // user moved on
  renderLeaderboard(list, rows, null);
  status.textContent =
    source === 'online'
      ? `${city.nativeName} • live from the BeyondGravity leaderboard`
      : leaderboardOnline
        ? 'Could not reach BeyondGravity right now: showing times saved on this device'
        : 'Times saved on this device';
}
document.getElementById('btn-leaderboard').addEventListener('click', () => showLeaderboard(engine.selectedCityId));
document.getElementById('lb-prev').addEventListener('click', () => {
  lbCityIndex = (lbCityIndex - 1 + CITIES.length) % CITIES.length;
  refreshLeaderboard();
});
document.getElementById('lb-next').addEventListener('click', () => {
  lbCityIndex = (lbCityIndex + 1) % CITIES.length;
  refreshLeaderboard();
});
document.getElementById('lb-close').addEventListener('click', () => lbOverlay.classList.add('hidden'));
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
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  if (typing) {
    if (e.code === 'Enter' && engine.state === 'MENU') startRaceFromTap();
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  setKey(e.code, true);
  if (!e.repeat) {
    if (e.code === 'KeyC') engine.cycleCamera();
    if (e.code === 'KeyM') engine.toggleAudio();
    if (e.code === 'KeyB') engine.toggleMusic();
    if (e.code === 'KeyR') engine.resetPlayerCar();
    if (e.code === 'Enter' && engine.state === 'MENU') startRaceFromTap();
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
