import { isNumber } from './map-utils.js';

async function readJson(path) {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!response.ok) throw new Error(`无法载入 ${path}（${response.status}）`);
  return response.json();
}

export async function loadData() {
  const [metadata, communities, basemapResult] = await Promise.all([
    readJson('metadata.json'),
    readJson('communities.geojson'),
    readJson('basemap.geojson').catch(() => null),
  ]);
  if (communities.type !== 'FeatureCollection' || !communities.features?.length) {
    throw new Error('社区边界数据格式不完整');
  }
  const features = communities.features.map(feature => {
    const p = feature.properties;
    if (!p.name || p.code === undefined || !Array.isArray(p.centroid)) {
      throw new Error('社区身份或显示坐标缺失');
    }
    return { ...feature, properties: { ...p, code: String(p.code) } };
  });
  // Rank ties together and calculate denominator from the actual available values.
  const ranked = features.filter(f => isNumber(f.properties.income))
    .sort((a, b) => b.properties.income - a.properties.income);
  let previousIncome;
  let rank;
  for (const [i, feature] of ranked.entries()) {
    if (feature.properties.income !== previousIncome) rank = i + 1;
    feature.properties.incomeRank = rank;
    previousIncome = feature.properties.income;
  }
  return { metadata, features, basemap: basemapResult };
}
