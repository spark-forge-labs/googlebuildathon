import QRCode from 'qrcode';
import { CITIES } from './cities.js';
import { MotionSteeringController } from './motionControls.js';

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Runs on the TV / Desktop screen.
 * Listens for wireless Phone Controller steering, pedals & actions via SSE + BroadcastChannel,
 * generates QR codes for pairing, and launches Casting / TV Fullscreen presentation.
 */
export class TVHostBridge {
  constructor({ onRemoteInput, onRemoteAction, onConnectionChange }) {
    this.onRemoteInput = onRemoteInput || (() => {});
    this.onRemoteAction = onRemoteAction || (() => {});
    this.onConnectionChange = onConnectionChange || (() => {});

    const params = new URLSearchParams(window.location.search);
    this.roomCode = (params.get('tv') || randomRoomCode()).toUpperCase();
    this.phoneConnected = false;
    this.phoneCount = 0;
    this.relayAvailable = false;
    this.lanBaseUrl = window.location.origin;

    this.sse = null;
    this.bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`india-desk-gp-${this.roomCode}`) : null;
    this.lastTelemetrySent = 0;
    this.presentationRequest = null;

    this._initBroadcastChannel();
    this._initNetworkAndRelay();
  }

  _initBroadcastChannel() {
    if (!this.bc) return;
    this.bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg) return;
      if (msg.type === 'phone_join') {
        this.phoneConnected = true;
        this.phoneCount = Math.max(1, this.phoneCount);
        this.onConnectionChange(true, this.phoneCount);
      } else if (msg.type === 'input') {
        this.phoneConnected = true;
        this.onRemoteInput(msg);
      } else if (msg.type === 'action') {
        this.onRemoteAction(msg.action, msg.value);
      }
    };
  }

  async _initNetworkAndRelay() {
    try {
      const resp = await fetch('/api/network-info');
      if (resp.ok) {
        const info = await resp.json();
        this.relayAvailable = Boolean(info.relayAvailable);
        const proto = window.location.protocol;
        if (info.lanIp && info.lanIp !== '127.0.0.1') {
          this.lanBaseUrl = `${proto}//${info.lanIp}:${info.port}`;
        }
      }
    } catch {
      this.relayAvailable = false;
    }

    if (this.relayAvailable) {
      this._connectSSE();
    }
  }

  _connectSSE() {
    if (this.sse) this.sse.close();
    this.sse = new EventSource(`/api/relay/host?room=${encodeURIComponent(this.roomCode)}`);
    this.sse.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'phone_status') {
          this.phoneConnected = Boolean(msg.connected);
          this.phoneCount = msg.count || 0;
          this.onConnectionChange(this.phoneConnected, this.phoneCount);
        } else if (msg.type === 'ready') {
          this.phoneConnected = (msg.phones || 0) > 0;
          this.phoneCount = msg.phones || 0;
          this.onConnectionChange(this.phoneConnected, this.phoneCount);
        } else if (msg.type === 'input') {
          if (!this.phoneConnected) {
            this.phoneConnected = true;
            this.onConnectionChange(true, 1);
          }
          this.onRemoteInput(msg);
        } else if (msg.type === 'action') {
          this.onRemoteAction(msg.action, msg.value);
        }
      } catch {}
    };
  }

  getControllerUrl() {
    return `${this.lanBaseUrl}/?controller=${this.roomCode}`;
  }

  getTVUrl() {
    return `${this.lanBaseUrl}/?tv=${this.roomCode}`;
  }

  async renderQRCode(canvasEl) {
    const url = this.getControllerUrl();
    await QRCode.toCanvas(canvasEl, url, {
      width: 196,
      margin: 2,
      color: { dark: '#0c1220', light: '#ffffff' },
    });
    return url;
  }

  sendTelemetry(telemetry) {
    const now = performance.now();
    if (!this.phoneConnected || now - this.lastTelemetrySent < 140) return;
    this.lastTelemetrySent = now;

    if (this.bc) {
      this.bc.postMessage({ type: 'telemetry', payload: telemetry });
    }
    if (this.relayAvailable) {
      fetch(`/api/relay/telemetry?room=${encodeURIComponent(this.roomCode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telemetry),
        keepalive: true,
      }).catch(() => {});
    }
  }

  /**
   * Attempts native Web Presentation / Cast dialog (Chrome Cast / Wireless Display),
   * and enters crisp TV Fullscreen mode as fallback.
   */
  async castToTV() {
    const tvUrl = this.getTVUrl();
    if (typeof window.PresentationRequest === 'function') {
      try {
        if (!this.presentationRequest) {
          this.presentationRequest = new window.PresentationRequest([tvUrl]);
        }
        await this.presentationRequest.start();
        return { mode: 'presentation', message: 'Casting to TV display!' };
      } catch (err) {
        // User cancelled or no Chromecast receiver found on browser — fall through cleanly
      }
    }

    // Enter fullscreen TV mode on this display so AirPlay / HDMI / Chrome Cast Tab looks like a console!
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        return {
          mode: 'fullscreen',
          message: 'TV Fullscreen active! Use Chrome "Cast" or AirPlay to mirror to your TV.',
        };
      } catch {}
    }

    return {
      mode: 'guide',
      message: 'Use Chrome menu → Cast, AirPlay, or open the TV URL on your Smart TV browser!',
    };
  }
}

/**
 * Full-screen Wireless Steering Wheel App that automatically launches
 * when a phone opens `/?controller=XXXX` (by scanning the QR code on the TV).
 */
export function launchPhoneControllerMode(roomCode) {
  const code = roomCode.toUpperCase();
  document.title = `Steering Wheel • Room ${code}`;

  // Replace body view with sleek dedicated F1/GT wireless phone steering wheel UI
  document.getElementById('game-root').innerHTML = `
    <div class="phone-pad-root">
      <div class="pad-header">
        <div class="pad-brand">
          <span class="pad-dot" id="pad-conn-dot"></span>
          <span class="pad-title">INDIA DESK GP • WHEEL</span>
          <span class="pad-room">ROOM ${code}</span>
        </div>
        <div class="pad-actions">
          <button id="pad-gyro-btn" class="pad-chip">GYRO: OFF</button>
          <button id="pad-recenter-btn" class="pad-chip">CENTER</button>
          <button id="pad-cam-btn" class="pad-chip">CAM</button>
          <button id="pad-reset-btn" class="pad-chip">RESET</button>
        </div>
      </div>

      <!-- Live F1-style Telemetry Strip synced from TV -->
      <div class="pad-dash">
        <div class="dash-cell"><span class="dash-lbl">CITY</span><span class="dash-val" id="pad-city">HYDERABAD</span></div>
        <div class="dash-cell"><span class="dash-lbl">POS</span><span class="dash-val gold" id="pad-pos">1st</span></div>
        <div class="dash-cell"><span class="dash-lbl">LAP</span><span class="dash-val" id="pad-lap">1 / 3</span></div>
        <div class="dash-cell"><span class="dash-lbl">SPEED</span><span class="dash-val teal mono" id="pad-speed">0 KM/H</span></div>
        <div class="dash-cell"><span class="dash-lbl">GEAR</span><span class="dash-val mono" id="pad-gear">1</span></div>
      </div>

      <!-- Main Cockpit Controls: Left Pedals | Center Interactive Steering Wheel | Right Pedals -->
      <div class="pad-cockpit">
        <div class="pad-pedal-col">
          <button id="pad-brake" class="pedal-btn brake">BRAKE<br/><span>REV</span></button>
          <button id="pad-drift" class="pedal-btn drift">DRIFT<br/><span>CHARGE</span></button>
        </div>

        <div class="pad-wheel-zone" id="pad-wheel-zone">
          <div class="wheel-hint" id="pad-wheel-hint">DRAG WHEEL OR TAP GYRO TO TILT</div>
          <svg id="pad-wheel-svg" class="pad-wheel-svg" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="rimGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#334155"/>
                <stop offset="50%" stop-color="#1e293b"/>
                <stop offset="100%" stop-color="#0f172a"/>
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="84" fill="none" stroke="url(#rimGrad)" stroke-width="20"/>
            <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
            <!-- Top saffron race centering marker -->
            <rect x="93" y="6" width="14" height="20" rx="4" fill="#ff8c2b"/>
            <!-- Spokes -->
            <line x1="100" y1="28" x2="100" y2="82" stroke="#475569" stroke-width="12" stroke-linecap="round"/>
            <line x1="28" y1="126" x2="82" y2="108" stroke="#475569" stroke-width="14" stroke-linecap="round"/>
            <line x1="172" y1="126" x2="118" y2="108" stroke="#475569" stroke-width="14" stroke-linecap="round"/>
            <circle cx="100" cy="100" r="24" fill="#0f172a" stroke="#f7c948" stroke-width="4"/>
            <text x="100" y="105" text-anchor="middle" fill="#f7c948" font-size="13" font-weight="900">GP</text>
          </svg>
          <div class="pad-quick-row">
            <button id="pad-start-btn" class="pad-start-btn">START / RESTART RACE</button>
            <select id="pad-city-select" class="pad-city-select" aria-label="Select City">
              ${CITIES.map((c) => `<option value="${c.id}">${c.name} (${c.nativeName})</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="pad-pedal-col">
          <button id="pad-nitro" class="pedal-btn nitro">NITRO<br/><span>BOOST</span></button>
          <button id="pad-gas" class="pedal-btn gas">GAS<br/><span>THROTTLE</span></button>
        </div>
      </div>
    </div>
  `;

  const state = {
    up: false,
    down: false,
    drift: false,
    boost: false,
    touchSteer: 0,
  };

  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`india-desk-gp-${code}`) : null;
  if (bc) bc.postMessage({ type: 'phone_join' });

  const connDot = document.getElementById('pad-conn-dot');
  const wheelSvg = document.getElementById('pad-wheel-svg');
  const wheelHint = document.getElementById('pad-wheel-hint');
  const gyroBtn = document.getElementById('pad-gyro-btn');

  // Connect SSE for live TV telemetry
  try {
    const sse = new EventSource(`/api/relay/phone?room=${encodeURIComponent(code)}`);
    sse.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'connected') {
          connDot.classList.add('online');
        } else if (msg.type === 'telemetry' && msg.payload) {
          updateDash(msg.payload);
        }
      } catch {}
    };
  } catch {}

  if (bc) {
    connDot.classList.add('online');
    bc.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'telemetry' && ev.data.payload) {
        updateDash(ev.data.payload);
      }
    };
  }

  function updateDash(t) {
    if (t.city) document.getElementById('pad-city').textContent = t.city.toUpperCase();
    if (t.pos) document.getElementById('pad-pos').textContent = t.pos;
    if (t.lap) document.getElementById('pad-lap').textContent = t.lap;
    if (typeof t.speed === 'number') document.getElementById('pad-speed').textContent = `${t.speed} KM/H`;
    if (t.gear) document.getElementById('pad-gear').textContent = t.gear;
  }

  // Gyroscope steering wheel controller
  const motion = new MotionSteeringController({
    onStatusChange: (status, msg) => {
      gyroBtn.textContent = motion.enabled ? 'GYRO: ON' : 'GYRO: OFF';
      gyroBtn.classList.toggle('active', motion.enabled);
      wheelHint.textContent = msg;
    },
  });

  gyroBtn.addEventListener('click', () => motion.toggle());
  document.getElementById('pad-recenter-btn').addEventListener('click', () => {
    motion.recenter();
    state.touchSteer = 0;
  });

  // Smooth touch-drag steering on the steering wheel (works even over plain HTTP or desktop tab!)
  const wheelZone = document.getElementById('pad-wheel-zone');
  let dragging = false;
  let dragStartX = 0;

  const onDragStart = (clientX) => {
    dragging = true;
    dragStartX = clientX;
  };
  const onDragMove = (clientX) => {
    if (!dragging) return;
    const dx = clientX - dragStartX;
    // Physics: +1 = left, -1 = right
    state.touchSteer = Math.max(-1, Math.min(1, -dx / 85));
  };
  const onDragEnd = () => {
    dragging = false;
    state.touchSteer = 0;
  };

  wheelSvg.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onDragStart(e.touches[0].clientX);
  }, { passive: false });
  wheelZone.addEventListener('touchmove', (e) => {
    if (dragging) {
      e.preventDefault();
      onDragMove(e.touches[0].clientX);
    }
  }, { passive: false });
  window.addEventListener('touchend', onDragEnd);
  window.addEventListener('touchcancel', onDragEnd);

  wheelSvg.addEventListener('mousedown', (e) => onDragStart(e.clientX));
  window.addEventListener('mousemove', (e) => onDragMove(e.clientX));
  window.addEventListener('mouseup', onDragEnd);

  // Pedals
  function bindPedal(id, field, vibrateMs = 15) {
    const el = document.getElementById(id);
    const press = (e) => {
      e.preventDefault();
      state[field] = true;
      el.classList.add('pressed');
      if (navigator.vibrate) navigator.vibrate(vibrateMs);
      pushInput();
    };
    const release = (e) => {
      e.preventDefault();
      state[field] = false;
      el.classList.remove('pressed');
      pushInput();
    };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);
  }
  bindPedal('pad-gas', 'up', 12);
  bindPedal('pad-brake', 'down', 18);
  bindPedal('pad-drift', 'drift', 20);
  bindPedal('pad-nitro', 'boost', 30);

  // Discrete TV actions
  function sendAction(action, value = null) {
    if (navigator.vibrate) navigator.vibrate(20);
    const payload = { type: 'action', action, value };
    if (bc) bc.postMessage(payload);
    fetch(`/api/relay/send?room=${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  document.getElementById('pad-start-btn').addEventListener('click', () => sendAction('start_race'));
  document.getElementById('pad-cam-btn').addEventListener('click', () => sendAction('cycle_camera'));
  document.getElementById('pad-reset-btn').addEventListener('click', () => sendAction('reset_car'));
  document.getElementById('pad-city-select').addEventListener('change', (e) => sendAction('select_city', e.target.value));

  // Stream 30Hz low-latency input updates to TV host
  let lastPayloadStr = '';
  function pushInput() {
    const steer = Math.abs(state.touchSteer) > 0.02 ? state.touchSteer : motion.enabled ? motion.steerValue : 0;
    wheelSvg.style.transform = `rotate(${(-steer * 85).toFixed(1)}deg)`;

    const payload = {
      type: 'input',
      up: state.up,
      down: state.down,
      throttle: state.up ? 1 : motion.enabled ? Number((motion.throttleValue || 0).toFixed(3)) : 0,
      brake: state.down ? 1 : motion.enabled ? Number((motion.brakeValue || 0).toFixed(3)) : 0,
      drift: state.drift,
      boost: state.boost,
      steer: Number(steer.toFixed(3)),
    };
    const str = JSON.stringify(payload);
    if (
      str === lastPayloadStr &&
      steer === 0 &&
      !payload.up &&
      !payload.down &&
      payload.throttle === 0 &&
      payload.brake === 0 &&
      !payload.drift &&
      !payload.boost
    ) {
      return;
    }
    lastPayloadStr = str;

    if (bc) bc.postMessage(payload);
    fetch(`/api/relay/send?room=${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: str,
    }).catch(() => {});
  }

  setInterval(pushInput, 33);
}
