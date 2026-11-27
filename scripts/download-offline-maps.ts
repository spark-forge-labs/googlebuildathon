import fs from 'node:fs';
import path from 'node:path';
import { CIRCUITS } from '../src/game/circuits.ts';

const OUT_DIR = path.resolve(process.cwd(), 'public/offline-maps');
const SAT_DIR = path.join(OUT_DIR, 'sat');
const LABELS_DIR = path.join(OUT_DIR, 'labels');

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

interface TileTask {
  layer: 'sat' | 'labels';
  z: number;
  x: number;
  y: number;
  url: string;
  dest: string;
}

function collectTileTasks(): { tasks: TileTask[]; satKeys: string[]; labelKeys: string[] } {
  const satSet = new Set<string>();
  const labelSet = new Set<string>();

  for (const circuit of CIRCUITS) {
    // Zoom 14: wide metro context (3x3 around center) so circuit overview never has blank edges
    const c14 = latLngToTile(circuit.center.lat, circuit.center.lng, 14);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `14/${c14.x + dx}/${c14.y + dy}`;
        satSet.add(key);
        labelSet.add(key);
      }
    }

    // Zoom 15: full circuit bounding box + 1-tile margin
    let minX15 = Infinity;
    let maxX15 = -Infinity;
    let minY15 = Infinity;
    let maxY15 = -Infinity;
    for (const wp of circuit.waypoints) {
      const t = latLngToTile(wp.lat, wp.lng, 15);
      minX15 = Math.min(minX15, t.x);
      maxX15 = Math.max(maxX15, t.x);
      minY15 = Math.min(minY15, t.y);
      maxY15 = Math.max(maxY15, t.y);
    }
    for (let x = minX15 - 1; x <= maxX15 + 1; x++) {
      for (let y = minY15 - 1; y <= maxY15 + 1; y++) {
        const key = `15/${x}/${y}`;
        satSet.add(key);
        labelSet.add(key);
      }
    }

    // Zoom 16: high-detail street corridor around each waypoint (+1 neighbor for follow camera)
    for (const wp of circuit.waypoints) {
      const t = latLngToTile(wp.lat, wp.lng, 16);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `16/${t.x + dx}/${t.y + dy}`;
          satSet.add(key);
        }
      }
    }
  }

  const tasks: TileTask[] = [];
  for (const key of satSet) {
    const [z, x, y] = key.split('/').map(Number);
    tasks.push({
      layer: 'sat',
      z,
      x,
      y,
      url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      dest: path.join(SAT_DIR, String(z), String(x), `${y}.jpg`),
    });
  }
  for (const key of labelSet) {
    const [z, x, y] = key.split('/').map(Number);
    tasks.push({
      layer: 'labels',
      z,
      x,
      y,
      url: `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
      dest: path.join(LABELS_DIR, String(z), String(x), `${y}.png`),
    });
  }

  return {
    tasks,
    satKeys: Array.from(satSet).sort(),
    labelKeys: Array.from(labelSet).sort(),
  };
}

async function downloadWithRetry(task: TileTask, retries = 2): Promise<boolean> {
  if (fs.existsSync(task.dest) && fs.statSync(task.dest).size > 100) {
    return true;
  }
  fs.mkdirSync(path.dirname(task.dest), { recursive: true });
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(task.url, {
        headers: { 'User-Agent': 'StreetViewGP-OfflineMapDownloader/1.0' },
      });
      if (!res.ok) {
        if (attempt === retries) return false;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) return false;
      fs.writeFileSync(task.dest, buf);
      return true;
    } catch {
      if (attempt === retries) return false;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return false;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { tasks } = collectTileTasks();
  console.log(`Downloading ${tasks.length} offline map tiles across ${CIRCUITS.length} circuits...`);

  const CONCURRENCY = 24;
  let cursor = 0;
  let okCount = 0;
  let failCount = 0;
  const availableSat: string[] = [];
  const availableLabels: string[] = [];

  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      const task = tasks[idx];
      const ok = await downloadWithRetry(task);
      if (ok) {
        okCount++;
        const key = `${task.z}/${task.x}/${task.y}`;
        if (task.layer === 'sat') availableSat.push(key);
        else availableLabels.push(key);
      } else {
        failCount++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    circuitsCount: CIRCUITS.length,
    sat: availableSat.sort(),
    labels: availableLabels.sort(),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest));
  console.log(
    `Offline map archive ready: ${okCount} downloaded (${availableSat.length} sat, ${availableLabels.length} labels), ${failCount} failed.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
