import QRCode from 'qrcode';
import { CITIES } from './cities.js';
import { MotionSteeringController } from './motionControls.js';

function detectSmartTV() {
  const ua = navigator.userAgent || '';
  return /Tizen|Web0S|WebOS|BRAVIA|SmartTV|SMART-TV|Android TV|AppleTV|Roku|PlayStation|Xbox|AFT|CrKey|HbbTV/i.test(ua);
}

function detectDeviceLabel() {
  const ua = navigator.userAgent || '';
  if (/Tizen/i.test(ua)) return 'Samsung Smart TV';
  if (/Web0S|WebOS/i.test(ua)) return 'LG Smart TV';
  if (/BRAVIA/i.test(ua)) return 'Sony Bravia TV';
  if (/Android TV|AFT/i.test(ua)) return 'Android / Fire TV';
  if (/Roku/i.test(ua)) return 'Roku TV';
  if (/Macintosh/i.test(ua)) return 'Mac Screen';
  if (/Windows/i.test(ua)) return 'PC Screen';
  return 'TV Display';
}

/**
 * Loads Google's official Cast Sender SDK cleanly (non-blocking) so Chrome/Edge
 * automatically discovers Chromecast / Google TV devices on the same Wi-Fi!
 */
let castSdkInitPromise = null;
function initGoogleCastSDK(onStateChange) {
  if (castSdkInitPromise) return castSdkInitPromise;
  castSdkInitPromise = new Promise((resolve) => {
    if (window.cast && window.cast.framework) {
      setupCastContext(onStateChange);
      resolve(true);
      return;
    }
    window.__onGCastApiAvailable = (isAvailable) => {
      if (isAvailable && window.cast && window.cast.framework) {
        setupCastContext(onStateChange);
        resolve(true);
      } else {
        resolve(false);
      }
    };
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
    setTimeout(() => resolve(Boolean(window.cast && window.cast.framework)), 3500);
  });
  return castSdkInitPromise;
}

function setupCastContext(onStateChange) {
  try {
    const ctx = window.cast.framework.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    if (onStateChange) {
      ctx.addEventListener(window.cast.framework.CastContextEventType.CAST_STATE_CHANGED, (ev) => {
        onStateChange(ev.castState);
      });
      onStateChange(ctx.getCastState());
    }
  } catch {}
}

/**
 * Runs on the TV / Desktop screen.
 * - Uses shared LAN room `LIVE` by default so ANY phone on the same Wi-Fi auto-connects without codes!
 * - Auto-discovers real TVs on your Wi-Fi (Chromecast, AirPlay, Samsung, LG, Roku, DIAL, active TV browsers)
 * - Streams live 3D canvas via AirPlay (`webkitShowPlaybackTargetPicker`) / RemotePlayback / Google Cast SDK
 */
export class TVHostBridge {
  constructor({ onRemoteInput, onRemoteAction, onConnectionChange, onTVsDiscovered }) {
    this.onRemoteInput = onRemoteInput || (() => {});
    this.onRemoteAction = onRemoteAction || (() => {});
    this.onConnectionChange = onConnectionChange || (() => {});
    this.onTVsDiscovered = onTVsDiscovered || (() => {});

    const params = new URLSearchParams(window.location.search);
    // Shared default room "LIVE" enables zero-code auto-pairing across devices on the same Wi-Fi!
    this.roomCode = (params.get('tv') || 'LIVE').toUpperCase();
    this.isSmartTV = params.has('tv') || detectSmartTV();
    this.deviceLabel = detectDeviceLabel();

    this.phoneConnected = false;
    this.phoneCount = 0;
    this.relayAvailable = false;
    this.lanBaseUrl = window.location.origin;
    this.discoveredTVs = [];
    this.activeHosts = [];
    this.castState = 'NO_DEVICES_AVAILABLE';

    this.sse = null;
    this.bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`india-desk-gp-${this.roomCode}`) : null;
    this.lastTelemetrySent = 0;
    this.mirrorVideo = null;

    this._initBroadcastChannel();
    this._initNetworkAndRelay();
    initGoogleCastSDK((state) => {
      this.castState = state;
      this.onTVsDiscovered(this.discoveredTVs, this.activeHosts, this.castState);
    });
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
        this.activeHosts = info.activeHosts || [];
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
      // Auto-scan the Wi-Fi network in the background right on startup!
      this.discoverTVs(false);
    }
  }

  _connectSSE() {
    if (this.sse) this.sse.close();
    const qs = new URLSearchParams({
      room: this.roomCode,
      label: this.deviceLabel,
      tv: this.isSmartTV ? '1' : '0',
    });
    this.sse = new EventSource(`/api/relay/host?${qs.toString()}`);
    this.sse.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'phone_status') {
          this.phoneConnected = Boolean(msg.connected);
          this.phoneCount = msg.count || 0;
          this.onConnectionChange(this.phoneConnected, this.phoneCount);
        } else if (msg.type === 'ready') {
          this.roomCode = msg.room || this.roomCode;
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

  async discoverTVs(force = true) {
    if (!this.relayAvailable) {
      this.onTVsDiscovered([], [], this.castState);
      return [];
    }
    try {
      const resp = await fetch(`/api/discover-tvs${force ? '?force=1' : ''}`);
      if (resp.ok) {
        const data = await resp.json();
        this.discoveredTVs = data.tvs || [];
        this.activeHosts = data.activeHosts || [];
        this.onTVsDiscovered(this.discoveredTVs, this.activeHosts, this.castState);
        return this.discoveredTVs;
      }
    } catch {}
    return [];
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
      width: 184,
      margin: 2,
      color: { dark: '#0c1220', light: '#ffffff' },
    });
    return url;
  }

  sendTelemetry(telemetry) {
    const now = performance.now();
    if (!this.phoneConnected || now - this.lastTelemetrySent < 140) return;
    this.lastTelemetrySent = now;

    if (this.bc) this.bc.postMessage({ type: 'telemetry', payload: telemetry });
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
   * Creates a live MediaStream mirror <video> of the 3D WebGL canvas so Safari AirPlay
   * and Chrome Remote Playback can stream the live game straight to a TV!
   */
  _ensureMirrorVideo() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas || typeof canvas.captureStream !== 'function') return null;
    if (!this.mirrorVideo) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.setAttribute('x-webkit-airplay', 'allow');
      v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.001;pointer-events:none;left:-9999px;';
      document.body.appendChild(v);
      this.mirrorVideo = v;
    }
    if (!this.mirrorVideo.srcObject) {
      this.mirrorVideo.srcObject = canvas.captureStream(30);
      this.mirrorVideo.play().catch(() => {});
    }
    return this.mirrorVideo;
  }

  /**
   * Connects to a specific discovered TV or auto-connects to the best available TV on the same Wi-Fi!
   * Preserves synchronous user-gesture activation for Chrome Cast / Safari AirPlay before any async fetch.
   */
  async connectToTV(selectedTv = null) {
    const tvUrl = this.getTVUrl();
    const targetTv = selectedTv || this.discoveredTVs[0] || null;

    // 1. If targeting a discovered Samsung / DIAL Smart TV on LAN, launch directly over WSS 8002 / DIAL!
    if (targetTv && (targetTv.protocol === 'samsung' || targetTv.dialUrl)) {
      try {
        const resp = await fetch('/api/cast-to-tv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tv: targetTv, tvUrl }),
        });
        if (resp.ok) {
          const result = await resp.json();
          if (result.launched || result.needsAllow) {
            return { mode: result.method || 'samsung', launched: Boolean(result.launched), message: result.message };
          }
        }
      } catch {}
    }

    // 2. Safari / macOS / iOS native AirPlay TV Picker streaming the live 3D game canvas!
    const mirror = this._ensureMirrorVideo();
    if (mirror && typeof mirror.webkitShowPlaybackTargetPicker === 'function') {
      try {
        mirror.webkitShowPlaybackTargetPicker();
        return { mode: 'airplay', launched: true, message: 'Select your AirPlay TV from the Apple picker to stream live!' };
      } catch {}
    }

    // 3. Google Cast Sender SDK (Chrome / Edge -> Chromecast / Google TV / Android TV on same Wi-Fi)
    if (window.cast && window.cast.framework) {
      try {
        const ctx = window.cast.framework.CastContext.getInstance();
        await ctx.requestSession();
        return { mode: 'chromecast', launched: true, message: 'Connected to Chromecast / Google TV on your Wi-Fi!' };
      } catch (err) {
        if (err === 'cancel') return { mode: 'cancel', launched: false, message: 'Cast picker closed.' };
      }
    }

    // 4. W3C Remote Playback API on the live 3D canvas stream
    if (mirror && mirror.remote && typeof mirror.remote.prompt === 'function') {
      try {
        await mirror.remote.prompt();
        return { mode: 'remote-playback', launched: true, message: 'Streaming live race to your TV!' };
      } catch {}
    }

    if (targetTv) {
      return {
        mode: 'guide',
        launched: false,
        message: `Found ${targetTv.name}${targetTv.ip ? ` (${targetTv.ip})` : ''} on Wi-Fi! In Chrome click ⋮ → Cast, Save and Share → Cast → pick "${targetTv.name}", OR open ${tvUrl} on the TV browser.`,
      };
    }

    return {
      mode: 'guide',
      launched: false,
      message: `In Chrome click ⋮ → Cast, Save and Share → Cast → pick your TV, or open ${tvUrl} on your Smart TV browser.`,
    };
  }

  /**
   * One-click Cast directly from the browser Cast icon!
   * Immediately casts to the auto-detected Samsung Smart TV on the same Wi-Fi,
   * or invokes Chrome's native Cast / Safari AirPlay synchronously inside the click!
   */
  async instantCastFromClick() {
    const samsungTv = this.discoveredTVs.find((t) => t.protocol === 'samsung' && t.ip);
    const castReady = window.cast && window.cast.framework && this.castState !== 'NO_DEVICES_AVAILABLE';

    if (samsungTv) {
      return await this.connectToTV(samsungTv);
    }
    if (castReady) {
      try {
        await window.cast.framework.CastContext.getInstance().requestSession();
        return { mode: 'chromecast', launched: true, message: 'Casting to your TV on Wi-Fi!' };
      } catch (err) {
        if (err === 'cancel') return { mode: 'cancel', launched: false, message: 'Cast picker closed.' };
      }
    }
    return await this.connectToTV(this.discoveredTVs[0] || null);
  }
}

/**
 * Checks if a TV/Desktop host is ALREADY active on the same Wi-Fi network.
 * Allows any phone opening the app on the same Wi-Fi to auto-pair in 1 tap with zero codes!
 */
export async function checkActiveTVOnWifi() {
  try {
    const resp = await fetch('/api/network-info');
    if (!resp.ok) return null;
    const info = await resp.json();
    if (info.activeHosts && info.activeHosts.length > 0) {
      return info.activeHosts[0];
    }
  } catch {}
  return null;
}

/**
 * Full-screen Wireless Steering Wheel App that launches on a phone (`/?controller=LIVE` or `/?controller`).
 * Automatically binds to whichever TV screen is open on the same Wi-Fi network!
 */
export function launchPhoneControllerMode(roomCode = 'AUTO') {
  const code = (roomCode || 'AUTO').toUpperCase();
  document.title = `Steering Wheel • TV Controller`;

  document.getElementById('game-root').innerHTML = `
    <div class="phone-pad-root">
      <div class="pad-header">
        <div class="pad-brand">
          <span class="pad-dot" id="pad-conn-dot"></span>
          <span class="pad-title">INDIA GP • WIRELESS WHEEL</span>
          <span class="pad-room" id="pad-room-badge">CONNECTING TO TV...</span>
        </div>
        <div class="pad-actions">
          <button id="pad-gyro-btn" class="pad-chip">GYRO: OFF</button>
          <button id="pad-recenter-btn" class="pad-chip">CENTER</button>
          <button id="pad-cam-btn" class="pad-chip">CAM</button>
          <button id="pad-reset-btn" class="pad-chip">RESET</button>
        </div>
      </div>

      <div class="pad-dash">
        <div class="dash-cell"><span class="dash-lbl">CITY</span><span class="dash-val" id="pad-city">HYDERABAD</span></div>
        <div class="dash-cell"><span class="dash-lbl">POS</span><span class="dash-val gold" id="pad-pos">1st</span></div>
        <div class="dash-cell"><span class="dash-lbl">LAP</span><span class="dash-val" id="pad-lap">1 / 3</span></div>
        <div class="dash-cell"><span class="dash-lbl">SPEED</span><span class="dash-val teal mono" id="pad-speed">0 KM/H</span></div>
        <div class="dash-cell"><span class="dash-lbl">GEAR</span><span class="dash-val mono" id="pad-gear">1</span></div>
      </div>

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
            <rect x="93" y="6" width="14" height="20" rx="4" fill="#ff8c2b"/>
            <line x1="100" y1="28" x2="100" y2="82" stroke="#475569" stroke-width="12" stroke-linecap="round"/>
            <line x1="28" y1="126" x2="82" y2="108" stroke="#475569" stroke-width="14" stroke-linecap="round"/>
            <line x1="172" y1="126" x2="118" y2="108" stroke="#475569" stroke-width="14" stroke-linecap="round"/>
            <circle cx="100" cy="100" r="24" fill="#0f172a" stroke="#f7c948" stroke-width="4"/>
            <text x="100" y="105" text-anchor="middle" fill="#f7c948" font-size="13" font-weight="900">GP</text>
          </svg>
          <div class="pad-quick-row">
            <button id="pad-start-btn" class="pad-start-btn">START / RESTART RACE</button>
            <select id="pad-city-select" class="pad-city-select" aria-label="Select City">
              ${CITIES.map((c) => `<option value="${c.id}">${c.name}${c.nativeName && c.nativeName !== c.name ? ` (${c.nativeName})` : ''}</option>`).join('')}
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

  let activeRoom = code;
  const state = { up: false, down: false, drift: false, boost: false, touchSteer: 0 };

  const connDot = document.getElementById('pad-conn-dot');
  const roomBadge = document.getElementById('pad-room-badge');
  const wheelSvg = document.getElementById('pad-wheel-svg');
  const wheelHint = document.getElementById('pad-wheel-hint');
  const gyroBtn = document.getElementById('pad-gyro-btn');

  let bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`india-desk-gp-${activeRoom === 'AUTO' ? 'LIVE' : activeRoom}`) : null;
  if (bc) bc.postMessage({ type: 'phone_join' });

  try {
    const sse = new EventSource(`/api/relay/phone?room=${encodeURIComponent(code)}`);
    sse.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'connected') {
          activeRoom = msg.room || activeRoom;
          connDot.classList.add('online');
          roomBadge.textContent = msg.hosts > 0 ? `LINKED: ${msg.hostLabel || 'TV'} ✓` : `ROOM ${activeRoom} • WAITING FOR TV`;
        } else if (msg.type === 'host_status' && msg.connected) {
          activeRoom = msg.room || activeRoom;
          connDot.classList.add('online');
          roomBadge.textContent = `LINKED: ${msg.label || 'TV'} ✓`;
        } else if (msg.type === 'telemetry' && msg.payload) {
          updateDash(msg.payload);
        }
      } catch {}
    };
  } catch {}

  if (bc) {
    bc.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'telemetry' && ev.data.payload) {
        connDot.classList.add('online');
        roomBadge.textContent = `LINKED: TV ✓`;
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

  const wheelZone = document.getElementById('pad-wheel-zone');
  let dragging = false;
  let dragStartX = 0;
  const onDragStart = (clientX) => { dragging = true; dragStartX = clientX; };
  const onDragMove = (clientX) => {
    if (!dragging) return;
    state.touchSteer = Math.max(-1, Math.min(1, -(clientX - dragStartX) / 85));
  };
  const onDragEnd = () => { dragging = false; state.touchSteer = 0; };

  wheelSvg.addEventListener('touchstart', (e) => { e.preventDefault(); onDragStart(e.touches[0].clientX); }, { passive: false });
  wheelZone.addEventListener('touchmove', (e) => { if (dragging) { e.preventDefault(); onDragMove(e.touches[0].clientX); } }, { passive: false });
  window.addEventListener('touchend', onDragEnd);
  window.addEventListener('touchcancel', onDragEnd);
  wheelSvg.addEventListener('mousedown', (e) => onDragStart(e.clientX));
  window.addEventListener('mousemove', (e) => onDragMove(e.clientX));
  window.addEventListener('mouseup', onDragEnd);

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

  function sendAction(action, value = null) {
    if (navigator.vibrate) navigator.vibrate(20);
    const payload = { type: 'action', action, value };
    if (bc) bc.postMessage(payload);
    fetch(`/api/relay/send?room=${encodeURIComponent(activeRoom)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  document.getElementById('pad-start-btn').addEventListener('click', () => sendAction('start_race'));
  document.getElementById('pad-cam-btn').addEventListener('click', () => sendAction('cycle_camera'));
  document.getElementById('pad-reset-btn').addEventListener('click', () => sendAction('reset_car'));
  document.getElementById('pad-city-select').addEventListener('change', (e) => sendAction('select_city', e.target.value));

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
    fetch(`/api/relay/send?room=${encodeURIComponent(activeRoom)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: str,
    }).catch(() => {});
  }

  setInterval(pushInput, 33);
}
