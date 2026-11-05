// Rebuild app data from the checked official snapshot. No network or API key needed.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const write = (path, value) => fs.writeFileSync(new URL(path, root), `${JSON.stringify(value)}\n`);
const boundaries = read('data/source/boundaries.geojson');
const statistics = read('data/source/statistics.json');
const originalMetadata = read('data/source/statistics-metadata.json');
const stats = new Map(statistics.map(row => [row.code, row]));
assert.equal(stats.size, statistics.length);
const matched = new Set();

for (const feature of boundaries.features) {
  const base = feature.properties;
  const row = stats.get(base.code);
  const p = feature.properties = {
    ...base,
    income: null, chineseCount: null, chinesePct: null, chinesePopulationBase: null,
    population: null, populationPrivate: null, populationTotal: null,
    children: null, householdSize: null,
    incomeStatus: 'no_published_record', chineseStatus: 'no_published_record',
    sourceUrl: 'https://data.edmonton.ca/d/9325-erna',
    caveat: '市府未为此编号单独发布同口径统计。部分小型区域并入邻近社区统计；此处不推测归属，也不复制邻区数值。',
    ...row,
    name: base.name, boundaryName: base.name,
    censusName: row?.name ?? null,
  };
  if (row) matched.add(base.code);
  if (base.name === 'Oliver') {
    p.name = 'Wîhkwêntôwin (Oliver)';
    p.aliases = ['Oliver', 'Wîhkwêntôwin', 'Wihkwentowin'];
    p.caveat += `${p.caveat ? ' ' : ''}2021 年统计使用旧名 Oliver；市议会于 2024 年批准更名为 Wîhkwêntôwin。`;
  }
}
assert.equal(matched.size, stats.size, 'Every statistical code must match an official polygon');
const metadata = {
  ...originalMetadata,
  cityName: 'Edmonton', populationYear: 2021,
  preparedDate: originalMetadata.verifiedAt,
  latestCensusNote: originalMetadata.newCensusNote,
  license: 'City of Edmonton Open Government Licence；统计资料改编自 Statistics Canada 2021 Census，经 City of Edmonton 发布。本产品不代表 Statistics Canada 的认可。',
  sources: [...originalMetadata.sources,
    { label: 'City of Edmonton · Arterial roads', url: 'https://data.edmonton.ca/d/9j8t-zm52' },
    { label: 'City of Edmonton · Named water bodies', url: 'https://data.edmonton.ca/d/ndtw-vdfy' },
    { label: 'City of Edmonton · Open Government Licence', url: 'https://data.edmonton.ca/stories/s/Open-Government-Licence-Edmonton/msh8-if28/' },
    { label: 'City of Edmonton · Wîhkwêntôwin naming', url: 'https://www.edmonton.ca/city_government/city_organization/naming-committee' },
    { label: 'Edmonton Public Schools · 按地址查询公校', url: 'https://epsb.ca/fast/' },
  ],
};
write('public/data/communities.geojson', boundaries);
write('public/data/metadata.json', metadata);
write('data/audit/join.json', {
  preparedDate: metadata.preparedDate,
  boundaryCount: boundaries.features.length, statisticsCount: stats.size, matchedCount: matched.size,
  join: 'Exact official neighbourhood code; no inferred grouping or reallocation',
  caveat: metadata.boundaryNote,
});
console.log(`Prepared ${boundaries.features.length} areas with ${matched.size} exact statistical joins.`);
