/**
 * Player settings (assists, accessibility, controls), saved on the device.
 */
export const ACTIONS = [
  { id: 'up', label: 'Accelerate' },
  { id: 'down', label: 'Brake / Reverse' },
  { id: 'left', label: 'Steer left' },
  { id: 'right', label: 'Steer right' },
  { id: 'drift', label: 'Drift' },
  { id: 'boost', label: 'Nitro' },
];

const DEFAULT_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight', 'KeyN'],
};

const DEFAULTS = {
  autoAccelerate: false,
  steerAssist: 0, // 0 off, 0.35 light, 0.7 strong
  reducedShake: false,
  colorblind: false,
  uiScale: 1,
  ghost: true,
  haptics: true,
  arcadeRules: false, // false = strict race rules (crash / track limits / wrong way = DSQ)
  keys: DEFAULT_KEYS,
};

const STORAGE_KEY = 'hydrace-settings';

/** Keys with fixed meanings (camera, sound, music, reset, start, menus) that can't be rebound. */
export const RESERVED_KEYS = new Set(['KeyC', 'KeyM', 'KeyB', 'KeyR', 'Enter', 'NumpadEnter', 'Escape', 'Tab']);

export class Settings {
  constructor() {
    this.values = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      Object.assign(this.values, saved);
      this.values.keys = { ...DEFAULT_KEYS, ...(saved.keys || {}) };
    } catch (e) {
      /* storage unavailable or corrupt: defaults */
    }
    this.listeners = [];
  }

  get(k) {
    return this.values[k];
  }

  set(k, v) {
    this.values[k] = v;
    this.save();
    this.listeners.forEach((fn) => fn(k, v));
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch (e) {
      /* storage unavailable */
    }
  }

  /** Action bound to a keyboard code, or null. */
  actionForKey(code) {
    for (const a of ACTIONS) if ((this.values.keys[a.id] || []).includes(code)) return a.id;
    return null;
  }

  /** Rebind: the new key becomes the action's primary key and is removed from every other action. */
  bindKey(action, code) {
    if (RESERVED_KEYS.has(code)) return false;
    const keys = { ...this.values.keys };
    for (const a of Object.keys(keys)) keys[a] = keys[a].filter((c) => c !== code);
    keys[action] = [code, ...keys[action].filter((c) => c !== code)].slice(0, 2);
    this.set('keys', keys);
    return true;
  }

  resetKeys() {
    this.set('keys', JSON.parse(JSON.stringify(DEFAULT_KEYS)));
  }
}

export function keyLabel(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Arrow', '')
    .replace('ShiftLeft', 'L-Shift')
    .replace('ShiftRight', 'R-Shift')
    .replace('ControlLeft', 'L-Ctrl')
    .replace('ControlRight', 'R-Ctrl')
    .replace('Space', 'Space');
}
