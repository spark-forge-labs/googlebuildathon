import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENTIC_REQUIRED_HOLD_MS,
  COUNTDOWN_DURATION_MS,
  RACE_DURATION_MS,
  SCHEDULE_INTERVAL_MS,
  canStartScheduledRace,
  computeOfficialStandings,
  evaluateAgenticActivation,
  formatClockMs,
  getCurrentSlotStart,
  getNextSlotStart,
  getRaceTimeline,
} from './raceSchedule';

test('10-minute global schedule boundaries compute accurately', () => {
  const base = Date.UTC(2026, 10, 25, 12, 14, 30); // 12:14:30 UTC
  const current = getCurrentSlotStart(base);
  const next = getNextSlotStart(base);

  assert.equal(current, Date.UTC(2026, 10, 25, 12, 10, 0));
  assert.equal(next, Date.UTC(2026, 10, 25, 12, 20, 0));
  assert.equal(next - current, SCHEDULE_INTERVAL_MS);
});

test('5-minute race duration includes 10-second countdown and opens Agentic window at [-3s, +5s]', () => {
  const start = 1_000_000;
  const go = start + COUNTDOWN_DURATION_MS;

  // At T+0s (start of 10-second countdown): countdown=10, Agentic window NOT open yet
  const t0 = getRaceTimeline(start, start);
  assert.equal(t0.phase, 'countdown');
  assert.equal(t0.countdownSecondsLeft, 10);
  assert.equal(t0.remainingMs, RACE_DURATION_MS);
  assert.equal(t0.isAgenticWindowOpen, false);

  // At T+6.5s (3.5s before GO): still outside [-3s, +5s]
  const t6_5 = getRaceTimeline(start, start + 6500);
  assert.equal(t6_5.phase, 'countdown');
  assert.equal(t6_5.isAgenticWindowOpen, false);

  // At T+7.0s (exact 3s before GO): Agentic window OPENS
  const t7 = getRaceTimeline(start, go - 3000);
  assert.equal(t7.phase, 'countdown');
  assert.equal(t7.countdownSecondsLeft, 3);
  assert.equal(t7.isAgenticWindowOpen, true);
  assert.equal(t7.agenticWindowRemainingMs, 8000);

  // At T+10.0s (exact GO): phase switches to racing, Agentic window open for 5 more seconds
  const t10 = getRaceTimeline(start, go);
  assert.equal(t10.phase, 'racing');
  assert.equal(t10.countdownSecondsLeft, 0);
  assert.equal(t10.isAgenticWindowOpen, true);
  assert.equal(t10.agenticWindowRemainingMs, 5000);

  // At T+15.0s (exact 5s after GO): still boundary open
  const t15 = getRaceTimeline(start, go + 5000);
  assert.equal(t15.phase, 'racing');
  assert.equal(t15.isAgenticWindowOpen, true);

  // At T+15.001s (after +5s): Agentic window CLOSED
  const t15_1 = getRaceTimeline(start, go + 5001);
  assert.equal(t15_1.phase, 'racing');
  assert.equal(t15_1.isAgenticWindowOpen, false);

  // At T+5m (exact 300,000ms): Results announced!
  const tEnd = getRaceTimeline(start, start + RACE_DURATION_MS);
  assert.equal(tEnd.phase, 'results');
  assert.equal(tEnd.remainingMs, 0);
});

test('minimum 2 participants required to start scheduled race', () => {
  assert.equal(canStartScheduledRace(0), false);
  assert.equal(canStartScheduledRace(1), false);
  assert.equal(canStartScheduledRace(2), true);
  assert.equal(canStartScheduledRace(8), true);
});

test('Agentic hand-press gate blocks automation, <2 racers, outside window, and short holds', () => {
  // Valid desktop key P hold initiated 2.5s before GO for 2.0s with 2 racers
  const validDesktop = evaluateAgenticActivation({
    participantCount: 2,
    holdStartedRelativeToGoMs: -2500,
    holdDurationMs: AGENTIC_REQUIRED_HOLD_MS,
    isTrusted: true,
    inputType: 'desktop_key_p',
  });
  assert.equal(validDesktop.allowed, true);
  assert.equal(validDesktop.reason, 'OK');

  // Valid mobile hard press initiated 4.2s after GO for 2.1s with pressure 0.65
  const validMobile = evaluateAgenticActivation({
    participantCount: 3,
    holdStartedRelativeToGoMs: 4200,
    holdDurationMs: 2100,
    isTrusted: true,
    inputType: 'touch_hard_press',
    pressure: 0.65,
  });
  assert.equal(validMobile.allowed, true);

  // Blocked: Solo racer (< 2 participants)
  const blockedSolo = evaluateAgenticActivation({
    participantCount: 1,
    holdStartedRelativeToGoMs: 0,
    holdDurationMs: 2200,
    isTrusted: true,
    inputType: 'desktop_key_p',
  });
  assert.equal(blockedSolo.allowed, false);
  assert.equal(blockedSolo.reason, 'INSUFFICIENT_PARTICIPANTS');

  // Blocked: Untrusted synthetic/agentic click (isTrusted === false)
  const blockedBot = evaluateAgenticActivation({
    participantCount: 4,
    holdStartedRelativeToGoMs: 1000,
    holdDurationMs: 2500,
    isTrusted: false,
    inputType: 'desktop_key_p',
  });
  assert.equal(blockedBot.allowed, false);
  assert.equal(blockedBot.reason, 'UNTRUSTED_AUTOMATION_BLOCKED');

  // Blocked: Started 4s before GO (window opens at -3s)
  const blockedEarly = evaluateAgenticActivation({
    participantCount: 4,
    holdStartedRelativeToGoMs: -4000,
    holdDurationMs: 2200,
    isTrusted: true,
    inputType: 'desktop_key_p',
  });
  assert.equal(blockedEarly.allowed, false);
  assert.equal(blockedEarly.reason, 'OUTSIDE_ACTIVATION_WINDOW');

  // Blocked: Started 5.5s after GO (window closes at +5s)
  const blockedLate = evaluateAgenticActivation({
    participantCount: 4,
    holdStartedRelativeToGoMs: 5500,
    holdDurationMs: 2200,
    isTrusted: true,
    inputType: 'desktop_key_p',
  });
  assert.equal(blockedLate.allowed, false);
  assert.equal(blockedLate.reason, 'OUTSIDE_ACTIVATION_WINDOW');

  // Blocked: Released after 1.5s (< 2.0s required)
  const blockedShort = evaluateAgenticActivation({
    participantCount: 2,
    holdStartedRelativeToGoMs: 500,
    holdDurationMs: 1500,
    isTrusted: true,
    inputType: 'desktop_key_p',
  });
  assert.equal(blockedShort.allowed, false);
  assert.equal(blockedShort.reason, 'HOLD_TOO_SHORT');

  // Blocked: Light feather touch (< 0.22 pressure)
  const blockedLightTouch = evaluateAgenticActivation({
    participantCount: 2,
    holdStartedRelativeToGoMs: 500,
    holdDurationMs: 2100,
    isTrusted: true,
    inputType: 'touch_hard_press',
    pressure: 0.1,
  });
  assert.equal(blockedLightTouch.allowed, false);
  assert.equal(blockedLightTouch.reason, 'INSUFFICIENT_HARD_PRESS_FORCE');
});

test('computeOfficialStandings ranks multi-location participants accurately', () => {
  const standings = computeOfficialStandings([
    {
      id: 'p1',
      name: 'Aarav',
      locationName: 'Hyderabad, India',
      locationCode: 'IN',
      vehicleId: 'apex-gtr',
      distanceMeters: 18400,
      speedKmh: 240,
      topSpeedKmh: 304,
      lap: 5,
      agenticMode: true,
      joinedAtMs: 1000,
    },
    {
      id: 'p2',
      name: 'Elena',
      locationName: 'London, UK',
      locationCode: 'GB',
      vehicleId: 'nizam-hyper',
      distanceMeters: 19250,
      speedKmh: 255,
      topSpeedKmh: 318,
      lap: 5,
      agenticMode: false,
      joinedAtMs: 1200,
    },
  ]);

  assert.equal(standings[0].name, 'Elena');
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[0].gapMeters, 0);
  assert.equal(standings[0].controlMode, 'MANUAL');
  assert.equal(standings[1].name, 'Aarav');
  assert.equal(standings[1].rank, 2);
  assert.equal(standings[1].gapMeters, 850);
  assert.equal(standings[1].controlMode, 'AGENTIC');
  assert.equal(formatClockMs(300_000), '05:00');
});
