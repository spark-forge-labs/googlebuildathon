import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import {
  getCurrentWeekWindow,
  rankWeeklyLeaderboard,
  type WeeklyLeaderboardEntry,
  type WeeklyLeaderboardResponse,
} from '../game/weeklyLeaderboard.ts';

export interface InsertLeaderboardRunInput {
  driverName: string;
  locationName: string;
  locationCode: string;
  circuitId: string;
  circuitName: string;
  vehicleId: string;
  topSpeedKmh: number;
  avgSpeedKmh: number;
  distanceKm: number;
  bestLapMs: number;
  controlMode: 'AGENTIC' | 'MANUAL';
  recordedAtMs: number;
}

export class WeeklyLeaderboardDatabase {
  private db: DatabaseSync;

  constructor(dbFilePath: string = path.resolve(process.cwd(), '.race-leaderboard.db')) {
    this.db = new DatabaseSync(dbFilePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS weekly_leaderboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_name TEXT NOT NULL,
        location_name TEXT NOT NULL,
        location_code TEXT NOT NULL,
        circuit_id TEXT NOT NULL,
        circuit_name TEXT NOT NULL,
        vehicle_id TEXT NOT NULL,
        top_speed_kmh INTEGER NOT NULL,
        avg_speed_kmh INTEGER NOT NULL,
        distance_km REAL NOT NULL,
        best_lap_ms INTEGER NOT NULL,
        control_mode TEXT NOT NULL,
        recorded_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_weekly_lb_recorded_pace
        ON weekly_leaderboard (recorded_at_ms, best_lap_ms, top_speed_kmh);
    `);
  }

  insertRun(input: InsertLeaderboardRunInput): number {
    const stmt = this.db.prepare(`
      INSERT INTO weekly_leaderboard (
        driver_name,
        location_name,
        location_code,
        circuit_id,
        circuit_name,
        vehicle_id,
        top_speed_kmh,
        avg_speed_kmh,
        distance_km,
        best_lap_ms,
        control_mode,
        recorded_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.driverName.trim().slice(0, 24) || 'Racer',
      input.locationName.trim().slice(0, 48) || 'Unknown',
      input.locationCode.trim().slice(0, 4).toUpperCase() || 'GL',
      input.circuitId.trim().slice(0, 32),
      input.circuitName.trim().slice(0, 48),
      input.vehicleId.trim().slice(0, 24),
      Math.max(0, Math.round(input.topSpeedKmh)),
      Math.max(0, Math.round(input.avgSpeedKmh)),
      Math.max(0, Number(input.distanceKm.toFixed(3))),
      Math.max(10_000, Math.round(input.bestLapMs)),
      input.controlMode === 'AGENTIC' ? 'AGENTIC' : 'MANUAL',
      Math.round(input.recordedAtMs)
    );

    return Number(result.lastInsertRowid);
  }

  getWeeklyTop10(options?: {
    circuitId?: string;
    nowMs?: number;
    limit?: number;
  }): WeeklyLeaderboardResponse {
    const nowMs = options?.nowMs ?? Date.now();
    const circuitId = options?.circuitId && options.circuitId !== 'all' ? options.circuitId : 'all';
    const limit = Math.min(25, Math.max(1, options?.limit ?? 10));
    const window = getCurrentWeekWindow(nowMs);

    const rows =
      circuitId === 'all'
        ? (this.db
            .prepare(
              `SELECT id, driver_name, location_name, location_code, circuit_id, circuit_name,
                      vehicle_id, top_speed_kmh, avg_speed_kmh, distance_km, best_lap_ms,
                      control_mode, recorded_at_ms
                 FROM weekly_leaderboard
                WHERE recorded_at_ms >= ? AND recorded_at_ms < ?
                ORDER BY best_lap_ms ASC, top_speed_kmh DESC
                LIMIT 200`
            )
            .all(window.weekStartMs, window.weekEndMs) as Array<Record<string, unknown>>)
        : (this.db
            .prepare(
              `SELECT id, driver_name, location_name, location_code, circuit_id, circuit_name,
                      vehicle_id, top_speed_kmh, avg_speed_kmh, distance_km, best_lap_ms,
                      control_mode, recorded_at_ms
                 FROM weekly_leaderboard
                WHERE recorded_at_ms >= ? AND recorded_at_ms < ? AND circuit_id = ?
                ORDER BY best_lap_ms ASC, top_speed_kmh DESC
                LIMIT 200`
            )
            .all(window.weekStartMs, window.weekEndMs, circuitId) as Array<Record<string, unknown>>);

    const mapped: WeeklyLeaderboardEntry[] = rows.map((r) => ({
      id: Number(r.id),
      driverName: String(r.driver_name),
      locationName: String(r.location_name),
      locationCode: String(r.location_code),
      circuitId: String(r.circuit_id),
      circuitName: String(r.circuit_name),
      vehicleId: String(r.vehicle_id),
      topSpeedKmh: Number(r.top_speed_kmh),
      avgSpeedKmh: Number(r.avg_speed_kmh),
      distanceKm: Number(r.distance_km),
      bestLapMs: Number(r.best_lap_ms),
      controlMode: r.control_mode === 'AGENTIC' ? 'AGENTIC' : 'MANUAL',
      recordedAtMs: Number(r.recorded_at_ms),
    }));

    const entries = rankWeeklyLeaderboard(mapped, {
      weekStartMs: window.weekStartMs,
      weekEndMs: window.weekEndMs,
      circuitId,
      limit,
    });

    return {
      weekLabel: window.weekLabel,
      weekStartMs: window.weekStartMs,
      weekEndMs: window.weekEndMs,
      circuit: circuitId,
      totalRunsThisWeek: mapped.length,
      entries,
    };
  }

  close(): void {
    this.db.close();
  }
}
