import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const integrity = read('geography-integrity.json');
const loaded = {};
const lineIds = ['capital', 'metro', 'valley'];

function position(point, label) {
  assert.ok(Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite), `${label}: invalid coordinate`);
  assert.ok(point[0] > -116 && point[0] < -111 && point[1] > 52 && point[1] < 55, `${label}: outside Edmonton regional context or wrong CRS`);
}
function line(points, label) {
  assert.ok(points.length >= 2, `${label}: too few line coordinates`);
  points.forEach(point => position(point, label));
}
function polygon(rings, label) {
  assert.ok(rings.length > 0);
  for (const ring of rings) {
    assert.ok(ring.length >= 4, `${label}: too few ring coordinates`);
    line(ring, label);
    assert.deepEqual(ring[0], ring.at(-1), `${label}: unclosed polygon`);
  }
}
function validateFeature(feature, path) {
  const p = feature.properties;
  assert.ok(p.id && p.name && p.kind && p.sourceUrl, `${path}: missing identity or provenance`);
  assert.equal(new URL(p.sourceUrl).protocol, 'https:');
  const { type, coordinates: c } = feature.geometry;
  const label = `${path}/${p.id}`;
  if (type === 'Point') position(c, label);
  else if (type === 'LineString') line(c, label);
  else if (type === 'MultiLineString') { assert.ok(c.length); c.forEach(points => line(points, label)); }
  else if (type === 'Polygon') polygon(c, label);
  else if (type === 'MultiPolygon') { assert.ok(c.length); c.forEach(rings => polygon(rings, label)); }
  else assert.fail(`${label}: unsupported geometry ${type}`);
  if (p.labelPoint) position(p.labelPoint, label);
}

for (const [path, expected] of Object.entries(integrity.files)) {
  const bytes = fs.readFileSync(new URL(path, root));
  assert.equal(bytes.length, expected.bytes, `${path}: audited snapshot size changed`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, `${path}: audited snapshot changed`);
  const data = JSON.parse(bytes);
  assert.equal(data.type, 'FeatureCollection');
  assert.ok(data.features.length > 0, `${path}: empty layer`);
  assert.equal(new Set(data.features.map(f => f.properties.id)).size, data.features.length, `${path}: duplicate IDs`);
  data.features.forEach(feature => validateFeature(feature, path));
  loaded[path.split('/').at(-1)] = data.features;
}

const operating = loaded['lrt-operating.geojson'];
const stations = operating.filter(f => f.properties.kind === 'transit_station');
assert.deepEqual(new Set(operating.filter(f => f.properties.kind === 'transit_route').map(f => f.properties.lineId)), new Set(lineIds));
for (const f of operating) {
  assert.equal(f.properties.status, 'operating');
  if (f.properties.kind === 'transit_station') {
    assert.equal(f.geometry.type, 'Point');
    assert.ok(f.properties.lineIds.length > 0 && f.properties.lineIds.every(id => lineIds.includes(id)));
  }
}
assert.equal(stations.length, integrity.expected.operatingStations);
const planned = loaded['lrt-planned.geojson'];
for (const f of planned) {
  assert.ok(['construction', 'planned'].includes(f.properties.status), 'Future LRT must never appear operational');
  assert.ok(f.properties.kind === 'transit_station'
    ? f.properties.lineIds.length > 0 && f.properties.lineIds.every(id => lineIds.includes(id))
    : f.properties.kind === 'transit_route' && lineIds.includes(f.properties.lineId));
}
assert.equal(planned.filter(f => f.properties.kind === 'transit_station').length, integrity.expected.plannedStations);
const context = loaded['geographic-context.geojson'];
for (const kind of ['railway', 'airport', 'park', 'reserve']) assert.ok(context.some(f => f.properties.kind === kind), `${kind} context missing`);
assert.ok(context.some(f => f.properties.kind === 'reserve' && /Enoch/i.test(f.properties.name)), 'Enoch Cree Nation context missing');
console.log(`PASS: audited Edmonton geography; ${stations.length} operating and ${integrity.expected.plannedStations} non-operating LRT stations; source links, coordinates and snapshots valid.`);
