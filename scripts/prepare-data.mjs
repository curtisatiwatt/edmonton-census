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

function reference(p) {
  const notes = [];
  if (p.income == null) {
    notes.push('没有可用的同口径收入，不参与收入排名；暂无数据不代表低收入。');
  } else {
    notes.push(`住户收入中位数约为全市的 ${(p.income / originalMetadata.cityIncomeMedian).toFixed(2)} 倍。`);
  }
  if (p.householdSize != null && p.householdSize <= 2) {
    notes.push('平均住户人数较少，比较家庭收入时也要考虑住户规模差异。');
  } else if (p.children != null && p.children >= 0.22) {
    notes.push('0–14 岁儿童比例高于全市 18.2%，可进一步查看同龄活动和入学安排。');
  }
  if (p.chinesePopulationBase != null && p.chinesePopulationBase > 0 && p.chinesePopulationBase < 500) {
    notes.push('华人人口占比的统计分母较小，少量人数变化就会明显改变比例。');
  }
  notes.push('选区仍需比较住房预算、具体地址对应的公校和通勤；收入不等于学校质量或治安。');
  return notes.join('');
}

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
  p.note = reference(p);
}
assert.equal(matched.size, stats.size, 'Every statistical code must match an official polygon');
const metadata = {
  ...originalMetadata,
  cityName: 'Edmonton', populationYear: 2021,
  preparedDate: originalMetadata.verifiedAt,
  latestCensusNote: originalMetadata.newCensusNote,
  shortlist: ['Windermere', 'Glenora', 'Westbrook Estates', 'Bulyea Heights', 'Terwillegar Towne', 'Windsor Park'],
  license: 'City of Edmonton Open Government Licence；统计资料改编自 Statistics Canada 2021 Census，经 City of Edmonton 发布。本产品不代表 Statistics Canada 的认可。',
  sources: [...originalMetadata.sources,
    { label: 'City of Edmonton · Arterial roads', url: 'https://data.edmonton.ca/d/9j8t-zm52' },
    { label: 'City of Edmonton · Named water bodies', url: 'https://data.edmonton.ca/d/ndtw-vdfy' },
    { label: 'City of Edmonton · Open Government Licence', url: 'https://data.edmonton.ca/stories/s/Open-Government-Licence-Edmonton/msh8-if28/' },
    { label: 'City of Edmonton · Wîhkwêntôwin naming', url: 'https://www.edmonton.ca/city_government/city_organization/naming-committee' },
    { label: 'Edmonton Public Schools · 按地址查询公校', url: 'https://epsb.ca/fast/' },
  ],
  referenceMethod: '参考说明由已公布收入与全市中位数比值、儿童比例、住户规模及小统计分母生成；不依据族裔推断教育质量、安全或个人特征。学校与通勤需按具体地址查询。',
};
write('public/data/communities.geojson', boundaries);
write('public/data/metadata.json', metadata);
write('data/audit/join.json', {
  preparedDate: metadata.preparedDate,
  boundaryCount: boundaries.features.length, statisticsCount: stats.size, matchedCount: matched.size,
  join: 'Exact official neighbourhood code; no inferred grouping or reallocation',
  caveat: metadata.boundaryNote, referenceMethod: metadata.referenceMethod,
});
console.log(`Prepared ${boundaries.features.length} areas with ${matched.size} exact statistical joins.`);
