// Generates supabase/functions/submit-race/tracks.json: exact lap length of every circuit,
// built the same way as RaceTrack (closed Catmull-Rom, tension 0.45). Run: npm run gen:tracks
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { CITIES, getCityWaypointVectors } from '../src/game/cities.js';
import { CAR_CATALOG } from '../src/game/cars.js';

const tracks = {};
for (const city of CITIES) {
  const curve = new THREE.CatmullRomCurve3(getCityWaypointVectors(city), true, 'catmullrom', 0.45);
  tracks[city.id] = { lapLength: Math.round(curve.getLength() * 100) / 100 };
}
const out = {
  tracks,
  cars: CAR_CATALOG.map((c) => c.name),
  // Physics clamps speed to maxSpeed * 1.44 (nitro / boost pads included)
  vmax: Math.max(...CAR_CATALOG.map((c) => c.maxSpeed)) * 1.44,
};
writeFileSync(new URL('../supabase/functions/submit-race/tracks.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${Object.keys(tracks).length} tracks, vmax ${out.vmax.toFixed(1)}`);
