import test from 'node:test';
import assert from 'node:assert/strict';
import { CIRCUITS } from './circuits';
import { buildCircuit3DBuildings, computeBuilding3DExtrusion } from './mapBuildings';

test('buildCircuit3DBuildings generates deterministic non-empty 3D buildings for all 27 circuits', () => {
  assert.ok(CIRCUITS.length >= 27, 'Expected all 27 published circuits');
  for (const circuit of CIRCUITS) {
    const first = buildCircuit3DBuildings(circuit);
    const second = buildCircuit3DBuildings(circuit);
    assert.ok(first.length >= 16, `${circuit.id} should generate realistic city block density`);
    assert.deepEqual(first, second, `${circuit.id} 3D buildings must be deterministic`);

    for (const b of first) {
      assert.equal(b.corners.length, 4);
      assert.ok(b.heightMeters >= 20 && b.heightMeters <= 200);
      assert.ok(Number.isFinite(b.centerLat) && Number.isFinite(b.centerLng));
      assert.ok(b.archetype.length > 0);
      assert.ok(b.bayCount >= 3 && b.bayCount <= 8);
      if (b.setbackScale > 0) {
        assert.ok(b.setbackScale >= 0.5 && b.setbackScale <= 0.8);
        assert.ok(b.setbackHeightRatio > 0 && b.setbackHeightRatio < 0.5);
      }
    }
  }
});

test('computeBuilding3DExtrusion elevates roof above base and scales with building height', () => {
  const base = [
    { x: 100, y: 200 },
    { x: 130, y: 200 },
    { x: 130, y: 220 },
    { x: 100, y: 220 },
  ];
  const lowRise = computeBuilding3DExtrusion(base, 25, 0.45);
  const skyscraper = computeBuilding3DExtrusion(base, 140, 0.45);

  assert.ok(skyscraper.extrudePxY > lowRise.extrudePxY);
  assert.ok(skyscraper.roofScreen[0].y < base[0].y);
  assert.equal(lowRise.sortY, 210);
});
