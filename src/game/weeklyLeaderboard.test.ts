import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBestLapMs,
  formatLapTimeMs,
  getCurrentWeekWindow,
  rankWeeklyLeaderboard,
  type WeeklyLeaderboardEntry,
} from './weeklyLeaderboard.ts';
import { WeeklyLeaderboardDatabase } from '../server/leaderboardDb.ts';

test('getCurrentWeekWindow computes Monday-to-Monday UTC boundaries accurately', () => {
  // Wednesday, Nov 25, 2026 18:30:00 UTC -> Monday is Nov 23, 2026 00:00:00 UTC
  const wed = Date.UTC(2026, 10, 25, 18, 30, 0);
  const w = getCurrentWeekWindow(wed);
  assert.equal(w.weekStartMs, Date.UTC(2026, 10, 23, 0, 0, 0));
  assert.equal(w.weekEndMs, Date.UTC(2026, 10, 30, 0, 0, 0));
  assert.match(w.weekLabel, /Nov 23/);
  assert.match(w.weekLabel, /Nov 29/);
});

test('rankWeeklyLeaderboard excludes prior week, deduplicates drivers, sorts fastest lap first, caps at 10', () => {
  const now = Date.UTC(2026, 10, 25, 12, 0, 0);
  const w = getCurrentWeekWindow(now);

  const entries: WeeklyLeaderboardEntry[] = [];
  for (let i = 0; i < 14; i++) {
    entries.push({
      id: i + 1,
      driverName: `Driver ${i + 1}`,
      locationName: 'Hyderabad, India',
      locationCode: 'IN',
      circuitId: i % 2 === 0 ? 'hyderabad' : 'london',
      circuitName: i % 2 === 0 ? 'Hyderabad' : 'London',
      vehicleId: 'apex-gtr',
      topSpeedKmh: 260 + i,
      avgSpeedKmh: 180 + i,
      distanceKm: 12.4,
      bestLapMs: 70_000 + i * 1500,
      controlMode: i % 3 === 0 ? 'AGENTIC' : 'MANUAL',
      recordedAtMs: now - i * 1000,
    });
  }
  // Older run from previous week should be ignored even though it's faster
  entries.push({
    id: 999,
    driverName: 'Old Champ',
    locationName: 'Paris, France',
    locationCode: 'FR',
    circuitId: 'hyderabad',
    circuitName: 'Hyderabad',
    vehicleId: 'nizam-hyper',
    topSpeedKmh: 320,
    avgSpeedKmh: 240,
    distanceKm: 18.0,
    bestLapMs: 52_000,
    controlMode: 'MANUAL',
    recordedAtMs: w.weekStartMs - 10_000,
  });
  // Slower duplicate for Driver 1 should be deduplicated
  entries.push({
    ...entries[0],
    id: 1000,
    bestLapMs: 95_000,
  });

  const topAll = rankWeeklyLeaderboard(entries, {
    weekStartMs: w.weekStartMs,
    weekEndMs: w.weekEndMs,
    circuitId: 'all',
    limit: 10,
  });

  assert.equal(topAll.length, 10);
  assert.equal(topAll[0].driverName, 'Driver 1');
  assert.equal(topAll.some((r) => r.driverName === 'Old Champ'), false);

  const topLondon = rankWeeklyLeaderboard(entries, {
    weekStartMs: w.weekStartMs,
    weekEndMs: w.weekEndMs,
    circuitId: 'london',
    limit: 10,
  });
  assert.equal(topLondon.every((r) => r.circuitId === 'london'), true);
  assert.equal(topLondon[0].driverName, 'Driver 2');
});

test('WeeklyLeaderboardDatabase persists runs in SQLite and returns weekly top 10', () => {
  const db = new WeeklyLeaderboardDatabase(':memory:');
  const now = Date.UTC(2026, 10, 25, 14, 0, 0);
  const w = getCurrentWeekWindow(now);

  db.insertRun({
    driverName: 'Elena Vance',
    locationName: 'London, UK',
    locationCode: 'GB',
    circuitId: 'london',
    circuitName: 'London',
    vehicleId: 'apex-gtr',
    topSpeedKmh: 304,
    avgSpeedKmh: 210,
    distanceKm: 16.5,
    bestLapMs: 68_420,
    controlMode: 'AGENTIC',
    recordedAtMs: now,
  });

  db.insertRun({
    driverName: 'Aarav Rao',
    locationName: 'Hyderabad, India',
    locationCode: 'IN',
    circuitId: 'hyderabad',
    circuitName: 'Hyderabad',
    vehicleId: 'nizam-hyper',
    topSpeedKmh: 318,
    avgSpeedKmh: 222,
    distanceKm: 17.8,
    bestLapMs: 64_150,
    controlMode: 'MANUAL',
    recordedAtMs: now - 30_000,
  });

  // Out-of-week entry
  db.insertRun({
    driverName: 'Last Week Ghost',
    locationName: 'Tokyo, Japan',
    locationCode: 'JP',
    circuitId: 'hyderabad',
    circuitName: 'Hyderabad',
    vehicleId: 'bayline-rs',
    topSpeedKmh: 325,
    avgSpeedKmh: 230,
    distanceKm: 19.0,
    bestLapMs: 55_000,
    controlMode: 'MANUAL',
    recordedAtMs: w.weekStartMs - 60_000,
  });

  const res = db.getWeeklyTop10({ circuitId: 'all', nowMs: now });
  assert.equal(res.entries.length, 2);
  assert.equal(res.entries[0].driverName, 'Aarav Rao');
  assert.equal(res.entries[1].driverName, 'Elena Vance');

  const londonOnly = db.getWeeklyTop10({ circuitId: 'london', nowMs: now });
  assert.equal(londonOnly.entries.length, 1);
  assert.equal(londonOnly.entries[0].driverName, 'Elena Vance');

  assert.equal(formatLapTimeMs(64_150), '01:04.15');
  assert.ok(computeBestLapMs(1000, 18_000, 4450, 260) > 60_000);
  db.close();
});
