// Supabase Edge Function: validate a finished race and store it on the BeyondGravity leaderboard.
// Deploy:  supabase functions deploy submit-race   (verify_jwt is off in supabase/config.toml so the
// public anon / publishable key works; the function itself writes with the service role).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateRun } from './validate.js';
import data from './tracks.json' with { type: 'json' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_BODY = 120_000; // bytes (~3 min of 10 Hz telemetry)
const RATE_LIMIT = 6; // submissions per IP per minute

async function hashIp(ip: string) {
  const salt = Deno.env.get('RATE_LIMIT_SALT') ?? 'india-gp';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'POST only' }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, reason: 'submission too large' }, 413);
  let run: unknown;
  try {
    run = JSON.parse(raw);
  } catch {
    return json({ ok: false, reason: 'invalid JSON' }, 400);
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Rate limit by hashed client IP
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  const ipHash = await hashIp(ip);
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db
    .from('race_submit_log')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if ((count ?? 0) >= RATE_LIMIT) return json({ ok: false, reason: 'too many submissions, try again in a minute' }, 429);

  // Housekeeping: drop rate-limit rows older than a day now and then
  if (Math.random() < 0.02) {
    await db.from('race_submit_log').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
  }

  const result = validateRun(run, data);
  await db.from('race_submit_log').insert({ ip_hash: ipHash, accepted: result.ok, reason: result.ok ? null : result.reason });
  if (!result.ok) return json({ ok: false, reason: result.reason }, 422);

  const { data: inserted, error } = await db.from('race_leaderboard').insert(result.row).select('id').single();
  if (error) return json({ ok: false, reason: 'database error' }, 500);

  // The top-10 trigger may already have removed a slower run; only keep replays for runs on the board
  const { data: still } = await db.from('race_leaderboard').select('id').eq('id', inserted.id).maybeSingle();
  let rank: number | null = null;
  if (still) {
    await db.from('race_replays').insert({
      leaderboard_id: inserted.id,
      city: result.row.city,
      player_name: result.row.player_name,
      car: result.row.car,
      total_ms: result.row.total_ms,
      checkpoints: result.replay.checkpoints,
      samples: result.replay.samples,
    });
    const { count: faster } = await db
      .from('race_leaderboard')
      .select('id', { count: 'exact', head: true })
      .eq('city', result.row.city)
      .lt('total_ms', result.row.total_ms);
    rank = (faster ?? 0) + 1;
  }
  return json({ ok: true, rank, bestLapMs: result.row.best_lap_ms });
});
