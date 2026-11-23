import dgram from 'dgram';
import http from 'http';
import net from 'net';
import tls from 'tls';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const TOKEN_FILE = path.resolve(process.cwd(), '.tv-tokens.json');

function loadSavedTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveToken(ip, token) {
  if (!ip || !token) return;
  try {
    const tokens = loadSavedTokens();
    tokens[ip] = String(token);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  } catch {}
}

const TV_KEYWORDS = [
  'tv', 'bravia', 'samsung', 'tizen', 'lg', 'webos', 'chromecast', 'google tv',
  'android tv', 'apple tv', 'airplay', 'roku', 'vizio', 'fire tv', 'aft',
  'hisense', 'tcl', 'sony', 'philips', 'panasonic', 'sharp', 'xiaomi', 'mi box',
  'nvidia shield', 'shield', 'mediarenderer', 'dial', 'cast', 'crystal uhd', 'qled', 'oled',
];

function decodeXmlEntities(str) {
  return (str || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function looksLikeTV(text) {
  const lower = (text || '').toLowerCase();
  return TV_KEYWORDS.some((kw) => lower.includes(kw));
}

function isThisComputer(name) {
  const lower = (name || '').toLowerCase();
  const hostBase = os.hostname().replace(/\.local$/i, '').toLowerCase();
  if (hostBase && lower.includes(hostBase)) return true;
  if (lower.includes('macbook') || lower.includes('imac') || lower.includes('mac mini') || lower.includes('mac studio')) {
    return true;
  }
  return false;
}

function fetchXmlMetadata(locationUrl, timeoutMs = 1100) {
  return new Promise((resolve) => {
    try {
      const req = http.get(locationUrl, { timeout: timeoutMs }, (res) => {
        const dialUrl = res.headers['application-url'] || null;
        let xml = '';
        res.on('data', (chunk) => {
          xml += chunk.toString('utf8');
          if (xml.length > 24000) res.destroy();
        });
        res.on('end', () => {
          const getTag = (tag) => {
            const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
            return m ? decodeXmlEntities(m[1]) : '';
          };
          resolve({
            friendlyName: getTag('friendlyName'),
            manufacturer: getTag('manufacturer'),
            modelName: getTag('modelName'),
            deviceType: getTag('deviceType'),
            dialUrl,
          });
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

function scanSSDP(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const found = new Map();
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }

    socket.on('error', () => {
      try { socket.close(); } catch {}
      resolve([]);
    });

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      const headers = {};
      for (const line of text.split(/\r?\n/)) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        }
      }
      const location = headers.location || '';
      const server = headers.server || '';
      const st = headers.st || '';
      const key = location || rinfo.address;
      if (!found.has(key)) {
        found.set(key, { ip: rinfo.address, location, server, st });
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        const targets = [
          'urn:dial-multiscreen-org:service:dial:1',
          'urn:schemas-upnp-org:device:MediaRenderer:1',
          'roku:ecp',
          'ssdp:all',
        ];
        for (const st of targets) {
          const packet = Buffer.from(
            [
              'M-SEARCH * HTTP/1.1',
              'HOST: 239.255.255.250:1900',
              'MAN: "ssdp:discover"',
              'MX: 1',
              `ST: ${st}`,
              '',
              '',
            ].join('\r\n')
          );
          socket.send(packet, 0, packet.length, 1900, '239.255.255.250');
        }
      } catch {
        try { socket.close(); } catch {}
        resolve([]);
        return;
      }

      setTimeout(async () => {
        try { socket.close(); } catch {}
        const results = [];
        const entries = [...found.values()];
        await Promise.all(
          entries.map(async (entry) => {
            const meta = entry.location ? await fetchXmlMetadata(entry.location) : null;
            const combined = `${entry.server} ${entry.st} ${meta?.friendlyName || ''} ${meta?.manufacturer || ''} ${meta?.modelName || ''} ${meta?.deviceType || ''}`;
            const isRoku = entry.st.includes('roku') || combined.toLowerCase().includes('roku');
            const isDial = entry.st.includes('dial') || Boolean(meta?.dialUrl);
            if (!isRoku && !isDial && !looksLikeTV(combined)) return;

            const lower = combined.toLowerCase();
            let protocol = 'smart-tv';
            if (isRoku) protocol = 'roku';
            else if (lower.includes('samsung') || lower.includes('tizen')) protocol = 'samsung';
            else if (lower.includes('lg') || lower.includes('webos')) protocol = 'lg';
            else if (lower.includes('chromecast') || lower.includes('google') || lower.includes('eureka')) protocol = 'chromecast';
            else if (isDial) protocol = 'dial';

            const name = decodeXmlEntities(
              meta?.friendlyName ||
              meta?.modelName ||
              (isRoku ? `Roku TV (${entry.ip})` : `Smart TV (${entry.ip})`)
            );
            if (isThisComputer(name)) return;

            results.push({
              id: `${protocol}-${entry.ip}`,
              name,
              brand: meta?.manufacturer || protocol.toUpperCase(),
              protocol,
              ip: entry.ip,
              port: isRoku ? 8060 : protocol === 'samsung' ? 8002 : 8008,
              location: entry.location,
              dialUrl: meta?.dialUrl || null,
            });
          })
        );
        resolve(results);
      }, timeoutMs);
    });
  });
}

function lookupDnsSdFriendly(instanceName, serviceType, timeoutMs = 800) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('dns-sd', ['-L', instanceName, serviceType, 'local.']);
    } catch {
      resolve({ friendlyName: instanceName });
      return;
    }
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString('utf8'); });
    proc.on('error', () => resolve({ friendlyName: instanceName }));
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      const fnMatch = out.match(/fn=([^\s]+(?:\\ [^\s]+)*)/);
      const mdMatch = out.match(/md=([^\s]+(?:\\ [^\s]+)*)/);
      const friendlyName = fnMatch
        ? fnMatch[1].replace(/\\ /g, ' ').replace(/\\'/g, "'").trim()
        : instanceName;
      const model = mdMatch ? mdMatch[1].replace(/\\ /g, ' ').trim() : '';
      resolve({ friendlyName, model });
    }, timeoutMs);
  });
}

function browseDnsSd(serviceType, protocolLabel, timeoutMs = 1200) {
  if (process.platform !== 'darwin') return Promise.resolve([]);
  return new Promise((resolve) => {
    const names = new Set();
    let proc;
    try {
      proc = spawn('dns-sd', ['-B', serviceType, 'local.']);
    } catch {
      resolve([]);
      return;
    }

    let out = '';
    proc.stdout.on('data', (d) => {
      out += d.toString('utf8');
      for (const line of out.split('\n')) {
        if (line.includes(' Add ') && line.includes(serviceType)) {
          const parts = line.split(serviceType);
          if (parts[1]) {
            const inst = parts[1].replace(/^\.\s*/, '').trim();
            if (inst && !isThisComputer(inst)) names.add(inst);
          }
        }
      }
    });
    proc.on('error', () => resolve([]));

    setTimeout(async () => {
      try { proc.kill('SIGKILL'); } catch {}
      const list = await Promise.all(
        [...names].map(async (rawName) => {
          let displayName = rawName;
          let brand = protocolLabel === 'chromecast' ? 'Google Cast' : 'AirPlay TV';
          if (protocolLabel === 'chromecast') {
            const meta = await lookupDnsSdFriendly(rawName, serviceType, 750);
            if (meta.friendlyName) displayName = meta.friendlyName;
            if (meta.model) brand = meta.model;
          }
          return {
            id: `${protocolLabel}-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            name: decodeXmlEntities(displayName),
            brand,
            protocol: protocolLabel,
            ip: null,
            port: protocolLabel === 'chromecast' ? 8009 : 7000,
            location: null,
            dialUrl: null,
          };
        })
      );
      resolve(list.filter((item) => !isThisComputer(item.name)));
    }, timeoutMs);
  });
}

export async function discoverTVsOnNetwork() {
  const [ssdpList, castList, airplayList] = await Promise.all([
    scanSSDP(1400),
    browseDnsSd('_googlecast._tcp', 'chromecast', 1200),
    browseDnsSd('_airplay._tcp', 'airplay', 1200),
  ]);

  const merged = new Map();
  for (const item of [...ssdpList, ...castList, ...airplayList]) {
    const key = decodeXmlEntities(item.name || item.ip || item.id).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!merged.has(key)) {
      merged.set(key, item);
    } else {
      const existing = merged.get(key);
      if (!existing.ip && item.ip) existing.ip = item.ip;
      if (!existing.dialUrl && item.dialUrl) existing.dialUrl = item.dialUrl;
      if (item.protocol === 'airplay' && !existing.brand.includes('AirPlay')) {
        existing.brand = `${existing.brand} • AirPlay`;
      }
    }
  }
  return [...merged.values()];
}

/**
 * Minimal zero-dependency RFC 6455 WebSocket client over TLS (`rejectUnauthorized: false`)
 * or plain TCP — required for modern Samsung Tizen Smart TVs (wss://ip:8002 with self-signed certs).
 */
function encodeWsTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ mask[i & 3];
  }
  return Buffer.concat([header, mask, masked]);
}

function parseWsFrames(buf, onMessage) {
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const opcode = buf[offset] & 0x0f;
    const masked = (buf[offset + 1] & 0x80) !== 0;
    let len = buf[offset + 1] & 0x7f;
    let pos = offset + 2;
    if (len === 126) {
      if (pos + 2 > buf.length) break;
      len = buf.readUInt16BE(pos);
      pos += 2;
    } else if (len === 127) {
      if (pos + 8 > buf.length) break;
      len = Number(buf.readBigUInt64BE(pos));
      pos += 8;
    }
    const maskLen = masked ? 4 : 0;
    if (pos + maskLen + len > buf.length) break;
    let payload = buf.subarray(pos + maskLen, pos + maskLen + len);
    if (masked) {
      const m = buf.subarray(pos, pos + 4);
      const out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3];
      payload = out;
    }
    if (opcode === 1) onMessage(payload.toString('utf8'));
    offset = pos + maskLen + len;
  }
  return buf.subarray(offset);
}

/**
 * Connects directly to a Samsung Tizen TV over WSS port 8002 (or WS 8001),
 * handles one-time TokenAuth ("Allow" on TV remote), saves the token,
 * and launches the Samsung TV Web Browser straight to our live 3D race URL!
 */
function launchOnSamsungTizen(ip, tvUrl, { useTls = true, timeoutMs = 14000 } = {}) {
  return new Promise((resolve) => {
    const port = useTls ? 8002 : 8001;
    const savedTokens = loadSavedTokens();
    const token = savedTokens[ip] || '';
    const appNameB64 = Buffer.from('India GP').toString('base64');
    const wsPath = `/api/v2/channels/samsung.remote.control?name=${appNameB64}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

    let settled = false;
    let upgraded = false;
    let rxBuf = Buffer.alloc(0);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch {}
      resolve(result);
    };

    const sock = useTls
      ? tls.connect({ host: ip, port, rejectUnauthorized: false })
      : net.connect({ host: ip, port });

    const timer = setTimeout(() => {
      finish({
        launched: false,
        needsAllow: upgraded,
        message: upgraded
          ? 'Check your Samsung TV screen and press "Allow" on the remote, then click Cast again!'
          : `Timed out reaching Samsung TV on port ${port}.`,
      });
    }, timeoutMs);

    sock.on('error', () => finish({ launched: false, message: `Could not connect on port ${port}` }));

    const sendUpgrade = () => {
      const key = crypto.randomBytes(16).toString('base64');
      sock.write(
        [
          `GET ${wsPath} HTTP/1.1`,
          `Host: ${ip}:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n')
      );
    };

    if (useTls) sock.on('secureConnect', sendUpgrade);
    else sock.on('connect', sendUpgrade);

    sock.on('data', (chunk) => {
      rxBuf = Buffer.concat([rxBuf, chunk]);
      if (!upgraded) {
        const headerEnd = rxBuf.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerText = rxBuf.subarray(0, headerEnd).toString('utf8');
        if (!headerText.includes('101')) {
          finish({ launched: false, message: 'TV rejected WebSocket upgrade' });
          return;
        }
        upgraded = true;
        rxBuf = rxBuf.subarray(headerEnd + 4);
      }

      rxBuf = parseWsFrames(rxBuf, (text) => {
        try {
          const msg = JSON.parse(text);
          if (msg.event === 'ms.channel.connect') {
            if (msg.data && msg.data.token) {
              saveToken(ip, msg.data.token);
            }
            // Launch Samsung TV Internet Browser directly to our live 3D race URL!
            const launchCmd = JSON.stringify({
              method: 'ms.channel.emit',
              params: {
                event: 'ed.apps.launch',
                to: 'host',
                data: {
                  appId: 'org.tizen.browser',
                  action_type: 'NATIVE_LAUNCH',
                  metaTag: tvUrl,
                },
              },
            });
            sock.write(encodeWsTextFrame(launchCmd));
            setTimeout(() => {
              finish({
                launched: true,
                method: useTls ? 'samsung-wss-8002' : 'samsung-ws-8001',
                message: `Launched India GP on your Samsung TV (${ip})! Scan the QR code with your phone to steer.`,
              });
            }, 650);
          } else if (msg.event === 'ms.channel.unauthorized') {
            finish({
              launched: false,
              needsAllow: true,
              message: 'Samsung TV declined connection — press "Allow" on your TV remote and click Cast again.',
            });
          }
        } catch {}
      });
    });
  });
}

export async function launchOnLanTV(tv, tvUrl) {
  if (!tv || !tv.ip) {
    return {
      launched: false,
      method: 'browser-cast',
      message: `Found ${tv?.name || 'TV'} on your Wi-Fi! Pick it in the browser Cast picker.`,
    };
  }

  // 1. Samsung Tizen Smart TV (modern WSS port 8002 with TokenAuth + fallback to WS 8001)
  if (tv.protocol === 'samsung') {
    const wssRes = await launchOnSamsungTizen(tv.ip, tvUrl, { useTls: true, timeoutMs: 14000 });
    if (wssRes.launched || wssRes.needsAllow) return wssRes;

    const wsRes = await launchOnSamsungTizen(tv.ip, tvUrl, { useTls: false, timeoutMs: 4000 });
    if (wsRes.launched) return wsRes;
  }

  // 2. DIAL Smart TVs
  if (tv.dialUrl) {
    const base = tv.dialUrl.endsWith('/') ? tv.dialUrl : `${tv.dialUrl}/`;
    const ok = await new Promise((resolve) => {
      try {
        const u = new URL('Browser', base);
        const body = `url=${encodeURIComponent(tvUrl)}`;
        const req = http.request(
          {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname,
            method: 'POST',
            timeout: 1600,
            headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 300);
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.write(body);
        req.end();
      } catch {
        resolve(false);
      }
    });
    if (ok) {
      return { launched: true, method: 'dial', message: `Sent race directly to ${tv.name}!` };
    }
  }

  return {
    launched: false,
    method: 'browser-cast',
    message: `Detected ${tv.name} (${tv.ip}) on Wi-Fi! Use the browser Cast picker or open ${tvUrl} on your TV.`,
  };
}
