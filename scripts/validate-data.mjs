import assert from 'node:assert/strict';
import fs from 'node:fs';

const communities = JSON.parse(fs.readFileSync(new URL('../public/data/communities.geojson', import.meta.url)));
const basemap = JSON.parse(fs.readFileSync(new URL('../public/data/basemap.geojson', import.meta.url)));
const metadata = JSON.parse(fs.readFileSync(new URL('../public/data/metadata.json', import.meta.url)));
assert.equal(communities.type, 'FeatureCollection');
assert.ok(communities.features.length > 300, 'Expected the full Edmonton neighbourhood boundary inventory');
assert.equal(new Set(communities.features.map(f => String(f.properties.code))).size, communities.features.length);
assert.equal(metadata.cityName, 'Edmonton');
assert.ok(Number.isInteger(metadata.incomeYear) && Number.isInteger(metadata.populationYear));
assert.ok(metadata.cityIncomeMedian > 0);
assert.ok(Array.isArray(metadata.sources) && metadata.sources.length > 0);

let incomeCount = 0;
let chineseCount = 0;
for (const feature of communities.features) {
  const p = feature.properties;
  assert.ok(p.name && p.code !== undefined && p.note, 'Every neighbourhood needs an identity and reference note');
  assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
  assert.ok(Array.isArray(p.centroid) && p.centroid[0] > -115 && p.centroid[0] < -112 && p.centroid[1] > 52 && p.centroid[1] < 55);
  if (p.income !== null) {
    assert.ok(Number.isFinite(p.income) && p.income > 0 && p.sourceUrl);
    incomeCount += 1;
  }
  if (p.chineseCount !== null) {
    assert.ok(Number.isInteger(p.chineseCount) && p.chineseCount >= 0 && p.sourceUrl);
    assert.ok(Number.isFinite(p.chinesePct) && p.chinesePct >= 0 && p.chinesePct <= 1);
    chineseCount += 1;
  }
  assert.ok(p.children === null || (Number.isFinite(p.children) && p.children >= 0 && p.children <= 1));
}
assert.ok(incomeCount > 200, 'Expected broad official income coverage');
assert.ok(chineseCount > 200, 'Expected broad official Chinese population coverage');
assert.equal(basemap.type, 'FeatureCollection');
assert.ok(basemap.features.some(f => f.properties.kind === 'water'), 'River reference geometry must be present');
assert.ok(basemap.features.some(f => f.properties.kind === 'road'), 'Major road reference geometry must be present');
console.log(`PASS: ${communities.features.length} unique neighbourhoods; ${incomeCount} income and ${chineseCount} Chinese values; metadata and basemap valid.`);
