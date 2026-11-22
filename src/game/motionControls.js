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
    this.maxTiltDeg = 30;

    // Pedal (pitch)
    this.rawPitchDeg = 0; // + = top edge tilted away (screen facing the sky more)
    this.zeroPitch = null;
    this.smoothedPitch = 0;
    this.throttleValue = 0; // 0..1
    this.brakeValue = 0; // 0..1
    this.pedalDeadzoneDeg = 3;
    this.fullGasDeg = 15; // tilt beyond neutral for full throttle
    this.fullBrakeDeg = 14; // tilt toward you for full brake

    this.source = 'none'; // 'orientation' | 'motion' (accelerometer-only phones)
    this.frameAngle = null; // screen orientation locked from gravity (robust to iOS angle quirks)
    this.lastUp = null;
    this.sampleCount = 0;
    this._boundReframe = () => {
      this.frameAngle = null;
    };
    this._boundHandler = (e) => this._handleOrientation(e);
    this._boundMotion = (e) => this._handleMotion(e);
  }

  async enable() {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      // Phones only give motion sensors to https:// pages
      this.onStatusChange('insecure', 'Tilt needs a secure page: open the game with an https:// address');
      return false;
    }
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
      // Accelerometer-only phones (no gyroscope) never send orientation: fall back to gravity
      if ('DeviceMotionEvent' in window) window.addEventListener('devicemotion', this._boundMotion, true);
      window.addEventListener('orientationchange', this._boundReframe);
      this.frameAngle = null;
      this.source = 'none';
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
          this.onStatusChange('waiting', 'No motion sensor signal — check the browser allows Motion sensors for this site');
        }
      }, 2000);
    }
    return true;
  }

  disable() {
    if (this.enabled) {
      window.removeEventListener('deviceorientation', this._boundHandler, true);
      window.removeEventListener('devicemotion', this._boundMotion, true);
      window.removeEventListener('orientationchange', this._boundReframe);
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
    // Re-detect which way the phone is held, then take this grip as neutral
    if (this.lastUp) {
      this.frameAngle = this._detectFrameAngle(this.lastUp[0], this.lastUp[1]);
      this._computeRaw();
    }
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
    if (e.beta === null || e.gamma === null || e.beta === undefined) return;
    this.source = 'orientation';
    const d2r = Math.PI / 180;
    const b = e.beta * d2r;
    const g = e.gamma * d2r;
    // World "up" expressed in the device frame (x right, y top, z out of screen)
    this._applyUp(-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g));
  }

  _handleMotion(e) {
    if (this.source === 'orientation') return; // gyroscope-fused data is better when available
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    const len = Math.hypot(a.x, a.y, a.z);
    if (len < 4) return; // free fall / bogus sample
    this.source = 'motion';
    // At rest the reading points away from the ground (face-up phone reads +z), i.e. it is "up"
    this._applyUp(a.x / len, a.y / len, a.z / len);
  }

  /**
   * Which device edge is "screen up", worked out from gravity (like the OS does), so a
   * browser that reports screen.orientation differently (older iOS) can't flip the controls.
   */
  _detectFrameAngle(ux, uy) {
    const browser = ((this._getScreenAngle() % 360) + 360) % 360;
    if (Math.hypot(ux, uy) < 0.35) return browser; // phone nearly flat: trust the browser
    if (Math.abs(ux) > Math.abs(uy)) return ux > 0 ? 90 : 270;
    return uy > 0 ? 0 : 180;
  }

  getDiagnostics() {
    return {
      source: this.source,
      samples: this.sampleCount,
      pitch: this.smoothedPitch,
      frameAngle: this.frameAngle,
      browserAngle: ((this._getScreenAngle() % 360) + 360) % 360,
    };
  }

  _applyUp(ux, uy, uz) {
    this.hasSensorData = true;
    this.sampleCount++;
    this.lastUp = [ux, uy, uz];
    if (this.frameAngle === null) this.frameAngle = this._detectFrameAngle(ux, uy);
    this._computeRaw();
    this._updateOutputs();
  }

  _computeRaw() {
    const [ux, uy, uz] = this.lastUp;
    const d2r = Math.PI / 180;

    // Rotate into the screen frame for the locked orientation
    const angle = this.frameAngle;
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

    // Steering from the sideways component of gravity (+ = turned right). Works for a
    // wheel grip and for tilting a phone held flat, and never jumps to full lock.
    const steerDeg = Math.asin(Math.max(-1, Math.min(1, -sx))) / d2r;
    // Pedal: rotation about the screen's horizontal axis (+ = top edge tilted away from you).
    // Uses only the screen-vertical component so steering tilts don't leak into gas/brake.
    const pitchDeg = Math.atan2(uz, sy) / d2r;

    this.rawSteerDeg = Math.max(-80, Math.min(80, steerDeg));
    this.rawPitchDeg = pitchDeg;
    if (this.zeroPitch === null) this.zeroPitch = pitchDeg;
  }

  _updateOutputs() {
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
