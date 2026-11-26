export interface WeeklyLeaderboardEntry {
  id: number;
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

export interface WeekWindow {
  weekStartMs: number;
  weekEndMs: number;
  weekLabel: string;
}

export interface WeeklyLeaderboardResponse {
  weekLabel: string;
  weekStartMs: number;
  weekEndMs: number;
  circuit: string;
  totalRunsThisWeek: number;
  entries: WeeklyLeaderboardEntry[];
}

const MS_PER_DAY = 86_400_000;

/**
 * Returns the Monday 00:00:00 UTC -> next Monday 00:00:00 UTC window containing `nowMs`.
 */
export function getCurrentWeekWindow(nowMs: number): WeekWindow {
  const d = new Date(nowMs);
  const utcDay = d.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const daysSinceMonday = (utcDay + 6) % 7;
  const startUtc = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysSinceMonday,
    0,
    0,
    0,
    0
  );
  const endUtc = startUtc + 7 * MS_PER_DAY;
  const inclusiveEnd = new Date(endUtc - 1);
  const startDate = new Date(startUtc);

  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const year = inclusiveEnd.getUTCFullYear();
  const weekLabel = `${fmt.format(startDate)} – ${fmt.format(inclusiveEnd)}, ${year}`;

  return {
    weekStartMs: startUtc,
    weekEndMs: endUtc,
    weekLabel,
  };
}

/**
 * Computes an estimated best lap time in milliseconds from a racer's distance,
 * elapsed racing milliseconds, and circuit lap length.
 */
export function computeBestLapMs(
  distanceMeters: number,
  elapsedRacingMs: number,
  lapLengthMeters: number,
  topSpeedKmh: number
): number {
  const safeLap = Math.max(1000, lapLengthMeters);
  if (distanceMeters >= 80 && elapsedRacingMs >= 1000) {
    const avgMetersPerSec = distanceMeters / (elapsedRacingMs / 1000);
    if (avgMetersPerSec > 2) {
      return Math.round((safeLap / avgMetersPerSec) * 1000);
    }
  }
  const fallbackMps = Math.max(15, (Math.max(60, topSpeedKmh) * 0.72) / 3.6);
  return Math.round((safeLap / fallbackMps) * 1000);
}

/**
 * Filters entries to the active week (and optional circuit), keeps each driver's
 * single fastest run (fastest lap first, tie-break by highest top speed), and returns top N.
 */
export function rankWeeklyLeaderboard(
  entries: WeeklyLeaderboardEntry[],
  options: {
    weekStartMs: number;
    weekEndMs: number;
    circuitId?: string;
    limit?: number;
  }
): WeeklyLeaderboardEntry[] {
  const { weekStartMs, weekEndMs, circuitId = 'all', limit = 10 } = options;

  const filtered = entries.filter((e) => {
    if (e.recordedAtMs < weekStartMs || e.recordedAtMs >= weekEndMs) return false;
    if (circuitId !== 'all' && e.circuitId !== circuitId) return false;
    return true;
  });

  // Sort fastest lap ascending, then top speed descending, then distance descending
  const sorted = [...filtered].sort((a, b) => {
    if (a.bestLapMs !== b.bestLapMs) return a.bestLapMs - b.bestLapMs;
    if (b.topSpeedKmh !== a.topSpeedKmh) return b.topSpeedKmh - a.topSpeedKmh;
    if (b.distanceKm !== a.distanceKm) return b.distanceKm - a.distanceKm;
    return a.recordedAtMs - b.recordedAtMs;
  });

  // Deduplicate so each driver holds their single fastest entry on the board
  const seenDrivers = new Set<string>();
  const uniqueTop: WeeklyLeaderboardEntry[] = [];
  for (const row of sorted) {
    const key = `${row.driverName.trim().toLowerCase()}::${circuitId === 'all' ? 'all' : row.circuitId}`;
    if (seenDrivers.has(key)) continue;
    seenDrivers.add(key);
    uniqueTop.push(row);
    if (uniqueTop.length >= limit) break;
  }

  return uniqueTop;
}

export function formatLapTimeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--.--';
  const totalCs = Math.round(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
