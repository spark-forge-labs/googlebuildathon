/**
 * Mobile Motion Sensor Steering Wheel Controller.
 * Turns any smartphone/tablet into a real-time steering wheel using DeviceOrientationEvent.
 * Handles iOS 13+ permission prompts, portrait/landscape orientation mapping,
 * neutral calibration, deadzone, smoothing, and progressive steering curves.
 */
export class MotionSteeringController {
  constructor({ onStatusChange } = {}) {
    this.onStatusChange = onStatusChange || (() => {});
    this.enabled = false;
    this.supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    this.hasSensorData = false;

    this.rawTilt = 0; // degrees, negative = left, positive = right
    this.zeroOffset = 0; // calibrated neutral angle
    this.smoothedTilt = 0;
    this.steerValue = 0; // -1 (full right) to +1 (full left) matching game physics steerInput!

    this.deadzoneDeg = 3.5;
    this.maxTiltDeg = 32; // full lock at 32 degrees of wheel turn
    this.autoGas = true; // when enabled on mobile, accelerates smoothly unless braking

    this._boundHandler = (e) => this._handleOrientation(e);
  }

  async enable() {
    if (!this.supported) {
      this.onStatusChange('unavailable', 'Motion sensor not available on this device');
      return false;
    }

    // iOS 13+ requires explicit permission requested synchronously in a user gesture
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
      this.zeroOffset = 0;
      this.smoothedTilt = 0;
      this.steerValue = 0;
      this.onStatusChange('active', 'Tilt phone like a steering wheel!');

      // Detect desktop browsers that expose DeviceOrientationEvent without actual gyroscope hardware
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
      this.smoothedTilt = 0;
      this.onStatusChange('off', 'Motion steering off');
    }
  }

  async toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    }
    return await this.enable();
  }

  recenter() {
    this.zeroOffset = this.rawTilt;
    this.smoothedTilt = 0;
    this.steerValue = 0;
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

    const angle = this._getScreenAngle();
    let tiltDeg = 0;

    // Map holding the phone like a steering wheel across all 4 screen orientations:
    // Positive tiltDeg = turning wheel RIGHT, Negative tiltDeg = turning wheel LEFT
    if (angle === 90) {
      // Landscape-left (home/charge edge on right): turning wheel right increases beta
      tiltDeg = e.beta || 0;
    } else if (angle === -90 || angle === 270) {
      // Landscape-right: turning wheel right decreases beta
      tiltDeg = -(e.beta || 0);
    } else if (angle === 180) {
      // Upside-down portrait
      tiltDeg = -(e.gamma || 0);
    } else {
      // Portrait (0 deg): tilting right increases gamma
      tiltDeg = e.gamma || 0;
    }

    // Clamp extreme flips
    tiltDeg = Math.max(-75, Math.min(75, tiltDeg));
    this.rawTilt = tiltDeg;

    const relative = tiltDeg - this.zeroOffset;

    // Smooth low-pass filter to eliminate hand jitter while staying crisp
    this.smoothedTilt = this.smoothedTilt * 0.72 + relative * 0.28;

    const absT = Math.abs(this.smoothedTilt);
    if (absT <= this.deadzoneDeg) {
      this.steerValue = 0;
    } else {
      const normalized = Math.min(1, (absT - this.deadzoneDeg) / (this.maxTiltDeg - this.deadzoneDeg));
      // Gentle progressive curve (x^1.22) for rock-steady highway straights + sharp hairpin lock
      const curved = Math.pow(normalized, 1.22);
      // Physics convention: +1 = steer LEFT, -1 = steer RIGHT
      this.steerValue = this.smoothedTilt > 0 ? -curved : curved;
    }
  }

  /**
   * Returns visual wheel angle in degrees (-55 to +55) for the HUD steering wheel icon.
   */
  getVisualWheelDeg() {
    return -this.steerValue * 58;
  }
}
