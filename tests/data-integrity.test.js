import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => JSON.parse(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const published = read('data/source/statistics.json');
const communities = read('public/data/communities.geojson').features.map(feature => feature.properties);
const metadata = read('public/data/metadata.json');
const sourceByCode = new Map(published.map(row => [row.code, row]));
const byCode = new Map(communities.map(row => [row.code, row]));

test('the map preserves every official statistical value at its own code', () => {
  assert.equal(communities.length, 403);
  assert.equal(byCode.size, 403);
  assert.equal(sourceByCode.size, 279);
  const fields = [
    'income', 'chineseCount', 'chinesePct', 'chinesePopulationBase',
    'population', 'populationPrivate', 'populationTotal', 'children',
    'childrenCount', 'householdSize', 'households', 'householdsLongForm',
    'incomeStatus', 'chineseStatus',
  ];
  for (const source of published) {
    const actual = byCode.get(source.code);
    assert.ok(actual, `Missing boundary for ${source.code}`);
    for (const key of fields) {
      assert.deepEqual(actual[key], source[key], `${source.code}: ${key}`);
    }
  }
});

test('unpublished areas stay empty and published zero Chinese counts stay zero', () => {
  const unpublished = communities.filter(row => !sourceByCode.has(row.code));
  assert.equal(unpublished.length, 124);
  for (const row of unpublished) {
    for (const key of ['income', 'chineseCount', 'chinesePct', 'population', 'children', 'householdSize']) {
      assert.equal(row[key], null, `${row.code}: ${key}`);
    }
  }
  assert.equal(communities.filter(row => row.income === null).length, 126);
  assert.equal(communities.filter(row => row.chineseCount === null).length, 125);
  const zeroChinese = communities.filter(row => row.chineseCount === 0);
  assert.equal(zeroChinese.length, 16);
  for (const row of zeroChinese) assert.equal(row.chinesePct, 0);
});

test('Chinese shares use the matching long-form denominator, not short-form residents', () => {
  for (const row of communities.filter(row => row.chineseCount !== null)) {
    assert.ok(row.chinesePopulationBase > 0);
    assert.equal(row.chinesePct, row.chineseCount / row.chinesePopulationBase);
  }
  const windermere = byCode.get('5570');
  assert.equal(windermere.chineseCount, 2260);
  assert.equal(windermere.chinesePopulationBase, 12970);
  assert.equal(windermere.populationPrivate, 12570);
  assert.equal(windermere.children, 0.237);
});

test('suppressed values and small statistical bases remain intact', () => {
  const goodridge = byCode.get('3490');
  assert.equal(goodridge.income, null);
  assert.equal(goodridge.chineseCount, null);
  assert.equal(goodridge.populationPrivate, 0);
  assert.equal(goodridge.populationTotal, 1320);
  assert.equal(goodridge.householdSize, null);
  assert.match(goodridge.caveat, /1,320/);
  const university = byCode.get('5520');
  assert.equal(university.income, null);
  assert.equal(university.chineseCount, 70);
  assert.equal(university.chinesePopulationBase, 215);
  assert.equal(university.chinesePct, 70 / 215);
  assert.match(byCode.get('2691').caveat, /HORSE HILL NEIGHBOURHOOD/);
});

test('city comparisons and data years use the published city row', () => {
  assert.equal(metadata.cityIncomeMedian, 90000);
  assert.equal(metadata.cityChineseCount, 59740);
  assert.equal(metadata.cityChinesePopulationBase, 996485);
  assert.equal(metadata.cityChinesePct, 59740 / 996485);
  assert.equal(metadata.incomeYear, 2020);
  assert.equal(metadata.populationYear, 2021);
  assert.equal(metadata.populationLabel, '私人住户人口');
  assert.match(metadata.boundaryNote, /2023/);
  assert.match(metadata.boundaryNote, /未提供逐区合并对应表/);
});

// Editorial advice is not part of the official statistical snapshot.
test('public data omits editorial advice and curated neighbourhood shortlists', () => {
  for (const row of communities) assert.ok(!Object.hasOwn(row, 'note'), row.code);
  assert.ok(!Object.hasOwn(metadata, 'shortlist'));
  assert.ok(!Object.hasOwn(metadata, 'referenceMethod'));
});

test('community geometries still match the official boundary snapshot', () => {
  const boundaries = read('data/source/boundaries.geojson').features;
  const actual = new Map(read('public/data/communities.geojson').features.map(f => [f.properties.code, f.geometry]));
  for (const feature of boundaries) assert.deepEqual(actual.get(feature.properties.code), feature.geometry, feature.properties.code);
});
