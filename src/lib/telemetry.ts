import type { Position } from '../data/snapshot';

export interface Aircraft {
  id: string; callsign: string; country: string; position: Position; positionTime: number;
  altitudeM: number | null; speedMps: number | null; track: number | null; verticalMps: number | null;
  squawk: string | null; positionSource: string;
}
export interface FlightReport {
  time: number; receivedAt: number; aircraft: Aircraft[]; reported: number; airborne: number;
  unlocated: number; excludedStale: number; transport: 'live' | 'cached'; remaining: number | null;
  gatewayError?: string;
}
export interface Vessel {
  id: string; name: string; position: Position; positionTime: number; speedKnots: number | null;
  track: number | null; heading: number | null; destination: string; shipType: string; navStatus: string;
}
export interface WeatherEvent {
  id: string; title: string; area: string; severity: string; sent: number; expires: number | null;
  description: string; instruction: string; source: 'NWS' | 'NASA EONET'; url: string;
  position: Position; geometry: GeoJSON.Geometry; track?: Position[];
}
export interface RadarFrame { time: number; path: string }
export interface RadarReport { host: string; frames: RadarFrame[]; generated: number }
export type FeedStatus = 'loading' | 'live' | 'delayed' | 'unavailable' | 'off';
export interface Feed<T> { data: T | null; status: FeedStatus; error: string; receivedAt: number | null }
export const emptyFeed = <T>(): Feed<T> => ({ data: null, status: 'off', error: '', receivedAt: null });
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nullableNumber = (v: unknown) => finite(v) ? v : null;
export function validPosition(lon: unknown, lat: unknown): boolean { return finite(lon) && finite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90; }
export function parseFlights(input: unknown, transport: 'live' | 'cached' = 'live', receivedAt = Date.now()): FlightReport {
  const x = input as { time?: unknown; states?: unknown; remaining?: unknown };
  if (!finite(x?.time) || !Array.isArray(x.states)) throw new Error('The aircraft provider returned an invalid report.');
  const unique = new Map<string, Aircraft>(); let airborne = 0, unlocated = 0, excludedStale = 0;
  for (const row of x.states) {
    if (!Array.isArray(row) || row.length < 17 || typeof row[0] !== 'string' || row[8] !== false) continue;
    airborne++;
    if (!validPosition(row[5], row[6]) || !finite(row[3])) { unlocated++; continue; }
    if (x.time - row[3] > 120 || row[3] - x.time > 30) { excludedStale++; continue; }
    const id = row[0].toLowerCase();
    const item: Aircraft = { id, callsign: typeof row[1] === 'string' ? row[1].trim() : '', country: typeof row[2] === 'string' ? row[2] : 'Unknown', position: [row[5] as number, row[6] as number], positionTime: row[3], altitudeM: nullableNumber(row[7]), speedMps: nullableNumber(row[9]), track: finite(row[10]) && row[10] >= 0 && row[10] < 360 ? row[10] : null, verticalMps: nullableNumber(row[11]), squawk: typeof row[14] === 'string' ? row[14] : null, positionSource: ['ADS-B','ASTERIX','MLAT','FLARM'][row[16] as number] ?? 'Unknown' };
    if (!unique.has(id) || unique.get(id)!.positionTime < item.positionTime) unique.set(id,item);
  }
  return { time:x.time, receivedAt, aircraft:[...unique.values()], reported:x.states.length, airborne, unlocated, excludedStale, transport, remaining:nullableNumber(x.remaining) };
}
const navStatuses = ['Under way using engine','At anchor','Not under command','Restricted manoeuvrability','Constrained by draught','Moored','Aground','Fishing','Under way sailing'];
export function shipType(type: unknown): string {
  if (!finite(type)) return 'Not reported';
  if (type>=70 && type<80) return 'Cargo'; if(type>=80 && type<90)return 'Tanker';
  if(type>=60 && type<70)return 'Passenger'; if(type>=40 && type<50)return 'High-speed craft';
  return ({30:'Fishing',31:'Towing',32:'Towing',33:'Dredging',34:'Diving operations',35:'Military',36:'Sailing',37:'Pleasure craft',50:'Pilot vessel',51:'Search and rescue',52:'Tug',53:'Port tender',55:'Law enforcement'} as Record<number,string>)[type] ?? 'Other / unspecified';
}
export function parseVesselLocation(id: string, p: Record<string,unknown>, meta: Record<string,unknown> = {}): Vessel | null {
  const lon=p.lon,lat=p.lat,ms=finite(p.timestampExternal)?p.timestampExternal:finite(p.time)?p.time*1000:null;
  if(!/^\d{9}$/.test(id) || !validPosition(lon,lat) || ms===null)return null;
  return {id,name:typeof meta.name==='string'?meta.name.trim():'',position:[lon as number,lat as number],positionTime:ms/1000,speedKnots:finite(p.sog)&&p.sog>=0&&p.sog<102.3?p.sog:null,track:finite(p.cog)&&p.cog>=0&&p.cog<360?p.cog:null,heading:finite(p.heading)&&p.heading>=0&&p.heading<360?p.heading:null,destination:typeof meta.destination==='string'?meta.destination.trim():'',shipType:shipType(meta.shipType??meta.type),navStatus:finite(p.navStat)?navStatuses[p.navStat]??'Not reported':'Not reported'};
}
export function parseVessels(input: unknown, metadata: unknown = [], now = Date.now()): Vessel[] {
  const x=input as {features?: unknown};if(!Array.isArray(x?.features))throw new Error('The AIS provider returned an invalid report.');
  const meta=new Map<string,Record<string,unknown>>();
  if(Array.isArray(metadata))for(const m of metadata)if(m && typeof m==='object')meta.set(String(m.mmsi),m);
  const vessels=new Map<string,Vessel>();
  for(const f of x.features){
    const p=f?.properties,c=f?.geometry?.coordinates;
    if(!p || !Array.isArray(c))continue;
    const id=String(p.mmsi??f.mmsi),v=parseVesselLocation(id,{...p,lon:c[0],lat:c[1]},meta.get(id));
    if(v && now/1000-v.positionTime<=900 && v.positionTime-now/1000<=30)vessels.set(id,v);
  }
  return [...vessels.values()];
}
export function parseRadar(input: unknown): RadarReport {
  const x=input as {host?:unknown;radar?:{past?:unknown};generated?:unknown};
  if(typeof x?.host!=='string' || !/^https:\/\/(?:[a-z0-9-]+\.)*rainviewer\.com$/.test(x.host) || !Array.isArray(x.radar?.past) || !finite(x.generated))throw new Error('The radar provider returned an invalid manifest.');
  const frames=x.radar.past.filter((f):f is RadarFrame=>finite(f?.time) && typeof f?.path==='string' && /^\/v2\/radar\/[a-zA-Z0-9_-]+$/.test(f.path)).sort((a,b)=>a.time-b.time);
  if(!frames.length)throw new Error('No radar frames are currently available.');
  return {host:x.host,frames,generated:x.generated};
}
function centerOf(geometry: GeoJSON.Geometry): Position | null {
  if(geometry.type==='Point')return validPosition(...geometry.coordinates.slice(0,2) as [number,number])?geometry.coordinates.slice(0,2) as Position:null;
  const c=geometry.type==='Polygon'?geometry.coordinates[0]:geometry.type==='MultiPolygon'?geometry.coordinates[0]?.[0]:null;
  if(!c?.length)return null; const lons=c.map(p=>p[0]),lats=c.map(p=>p[1]);
  return [(Math.min(...lons)+Math.max(...lons))/2,(Math.min(...lats)+Math.max(...lats))/2];
}
export function parseAlerts(input: unknown, now = Date.now()): WeatherEvent[] {
  const x=input as {features?:unknown};if(!Array.isArray(x?.features))throw new Error('The weather-alert provider returned an invalid report.');
  return x.features.flatMap(f=>{
    const p=f?.properties,g=f?.geometry as GeoJSON.Geometry|null;
    if(!p || p.status!=='Actual' || !['Extreme','Severe'].includes(p.severity) || !g || !['Polygon','MultiPolygon'].includes(g.type))return [];
    const position=centerOf(g),expires=Date.parse(p.ends??p.expires),sent=Date.parse(p.sent);
    if(!position || !Number.isFinite(sent) || !Number.isFinite(expires) || expires<=now)return [];
    return [{id:String(p.id??f.id),title:String(p.event),area:String(p.areaDesc),severity:String(p.severity),sent:sent/1000,expires:expires/1000,description:String(p.description??''),instruction:String(p.instruction??''),source:'NWS' as const,url:typeof f.id==='string'&&f.id.startsWith('https://api.weather.gov/alerts/')?f.id:'https://www.weather.gov/',position,geometry:g}];
  });
}
export function parseStorms(input: unknown, now = Date.now()): WeatherEvent[] {
  const x=input as {events?:unknown};if(!Array.isArray(x?.events))throw new Error('The global storm provider returned an invalid report.');
  return x.events.flatMap(e=>{
    if(e.closed || !Array.isArray(e.geometry) || !e.categories?.some((c:{id:string})=>c.id==='severeStorms'))return [];
    const locations=e.geometry.filter((g:{type:string;coordinates:unknown[];date:string})=>g.type==='Point'&&validPosition(g.coordinates?.[0],g.coordinates?.[1])&&Number.isFinite(Date.parse(g.date))).sort((a:{date:string},b:{date:string})=>Date.parse(a.date)-Date.parse(b.date));
    const g=locations.at(-1);if(!g || now-Date.parse(g.date)>72*3600*1000 || Date.parse(g.date)>now+30000)return [];
    return [{id:String(e.id),title:String(e.title),area:'Global severe-storm event',severity:'Tracked storm',sent:Date.parse(g.date)/1000,expires:null,description:'NASA EONET curated event. Marker is the latest reported point, not a current storm boundary or forecast cone.',instruction:'',source:'NASA EONET' as const,url:`https://eonet.gsfc.nasa.gov/api/v3/events/${encodeURIComponent(String(e.id))}`,position:g.coordinates as Position,geometry:{type:'Point' as const,coordinates:g.coordinates},track:locations.map((g:{coordinates:Position})=>g.coordinates)}];
  });
}
export function ageLabel(seconds: number): string {
  const s=Math.max(0,Math.floor(seconds));return s<60?`${s}s`:s<3600?`${Math.floor(s/60)}m ${s%60}s`:`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`;
}
