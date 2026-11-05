import { addTranslations, addTranslationPatterns, translate } from './i18n.js';

const phrases = {
  '社区': 'Neighbourhood',
  '地理资料范围': 'Geographic coverage',
  '搜索社区，例如 Garneau': 'Search neighbourhoods, e.g. Garneau',
  '搜索埃德蒙顿社区': 'Search Edmonton neighbourhoods',
  'Edmonton 社区观察首页': 'Edmonton Community Atlas home',
  'Edmonton 社区观察 · 人口构成与分布': 'Edmonton Community Atlas · Population & distribution',
  '埃德蒙顿互动社区地图': 'Interactive Edmonton neighbourhood map',
  '查看整个埃德蒙顿': 'Show all of Edmonton',
  '正在展开 Edmonton': 'Opening Edmonton',
  '长表私人住户人口 · 2021': 'Private-household population · 2021 long form',
  '短表私人住户人口 · 2021': 'Private-household population · 2021 short form',
  '私人住户人口 · 2021': 'Private-household population · 2021',
  'LRT 线路与车站': 'LRT routes & stations',
  'Capital / Metro / Valley · 运营与规划扩建': 'Capital / Metro / Valley · operating & planned',
  'LRT 线路图例': 'LRT route legend',
  '运营 LRT': 'Operating LRT',
  'LRT 扩建线路': 'LRT extensions',
  '未运营扩建': 'Future extensions',
  'Capital / Metro / Valley 为运营线路；扩建线路采用虚线，标注未运营及各段建设状态。点击车站查看名称与线路，放大可显示更多车站名。规划线路及站位可能调整，示意位置会特别注明。地理图层覆盖范围可超出社区统计范围；不会为市外区域推算人口资料。': 'Capital, Metro and Valley are operating LRT lines. Dashed extensions are not in service; their construction or planning status is identified. Select a station for its name and route, and zoom in for more station labels. Planned routes and stations may change; schematic locations are identified. Geographic context can extend beyond the census area, without estimating population for areas outside Edmonton.',
  '详情与热度图的占比由公布人数除以同表的私人住户人口计算，保留一位小数；与市府表中已取整的百分比可能略有不同。官方人数通常按 5 人取整，各类别人数之和可能略偏离总人口。分类合计少于人口总数时，差额在圆环中单独留白；超过人口总数时，圆环按分类合计缩放。详情数值仍使用表中人口基数。': 'Detail and heat-map percentages divide published counts by private-household population in the same long-form table, shown to one decimal place. They may differ slightly from rounded percentages in the City tables. Counts are usually randomly rounded to multiples of five, so categories can sum above or below the table population. A shortfall is shown as a separate gap in the ring; an excess is scaled to fit the ring. Detail percentages retain the original table denominator.',
  '“社区构成”的“地图图层”可分别切换道路与铁路、社区名称、LRT 和地理地标；“分布对比”保留简洁的人口热度图。社区名称在地图上使用大写，详情保留原名称。文字随缩放逐步显示并自动避让，放大后可查看更多社区和站点。机场使用紫色、公园使用绿色、原住民保留区使用浅棕色，这些地理底色不表示人口或收入。': 'In Composition, Map layers controls roads and railways, neighbourhood labels, LRT and geographic landmarks. Distribution retains a simple population heat map. Neighbourhood labels use capitals, with original names in the details. Labels appear progressively as you zoom and avoid overlap. Purple airports, green parks and tan reserve lands are geographic context, not population or income values.',
  'Edmonton Public Schools · 按地址查询公校': 'Edmonton Public Schools · Find a school by address',
  '人口构成与占比采用 25% 长表的私人住户人口；儿童比例与平均住户人数采用 100% 短表。两种人口基数可能不同，不能混用。': 'Population composition and shares use private-household population from the 25% long form. Child shares and average household size come from the 100% short form. The population bases can differ and must not be interchanged.',
  '9 万': '$90k',
  '私人住户人口较少，百分比和收入中位数易受少数住户影响': 'The private-household population is small, so percentages and median income can be sensitive to a few households',
  '家庭收入因保密规则被抑制，未填作 0': 'Household income is suppressed for confidentiality and has not been replaced with zero',
  '华裔统计因保密规则被抑制，未填作 0': 'Chinese-population statistics are suppressed for confidentiality and have not been replaced with zero',
  '普查人数经随机取整': 'Census counts are randomly rounded',
  '显示 0 不表示绝对无人': 'A published zero does not establish that no residents are present',
  '私人住户人口为 0，但年龄统计总人口为 1,320': 'Private-household population is zero, while the total population used for age statistics is 1,320',
  '两者统计范围不同': 'These statistics cover different populations',
  '市府未为此编号单独发布同口径统计': 'The City has not published separate comparable statistics for this neighbourhood code',
  '部分小型区域并入邻近社区统计': 'Some small areas are combined with neighbouring areas in the statistics',
  '此处不推测归属，也不复制邻区数值': 'This map does not infer those assignments or copy values from neighbouring areas',
  '2021 年统计使用旧名 Oliver': 'The 2021 statistics use the former name Oliver',
  '市议会于 2024 年批准更名为 Wîhkwêntôwin': 'City Council approved the name Wîhkwêntôwin in 2024',
  '地图名称为 Horse Hill Neighbourhood 1A，统计原表名称为 HORSE HILL NEIGHBOURHOOD': 'The map uses Horse Hill Neighbourhood 1A; the source statistics use HORSE HILL NEIGHBOURHOOD',
  '按相同官方社区编号连接，边界范围可能有差异': 'Records are joined using the same official neighbourhood code; the geographic coverage may differ',
  '本区人口构成使用 25% 长表私人住户人口作为分母，与 100% 短表人口可能不同。': 'Population composition uses the private-household population from the 25% long form; it can differ from the 100% short-form population.',
};

export function translateEdmontonReference(value = '') {
  return String(value).split(/[。；]/).map(part => part.trim()).filter(Boolean).map(part => {
    if (phrases[part]) return phrases[part];
    const nonresponse = part.match(/^长表总未答复率为 ([\d.]+)%$/);
    if (nonresponse) return `The long-form total non-response rate is ${nonresponse[1]}%`;
    return part;
  }).join('. ') + (value ? '.' : '');
}

const metadataEnglish = {
  populationDefinition: 'Private-household population from the 2021 Census 100% short form, excluding collective-dwelling residents. The separately stored total population used for age statistics includes collective-dwelling residents; the randomly rounded city total is 1,010,900.',
  incomeDefinition: 'Median total household income before tax in 2020, in Canadian dollars, from the 2021 Census 25% long-form custom neighbourhood tabulation. This is not personal income, economic-family income, after-tax income or current income.',
  chineseDefinition: 'Chinese is a 2021 Census visible-minority category, using a weighted 25% long-form estimate. It is not citizenship, language or all people with Chinese ancestry. Shares use private-household population from the same long-form table; this denominator can differ from the 100% short form.',
  childrenDefinition: 'The share aged 0–14 is the City-published short-form percentage (characteristic 28). Its denominator is the population used for age statistics, including collective-dwelling residents.',
  householdSizeDefinition: 'Average private-household size, as directly published in the 2021 Census 100% short form.',
  boundaryNote: 'The map uses 403 City boundaries labelled “2021 Federal Census: Neighbourhoods as of Official Census Day”. The methodology says the custom statistics were assembled using 2023 neighbourhood boundaries, with some small river-valley and industrial areas combined into neighbouring areas. No complete area-by-area crosswalk was supplied. Published values are joined only by official neighbourhood code and are never copied into missing neighbouring areas. Displayed boundaries and statistical areas may not coincide exactly.',
  missingDataNote: 'Unpublished, suppressed and not-applicable values remain missing. Missing data does not imply low income or no residents. Grey areas can include industrial, river-valley and other neighbourhoods without separate statistics.',
  roundingNote: 'Census counts are randomly rounded for confidentiality. The 25% long form uses weighted sample estimates, and its population denominator can differ from the 100% short form. Neighbourhood counts may not sum to the published city total.',
  newCensusNote: 'The 2026 federal census has finished collection, but results had not been released as of November 3, 2026. The first population release is scheduled for February 10, 2027; income for July 14, 2027; and ethnocultural data for October 27, 2027. This map uses the published 2021 neighbourhood data.',
  latestCensusNote: 'The 2026 federal census has finished collection, but results had not been released as of November 3, 2026. The first population release is scheduled for February 10, 2027; income for July 14, 2027; and ethnocultural data for October 27, 2027. This map uses the published 2021 neighbourhood data.',
  license: 'Statistical data adapted from Statistics Canada’s 2021 Census through the City of Edmonton; this product is not endorsed by Statistics Canada. Geographic data is used under the City of Edmonton Open Government Licence, Open Government Licence – Alberta, and Open Government Licence – Canada, as applicable. Leaflet uses the BSD 2-Clause licence.',
  populationGroupsDefinition: 'Population views use the 13 mutually classified visible-minority (racialized-population) categories from the City’s 2021 Census custom tabulation. The five largest visible-minority groups citywide are selected by default. “Not a visible minority” includes Indigenous people and must not be interpreted as White or European.',
  geographyDefinition: 'Geographic context uses official parks, railway and Indigenous reserve data. Edmonton International Airport (YEG) is shown at its official point location outside the city and does not expand the neighbourhood census coverage. Parks indicate designated park land, not all vegetation cover.',
};

export function registerEdmontonContent({ metadata, features = [], operatingTransit, greenTransit } = {}) {
  const translations = { ...phrases };
  for (const [key, english] of Object.entries(metadataEnglish)) if (metadata?.[key]) translations[metadata[key]] = english;
  for (const feature of features) for (const key of ['caveat']) {
    const value = feature.properties?.[key];
    if (value) translations[value] = translateEdmontonReference(value);
  }
  for (const collection of [operatingTransit, greenTransit]) for (const feature of collection?.features || []) {
    const p = feature.properties;
    for (const key of ['phaseLabel', 'locationNote', 'note']) if (p[key] && p[`${key}En`]) translations[p[key]] = p[`${key}En`];
    if (p.phaseLabel && p.phaseLabelEn && p.funding === 'unfunded') translations[`${p.phaseLabel} · 远期规划 / 未获建设资金`] = `${p.phaseLabelEn} · Future plan / construction funding not secured`;
  }
  addTranslations(translations);
}

// Register city-specific static text before the first UI translation pass.
registerEdmontonContent();

addTranslationPatterns([
  [/^(.+) ↗$/, (_, source) => `${translate(source, 'en')} ↗`],
]);
