/**
 * Mobile motion controller: the phone is the whole controller.
 *
 *  - Rotate the phone like a steering wheel  -> steer
 *  - Tilt the top edge AWAY from you          -> accelerate (more tilt = more gas)
 *  - Tilt the top edge TOWARD you             -> brake, then reverse once stopped
 *  - Hold it at your resting angle            -> coast
 *
 * Orientation angles (alpha/beta/gamma) are converted into the gravity direction
 * in screen space. That stays continuous in every grip (upright, laid back, lying
 * down) instead of jumping when gamma wraps at +/-90 degrees.
 * Neutral steering AND neutral pedal angle are captured by recenter(), which the
 * game calls during the 3-2-1 countdown.
 */
export class MotionSteeringController {
  constructor({ onStatusChange } = {}) {
    this.onStatusChange = onStatusChange || (() => {});
    this.enabled = false;
    this.supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    this.hasSensorData = false;

    // Steering
    this.rawSteerDeg = 0; // + = wheel turned right
    this.zeroSteer = 0;
    this.smoothedSteer = 0;
    this.steerValue = 0; // physics convention: +1 = full LEFT, -1 = full RIGHT
    this.deadzoneDeg = 3.0;
    this.maxTiltDeg = 34;

    // Pedal (pitch)
    this.rawPitchDeg = 0; // + = top edge tilted away (screen facing the sky more)
    this.zeroPitch = null;
    this.smoothedPitch = 0;
    this.throttleValue = 0; // 0..1
    this.brakeValue = 0; // 0..1
    this.pedalDeadzoneDeg = 4;
    this.fullGasDeg = 20; // tilt beyond neutral for full throttle
    this.fullBrakeDeg = 16; // tilt toward you for full brake

    this._boundHandler = (e) => this._handleOrientation(e);
  }

  async enable() {
    if (!this.supported) {
      this.onStatusChange('unavailable', 'Motion sensor not available on this device');
      return false;
    }

    // iOS 13+ requires explicit permission requested inside a user gesture
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') {
          this.onStatusChange('denied', 'Motion sensor permission denied');
          return false;
        }
      } catch (err) {
        this.onStatusChange('denied', 'Enable motion sensors in browser settings');
        return false;
      }
    }

    if (!this.enabled) {
      window.addEventListener('deviceorientation', this._boundHandler, true);
      this.enabled = true;
      this.hasSensorData = false;
      this.zeroSteer = 0;
      this.zeroPitch = null;
      this.smoothedSteer = 0;
      this.smoothedPitch = 0;
      this.steerValue = 0;
      this.throttleValue = 0;
      this.brakeValue = 0;
      this.onStatusChange('active', 'Turn to steer • tilt away to accelerate • tilt back to brake');

      setTimeout(() => {
        if (this.enabled && !this.hasSensorData) {
          this.onStatusChange('waiting', 'No gyroscope signal yet — use on mobile or keyboard');
        }
      }, 1800);
    }
    return true;
  }

  disable() {
    if (this.enabled) {
      window.removeEventListener('deviceorientation', this._boundHandler, true);
      this.enabled = false;
      this.steerValue = 0;
      this.throttleValue = 0;
      this.brakeValue = 0;
      this.smoothedSteer = 0;
      this.onStatusChange('off', 'Motion controls off');
    }
  }

  async toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    }
    return await this.enable();
  }

  /** Capture how the player is holding the phone right now as neutral (steer + pedal). */
  recenter() {
    this.zeroSteer = this.rawSteerDeg;
    this.zeroPitch = this.rawPitchDeg;
    this.smoothedSteer = 0;
    this.smoothedPitch = 0;
    this.steerValue = 0;
    this.throttleValue = 0;
    this.brakeValue = 0;
  }

  _getScreenAngle() {
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
      return window.screen.orientation.angle;
    }
    if (typeof window.orientation === 'number') {
      return window.orientation;
    }
    return 0;
  }

  _handleOrientation(e) {
    if (e.beta === null && e.gamma === null) return;
    this.hasSensorData = true;

    const d2r = Math.PI / 180;
    const b = (e.beta || 0) * d2r;
    const g = (e.gamma || 0) * d2r;

    // World "up" expressed in the device frame (x right, y top, z out of screen)
    const ux = -Math.cos(b) * Math.sin(g);
    const uy = Math.sin(b);
    const uz = Math.cos(b) * Math.cos(g);

    // Rotate into the screen frame for the current orientation
    const angle = ((this._getScreenAngle() % 360) + 360) % 360;
    let sx;
    let sy;
    if (angle === 90) {
      sx = -uy;
      sy = ux;
    } else if (angle === 270) {
      sx = uy;
      sy = -ux;
    } else if (angle === 180) {
      sx = -ux;
      sy = -uy;
    } else {
      sx = ux;
      sy = uy;
    }

    const inPlane = Math.hypot(sx, sy);
    // Steering: rotation of "up" inside the screen plane (+ = wheel turned right)
    const steerDeg = inPlane > 0.12 ? Math.atan2(-sx, sy) / d2r : this.rawSteerDeg;
    // Pedal: how far the screen faces the sky (+ = top edge tilted away from you)
    const pitchDeg = Math.atan2(uz, inPlane) / d2r;

    this.rawSteerDeg = Math.max(-80, Math.min(80, steerDeg));
    this.rawPitchDeg = pitchDeg;
    if (this.zeroPitch === null) this.zeroPitch = pitchDeg;

    // --- Steering ---
    const relSteer = this.rawSteerDeg - this.zeroSteer;
    this.smoothedSteer = this.smoothedSteer * 0.7 + relSteer * 0.3;
    const absS = Math.abs(this.smoothedSteer);
    if (absS <= this.deadzoneDeg) {
      this.steerValue = 0;
    } else {
      const n = Math.min(1, (absS - this.deadzoneDeg) / (this.maxTiltDeg - this.deadzoneDeg));
      const curved = Math.pow(n, 1.25);
      this.steerValue = this.smoothedSteer > 0 ? -curved : curved;
    }

    // --- Pedal ---
    const relPitch = this.rawPitchDeg - this.zeroPitch;
    this.smoothedPitch = this.smoothedPitch * 0.75 + relPitch * 0.25;
    const p = this.smoothedPitch;
    if (p > this.pedalDeadzoneDeg) {
      const n = Math.min(1, (p - this.pedalDeadzoneDeg) / (this.fullGasDeg - this.pedalDeadzoneDeg));
      this.throttleValue = Math.pow(n, 0.85);
      this.brakeValue = 0;
    } else if (p < -this.pedalDeadzoneDeg) {
      const n = Math.min(1, (-p - this.pedalDeadzoneDeg) / (this.fullBrakeDeg - this.pedalDeadzoneDeg));
      this.brakeValue = n;
      this.throttleValue = 0;
    } else {
      this.throttleValue = 0;
      this.brakeValue = 0;
    }
  }

  /** Visual wheel angle in degrees for the HUD steering wheel icon. */
  getVisualWheelDeg() {
    return -this.steerValue * 58;
  }

  /** -1 (full brake) .. +1 (full gas) for the HUD pedal bar. */
  getPedalValue() {
    return this.throttleValue - this.brakeValue;
  }
}
