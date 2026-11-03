#!/usr/bin/env python3
"""Build restrained Edmonton geographic context from official public geometry.

python3 scripts/build-geographic-context.py --source-dir /tmp/edmonton-geography --download
Use an existing source-dir without --download to reproduce its snapshot.
Maintenance requires Shapely 2.x; the website only requires Node.js/Vite.
"""
import argparse
import collections
import datetime
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request
from shapely import affinity
from shapely.geometry import shape, mapping, Point, box, MultiLineString

ROOT = Path(__file__).resolve().parents[1]
PARK_SOURCE = 'https://data.edmonton.ca/Outdoor-Recreation/Parks/gdd9-eqv9'
CORRIDOR_SERVICE = 'https://geospatial.alberta.ca/arcgis/rest/services/Highway_Economic_Corridor/MapServer'
RAIL_SOURCE = CORRIDOR_SERVICE + '/22'
AIRPORT_SOURCE = CORRIDOR_SERVICE + '/29'
RESERVE_SOURCE = 'https://open.canada.ca/data/en/dataset/522b07b9-78e2-4819-b736-ad9208eb1067'
RESERVE_SERVICE = 'https://proxyinternet.nrcan-rncan.gc.ca/arcgis/rest/services/CLSS-SATC/CLSS_Administrative_Boundaries/MapServer/0'
RAIL_BOUNDS = [-113.9, 53.25, -113.2, 53.75]
RESERVE_BOUNDS = [-113.9, 53.15, -113.2, 53.8]
EDMONTON_LICENSE = 'https://data.edmonton.ca/stories/s/Open-Government-Licence-Edmonton/msh8-if28/'
ALBERTA_LICENSE = 'https://open.alberta.ca/licence'
CANADA_LICENSE = 'https://open.canada.ca/en/open-government-licence-canada'
LICENSE_EVIDENCE = 'https://www.alberta.ca/system/files/tec-economic-corridors-map.pdf'
QUERY = {'f': 'geojson', 'where': '1=1', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
         'outSR': 4326, 'outFields': '*', 'returnGeometry': 'true'}
URLS = {
    'parks.json': 'https://data.edmonton.ca/resource/gdd9-eqv9.geojson?' + urllib.parse.urlencode({'$limit': 5000}),
    'parks-meta.json': 'https://data.edmonton.ca/api/views/gdd9-eqv9.json',
    'reserves.json': RESERVE_SERVICE + '/query?' + urllib.parse.urlencode({**QUERY, 'geometry': ','.join(map(str, RESERVE_BOUNDS))}),
    'airport.json': AIRPORT_SOURCE + '/query?' + urllib.parse.urlencode({'f': 'geojson', 'where': "IATA_CODE = 'YEG'", 'outSR': 4326, 'outFields': '*', 'returnGeometry': 'true'}),
    'rail-network-meta.json': RAIL_SOURCE + '?f=json',
    'airport-meta.json': AIRPORT_SOURCE + '?f=json',
}


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        data = json.load(response)
    if 'error' in data:
        raise ValueError(data['error'])
    return data


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rounded(coords, digits=6):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], digits), round(coords[1], digits)]
    return [rounded(c, digits) for c in coords]


def projected(geometry):
    return affinity.scale(geometry, xfact=math.cos(math.radians(53.5)) * 111320, yfact=111320, origin=(0, 0))


def simplified(geometry):
    original = shape(geometry)
    if not original.is_valid or original.is_empty:
        raise ValueError('Invalid or empty source polygon')
    local = projected(original)
    for tolerance in [5, 1, 0]:
        candidate = affinity.scale(local.simplify(tolerance, preserve_topology=True), xfact=1 / (math.cos(math.radians(53.5)) * 111320), yfact=1 / 111320, origin=(0, 0)) if tolerance else original
        converted = mapping(candidate)
        result = {'type': converted['type'], 'coordinates': rounded(converted['coordinates'])}
        g = shape(result)
        if not g.is_valid or abs(g.area / original.area - 1) > .01:
            result = {'type': converted['type'], 'coordinates': converted['coordinates']}
            g = shape(result)
        if g.is_valid and abs(g.area / original.area - 1) <= .01:
            return result, abs(g.area / original.area - 1)
    raise ValueError('Polygon simplification exceeded 1% area tolerance')


def area_feature(kind, identifier, name, geometry, source, **extra):
    geometry, area_change = simplified(geometry)
    g = shape(geometry)
    components = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
    anchor = max(components, key=lambda x: x.area).representative_point()
    point = [round(anchor.x, 8), round(anchor.y, 8)]
    if not g.contains(Point(point)):
        point = [anchor.x, anchor.y]
    assert g.contains(Point(point))
    return {'type': 'Feature', 'properties': {'kind': kind, 'id': identifier, 'name': name, 'sourceUrl': source,
            'geometryQuality': 'official', 'labelPoint': point, **extra}, 'geometry': geometry}, area_change


def lines_in(geometry):
    if geometry.geom_type == 'LineString':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for member in geometry.geoms:
            yield from lines_in(member)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--snapshot-date', default='2026-11-03')
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    rail_query = {**QUERY, 'geometry': ','.join(map(str, RAIL_BOUNDS)), 'orderByFields': 'OBJECTID_1', 'resultRecordCount': 2000}
    if args.download:
        for name, url in URLS.items():
            (args.source_dir / name).write_text(json.dumps(fetch(url)))
        rails = []
        for offset in range(0, 20000, 2000):
            response = fetch(RAIL_SOURCE + '/query?' + urllib.parse.urlencode({**rail_query, 'resultOffset': offset}))
            rails.extend(response['features'])
            if not response.get('exceededTransferLimit'):
                break
        else:
            raise ValueError('Rail query pagination exceeded expected bound')
        (args.source_dir / 'rail-network.json').write_text(json.dumps({'type': 'FeatureCollection', 'features': rails}))
    raw = {name: json.loads((args.source_dir / name).read_text()) for name in [*URLS, 'rail-network.json']}
    parks = raw['parks.json']['features']
    reserves = raw['reserves.json']['features']
    rails = raw['rail-network.json']['features']
    airports = raw['airport.json']['features']
    assert len(airports) == 1 and airports[0]['properties']['IATA_CODE'] == 'YEG'
    assert len(rails) == len({f['properties']['OBJECTID_1'] for f in rails})
    features, changes, selected_parks = [], [], []
    iconic = {'William Hawrelak Park', 'Rundle Park', 'Terwillegar Park', 'Hermitage Park', 'Fort Edmonton Park', 'Victoria Park', 'Gold Bar Park', 'Northeast River Valley Park'}
    for f in parks:
        p = f['properties']
        if p['status'] != 'Active' or p['type'] != 'Park' or float(p['area']) < 50000:
            continue
        park_id = p['id'] or 'geometry-' + hashlib.sha256(json.dumps(f['geometry'], sort_keys=True).encode()).hexdigest()[:16]
        name = p.get('official_name') or p.get('common_name')
        named = bool(name)
        if not name:
            name = 'Park / natural area ' + park_id
        feature, change = area_feature('park', 'park-' + park_id, name, f['geometry'], PARK_SOURCE,
            named=named, sourceId=p['id'], parkCategory=p['class'], areaHa=round(float(p['area']) / 10000, 2),
            sourceStatus=p['status'], labelPriority=2000 if name in iconic else round(float(p['area']) / 10000, 1), iconic=name in iconic)
        features.append(feature)
        changes.append(change)
        selected_parks.append(park_id)
    reserve_names = {'06652': 'Enoch Cree Nation 135', '06658': 'Alexander 134'}
    for f in reserves:
        p = f['properties']
        if p['distributionType'] != 'IR' or p['jurisdiction'] != 'AB':
            continue
        feature, change = area_feature('reserve', 'reserve-' + p['adminAreaId'], reserve_names.get(p['adminAreaId'], p['adminAreaNameEng'].title()),
            f['geometry'], RESERVE_SOURCE, named=True, reserveId=p['adminAreaId'], labelPriority=3000,
            sourceName=p['adminAreaNameEng'])
        features.append(feature)
        changes.append(change)
    airport = airports[0]
    coords = airport['geometry']['coordinates']
    features.append({'type': 'Feature', 'properties': {'kind': 'airport', 'id': 'airport-YEG', 'name': 'Edmonton International Airport (YEG)',
        'shortName': 'YEG AIRPORT', 'shortLabel': 'YEG AIRPORT', 'iata': 'YEG', 'sourceUrl': AIRPORT_SOURCE, 'geometryQuality': 'official_point', 'labelPoint': coords,
        'named': True, 'labelPriority': 4000, 'outsideCity': True,
        'note': '机场位于 Leduc County，使用官方机场点位，不表示机场地块边界。',
        'noteEn': 'Located in Leduc County. Official airport reference point; no airport property boundary is implied.'},
        'geometry': airport['geometry']})
    rail_groups = collections.defaultdict(list)
    rail_ids = collections.defaultdict(list)
    clip = box(*RAIL_BOUNDS)
    for f in rails:
        p = f['properties']
        # The official network contains CN / CPKC freight and intercity passenger tracks, not Edmonton LRT.
        if p['OPERATOENA'] not in ['Canadian National', 'Canadian Pacific Kansas City']:
            raise ValueError('New railway operator requires review')
        g = shape(f['geometry']).intersection(clip)
        for line in lines_in(g):
            local = projected(line).simplify(3, preserve_topology=True)
            display = affinity.scale(local, xfact=1 / (math.cos(math.radians(53.5)) * 111320), yfact=1 / 111320, origin=(0, 0))
            coordinates = rounded(mapping(display)['coordinates'])
            if len(set(map(tuple, coordinates))) < 2:
                continue
            rail_groups[p['OPERATORMK']].append(coordinates)
        rail_ids[p['OPERATORMK']].append(p['OBJECTID_1'])
    for operator, lines in sorted(rail_groups.items()):
        features.append({'type': 'Feature', 'properties': {'kind': 'railway', 'id': 'railway-' + operator.lower(),
            'name': ('Canadian National' if operator == 'CN' else 'Canadian Pacific Kansas City') + ' railway tracks',
            'sourceUrl': RAIL_SOURCE, 'geometryQuality': 'official', 'operator': operator,
            'sourceSegmentCount': len(rail_ids[operator]), 'displaySegmentCount': len(lines)},
            'geometry': {'type': 'MultiLineString', 'coordinates': lines}})
    features.sort(key=lambda f: (f['properties']['kind'], f['properties']['id']))
    assert len(features) == len({f['properties']['id'] for f in features})
    for f in features:
        assert shape(f['geometry']).is_valid and not shape(f['geometry']).is_empty
    out = ROOT / 'public/data/geographic-context.geojson'
    out.write_text(json.dumps({'type': 'FeatureCollection', 'name': 'Edmonton geographic context', 'snapshotDate': args.snapshot_date, 'features': features}, ensure_ascii=False, separators=(',', ':')) + '\n')
    audit = {
        'schemaVersion': 1, 'snapshotDate': args.snapshot_date, 'outputSha256': digest(out), 'outputBytes': out.stat().st_size,
        'outputCounts': dict(collections.Counter(f['properties']['kind'] for f in features)),
        'sourceCounts': {'parks': len(parks), 'reserves': len(reserves), 'airports': len(airports), 'railSegments': len(rails)},
        'parkSelection': 'Official Active Park sites with published area >= 5 hectares. Cemeteries, proposed/assembled sites and other open-space land types excluded. School/community grounds may be included. This is park land, not a vegetation or opening-hours map.',
        'selectedParkIds': sorted(selected_parks),
        'parkIdentifiers': 'Published park ID when present; missing IDs receive geometry- plus the first 16 SHA-256 hex characters of the original geometry JSON. sourceId preserves null.',
        'railSelection': {'queryWgs84Bounds': RAIL_BOUNDS, 'operators': sorted(rail_groups), 'sourceUses': dict(collections.Counter(f['properties']['USETYPE'] for f in rails)),
            'pagination': '2000-record pages ordered by OBJECTID_1 until exceededTransferLimit is false; unique IDs verified.',
            'clipping': 'Tracks clipped to regional display bounds; fragments remain separate. No connecting lines invented. No LRT tracks.'},
        'reserveSelection': {'intersectsWgs84Bounds': RESERVE_BOUNDS, 'fullPolygonsRetained': True, 'names': [f['properties']['name'] for f in features if f['properties']['kind'] == 'reserve']},
        'airport': {'name': 'Edmonton International Airport (YEG)', 'geometry': 'Official point only, outside Edmonton in Leduc County; no fabricated land polygon. Does not change community fit bounds.', 'excluded': 'Former Edmonton City Centre / Blatchford airport is not represented as an active airport.', 'locationEvidence': 'https://flyeia.com/corporate/wp-content/uploads/YEG-Master-Plan-2048-Public-Report_FINAL_EN.pdf'},
        'simplification': {'polygons': 'Local metre projection, topology-preserving tolerance 5m, then 1m/original fallback until area change <=1%; rounding fallback preserves geometry.', 'maxRelativeAreaChange': max(changes), 'railways': '3m local tolerance, individual clipped segments batched into operator MultiLineStrings.'},
        'labelPoints': 'Polygon interior points in largest component, verified after rounding; airport uses official point.',
        'sources': [
            {'name': 'City of Edmonton Parks', 'url': PARK_SOURCE, 'licenseUrl': EDMONTON_LICENSE, 'updatedAt': datetime.datetime.fromtimestamp(raw['parks-meta.json']['rowsUpdatedAt'], datetime.timezone.utc).isoformat()},
            {'name': 'Government of Alberta Railway Network', 'url': RAIL_SOURCE, 'licenseUrl': ALBERTA_LICENSE, 'licenseEvidenceUrl': LICENSE_EVIDENCE, 'licenseEvidence': 'Official Economic Corridors map identifies Government of Alberta basemap data as provided under the Alberta Open Government Licence; REST item metadata has no separate terms.'},
            {'name': 'Government of Alberta International Airports', 'url': AIRPORT_SOURCE, 'licenseUrl': ALBERTA_LICENSE, 'licenseEvidenceUrl': LICENSE_EVIDENCE},
            {'name': 'NRCan Aboriginal Lands of Canada Legislative Boundaries', 'url': RESERVE_SOURCE, 'serviceUrl': RESERVE_SERVICE, 'licenseUrl': CANADA_LICENSE},
        ],
        'rawSources': [{'file': name, 'url': url, 'sha256': digest(args.source_dir / name)} for name, url in URLS.items()] + [{'file': 'rail-network.json', 'url': RAIL_SOURCE + '/query?' + urllib.parse.urlencode(rail_query), 'paginated': True, 'sha256': digest(args.source_dir / 'rail-network.json')}],
        'preservedDataSha256': {name: digest(ROOT / 'public/data' / name) for name in ['communities.geojson', 'basemap.geojson']},
    }
    audit_path = ROOT / 'data/audit/geographic-context.json'
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'counts': audit['outputCounts'], 'bytes': out.stat().st_size, 'sha256': audit['outputSha256'], 'maxAreaChange': max(changes)}))


if __name__ == '__main__':
    main()
