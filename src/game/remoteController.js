import QRCode from 'qrcode';
import { CITIES } from './cities.js';
import { CAR_CATALOG } from './cars.js';
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
 * Runs on the TV / Desktop screen.
 * - Uses shared LAN room `LIVE` by default so ANY phone on the same Wi-Fi auto-connects without codes!
 * - Uses Chrome Desktop's native 1-UA PresentationRequest (renders the live 3D game page directly on the TV,
 *   NEVER launching Google's blank CC1AD845 media-logo receiver!).
 * - Auto-discovers real TVs on your Wi-Fi and streams live canvas via Safari AirPlay when on Safari.
 */
export class TVHostBridge {
  constructor({ onRemoteInput, onRemoteAction, onConnectionChange, onTVsDiscovered }) {
    this.onRemoteInput = onRemoteInput || (() => {});
    this.onRemoteAction = onRemoteAction || (() => {});
    this.onConnectionChange = onConnectionChange || (() => {});
    this.onTVsDiscovered = onTVsDiscovered || (() => {});

    const params = new URLSearchParams(window.location.search);
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
    this.presentationRequest = null;
    this.presentationConnection = null;

    this._initBroadcastChannel();
    this._initPresentationDefault();
    this._initPresentationReceiver();
    this._initNetworkAndRelay();
  }

  _initPresentationReceiver() {
    if (!navigator.presentation || !navigator.presentation.receiver) return;
    navigator.presentation.receiver.connectionList
      .then((list) => {
        const attach = (conn) => {
          conn.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data);
              if (msg.type === 'input') {
                this.onRemoteInput(msg);
              } else if (msg.type === 'action') {
                this.onRemoteAction(msg.action, msg.value);
              }
            } catch {}
          };
        };
        list.connections.forEach(attach);
        list.onconnectionavailable = (ev) => attach(ev.connection);
      })
      .catch(() => {});
  }

  /** True when this Mac/Desktop browser is casting to a TV tab or a Smart TV browser is live on Wi-Fi. */
  isControllingExternalTV() {
    if (this.isSmartTV) return false;
    if (this.presentationConnection && this.presentationConnection.state === 'connected') return true;
    return this.activeHosts.some((h) => h.isSmartTV);
  }

  /** Forward Mac keyboard / Start Race / City / Car actions straight to the TV screen! */
  forwardToTV(payload) {
    if (this.isSmartTV) return;
    const str = JSON.stringify(payload);
    if (this.presentationConnection && this.presentationConnection.state === 'connected') {
      try {
        this.presentationConnection.send(str);
      } catch {}
    }
    if (this.bc) {
      try {
        this.bc.postMessage(payload);
      } catch {}
    }
    if (this.relayAvailable) {
      fetch(`/api/relay/send?room=${encodeURIComponent(this.roomCode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: str,
      }).catch(() => {});
    }
  }

  _initPresentationDefault() {
    if (typeof window.PresentationRequest !== 'function') return;
    try {
      const presUrl = `${window.location.origin}/?tv=${encodeURIComponent(this.roomCode)}`;
      this.presentationRequest = new window.PresentationRequest([presUrl]);
      if (navigator.presentation) {
        navigator.presentation.defaultRequest = this.presentationRequest;
      }
      this.presentationRequest.getAvailability().then((avail) => {
        if (avail.value) this.castState = 'NOT_CONNECTED';
        avail.onchange = () => {
          this.castState = avail.value ? 'NOT_CONNECTED' : 'NO_DEVICES_AVAILABLE';
          this.onTVsDiscovered(this.discoveredTVs, this.activeHosts, this.castState);
        };
      }).catch(() => {});
    } catch {}
  }

  /**
   * If this screen IS the TV (opened via Chrome 1-UA Presentation Cast or Smart TV browser `/?tv=LIVE`),
   * show a sleek floating corner QR code so anyone can scan the TV with their phone and start driving!
   */
  async showTVCornerQR() {
    if (!this.isSmartTV || document.getElementById('tv-corner-qr')) return;
    // On the TV display itself, hide the desktop form overlay so the full 3D circuit shines in 4K!
    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay) startOverlay.classList.add('hidden');

    const badge = document.createElement('div');
    badge.id = 'tv-corner-qr';
    badge.className = 'tv-corner-qr';
    badge.innerHTML = `
      <canvas id="tv-corner-qr-canvas" width="112" height="112"></canvas>
      <div class="tv-corner-text">
        <strong>PLAY WITH PHONE</strong>
        <span>Scan to steer &amp; start race</span>
      </div>
    `;
    document.body.appendChild(badge);
    const qrCanvas = document.getElementById('tv-corner-qr-canvas');
    await QRCode.toCanvas(qrCanvas, this.getControllerUrl(), {
      width: 112,
      margin: 1,
      color: { dark: '#0c1220', light: '#ffffff' },
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
      if (this.isSmartTV) this.showTVCornerQR();
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
    return `${this.lanBaseUrl}/tv`;
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
   * MUST be called SYNCHRONOUSLY as the very first call inside a user click event!
   * In Chrome Desktop, `PresentationRequest([presUrl]).start()` opens Chrome's native Cast popup
   * listing every Chromecast / Google Cast TV on the same Wi-Fi (including Samsung 65" Crystal UHD!)
   * and streams the live 3D game page straight onto the TV via Chrome's 1-UA Presentation Cast!
   * In Safari, synchronously invokes AirPlay `webkitShowPlaybackTargetPicker()`.
   */
  startBrowserCastSync(cityId = null) {
    const qs = new URLSearchParams({ tv: this.roomCode });
    if (cityId) qs.set('city', cityId);
    const presUrl = `${window.location.origin}/?${qs.toString()}`;

    // 1. Chrome / Edge Desktop native 1-UA Presentation Cast (opens native Cast sheet with TVs on Wi-Fi!)
    if (typeof window.PresentationRequest === 'function') {
      try {
        const req = new window.PresentationRequest([presUrl]);
        this.presentationRequest = req;
        const promise = req.start();
        return promise
          .then((conn) => {
            this.presentationConnection = conn;
            this.castState = 'CONNECTED';
            conn.onclose = () => {
              this.presentationConnection = null;
              this.castState = 'NOT_CONNECTED';
            };
            return {
              mode: 'presentation',
              launched: true,
              message: 'Casting live 3D race to your TV! Scan the QR code with your phone to steer.',
            };
          })
          .catch((err) => {
            if (err && err.name === 'AbortError') {
              return { mode: 'cancel', launched: false, message: 'Cast picker closed.' };
            }
            return this._fallbackCastAfterSync(err);
          });
      } catch (err) {
        return this._fallbackCastAfterSync(err);
      }
    }

    // 2. Safari (Mac / iPhone) native AirPlay picker streaming live 3D canvas!
    const mirror = this._ensureMirrorVideo();
    if (mirror && typeof mirror.webkitShowPlaybackTargetPicker === 'function') {
      try {
        mirror.webkitShowPlaybackTargetPicker();
        return Promise.resolve({
          mode: 'airplay',
          launched: true,
          message: 'Select your TV from the AirPlay picker to stream live!',
        });
      } catch {}
    }

    return this._fallbackCastAfterSync(null);
  }

  async _fallbackCastAfterSync(prevErr) {
    const tvUrl = this.getTVUrl();
    const targetTv = this.discoveredTVs[0];
    if (targetTv) {
      return {
        mode: 'guide',
        launched: false,
        message: `Found ${targetTv.name} on Wi-Fi${prevErr?.name ? ` (${prevErr.name})` : ''}. In Chrome click ⋮ → Cast, Save and Share → Cast → Sources → "Cast tab" → pick "${targetTv.name}"!`,
      };
    }
    return {
      mode: 'guide',
      launched: false,
      message: `In Chrome click ⋮ → Cast, Save and Share → Cast → Sources → "Cast tab" → pick your TV, or open ${tvUrl} on your Smart TV browser.`,
    };
  }

  async connectToTV(selectedTv = null, cityId = null) {
    return await this.startBrowserCastSync(cityId);
  }

  async instantCastFromClick(cityId = null) {
    return await this.startBrowserCastSync(cityId);
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
  document.title = `Motion Remote • TV Controller`;

  const needsIosTap =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function';
  const isSecure = typeof window === 'undefined' || window.isSecureContext !== false;

  document.getElementById('game-root').innerHTML = `
    <div class="phone-pad-root">
      <!-- One-tap motion sensor activation overlay when paired on HTTPS mobile -->
      <div id="pad-motion-prompt" class="pad-motion-prompt ${!isSecure ? 'hidden' : ''}">
        <div class="pad-prompt-card">
          <div class="pad-prompt-badge">PAIRED WITH TV • MOTION REMOTE</div>
          <h2>HOLD PHONE LIKE A STEERING WHEEL</h2>
          <p>Rotate left/right to steer • Tilt forward for gas • Tilt back to brake</p>
          <button id="pad-enable-motion-btn" class="primary-btn">ACTIVATE MOTION REMOTE</button>
          <button id="pad-skip-motion-btn" class="pad-skip-btn">Use Touch Controls Instead</button>
        </div>
      </div>

      <div class="pad-header">
        <div class="pad-brand">
          <span class="pad-dot" id="pad-conn-dot"></span>
          <span class="pad-title">TV MOTION REMOTE</span>
          <span class="pad-room" id="pad-room-badge">CONNECTING TO TV…</span>
        </div>
        <div class="pad-actions">
          <button id="pad-gyro-btn" class="pad-chip">MOTION: OFF</button>
          <button id="pad-recenter-btn" class="pad-chip">CENTER</button>
          <button id="pad-cam-btn" class="pad-chip">CAM</button>
          <button id="pad-music-btn" class="pad-chip">MUSIC</button>
          <button id="pad-reset-btn" class="pad-chip">RESET</button>
          <button id="pad-menu-btn" class="pad-chip">TV MENU</button>
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
          <div class="wheel-hint" id="pad-wheel-hint">${isSecure ? 'ROTATE PHONE TO STEER • TILT AWAY = GAS' : 'HTTPS NEEDED FOR GYRO (USE npm run dev:phone) — DRAG WHEEL OR TAP ◀ ▶'}</div>
          <div class="pad-wheel-row">
            <button id="pad-left" class="steer-tap-btn" aria-label="Steer Left">◀</button>
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
            <!-- Live Motion Tilt Gas / Brake Gauge -->
            <div class="pad-tilt-meter" title="Tilt forward = Gas, tilt back = Brake">
              <span class="tm-lbl gas">G</span>
              <div class="tm-track"><div id="pad-tilt-fill" class="tm-fill"></div><div class="tm-mid"></div></div>
              <span class="tm-lbl brk">B</span>
            </div>
            <button id="pad-right" class="steer-tap-btn" aria-label="Steer Right">▶</button>
          </div>
          <div class="pad-quick-row">
            <button id="pad-start-btn" class="pad-start-btn">START / RESTART</button>
            <select id="pad-city-select" class="pad-city-select" aria-label="Select City">
              ${CITIES.map((c) => `<option value="${c.id}">${c.name}${c.nativeName && c.nativeName !== c.name ? ` (${c.nativeName})` : ''}</option>`).join('')}
            </select>
            <select id="pad-car-select" class="pad-city-select" aria-label="Select Car">
              ${CAR_CATALOG.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
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
  const state = { up: false, down: false, left: false, right: false, drift: false, boost: false, touchSteer: 0 };

  const connDot = document.getElementById('pad-conn-dot');
  const roomBadge = document.getElementById('pad-room-badge');
  const wheelSvg = document.getElementById('pad-wheel-svg');
  const wheelHint = document.getElementById('pad-wheel-hint');
  const gyroBtn = document.getElementById('pad-gyro-btn');
  const tiltFill = document.getElementById('pad-tilt-fill');
  const motionPrompt = document.getElementById('pad-motion-prompt');

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
      gyroBtn.textContent = motion.enabled ? 'MOTION: ON' : 'MOTION: OFF';
      gyroBtn.classList.toggle('active', motion.enabled);
      wheelHint.textContent = msg;
      if (motion.enabled && motionPrompt) motionPrompt.classList.add('hidden');
    },
  });

  // Auto-start motion sensing immediately on Android/HTTPS devices that don't require an iOS tap!
  if (isSecure && !needsIosTap) {
    motion.enable().then((ok) => {
      if (ok && motionPrompt) motionPrompt.classList.add('hidden');
    });
  }

  document.getElementById('pad-enable-motion-btn')?.addEventListener('click', async () => {
    await motion.enable();
    motion.recenter();
    if (motionPrompt) motionPrompt.classList.add('hidden');
  });
  document.getElementById('pad-skip-motion-btn')?.addEventListener('click', () => {
    if (motionPrompt) motionPrompt.classList.add('hidden');
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

  wheelZone.addEventListener('touchstart', (e) => {
    if (e.target.closest('button, select')) return;
    e.preventDefault();
    onDragStart(e.touches[0].clientX);
  }, { passive: false });
  wheelZone.addEventListener('touchmove', (e) => { if (dragging) { e.preventDefault(); onDragMove(e.touches[0].clientX); } }, { passive: false });
  window.addEventListener('touchend', onDragEnd);
  window.addEventListener('touchcancel', onDragEnd);
  wheelSvg.addEventListener('mousedown', (e) => onDragStart(e.clientX));
  window.addEventListener('mousemove', (e) => onDragMove(e.clientX));
  window.addEventListener('mouseup', onDragEnd);

  function bindPedal(id, field, vibrateMs = 15) {
    const el = document.getElementById(id);
    if (!el) return;
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
  bindPedal('pad-left', 'left', 10);
  bindPedal('pad-right', 'right', 10);
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

  document.getElementById('pad-start-btn').addEventListener('click', () => {
    if (motion.enabled) motion.recenter();
    sendAction('start_race');
  });
  document.getElementById('pad-cam-btn').addEventListener('click', () => sendAction('cycle_camera'));
  document.getElementById('pad-music-btn')?.addEventListener('click', () => sendAction('toggle_music'));
  document.getElementById('pad-menu-btn')?.addEventListener('click', () => sendAction('back_menu'));
  document.getElementById('pad-reset-btn').addEventListener('click', () => sendAction('reset_car'));
  document.getElementById('pad-city-select').addEventListener('change', (e) => sendAction('select_city', e.target.value));
  document.getElementById('pad-car-select')?.addEventListener('change', (e) => sendAction('select_car', e.target.value));

  let lastPayloadStr = '';
  function pushInput() {
    const tapSteer = (state.left ? 1 : 0) - (state.right ? 1 : 0);
    const steer =
      tapSteer !== 0
        ? tapSteer
        : Math.abs(state.touchSteer) > 0.02
          ? state.touchSteer
          : motion.enabled
            ? motion.steerValue
            : 0;
    wheelSvg.style.transform = `rotate(${(-steer * 85).toFixed(1)}deg)`;

    const throttle = state.up ? 1 : motion.enabled ? Number((motion.throttleValue || 0).toFixed(3)) : 0;
    const brake = state.down ? 1 : motion.enabled ? Number((motion.brakeValue || 0).toFixed(3)) : 0;

    if (tiltFill) {
      const pv = throttle > 0 ? throttle : -brake;
      const pct = Math.round(Math.abs(pv) * 50);
      tiltFill.style.height = `${pct}%`;
      tiltFill.style.bottom = pv >= 0 ? '50%' : `${50 - pct}%`;
      tiltFill.classList.toggle('brake', pv < 0);
    }

    const payload = {
      type: 'input',
      up: state.up,
      down: state.down,
      throttle,
      brake,
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
