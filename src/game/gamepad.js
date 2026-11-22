/**
 * Gamepad + racing-wheel input via the Gamepad API.
 *
 * Standard-mapping pads (Xbox, PlayStation, Switch Pro, most Bluetooth pads):
 *   left stick = steer · RT = throttle · LT = brake (both analog) · A/✕ = drift
 *   B/○ or X/□ = nitro · Y/△ = camera · Start = start / race again · Back/Select = reset
 *
 * Wheels (non-standard mapping): axis 0 steers; pedal axes are found from their resting
 * value (released pedals rest at ±1), so G29/G920/T300-style wheels work without setup.
 */
const DEADZONE = 0.08;

const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));

export class GamepadInput {
  constructor() {
    this.index = null;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.drift = false;
    this.boost = false;
    this.active = false; // true while the pad is being used, so it can own the analog inputs
    this.isWheel = false;
    this.name = '';
    this.onPress = null; // (action) => void for 'camera' | 'start' | 'reset'
    this._prev = [];
    this._rest = null;
    this._idleFrames = 0;
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', (e) => this._attach(e.gamepad));
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.index) this._detach();
    });
  }

  get connected() {
    return this.index !== null;
  }

  _attach(gp) {
    if (this.index !== null) return;
    this.index = gp.index;
    this.name = gp.id || 'Gamepad';
    this.isWheel = gp.mapping !== 'standard' && /wheel|g29|g920|g923|t300|t150|thrustmaster|fanatec|racing/i.test(gp.id);
    this._rest = gp.axes.slice();
    this._prev = gp.buttons.map((b) => b.pressed);
  }

  _detach() {
    this.index = null;
    this.active = false;
    this.steer = this.throttle = this.brake = 0;
    this.drift = this.boost = false;
  }

  _pad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.index === null) {
      // Some browsers only expose pads after a button press, without a connect event
      for (const p of pads) if (p && p.connected) this._attach(p);
    }
    return this.index !== null ? pads[this.index] : null;
  }

  /** Reads the pad once per frame. */
  poll() {
    const gp = this._pad();
    if (!gp) {
      if (this.index !== null) this._detach();
      return this;
    }
    const b = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    const pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);

    if (gp.mapping === 'standard' && !this.isWheel) {
      this.steer = -dz(gp.axes[0] || 0); // physics: + is left
      this.throttle = b(7);
      this.brake = b(6);
      this.drift = pressed(0) || pressed(5);
      this.boost = pressed(1) || pressed(2) || pressed(4);
      this._edge(gp, 3, 'camera');
      this._edge(gp, 9, 'start');
      this._edge(gp, 8, 'reset');
    } else {
      this.steer = -dz(gp.axes[0] || 0);
      const pedals = [];
      for (let i = 1; i < gp.axes.length; i++) {
        const rest = this._rest[i];
        if (Math.abs(rest) > 0.9) pedals.push(Math.min(1, Math.max(0, Math.abs(gp.axes[i] - rest) / 2)));
      }
      this.throttle = pedals[0] || 0;
      this.brake = pedals[1] || 0;
      this.drift = pressed(0) || pressed(5);
      this.boost = pressed(1) || pressed(4);
      this._edge(gp, 3, 'camera');
      this._edge(gp, 9, 'start');
      this._edge(gp, 8, 'reset');
    }
    for (let i = 0; i < gp.buttons.length; i++) this._prev[i] = gp.buttons[i].pressed;

    const busy =
      Math.abs(this.steer) > 0.02 || this.throttle > 0.02 || this.brake > 0.02 || this.drift || this.boost;
    if (busy) {
      this.active = true;
      this._idleFrames = 0;
    } else if (this.active && ++this._idleFrames > 240) {
      this.active = false; // hand control back to touch/tilt after ~4 s idle
    }
    return this;
  }

  _edge(gp, i, action) {
    const now = !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (now && !this._prev[i] && this.onPress) this.onPress(action);
  }

  /** Force feedback / rumble, where the pad supports it. */
  rumble(strength = 0.6, ms = 120) {
    const gp = this._pad();
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return false;
    act
      .playEffect('dual-rumble', {
        duration: ms,
        strongMagnitude: Math.min(1, strength),
        weakMagnitude: Math.min(1, strength * 0.6),
      })
      .catch(() => {});
    return true;
  }
}
