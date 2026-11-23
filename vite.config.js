import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import os from 'os';
import { discoverTVsOnNetwork, launchOnLanTV } from './scripts/tv-discovery.mjs';

function getLocalLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ name, address: net.address });
      }
    }
  }
  const preferred =
    candidates.find((c) => c.name === 'en0') ||
    candidates.find((c) => c.address.startsWith('192.168.')) ||
    candidates.find((c) => c.address.startsWith('10.')) ||
    candidates[0];
  return preferred ? preferred.address : '127.0.0.1';
}

/**
 * Built-in Zero-Dependency Real-Time Relay + Local Wi-Fi TV Discovery Plugin.
 *  - Auto-discovers Chromecast, AirPlay, Samsung, LG, Roku & DIAL TVs on your Wi-Fi
 *  - Auto-pairs phones & TV screens on the same Wi-Fi without needing room codes!
 */
function phoneControllerRelayPlugin() {
  const rooms = new Map();
  let lastActiveHostRoom = null;
  let cachedTvs = [];
  let cachedTvsAt = 0;

  function getRoom(code) {
    const clean = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    // AUTO resolves to whichever TV/Desktop host is currently active on the same Wi-Fi!
    const key =
      !clean || clean === 'AUTO'
        ? lastActiveHostRoom || 'LIVE'
        : clean;
    if (!rooms.has(key)) {
      rooms.set(key, {
        hosts: new Set(),
        phones: new Set(),
        lastTelemetry: null,
        hostMeta: { label: 'TV / Desktop Screen', isSmartTV: false, lastSeen: Date.now() },
      });
    }
    return { key, room: rooms.get(key) };
  }

  function getActiveHostList() {
    const out = [];
    for (const [code, room] of rooms.entries()) {
      if (room.hosts.size > 0) {
        out.push({
          room: code,
          label: room.hostMeta.label,
          isSmartTV: room.hostMeta.isSmartTV,
          phones: room.phones.size,
          city: room.lastTelemetry?.city || 'India GP',
        });
      }
    }
    return out;
  }

  function attachMiddleware(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url || !req.url.startsWith('/api/')) return next();

      const urlObj = new URL(req.url, 'http://localhost');
      const pathname = urlObj.pathname;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      // 1. Network info + active TV host rooms on the same Wi-Fi
      if (pathname === '/api/network-info') {
        const lanIp = getLocalLanIp();
        const hostHeader = req.headers.host || 'localhost:5173';
        const portMatch = hostHeader.match(/:(\d+)$/);
        const port = portMatch ? portMatch[1] : '5173';
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            lanIp,
            port,
            relayAvailable: true,
            activeHosts: getActiveHostList(),
            defaultRoom: lastActiveHostRoom || 'LIVE',
          })
        );
        return;
      }

      // 2. Real local Wi-Fi TV discovery (Chromecast, AirPlay, Samsung, LG, Roku, DIAL + active TV browsers)
      if (pathname === '/api/discover-tvs') {
        const force = urlObj.searchParams.get('force') === '1';
        const now = Date.now();
        if (force || now - cachedTvsAt > 8000) {
          try {
            cachedTvs = await discoverTVsOnNetwork();
            cachedTvsAt = Date.now();
          } catch {
            cachedTvs = [];
          }
        }
        const activeHosts = getActiveHostList();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ tvs: cachedTvs, activeHosts }));
        return;
      }

      // 3. Attempt direct LAN launch on a discovered Smart TV (Samsung Tizen / DIAL / etc.)
      if (pathname === '/api/cast-to-tv' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 8192) req.destroy();
        });
        req.on('end', async () => {
          try {
            const { tv, tvUrl } = JSON.parse(body || '{}');
            const result = await launchOnLanTV(tv, tvUrl);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ launched: false, message: 'Invalid cast payload' }));
          }
        });
        return;
      }

      // 4. Host (TV / Desktop) SSE stream
      if (pathname === '/api/relay/host') {
        const requested = urlObj.searchParams.get('room') || 'LIVE';
        const label = urlObj.searchParams.get('label') || 'TV / Desktop Screen';
        const isSmartTV = urlObj.searchParams.get('tv') === '1';
        const { key, room } = getRoom(requested);
        room.hostMeta = { label, isSmartTV, lastSeen: Date.now() };
        lastActiveHostRoom = key;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'ready', room: key, phones: room.phones.size })}\n\n`);
        room.hosts.add(res);

        // Notify any already-waiting phones in this room that the TV is now live!
        const hostOnlineMsg = `data: ${JSON.stringify({ type: 'host_status', connected: true, room: key, label })}\n\n`;
        room.phones.forEach((p) => { try { p.write(hostOnlineMsg); } catch {} });

        const keepAlive = setInterval(() => {
          try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
        }, 15000);

        req.on('close', () => {
          clearInterval(keepAlive);
          room.hosts.delete(res);
          if (room.hosts.size === 0 && lastActiveHostRoom === key) {
            const other = [...rooms.entries()].find(([, r]) => r.hosts.size > 0);
            lastActiveHostRoom = other ? other[0] : null;
          }
        });
        return;
      }

      // 5. Phone Controller SSE stream (supports `?room=AUTO` for zero-code same-Wi-Fi pairing!)
      if (pathname === '/api/relay/phone') {
        const { key, room } = getRoom(urlObj.searchParams.get('room') || 'AUTO');
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        room.phones.add(res);
        res.write(
          `data: ${JSON.stringify({
            type: 'connected',
            room: key,
            hosts: room.hosts.size,
            hostLabel: room.hostMeta.label,
          })}\n\n`
        );
        if (room.lastTelemetry) {
          res.write(`data: ${JSON.stringify({ type: 'telemetry', payload: room.lastTelemetry })}\n\n`);
        }

        const joinMsg = `data: ${JSON.stringify({ type: 'phone_status', connected: true, count: room.phones.size })}\n\n`;
        room.hosts.forEach((h) => { try { h.write(joinMsg); } catch {} });

        const keepAlive = setInterval(() => {
          try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
        }, 15000);

        req.on('close', () => {
          clearInterval(keepAlive);
          room.phones.delete(res);
          const leaveMsg = `data: ${JSON.stringify({ type: 'phone_status', connected: room.phones.size > 0, count: room.phones.size })}\n\n`;
          room.hosts.forEach((h) => { try { h.write(leaveMsg); } catch {} });
        });
        return;
      }

      // 6. Phone -> TV steering/action POST
      if (pathname === '/api/relay/send' && req.method === 'POST') {
        const { room } = getRoom(urlObj.searchParams.get('room') || 'AUTO');
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8192) req.destroy();
        });
        req.on('end', () => {
          const msg = `data: ${body}\n\n`;
          room.hosts.forEach((h) => { try { h.write(msg); } catch {} });
          res.statusCode = 204;
          res.end();
        });
        return;
      }

      // 7. TV -> Phone live telemetry POST
      if (pathname === '/api/relay/telemetry' && req.method === 'POST') {
        const { room } = getRoom(urlObj.searchParams.get('room') || 'AUTO');
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8192) req.destroy();
        });
        req.on('end', () => {
          try { room.lastTelemetry = JSON.parse(body); } catch {}
          const msg = `data: ${JSON.stringify({ type: 'telemetry', payload: room.lastTelemetry })}\n\n`;
          room.phones.forEach((p) => { try { p.write(msg); } catch {} });
          res.statusCode = 204;
          res.end();
        });
        return;
      }

      next();
    });
  }

  return {
    name: 'phone-controller-relay',
    configureServer(server) { attachMiddleware(server); },
    configurePreviewServer(server) { attachMiddleware(server); },
  };
}

// `npm run dev:phone` serves the game over https on your Wi-Fi so phones allow
// the motion sensors (tilt controls only work on secure https:// pages).
export default defineConfig(({ mode }) =>
  mode === 'phone'
    ? { plugins: [basicSsl(), phoneControllerRelayPlugin()], server: { host: true, port: 5173 } }
    : { plugins: [phoneControllerRelayPlugin()], server: { host: true, port: 5173 } }
);
