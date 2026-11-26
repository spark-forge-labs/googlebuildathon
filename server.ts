import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { getCircuitById } from './src/game/circuits.ts';
import { buildCircuitMetrics, interpolateCircuitPosition } from './src/game/circuitMath.ts';
import {
  AGENTIC_WINDOW_AFTER_START_MS,
  AGENTIC_WINDOW_BEFORE_START_MS,
  COUNTDOWN_DURATION_MS,
  MIN_PARTICIPANTS_FOR_RACE,
  RACE_DURATION_MS,
  canStartScheduledRace,
  computeOfficialStandings,
  evaluateAgenticActivation,
  getCurrentSlotStart,
  getNextSlotStart,
  getRaceTimeline,
  type AgenticInputType,
  type RacePhase,
} from './src/game/raceSchedule.ts';
import type { AnnouncedRaceResult, LiveParticipant, RoomStatePayload } from './src/types/race.ts';
import { computeBestLapMs } from './src/game/weeklyLeaderboard.ts';
import { WeeklyLeaderboardDatabase } from './src/server/leaderboardDb.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_FILE = path.join(__dirname, '.race-history.json');
const RESULTS_DISPLAY_MS = 45_000;

interface ConnectedParticipant extends LiveParticipant {
  ws: WebSocket;
  holdStartedAtMs: number | null;
  holdStartedRelativeToGoMs: number | null;
  holdInputType: AgenticInputType | null;
  holdPressure: number | undefined;
}

interface RaceRoom {
  id: string;
  label: string;
  type: 'global' | 'private' | 'practice';
  circuitId: string;
  phase: RacePhase;
  raceStartAtMs: number | null;
  resultsAnnouncedAtMs: number | null;
  lastSlotEvaluatedMs: number;
  notice: string | null;
  participants: Map<string, ConnectedParticipant>;
  lastAnnouncement: AnnouncedRaceResult | null;
}

function loadHistory(): AnnouncedRaceResult[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 25);
    }
  } catch {
    // Ignore malformed history file
  }
  return [];
}

function saveHistory(history: AnnouncedRaceResult[]): void {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 25), null, 2), 'utf-8');
  } catch {
    // Best-effort persistence
  }
}

const raceHistory: AnnouncedRaceResult[] = loadHistory();
const leaderboardDb = new WeeklyLeaderboardDatabase();
const rooms = new Map<string, RaceRoom>();

function createRoom(
  id: string,
  label: string,
  type: 'global' | 'private' | 'practice',
  circuitId = 'hyderabad'
): RaceRoom {
  const safeCircuit = getCircuitById(circuitId).id;
  const room: RaceRoom = {
    id,
    label,
    type,
    circuitId: safeCircuit,
    phase: 'lobby',
    raceStartAtMs: null,
    resultsAnnouncedAtMs: null,
    lastSlotEvaluatedMs: getCurrentSlotStart(Date.now()),
    notice: null,
    participants: new Map(),
    lastAnnouncement: null,
  };
  rooms.set(id, room);
  return room;
}

// Initialize the authoritative global 10-minute Grand Prix room
const GLOBAL_ROOM_ID = 'global-gp';
createRoom(GLOBAL_ROOM_ID, 'Global 10-Min Grand Prix', 'global', 'hyderabad');

function getOrCreateRoom(roomId: string, requestedCircuitId?: string): RaceRoom {
  const clean = roomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || GLOBAL_ROOM_ID;
  const existing = rooms.get(clean);
  if (existing) return existing;
  if (clean.startsWith('practice-')) {
    return createRoom(clean, 'Solo Practice Session', 'practice', requestedCircuitId || 'hyderabad');
  }
  return createRoom(
    clean,
    `Synced Room · ${clean.toUpperCase()}`,
    'private',
    requestedCircuitId || 'hyderabad'
  );
}

function serializeParticipant(p: ConnectedParticipant): LiveParticipant {
  return {
    id: p.id,
    name: p.name,
    locationName: p.locationName,
    locationCode: p.locationCode,
    originLat: p.originLat,
    originLng: p.originLng,
    vehicleId: p.vehicleId,
    distanceMeters: p.distanceMeters,
    speedKmh: p.speedKmh,
    topSpeedKmh: p.topSpeedKmh,
    lap: p.lap,
    lat: p.lat,
    lng: p.lng,
    heading: p.heading,
    agenticMode: p.agenticMode,
    agenticDecision: p.agenticDecision,
    ready: p.ready,
    joinedAtMs: p.joinedAtMs,
  };
}

function buildRoomPayload(room: RaceRoom, nowMs: number): RoomStatePayload {
  return {
    serverNowMs: nowMs,
    roomId: room.id,
    roomLabel: room.label,
    roomType: room.type,
    circuitId: room.circuitId,
    phase: room.phase,
    raceStartAtMs: room.raceStartAtMs,
    nextGlobalSlotAtMs: getNextSlotStart(nowMs),
    notice: room.notice,
    participants: Array.from(room.participants.values()).map(serializeParticipant),
    lastAnnouncement: room.lastAnnouncement,
    history: raceHistory.slice(0, 10),
  };
}

function broadcastRoom(room: RaceRoom, nowMs = Date.now()): void {
  const payload = JSON.stringify({
    type: 'room:state',
    payload: buildRoomPayload(room, nowMs),
  });
  for (const p of room.participants.values()) {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(payload);
    }
  }
}

function resetParticipantsForRaceStart(room: RaceRoom): void {
  const circuit = getCircuitById(room.circuitId);
  const metrics = buildCircuitMetrics(circuit.waypoints);
  let idx = 0;
  for (const p of room.participants.values()) {
    const startDist = idx * 8; // Staggered F1-style starting grid
    const pos = interpolateCircuitPosition(circuit.waypoints, startDist, metrics);
    p.distanceMeters = startDist;
    p.speedKmh = 0;
    p.topSpeedKmh = 0;
    p.lap = 1;
    p.lat = pos.lat;
    p.lng = pos.lng;
    p.heading = pos.heading;
    p.agenticMode = false;
    p.agenticDecision = 'Manual Control';
    p.holdStartedAtMs = null;
    p.holdStartedRelativeToGoMs = null;
    p.holdInputType = null;
    p.holdPressure = undefined;
    idx++;
  }
}

function startRaceInRoom(room: RaceRoom, startAtMs: number): void {
  resetParticipantsForRaceStart(room);
  room.raceStartAtMs = startAtMs;
  room.phase = 'countdown';
  room.resultsAnnouncedAtMs = null;
  room.notice = null;
  broadcastRoom(room, startAtMs);
}

function finalizeRaceAndAnnounce(room: RaceRoom, nowMs: number): void {
  const circuit = getCircuitById(room.circuitId);
  const standings = computeOfficialStandings(
    Array.from(room.participants.values()).map((p) => ({
      id: p.id,
      name: p.name,
      locationName: p.locationName,
      locationCode: p.locationCode,
      vehicleId: p.vehicleId,
      distanceMeters: p.distanceMeters,
      speedKmh: p.speedKmh,
      topSpeedKmh: p.topSpeedKmh,
      lap: p.lap,
      agenticMode: p.agenticMode,
      joinedAtMs: p.joinedAtMs,
    }))
  );

  const announcement: AnnouncedRaceResult = {
    raceId: crypto.randomUUID(),
    roomId: room.id,
    roomLabel: room.label,
    circuitId: circuit.id,
    circuitName: circuit.name,
    startedAtMs: room.raceStartAtMs ?? nowMs - RACE_DURATION_MS,
    finishedAtMs: nowMs,
    participantCount: standings.length,
    standings,
  };

  room.phase = 'results';
  room.resultsAnnouncedAtMs = nowMs;
  room.lastAnnouncement = announcement;
  room.notice = `Official 5-minute race results announced for ${circuit.name} GP!`;

  if (standings.length > 0 && room.type !== 'practice') {
    raceHistory.unshift(announcement);
    if (raceHistory.length > 25) raceHistory.length = 25;
    saveHistory(raceHistory);
  }

  // Persist every finisher's verified pace to the SQLite weekly global leaderboard
  if (standings.length > 0) {
    const metrics = buildCircuitMetrics(circuit.waypoints);
    const racingStartMs = (room.raceStartAtMs ?? nowMs - RACE_DURATION_MS) + COUNTDOWN_DURATION_MS;
    const elapsedRacingMs = Math.max(1000, nowMs - racingStartMs);

    for (const row of standings) {
      if (row.distanceMeters < 20 && row.topSpeedKmh < 10) continue;
      const bestLapMs = computeBestLapMs(
        row.distanceMeters,
        elapsedRacingMs,
        metrics.totalLapMeters,
        row.topSpeedKmh
      );
      const avgSpeedKmh = Math.round((row.distanceMeters / (elapsedRacingMs / 1000)) * 3.6);
      try {
        leaderboardDb.insertRun({
          driverName: row.name,
          locationName: row.locationName,
          locationCode: row.locationCode,
          circuitId: circuit.id,
          circuitName: circuit.name,
          vehicleId: row.vehicleId,
          topSpeedKmh: row.topSpeedKmh,
          avgSpeedKmh: Math.max(avgSpeedKmh, Math.round(row.topSpeedKmh * 0.65)),
          distanceKm: row.distanceKm,
          bestLapMs,
          controlMode: row.controlMode,
          recordedAtMs: nowMs,
        });
      } catch {
        // Keep race completion resilient even if DB write fails
      }
    }
  }

  broadcastRoom(room, nowMs);
}

// Authoritative server simulation & 10-minute global schedule loop (250ms tick)
setInterval(() => {
  const nowMs = Date.now();
  const currentSlotStart = getCurrentSlotStart(nowMs);

  for (const [roomId, room] of rooms.entries()) {
    // Prune empty non-global rooms after inactivity
    if (roomId !== GLOBAL_ROOM_ID && room.participants.size === 0 && room.phase === 'lobby') {
      rooms.delete(roomId);
      continue;
    }

    // 1. Global 10-minute scheduled race trigger
    if (room.type === 'global' && room.phase === 'lobby') {
      if (currentSlotStart > room.lastSlotEvaluatedMs && nowMs - currentSlotStart < 15_000) {
        room.lastSlotEvaluatedMs = currentSlotStart;
        if (canStartScheduledRace(room.participants.size)) {
          startRaceInRoom(room, nowMs);
        } else if (room.participants.size > 0) {
          room.notice = `Need at least ${MIN_PARTICIPANTS_FOR_RACE} participants to launch. Held for the next 10-minute Global GP slot.`;
          broadcastRoom(room, nowMs);
        }
      }
    }

    // 2. Active race timeline progression (10s countdown + 4m50s live racing = 5:00 total)
    if ((room.phase === 'countdown' || room.phase === 'racing') && room.raceStartAtMs !== null) {
      const timeline = getRaceTimeline(room.raceStartAtMs, nowMs);
      if (timeline.phase === 'racing' && room.phase === 'countdown') {
        room.phase = 'racing';
        broadcastRoom(room, nowMs);
      } else if (timeline.phase === 'results') {
        finalizeRaceAndAnnounce(room, nowMs);
      } else if (room.participants.size > 0) {
        broadcastRoom(room, nowMs);
      }
    }

    // 3. Auto-return to lobby after 45s results podium so racers line up for next 10-min slot
    if (
      room.phase === 'results' &&
      room.resultsAnnouncedAtMs !== null &&
      nowMs - room.resultsAnnouncedAtMs >= RESULTS_DISPLAY_MS
    ) {
      room.phase = 'lobby';
      room.raceStartAtMs = null;
      room.resultsAnnouncedAtMs = null;
      room.notice = null;
      for (const p of room.participants.values()) {
        p.ready = false;
      }
      broadcastRoom(room, nowMs);
    }
  }
}, 250);

async function startServer() {
  const app = express();
  app.use(express.json());

  // REST API: Live schedule, active rooms, and persisted race results
  app.get('/api/schedule', (_req, res) => {
    const nowMs = Date.now();
    const globalRoom = rooms.get(GLOBAL_ROOM_ID)!;
    res.json({
      serverNowMs: nowMs,
      nextGlobalSlotAtMs: getNextSlotStart(nowMs),
      minParticipants: MIN_PARTICIPANTS_FOR_RACE,
      raceDurationMs: RACE_DURATION_MS,
      countdownDurationMs: COUNTDOWN_DURATION_MS,
      globalParticipants: globalRoom.participants.size,
      globalPhase: globalRoom.phase,
      globalCircuitId: globalRoom.circuitId,
      recentResults: raceHistory.slice(0, 10),
    });
  });

  app.get('/api/results', (_req, res) => {
    res.json({ results: raceHistory.slice(0, 20) });
  });

  app.get('/api/leaderboard/weekly', (req, res) => {
    const rawCircuit = typeof req.query.circuit === 'string' ? req.query.circuit.trim() : 'all';
    const circuitId = rawCircuit === 'all' || !rawCircuit ? 'all' : getCircuitById(rawCircuit).id;
    const payload = leaderboardDb.getWeeklyTop10({ circuitId, limit: 10 });
    res.json(payload);
  });

  app.post('/api/rooms', (req, res) => {
    const circuitId = typeof req.body?.circuitId === 'string' ? req.body.circuitId : 'hyderabad';
    const roomType = req.body?.type === 'practice' ? 'practice' : 'private';
    const prefix = roomType === 'practice' ? 'practice' : 'gp';
    const code = `${prefix}-${crypto.randomBytes(3).toString('hex')}`;
    const room = getOrCreateRoom(code, circuitId);
    res.json({
      roomId: room.id,
      roomLabel: room.label,
      roomType: room.type,
      circuitId: room.circuitId,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let activeRoom: RaceRoom | null = null;
    let participantId: string | null = null;

    const sendDirect = (obj: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    };

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const nowMs = Date.now();
      const type = String(msg.type || '');

      if (type === 'room:join') {
        // Leave previous room cleanly if rejoining
        if (activeRoom && participantId) {
          activeRoom.participants.delete(participantId);
          broadcastRoom(activeRoom, nowMs);
        }

        const requestedRoomId =
          typeof msg.roomId === 'string' && msg.roomId.trim() ? msg.roomId.trim() : GLOBAL_ROOM_ID;
        const circuitId =
          typeof msg.circuitId === 'string' ? getCircuitById(msg.circuitId).id : 'hyderabad';
        const room = getOrCreateRoom(requestedRoomId, circuitId);

        // In lobby, update circuit if requested on private/practice rooms or first racer in global
        if (room.phase === 'lobby' && (room.type !== 'global' || room.participants.size === 0)) {
          room.circuitId = circuitId;
        }

        const circuit = getCircuitById(room.circuitId);
        const startPos = circuit.waypoints[0];
        const id =
          typeof msg.clientId === 'string' && msg.clientId.trim()
            ? msg.clientId.trim().slice(0, 48)
            : crypto.randomUUID();

        const safeName = String(msg.name || 'Racer')
          .trim()
          .replace(/[^a-zA-Z0-9 _.-]/g, '')
          .slice(0, 20) || 'Racer';
        const safeLocationName = String(msg.locationName || 'Hyderabad, India').slice(0, 48);
        const safeLocationCode = String(msg.locationCode || 'IN').slice(0, 4).toUpperCase();
        const originLat = Number(msg.originLat) || 17.385;
        const originLng = Number(msg.originLng) || 78.4867;
        const vehicleId = String(msg.vehicleId || 'apex-gtr').slice(0, 24);

        const participant: ConnectedParticipant = {
          id,
          name: safeName,
          locationName: safeLocationName,
          locationCode: safeLocationCode,
          originLat,
          originLng,
          vehicleId,
          distanceMeters: 0,
          speedKmh: 0,
          topSpeedKmh: 0,
          lap: 1,
          lat: startPos.lat,
          lng: startPos.lng,
          heading: circuit.streetViewStartHeading,
          agenticMode: false,
          agenticDecision: 'Manual Control',
          ready: false,
          joinedAtMs: nowMs,
          ws,
          holdStartedAtMs: null,
          holdStartedRelativeToGoMs: null,
          holdInputType: null,
          holdPressure: undefined,
        };

        room.participants.set(id, participant);
        activeRoom = room;
        participantId = id;

        sendDirect({
          type: 'room:joined',
          participantId: id,
          serverNowMs: nowMs,
        });

        // Auto-start solo practice immediately on join
        if (room.type === 'practice' && room.phase === 'lobby') {
          startRaceInRoom(room, nowMs);
          return;
        }

        broadcastRoom(room, nowMs);
        return;
      }

      if (!activeRoom || !participantId) return;
      const me = activeRoom.participants.get(participantId);
      if (!me) return;

      if (type === 'room:select_circuit' && activeRoom.phase === 'lobby') {
        const nextCircuit = getCircuitById(String(msg.circuitId || 'hyderabad'));
        activeRoom.circuitId = nextCircuit.id;
        broadcastRoom(activeRoom, nowMs);
        return;
      }

      if (type === 'room:ready' && activeRoom.phase === 'lobby') {
        me.ready = Boolean(msg.ready);
        if (activeRoom.type === 'private') {
          const allReady =
            activeRoom.participants.size >= MIN_PARTICIPANTS_FOR_RACE &&
            Array.from(activeRoom.participants.values()).every((p) => p.ready);
          if (allReady) {
            startRaceInRoom(activeRoom, nowMs);
            return;
          }
        }
        broadcastRoom(activeRoom, nowMs);
        return;
      }

      // Host / room launch button for private rooms when >= 2 participants have joined
      if (type === 'room:launch_now' && activeRoom.phase === 'lobby') {
        if (
          activeRoom.type === 'private' &&
          canStartScheduledRace(activeRoom.participants.size)
        ) {
          startRaceInRoom(activeRoom, nowMs);
        } else if (activeRoom.type === 'practice') {
          startRaceInRoom(activeRoom, nowMs);
        } else {
          activeRoom.notice = `Minimum ${MIN_PARTICIPANTS_FOR_RACE} participants required before launching.`;
          broadcastRoom(activeRoom, nowMs);
        }
        return;
      }

      // End practice race early to view official results screen if desired
      if (type === 'room:finish_now' && (activeRoom.phase === 'racing' || activeRoom.phase === 'countdown')) {
        if (activeRoom.type === 'practice' || activeRoom.type === 'private') {
          finalizeRaceAndAnnounce(activeRoom, nowMs);
        }
        return;
      }

      // Live telemetry updates from client during racing
      if (type === 'race:telemetry' && activeRoom.phase === 'racing') {
        const dist = Number(msg.distanceMeters);
        const speed = Number(msg.speedKmh);
        const lat = Number(msg.lat);
        const lng = Number(msg.lng);
        const heading = Number(msg.heading);
        const lap = Number(msg.lap);

        if (Number.isFinite(dist) && dist >= me.distanceMeters && dist - me.distanceMeters < 180) {
          me.distanceMeters = dist;
        }
        if (Number.isFinite(speed) && speed >= 0 && speed <= 420) {
          me.speedKmh = speed;
          me.topSpeedKmh = Math.max(me.topSpeedKmh, speed);
        }
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          me.lat = lat;
          me.lng = lng;
        }
        if (Number.isFinite(heading)) {
          me.heading = ((heading % 360) + 360) % 360;
        }
        if (Number.isFinite(lap) && lap >= 1) {
          me.lap = Math.floor(lap);
        }
        if (me.agenticMode && typeof msg.agenticDecision === 'string') {
          me.agenticDecision = msg.agenticDecision.slice(0, 64);
        }
        return;
      }

      // === SERVER-AUTHORITATIVE TWO-PHASE HUMAN HAND-PRESS GATE FOR AGENTIC MODE ===
      if (type === 'agentic:hold_start') {
        if (!activeRoom.raceStartAtMs) return;
        const timeline = getRaceTimeline(activeRoom.raceStartAtMs, nowMs);
        const isTrusted = msg.isTrusted === true;
        const inputType: AgenticInputType =
          msg.inputType === 'touch_hard_press'
            ? 'touch_hard_press'
            : msg.inputType === 'pointer_hold'
              ? 'pointer_hold'
              : 'desktop_key_p';
        const pressure = typeof msg.pressure === 'number' ? msg.pressure : undefined;

        if (!isTrusted) {
          sendDirect({
            type: 'agentic:status',
            status: 'rejected',
            reason: 'UNTRUSTED_AUTOMATION_BLOCKED',
            message: 'Automated trigger blocked. Physical human hand press required to load Agentic Mode.',
          });
          return;
        }

        if (activeRoom.participants.size < MIN_PARTICIPANTS_FOR_RACE) {
          sendDirect({
            type: 'agentic:status',
            status: 'rejected',
            reason: 'INSUFFICIENT_PARTICIPANTS',
            message: 'Agentic Mode requires at least 2 participants in the race.',
          });
          return;
        }

        const inWindow =
          timeline.msRelativeToGo >= -AGENTIC_WINDOW_BEFORE_START_MS &&
          timeline.msRelativeToGo <= AGENTIC_WINDOW_AFTER_START_MS;

        if (!inWindow) {
          sendDirect({
            type: 'agentic:status',
            status: 'rejected',
            reason: 'OUTSIDE_ACTIVATION_WINDOW',
            message: 'Hold window is strictly 3s before to 5s after race start.',
          });
          return;
        }

        me.holdStartedAtMs = nowMs;
        me.holdStartedRelativeToGoMs = timeline.msRelativeToGo;
        me.holdInputType = inputType;
        me.holdPressure = pressure;

        sendDirect({
          type: 'agentic:status',
          status: 'holding',
          message: 'Keep holding continuously for 2.0 seconds…',
        });
        return;
      }

      if (type === 'agentic:hold_cancel') {
        me.holdStartedAtMs = null;
        me.holdStartedRelativeToGoMs = null;
        sendDirect({
          type: 'agentic:status',
          status: 'cancelled',
          message: 'Released early — hold continuously for 2.0s inside the window.',
        });
        return;
      }

      if (type === 'agentic:hold_commit') {
        if (!activeRoom.raceStartAtMs || me.holdStartedAtMs === null || me.holdStartedRelativeToGoMs === null) {
          sendDirect({
            type: 'agentic:status',
            status: 'rejected',
            reason: 'HOLD_TOO_SHORT',
            message: 'No active 2-second human press detected.',
          });
          return;
        }

        const serverHoldDurationMs = nowMs - me.holdStartedAtMs;
        const pressure =
          typeof msg.pressure === 'number' ? msg.pressure : me.holdPressure;
        const check = evaluateAgenticActivation({
          participantCount: activeRoom.participants.size,
          holdStartedRelativeToGoMs: me.holdStartedRelativeToGoMs,
          holdDurationMs: serverHoldDurationMs,
          isTrusted: msg.isTrusted === true,
          inputType: me.holdInputType ?? 'desktop_key_p',
          pressure,
          isServerCheck: true,
        });

        me.holdStartedAtMs = null;
        me.holdStartedRelativeToGoMs = null;

        if (!check.allowed) {
          sendDirect({
            type: 'agentic:status',
            status: 'rejected',
            reason: check.reason,
            message: check.message,
          });
          return;
        }

        me.agenticMode = true;
        me.agenticDecision = 'Autonomous Racing Line Active';
        sendDirect({
          type: 'agentic:status',
          status: 'engaged',
          message: check.message,
        });
        broadcastRoom(activeRoom, nowMs);
        return;
      }

      if (type === 'agentic:disengage') {
        me.agenticMode = false;
        me.agenticDecision = 'Manual Control';
        sendDirect({
          type: 'agentic:status',
          status: 'disengaged',
          message: 'Switched back to Manual Drive.',
        });
        broadcastRoom(activeRoom, nowMs);
        return;
      }
    });

    ws.on('close', () => {
      if (activeRoom && participantId) {
        activeRoom.participants.delete(participantId);
        broadcastRoom(activeRoom, Date.now());
      }
    });
  });

  // Mount Vite middleware in dev, or serve static dist/ in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`StreetView GP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start StreetView GP server:', err);
  process.exit(1);
});
