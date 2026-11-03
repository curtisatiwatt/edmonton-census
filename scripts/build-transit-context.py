#!/usr/bin/env python3
"""Rebuild Edmonton LRT context from checked-in City source snapshots.

Python standard library only. --refresh downloads the same official sources;
review current ETS service/project status before accepting an updated snapshot.
No frontend Python or live request is needed by the published app.
"""
from pathlib import Path
import argparse, csv, hashlib, json, math, re, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/audit/transit-source'
OUT = ROOT / 'public/data'
DATE = '2026-11-03'
NS = {'k': 'http://www.opengis.net/kml/2.2'}
CITY = 'https://www.edmonton.ca'
STATIONS_PAGE = CITY + '/ets/lrt-station-locations'
TRIPS_PAGE = 'https://data.edmonton.ca/Transit/ETS-Bus-Schedule-GTFS-Data-Feed-Trips/ctwr-tvrd'
SHEET = 'https://docs.google.com/spreadsheets/d/1Ck1sRA-0nI9WHf_mFdagqlc4deIbF-9vsOgKy1tL-f4/gviz/tq?tqx=out:csv&sheet=Stations'
PROJECTS = {
 'valley-west': ('1s78pE99lwGtjs8ZBqgEch3I9gjs', CITY+'/projects_plans/transit/valley-line-west'),
 'capital-south': ('1zYff0Vgzfeg076BC4pYPOn1RkfPUKKw', CITY+'/projects_plans/transit/capital-line-south'),
 'capital-north': ('1BQT2Q1vqmLX6iEVHT6I_PeoqgL4', CITY+'/projects_plans/transit/capital-line-northeast'),
 'metro-nw': ('1MnSElJBgHkL4J7Qk5-5aBVW61RFywjU', CITY+'/projects_plans/transit/nw-lrt'),
}
SHAPES = {'capital':'021R-68-North','metro':'022R-82-South','valley':'023R-18-North'}
PHASES = {
 'valley-west': dict(lineId='valley', status='construction', funding='funded', phaseLabel='Valley Line 西延线', phaseLabelEn='Valley Line West'),
 'capital-south-1': dict(lineId='capital', status='construction', funding='funded', phaseLabel='Capital Line 南延一期', phaseLabelEn='Capital Line South — Phase 1'),
 'capital-south-2': dict(lineId='capital', status='planned', funding='unfunded', phaseLabel='Capital Line 南延二期', phaseLabelEn='Capital Line South — Phase 2'),
 'capital-north': dict(lineId='capital', status='planned', funding='unfunded', phaseLabel='Capital Line 东北延线', phaseLabelEn='Capital Line Northeast'),
 'metro-gate': dict(lineId='metro', status='planned', funding='funded', phaseLabel='Blatchford Gate · 已建成，尚未开放', phaseLabelEn='Blatchford Gate — built, not open'),
 'metro-nw-2': dict(lineId='metro', status='planned', funding='unfunded', phaseLabel='Metro Line 西北延线二期', phaseLabelEn='Metro Line Northwest — Phase 2'),
 'metro-nw-3': dict(lineId='metro', status='planned', funding='unfunded', phaseLabel='Metro Line 西北延线三期', phaseLabelEn='Metro Line Northwest — Phase 3'),
}

def sha(b): return hashlib.sha256(b).hexdigest()
def slug(s): return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def write(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
def round_coords(v):
    return [round(x,7) for x in v[:2]] if v and isinstance(v[0],(int,float)) else [round_coords(x) for x in v]
def feature(p,g): return {'type':'Feature','properties':p,'geometry':g}
def collection(fs): return {'type':'FeatureCollection','features':fs}
def kml_records(name):
    doc=ET.parse(CACHE/(name+'.kml'))
    result=[]
    for folder in doc.findall('.//k:Folder',NS):
        folder_name=folder.findtext('k:name',default='',namespaces=NS).strip()
        for pm in folder.findall('k:Placemark',NS):
            name=pm.findtext('k:name',default='',namespaces=NS).strip()
            if not name: continue
            point=pm.find('k:Point/k:coordinates',NS)
            line=pm.find('k:LineString/k:coordinates',NS)
            if point is not None:
                coords=round_coords(list(map(float,point.text.strip().split(',')[:2])))
                result.append((folder_name,name,{'type':'Point','coordinates':coords}))
            elif line is not None:
                coords=round_coords([list(map(float,p.split(',')[:2])) for p in line.text.split()])
                result.append((folder_name,name,{'type':'LineString','coordinates':coords}))
    return result

def distance(point,lines):
    # Local equirectangular distance for QA only; displayed geometry is unprojected source data.
    sx=111320*math.cos(math.radians(point[1]));sy=111320
    px,py=point[0]*sx,point[1]*sy
    best=float('inf')
    for line in lines:
        for a,b in zip(line,line[1:]):
            ax,ay=a[0]*sx,a[1]*sy;bx,by=b[0]*sx,b[1]*sy
            dx,dy=bx-ax,by-ay
            t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy))) if dx or dy else 0
            best=min(best,math.hypot(px-ax-t*dx,py-ay-t*dy))
    return best

def main(refresh=False):
    CACHE.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    downloads={'stations.csv':SHEET}
    for name,shape in SHAPES.items():
        downloads[name+'-shape.json']='https://data.edmonton.ca/resource/ctwr-tvrd.json?'+urllib.parse.urlencode({'shape_id':shape,'$select':'shape_id,trip_headsign,geometry_line,line_length','$limit':1})
    for name,(mid,_) in PROJECTS.items(): downloads[name+'.kml']='https://www.google.com/maps/d/kml?mid='+mid+'&forcekml=1'
    if refresh:
        for file,url in downloads.items():
            (CACHE/file).write_bytes(urllib.request.urlopen(url,timeout=90).read())
    operating=[]; source_audit=[]; operating_lines={}
    for line,shape_id in SHAPES.items():
        row=json.loads((CACHE/(line+'-shape.json')).read_text())[0]
        geometry={'type':row['geometry_line']['type'],'coordinates':round_coords(row['geometry_line']['coordinates'])}
        operating_lines[line]=geometry['coordinates']
        operating.append(feature({'kind':'transit_route','id':'lrt-'+line,'name':line.title()+' Line','lineId':line,'status':'operating','geometryQuality':'official','sourceUrl':TRIPS_PAGE,'sourceShapeId':shape_id},geometry))
    rows=list(csv.DictReader((CACHE/'stations.csv').open()))
    distances=[]
    for row in rows:
        name=row['LRT Station Name'].strip()
        ids=[s.strip().lower() for s in row['LRT Lines'].split(';')]
        if name=='Churchill': name='Churchill (underground)'
        p={'kind':'transit_station','id':'lrt-station-'+slug(name),'name':name,'lineIds':ids,'status':'operating','geometryQuality':'official','sourceUrl':STATIONS_PAGE,'sourceStopNumbers':row['Stop Numbers'],'stationType':row['Type']}
        coords=[float(row['Longitude']),float(row['Latitude'])]
        if name=='NAIT/Blatchford Market':
            p.update(locationNote='采用市府车站查询页面的位置点；点位可能表示站口附近。',locationNoteEn='Location from the City station locator; the point may represent a nearby station access.')
        operating.append(feature(p,{'type':'Point','coordinates':coords}))
        distances.append({'station':name,'metres':round(min(distance(coords,operating_lines[k]) for k in ids),2)})
    planned=[]; route_parts={k:[] for k in PHASES}; excluded=[]
    def add_station(name,g,phase,project):
        p={**PHASES[phase],'kind':'transit_station','id':'lrt-planned-'+slug(name),'name':name,'lineIds':[PHASES[phase]['lineId']],'phase':phase,'sourceUrl':PROJECTS[project][1],'geometryQuality':'schematic','locationNote':'市府项目地图示意位置；线路、站位及名称可能调整。','locationNoteEn':'Schematic location from the City project map; alignments, station locations and names may change.'}
        p.pop('lineId')
        if phase=='metro-gate':p.update(note='车站已建成；达到市府公交服务标准后才会开放。当前无客运服务。',noteEn='Construction is complete. Passenger service will begin only when City Transit Service Standards are met; this station is not open.')
        planned.append(feature(p,g))
    for folder,name,g in kml_records('valley-west'):
        if folder=='Valley Line: West LRT Line' and g['type']=='LineString':route_parts['valley-west'].append(g['coordinates'])
        elif folder=='Valley Line: West' and g['type']=='Point' and re.search(r' (Stop|Station)$',name):add_station(re.sub(r' (Stop|Station)$','',name),g,'valley-west','valley-west')
        else:excluded.append({'source':'valley-west','name':name,'reason':'Not current route/station layer; bridges, parking, transit centres and superseded proposed-change markers excluded.'})
    for folder,name,g in kml_records('capital-south'):
        if folder=='Capital Line South Extension (Phase 1)' and g['type']=='LineString':route_parts['capital-south-1'].append(g['coordinates'])
        elif folder=='Concept Design':
            if g['type']=='LineString':route_parts['capital-south-2'].append(g['coordinates'])
            elif 'LRT Station' in name:add_station(name.replace(' LRT Station',''),g,'capital-south-2','capital-south')
        elif folder=='LRT Infrastructure' and 'LRT Station' in name:add_station(name.replace(' LRT Station (at-grade)',''),g,'capital-south-1','capital-south')
        else:excluded.append({'source':'capital-south','name':name,'reason':'Non-station infrastructure excluded.'})
    for _,name,g in kml_records('capital-north'):
        if g['type']=='LineString':route_parts['capital-north'].append(g['coordinates'])
        elif 'Gorman' in name:add_station('Gorman',g,'capital-north','capital-north')
    for folder,name,g in kml_records('metro-nw'):
        if folder=='Metro Line LRT' and g['type']=='LineString':
            phase='metro-nw-2' if name.startswith('Phase 2') else 'metro-nw-3' if name.startswith('Phase 3') else 'metro-gate'
            route_parts[phase].append(g['coordinates'])
        elif folder=='Metro Line: Northwest - LRT Stations' and g['type']=='Point':
            if 'NAIT/' in name:
                excluded.append({'source':'metro-nw','name':name,'reason':'Operating NAIT/Blatchford Market already included from current ETS locator; not a future station.'});continue
            phase='metro-gate' if 'Blatchford Gate' in name else 'metro-nw-3' if any(x in name for x in ['127 Street','137 Street','Campbell Road']) else 'metro-nw-2'
            name=re.sub(r'^(Complete|Design Phase) - ','',name);name=re.sub(r' Station$','',name).strip()
            add_station(name,g,phase,'metro-nw')
        else:excluded.append({'source':'metro-nw','name':name,'reason':'Non-station infrastructure excluded.'})
    for phase,parts in route_parts.items():
        project='metro-nw' if phase.startswith('metro-') else 'capital-south' if phase.startswith('capital-south') else phase
        p={**PHASES[phase],'kind':'transit_route','id':'lrt-'+phase,'name':PHASES[phase]['phaseLabelEn'],'phase':phase,'sourceUrl':PROJECTS[project][1],'geometryQuality':'schematic'}
        if phase=='metro-gate':p.update(note='已建成但尚未提供客运服务的区段。',noteEn='Built infrastructure that is not yet in passenger service.')
        planned.insert(0,feature(p,{'type':'MultiLineString','coordinates':parts}))
    planned_dist=[]
    for f in planned:
        p=f['properties']
        if p['kind']=='transit_station':planned_dist.append({'station':p['name'],'phase':p['phase'],'metres':round(distance(f['geometry']['coordinates'],route_parts[p['phase']]),2)})
    assert len(rows)==30
    assert sum('capital' in f['properties'].get('lineIds',[]) for f in operating)==15
    assert sum('metro' in f['properties'].get('lineIds',[]) for f in operating)==10
    assert sum('valley' in f['properties'].get('lineIds',[]) for f in operating)==12
    assert len(planned_dist)==30
    assert max(x['metres'] for x in distances)<100
    assert max(x['metres'] for x in planned_dist)<150
    for name,data in [('lrt-operating.geojson',collection(operating)),('lrt-planned.geojson',collection(planned))]:write(OUT/name,data)
    for file,url in downloads.items():
        raw=(CACHE/file).read_bytes();source_audit.append({'file':str((CACHE/file).relative_to(ROOT)),'url':url,'retrievedDate':DATE,'bytes':len(raw),'sha256':sha(raw)})
    audit={
      'preparedDate':DATE,'operatingStations':30,'operatingRoutes':3,'lineStationCounts':{'capital':15,'metro':10,'valley':12},'sharedCapitalMetroStations':7,
      'plannedOrNotYetOpenStations':30,'plannedCorridors':7,'plannedStationCountsByPhase':{k:sum(x['phase']==k for x in planned_dist) for k in PHASES},
      'sources':source_audit,'operatingStatusSource':STATIONS_PAGE,'projectStatusSource':CITY+'/projects_plans/transit/lrt-construction-update',
      'licenseUrl':CITY+'/city_government/initiatives_innovation/open-data',
      'operatingStationRouteDistances':distances,'plannedStationRouteDistances':planned_dist,'excludedFeatures':excluded,
      'method':[
       'Operating paths use representative official GTFS trip shapes, retaining their geographic coordinates. Primary northbound Capital/Valley and southbound Metro shapes cover the complete normal service routes, not every scheduled short-turn variant.',
       'The broad LRT Routes dataset rpjw-4jft draws Metro south to Century Park. This was rejected for current service: the current ETS station page and GTFS shape 022R-82-South agree on Health Sciences/Jubilee as the southern terminus.',
       'The LRT Stations and Stops dataset fhxi-cnhe omits the new NAIT/Blatchford Market location. The 30-row table published through the current ETS station-locator page supplies station names, line membership and coordinates instead.',
       'Capital/Metro shared stations appear once with both lineIds. Churchill underground and the Valley street-level Churchill stop remain separate physically distinct points.',
       'Future coordinates come only from official City project maps embedded on current project pages. All are marked schematic, not final engineering survey positions.',
       'Valley West and Capital South Phase 1 are construction, not operating. Blatchford Gate is built but remains closed until service standards are met. Metro Northwest Phase 2 has land-acquisition funding but no secured construction funding; phases marked unfunded refer to construction.',
       'Proposed-change layers, park-and-ride markers, bridges and transit-centre markers are excluded from station counts. NAIT/Blatchford is not duplicated as future. Station and line names may change as projects advance.',
       'This is a dated infrastructure snapshot, not real-time service or disruption information. No speculative route or station coordinates were invented.',
      ],
      'files':{name:{'bytes':(OUT/name).stat().st_size,'sha256':sha((OUT/name).read_bytes())} for name in ['lrt-operating.geojson','lrt-planned.geojson']},
    }
    (ROOT/'data/audit/transit-context.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'operatingStations':30,'futureStations':30,'operatingMaxDistanceM':max(x['metres'] for x in distances),'futureMaxDistanceM':max(x['metres'] for x in planned_dist),'files':audit['files']},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--refresh',action='store_true');args=parser.parse_args();main(args.refresh)
