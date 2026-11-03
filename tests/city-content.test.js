import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerEdmontonContent, translateEdmontonReference } from '../src/city-content.js';

import { translate } from '../src/i18n.js';

const read = path => JSON.parse(fs.readFileSync(new URL(`../public/data/${path}`, import.meta.url), 'utf8'));
const communities = JSON.parse(fs.readFileSync(new URL('../public/data/communities.geojson', import.meta.url), 'utf8')).features;

test('every published Edmonton reference and caveat has an English equivalent', () => {
  for (const feature of communities) for (const key of ['note', 'caveat']) {
    const text = feature.properties[key];
    if (!text) continue;
    const translated = translateEdmontonReference(text);
    assert.ok(translated, `${feature.properties.code}: ${key}`);
    assert.doesNotMatch(translated, /[\u3400-\u9fff]/, `${feature.properties.code}: ${key} is untranslated`);
  }
});

test('translated caveats retain suppressed values, small bases and incompatible populations', () => {
  const byCode = new Map(communities.map(f => [f.properties.code, f.properties]));
  assert.match(translateEdmontonReference(byCode.get('3490').caveat), /1,320/);
  assert.match(translateEdmontonReference(byCode.get('3490').caveat), /different populations/);
  assert.match(translateEdmontonReference(byCode.get('5520').note), /small statistical denominator/);
  assert.match(translateEdmontonReference(byCode.get('2691').caveat), /HORSE HILL NEIGHBOURHOOD/);
  assert.match(translateEdmontonReference(byCode.get('1010').note), /0\.75 times/);
});


test('Edmonton data methods and transit caveats are readable in English', () => {
  const metadata = read('metadata.json');
  const operatingTransit = read('lrt-operating.geojson');
  const greenTransit = read('lrt-planned.geojson');
  registerEdmontonContent({ metadata, features: communities, operatingTransit, greenTransit });
  for (const field of ['incomeDefinition', 'populationGroupsDefinition', 'latestCensusNote', 'boundaryNote', 'license', 'geographyDefinition']) {
    assert.doesNotMatch(translate(metadata[field], 'en'), /[\u3400-\u9fff]/u, field);
  }
  for (const collection of [operatingTransit, greenTransit]) for (const feature of collection.features) {
    for (const field of ['phaseLabel', 'locationNote', 'note']) {
      const value = feature.properties[field];
      if (value) assert.doesNotMatch(translate(value, 'en'), /[\u3400-\u9fff]/u, `${feature.properties.id}: ${field}`);
    }
  }
  for (const group of read('population-groups.json').groups) assert.doesNotMatch(translate(group.label, 'en'), /[\u3400-\u9fff]/u, group.id);
});
