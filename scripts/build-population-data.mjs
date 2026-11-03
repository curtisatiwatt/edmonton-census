// Rebuild population composition from checked official source cells, offline.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const write = (path, value) => fs.writeFileSync(new URL(path, root), `${JSON.stringify(value)}\n`);
const sha256 = path => createHash('sha256').update(fs.readFileSync(new URL(path, root))).digest('hex');
const longPath = 'data/source/population-long-form.json';
const crossPath = 'data/source/population-crosscheck.json';
const source = read(longPath);
const cross = read(crossPath);
const original = read('public/data/communities.geojson').features;
const originalByCode = new Map(original.map(feature => [String(feature.properties.code), feature.properties]));
const metadata = read('public/data/metadata.json');
const groups = [
  ['south_asian', '南亚裔', 'South Asian'],
  ['chinese', '华人', 'Chinese'],
  ['black', '黑人', 'Black'],
  ['filipino', '菲律宾裔', 'Filipino'],
  ['arab', '阿拉伯裔', 'Arab'],
  ['latin_american', '拉丁美洲裔', 'Latin American'],
  ['southeast_asian', '东南亚裔', 'Southeast Asian'],
  ['west_asian', '西亚裔', 'West Asian'],
  ['korean', '韩裔', 'Korean'],
  ['japanese', '日裔', 'Japanese'],
  ['visible_minority_nie', '其他可见少数族裔', 'Visible minority, n.i.e.'],
  ['multiple_visible_minorities', '多个可见少数族裔', 'Multiple visible minorities'],
  ['not_visible_minority', '非可见少数族裔（普查分类）', 'Not a visible minority'],
].map(([id, label, name], index) => ({ id, label, name, code: String(1641 + index) }));
const unpack = snapshot => snapshot.rows.map(row => Object.fromEntries(snapshot.columns.map((name, index) => [name, row[index]])));
const rows = unpack(source);
const crossRows = unpack(cross);
const records = new Map();
for (const row of rows) {
  const key = row.neighbourhood_number || row.neighbourhood_name;
  if (!records.has(key)) records.set(key, new Map());
  const record = records.get(key);
  assert.ok(!record.has(row.characteristics_code), `${key}: duplicate official characteristic`);
  record.set(row.characteristics_code, row);
}
assert.equal(source.characteristics['1639'], 'Total - Visible minority for the population in private households - 25% sample data');
for (const group of groups) assert.equal(source.characteristics[group.code], group.name);
const parseCount = value => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null;
const sourceUrl = 'https://data.edmonton.ca/d/9325-erna';
const unavailable = [];
function recordFromCells(key, cells) {
  assert.equal(cells.size, 15, `${key}: incomplete source table`);
  const population = parseCount(cells.get('1639').total_gender);
  const counts = Object.fromEntries(groups.map(group => [group.id, parseCount(cells.get(group.code).total_gender)]));
  if (!(population > 0) || Object.values(counts).some(value => value === null)) {
    unavailable.push({ code: key, name: cells.get('1639').neighbourhood_name, rawPopulation: cells.get('1639').total_gender, reason: 'Suppressed or unavailable denominator/categories; not treated as zero.' });
    return null;
  }
  // This dataset publishes counts, not percentages. Retain the common renderer
  // schema, but explicitly identify publishedPct as derived from source counts.
  return { population, counts, publishedPct: Object.fromEntries(groups.map(group => [group.id, counts[group.id] / population])), sourceUrl };
}
const city = recordFromCells('Edmonton, CY', records.get('Edmonton, CY'));
assert.equal(city.population, metadata.cityChinesePopulationBase);
assert.equal(city.counts.chinese, metadata.cityChineseCount);
const communities = {};
for (const [key, cells] of records) {
  if (!/^\d+$/.test(key)) continue;
  const p = originalByCode.get(key);
  assert.ok(p, `${key}: no exact official neighbourhood boundary match`);
  const record = recordFromCells(key, cells);
  if (!record) {
    assert.equal(p.chineseCount, null, `${key}: existing Chinese availability differs`);
    continue;
  }
  assert.equal(record.population, p.chinesePopulationBase, `${key}: denominator changed`);
  assert.equal(record.counts.chinese, p.chineseCount, `${key}: existing Chinese count changed`);
  assert.equal(record.publishedPct.chinese, p.chinesePct, `${key}: existing Chinese share changed`);
  communities[key] = record;
}
let compared = 0;
let suppressedCompared = 0;
const nameToCode = new Map(groups.map(group => [group.name, group.code]));
nameToCode.set('Total visible minority population', '1640');
const crossKeys = new Set();
for (const row of crossRows) {
  const code = nameToCode.get(row.characteristic);
  assert.ok(code, `Unexpected cross-check category: ${row.characteristic}`);
  const key = `${row.neighbourhood_number}/${code}`;
  assert.ok(!crossKeys.has(key), `Duplicate cross-check: ${key}`);
  crossKeys.add(key);
  const raw = records.get(row.neighbourhood_number)?.get(code)?.total_gender;
  assert.ok(raw !== undefined, `${key}: missing original cell`);
  if (raw === 'x' && row.value === null) suppressedCompared++;
  else assert.equal(raw, row.value, `${key}: dedicated visible-minority dataset differs`);
  compared++;
}
assert.equal(compared, 279 * 14);
const defaultGroupIds = groups.filter(group => group.id !== 'not_visible_minority')
  .sort((a, b) => city.counts[b.id] - city.counts[a.id]).slice(0, 5).map(group => group.id);
const output = {
  schemaVersion: 1, censusYear: 2021, variable: 'visible_minority', denominatorLabel: '私人住户人口',
  percentageBasis: 'derived_from_published_counts',
  groups: groups.map(({ code, ...group }) => group), defaultGroupIds, city, communities,
};
write('public/data/population-groups.json', output);
const sumGap = record => Object.values(record.counts).reduce((a, b) => a + b, 0) - record.population;
const gaps = Object.fromEntries(Object.entries(communities).map(([code, record]) => [code, sumGap(record)]).filter(([, gap]) => gap !== 0));
write('data/audit/population.json', {
  preparedDate: source.snapshotDate,
  variable: '2021 Census visible-minority classification, 25% long-form weighted estimates',
  denominator: { characteristicCode: '1639', label: source.characteristics['1639'], city: city.population },
  sources: [
    { dataset: '9325-erna', url: sourceUrl, query: source.sourceQuery, responseSha256: source.responseSha256, snapshot: longPath, snapshotSha256: sha256(longPath), rows: rows.length },
    { dataset: 'am8d-inje', url: 'https://data.edmonton.ca/d/am8d-inje', query: cross.sourceQuery, responseSha256: cross.responseSha256, snapshot: crossPath, snapshotSha256: sha256(crossPath), rows: crossRows.length },
  ],
  fieldMapping: Object.fromEntries(groups.map(group => [group.id, { code: group.code, label: group.name }])),
  percentageBasis: 'Source tables publish counts. All publishedPct schema fields are derived as count / same-table denominator; no rounded printed percentage is claimed.',
  join: 'Exact official neighbourhood code only; no copying to missing neighbouring polygons or inferred redistribution.',
  exclusions: { nonNeighbourhoodRows: ['Alberta', 'Total - Neighbourhoods'], suppressed: unavailable },
  coverage: { boundaries: original.length, publishedNeighbourhoodTables: 279, withAll13Groups: Object.keys(communities).length, boundariesWithoutPopulationComposition: original.length - Object.keys(communities).length, publishedChineseZeros: Object.values(communities).filter(row => row.counts.chinese === 0).length },
  crossCheck: { compared, suppressedCompared, mismatches: 0, categoryCount: 14, neighbourhoods: 279 },
  checks: { originalChineseCountsAndDenominatorsPreserved: true, cityCategorySumMinusDenominator: sumGap(city), communityCategorySumMinusDenominator: gaps },
  limitations: [
    'Random rounding means published category counts may not sum to the denominator. Preserve raw values; charts represent the gap and scale only oversums to fit a ring.',
    'Not a visible minority is the official classification, not a synonym for White, European, birthplace or nationality.',
    '2021 municipal census-day boundaries and the custom tabulation geography may differ for combined small areas. Existing exact-code join limitations remain.',
    'City totals are the official Edmonton, CY row, not a sum of neighbourhood values.',
  ],
  outputSha256: sha256('public/data/population-groups.json'),
});
console.log(`Prepared ${Object.keys(communities).length} Edmonton community profiles with 13 categories; ${compared} independent official cells matched.`);
