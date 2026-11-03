import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const hash = path => createHash('sha256').update(fs.readFileSync(new URL(path, root))).digest('hex');
const data = read('public/data/population-groups.json');
const audit = read('data/audit/population.json');
const original = read('public/data/communities.geojson').features.map(feature => feature.properties);
const byCode = new Map(original.map(row => [String(row.code), row]));
const metadata = read('public/data/metadata.json');
const ids = ['south_asian', 'chinese', 'black', 'filipino', 'arab', 'latin_american', 'southeast_asian', 'west_asian', 'korean', 'japanese', 'visible_minority_nie', 'multiple_visible_minorities', 'not_visible_minority'];
assert.equal(data.schemaVersion, 1);
assert.equal(data.censusYear, 2021);
assert.equal(data.variable, 'visible_minority');
assert.equal(data.percentageBasis, 'derived_from_published_counts');
assert.equal(data.denominatorLabel, '私人住户人口');
assert.deepEqual(data.groups.map(group => group.id), ids);
assert.ok(data.groups.every(group => group.name && group.label));
assert.ok(!/白人|欧洲|white|european/i.test(data.groups.find(group => group.id === 'not_visible_minority').label));
assert.deepEqual(data.defaultGroupIds, ['south_asian', 'black', 'filipino', 'chinese', 'arab']);
assert.deepEqual(data.defaultGroupIds, Object.entries(data.city.counts).filter(([id]) => id !== 'not_visible_minority').sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id));

function validateRecord(record, label) {
  assert.ok(Number.isInteger(record.population) && record.population > 0, `${label}: denominator must be published and positive`);
  assert.deepEqual(Object.keys(record.counts), ids, `${label}: classification differs`);
  assert.deepEqual(Object.keys(record.publishedPct), ids, `${label}: percentage schema differs`);
  assert.equal(record.sourceUrl, 'https://data.edmonton.ca/d/9325-erna');
  for (const id of ids) {
    const count = record.counts[id];
    assert.ok(Number.isInteger(count) && count >= 0 && count % 5 === 0 && count <= record.population, `${label}/${id}: invalid published count`);
    assert.equal(record.publishedPct[id], count / record.population, `${label}/${id}: wrong percentage denominator`);
  }
}
validateRecord(data.city, 'Edmonton');
assert.equal(data.city.population, 996485);
assert.equal(data.city.population, metadata.cityChinesePopulationBase);
assert.equal(data.city.counts.chinese, 59740);
assert.equal(data.city.counts.chinese, metadata.cityChineseCount);
assert.equal(data.city.publishedPct.chinese, metadata.cityChinesePct);
assert.equal(Object.keys(data.communities).length, 278);
let chineseZeros = 0;
for (const [code, record] of Object.entries(data.communities)) {
  const p = byCode.get(code);
  assert.ok(p, `${code}: no official polygon`);
  validateRecord(record, code);
  assert.equal(record.population, p.chinesePopulationBase, `${code}: original denominator changed`);
  assert.equal(record.counts.chinese, p.chineseCount, `${code}: original Chinese count changed`);
  assert.equal(record.publishedPct.chinese, p.chinesePct, `${code}: original Chinese percentage changed`);
  if (record.counts.chinese === 0) chineseZeros++;
}
for (const p of original) assert.equal(Boolean(data.communities[String(p.code)]), p.chineseCount !== null, `${p.code}: availability changed`);
assert.equal(chineseZeros, 16);
assert.equal(data.communities['3490'], undefined, 'Suppressed Goodridge Corners must not become zero');
assert.deepEqual(audit.coverage, { boundaries: 403, publishedNeighbourhoodTables: 279, withAll13Groups: 278, boundariesWithoutPopulationComposition: 125, publishedChineseZeros: 16 });
assert.equal(audit.crossCheck.compared, 3906);
assert.equal(audit.crossCheck.mismatches, 0);
assert.equal(audit.crossCheck.suppressedCompared, 14);
for (const source of audit.sources) assert.equal(hash(source.snapshot), source.snapshotSha256, `${source.dataset}: checked source snapshot changed`);
const source = read('data/source/population-long-form.json');
const rows = source.rows.map(row => Object.fromEntries(source.columns.map((name, index) => [name, row[index]])));
for (const row of rows) {
  const record = row.neighbourhood_number ? data.communities[row.neighbourhood_number] : row.neighbourhood_name === 'Edmonton, CY' ? data.city : null;
  if (!record) continue;
  const code = Number(row.characteristics_code);
  if (code === 1639) assert.equal(record.population, Number(row.total_gender));
  if (code >= 1641 && code <= 1653) assert.equal(record.counts[ids[code - 1641]], Number(row.total_gender));
}
const sumGap = record => Object.values(record.counts).reduce((a, b) => a + b, 0) - record.population;
assert.equal(sumGap(data.city), audit.checks.cityCategorySumMinusDenominator);
assert.deepEqual(Object.fromEntries(Object.entries(data.communities).map(([code, record]) => [code, sumGap(record)]).filter(([, gap]) => gap !== 0)), audit.checks.communityCategorySumMinusDenominator);
assert.equal(hash('public/data/population-groups.json'), audit.outputSha256);
console.log('PASS: 13 official categories across 278 Edmonton neighbourhood profiles; same-table denominator; all existing Chinese counts and 16 zeros preserved; source snapshots and output checksums match.');
