import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import os from 'os';

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
 * Built-in Zero-Dependency Real-Time Relay Plugin for Cast-to-TV + Phone Controller.
 * Works over both HTTP (`npm run dev`) and HTTPS (`npm run dev:phone`) on local Wi-Fi.
 */
function phoneControllerRelayPlugin() {
  const rooms = new Map();

  function getRoom(code) {
    const key = (code || 'MAIN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'MAIN';
    if (!rooms.has(key)) {
      rooms.set(key, { hosts: new Set(), phones: new Set(), lastTelemetry: null });
    }
    return { key, room: rooms.get(key) };
  }

  function attachMiddleware(server) {
    server.middlewares.use((req, res, next) => {
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

      if (pathname === '/api/network-info') {
        const lanIp = getLocalLanIp();
        const hostHeader = req.headers.host || 'localhost:5173';
        const portMatch = hostHeader.match(/:(\d+)$/);
        const port = portMatch ? portMatch[1] : '5173';
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ lanIp, port, relayAvailable: true }));
        return;
      }

      if (pathname === '/api/relay/host') {
        const { key, room } = getRoom(urlObj.searchParams.get('room'));
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'ready', room: key, phones: room.phones.size })}\n\n`);
        room.hosts.add(res);

        const keepAlive = setInterval(() => {
          try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
        }, 15000);

        req.on('close', () => {
          clearInterval(keepAlive);
          room.hosts.delete(res);
        });
        return;
      }

      if (pathname === '/api/relay/phone') {
        const { key, room } = getRoom(urlObj.searchParams.get('room'));
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        room.phones.add(res);
        res.write(`data: ${JSON.stringify({ type: 'connected', room: key, hosts: room.hosts.size })}\n\n`);
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

      if (pathname === '/api/relay/send' && req.method === 'POST') {
        const { room } = getRoom(urlObj.searchParams.get('room'));
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

      if (pathname === '/api/relay/telemetry' && req.method === 'POST') {
        const { room } = getRoom(urlObj.searchParams.get('room'));
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
