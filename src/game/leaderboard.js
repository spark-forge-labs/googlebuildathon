/**
 * Top-10 leaderboard per city, stored in the BeyondGravity Supabase project
 * (table public.race_leaderboard — see supabase/leaderboard.sql).
 *
 * Configure with Vite env vars (e.g. in Vercel → Settings → Environment Variables, or .env.local):
 *   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<public anon key>
 * Without them (or when offline) scores are kept on this device instead.
 */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const TABLE = 'race_leaderboard';

export const leaderboardOnline = Boolean(SUPABASE_URL && SUPABASE_KEY);

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

function localKey(city) {
  return `hydrace-lb-${city}`;
}

function readLocal(city) {
  try {
    return JSON.parse(localStorage.getItem(localKey(city)) || '[]');
  } catch (e) {
    return [];
  }
}

function writeLocal(city, rows) {
  try {
    localStorage.setItem(localKey(city), JSON.stringify(rows));
  } catch (e) {
    /* storage unavailable */
  }
}

function saveLocal(entry) {
  const rows = readLocal(entry.city);
  rows.push({ ...entry, created_at: new Date().toISOString() });
  rows.sort((a, b) => a.total_ms - b.total_ms || a.created_at.localeCompare(b.created_at));
  writeLocal(entry.city, rows.slice(0, 10));
}

export function sanitizeName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
}

/** Returns { rows, source: 'online' | 'device' }. */
export async function fetchTop10(city) {
  if (leaderboardOnline) {
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/${TABLE}?select=player_name,total_ms,best_lap_ms,car,finish_position,created_at` +
        `&city=eq.${encodeURIComponent(city)}&order=total_ms.asc,created_at.asc&limit=10`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { rows: await res.json(), source: 'online' };
    } catch (e) {
      console.warn('Leaderboard fetch failed, showing this device', e);
    }
  }
  return { rows: readLocal(city), source: 'device' };
}

/** Saves a finished race. Always keeps a copy on the device; returns where it was stored. */
export async function submitScore({ name, city, totalMs, bestLapMs, car, position }) {
  const entry = {
    player_name: sanitizeName(name) || 'Player',
    city,
    total_ms: Math.round(totalMs),
    best_lap_ms: Number.isFinite(bestLapMs) ? Math.round(bestLapMs) : null,
    car: car ? String(car).slice(0, 40) : null,
    finish_position: position,
  };
  saveLocal(entry);
  if (!leaderboardOnline) return 'device';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'return=minimal' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return 'online';
  } catch (e) {
    console.warn('Leaderboard submit failed, kept on this device', e);
    return 'device';
  }
}

export function formatMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const escapeHtml = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Renders up to 10 rows; `you` = { name, totalMs } highlights the player's own entry. */
export function renderLeaderboard(container, rows, you = null) {
  if (!rows.length) {
    container.innerHTML = '<div class="lb-empty">No times yet. Be the first on this circuit!</div>';
    return false;
  }
  let found = false;
  container.innerHTML = rows
    .map((r, i) => {
      const mine = you && !found && r.player_name === you.name && Math.abs(r.total_ms - you.totalMs) < 2;
      if (mine) found = true;
      const car = r.car ? `<small>${escapeHtml(r.car)}</small>` : '';
      return `<div class="lb-row ${mine ? 'is-you' : ''}"><span class="rank">${i + 1}</span><span class="who">${escapeHtml(r.player_name)}${car}</span><span class="time">${formatMs(r.total_ms)}</span></div>`;
    })
    .join('');
  return found;
}
