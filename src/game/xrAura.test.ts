import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AURA_OPTICAL_FOV_DEG,
  computeTwoHandSteering,
  extractGamepadDrivingInput,
  getAuraDimmingConfig,
  isHandPinching,
} from './xrAura';

describe('XREAL Aura / Android XR Spatial Module', () => {
  it('configures all 5 electrochromic dimming levels from optical AR clear to full shade', () => {
    const l1 = getAuraDimmingConfig(1);
    const l3 = getAuraDimmingConfig(3);
    const l5 = getAuraDimmingConfig(5);

    assert.equal(AURA_OPTICAL_FOV_DEG, 70);
    assert.equal(l1.transparentPassthrough, true);
    assert.equal(l1.skyOpacity, 0);
    assert.ok(l3.skyOpacity > l1.skyOpacity && l3.skyOpacity < l5.skyOpacity);
    assert.equal(l5.transparentPassthrough, false);
    assert.equal(l5.skyOpacity, 1);
  });

  it('computes intuitive two-hand 6DoF virtual steering wheel angles', () => {
    // Level hands = straight ahead (0)
    assert.equal(
      computeTwoHandSteering({ x: -0.2, y: 1.1, z: -0.4 }, { x: 0.2, y: 1.1, z: -0.4 }),
      0
    );

    // Turning wheel clockwise (left hand raised, right hand lowered) steers right (> 0.5)
    const rightTurn = computeTwoHandSteering(
      { x: -0.18, y: 1.24, z: -0.4 },
      { x: 0.18, y: 0.98, z: -0.4 }
    );
    assert.ok(rightTurn > 0.5 && rightTurn <= 1, `Expected right turn > 0.5, got ${rightTurn}`);

    // Turning wheel counter-clockwise (right hand raised, left hand lowered) steers left (< -0.5)
    const leftTurn = computeTwoHandSteering(
      { x: -0.18, y: 0.98, z: -0.4 },
      { x: 0.18, y: 1.24, z: -0.4 }
    );
    assert.ok(leftTurn < -0.5 && leftTurn >= -1, `Expected left turn < -0.5, got ${leftTurn}`);
  });

  it('detects air-pinch gestures within optical hand-tracking threshold', () => {
    assert.equal(
      isHandPinching({ x: 0, y: 0, z: 0 }, { x: 0.015, y: 0.01, z: 0 }),
      true
    );
    assert.equal(
      isHandPinching({ x: 0, y: 0, z: 0 }, { x: 0.06, y: 0.04, z: 0 }),
      false
    );
  });

  it('maps Aura companion puck touchpad & Bluetooth gamepad axes and triggers with deadzone', () => {
    const mockPad = {
      connected: true,
      axes: [0.05, 0, -0.75, 0], // Small noise on axis 0, strong left steer on XR thumbstick axis 2
      buttons: Array.from({ length: 16 }, (_, idx) => ({
        pressed: idx === 5, // RB Nitro
        touched: idx === 5 || idx === 7,
        value: idx === 7 ? 0.9 : idx === 5 ? 1 : 0, // RT Throttle 0.9
      })),
    } as unknown as Gamepad;

    const input = extractGamepadDrivingInput([mockPad], 'puck');
    assert.equal(input.active, true);
    assert.equal(input.source, 'puck');
    assert.ok(input.steer < -0.6, `Expected left steer < -0.6, got ${input.steer}`);
    assert.equal(input.throttle, 0.9);
    assert.equal(input.brake, 0);
    assert.equal(input.nitro, true);
  });
});
