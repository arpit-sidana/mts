import type { Position } from '../data/snapshot';
import { Body, EquatorFromVector, GeoVector, RotateVector, Rotation_EQJ_EQD, SiderealTime } from 'astronomy-engine';
const RAD = Math.PI / 180;
export const normalizeLongitude = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;

// Apparent geocentric solar position in the equatorial frame of date, including
// precession, nutation and aberration. No network delay or user-selected time.
export function solarPosition(date: Date): { longitude: number; latitude: number } {
  const equatorial=EquatorFromVector(RotateVector(Rotation_EQJ_EQD(date),GeoVector(Body.Sun,date,true)));
  return {longitude:normalizeLongitude(15*(equatorial.ra-SiderealTime(date))),latitude:equatorial.dec};
}

export function solarAltitude(position: Position, date: Date): number {
  const sun = solarPosition(date);
  return Math.asin(Math.sin(position[1] * RAD) * Math.sin(sun.latitude * RAD) + Math.cos(position[1] * RAD) * Math.cos(sun.latitude * RAD) * Math.cos((position[0] - sun.longitude) * RAD)) / RAD;
}

// Meridian-by-meridian terminator, closed through the winter pole.
export function nightPolygon(date: Date): GeoJSON.Feature<GeoJSON.Polygon> {
  const sun = solarPosition(date);
  const declination = sun.latitude * RAD;
  const pole = declination >= 0 ? -90 : 90;
  const edge: Position[] = [];
  for (let lon = -180; lon <= 180; lon += 1) {
    const tangent=Math.tan(declination);
    const x = -Math.cos((lon - sun.longitude) * RAD) / (Math.abs(tangent) < 1e-7 ? (tangent<0?-1e-7:1e-7) : tangent);
    edge.push([lon, Math.atan(x) / RAD]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-180,pole], ...edge, [180,pole], [-180,pole]]] } };
}

export function greatCircle(start: Position, end: Position, steps = 100): Position[] {
  const toVector = ([lon, lat]: Position) => [Math.cos(lat*RAD)*Math.cos(lon*RAD), Math.cos(lat*RAD)*Math.sin(lon*RAD), Math.sin(lat*RAD)];
  const a=toVector(start), b=toVector(end);
  const angle=Math.acos(Math.max(-1,Math.min(1,a.reduce((sum,v,i)=>sum+v*b[i],0))));
  if(angle < 1e-8) return [start,end];
  let previous = start[0];
  return Array.from({length:steps+1},(_,i)=>{
    const t=i/steps, u=Math.sin((1-t)*angle)/Math.sin(angle), v=Math.sin(t*angle)/Math.sin(angle);
    const p=a.map((x,j)=>u*x+v*b[j]);
    let lon=Math.atan2(p[1],p[0])/RAD;
    while(lon-previous>180) lon-=360;
    while(lon-previous< -180) lon+=360;
    previous=lon;
    return [lon,Math.atan2(p[2],Math.hypot(p[0],p[1]))/RAD] as Position;
  });
}
export function pointAlongLine(coordinates: Position[], t: number): { point: Position; bearing: number } {
  const lengths = coordinates.slice(1).map((p,i)=>Math.hypot((p[0]-coordinates[i][0])*Math.cos((p[1]+coordinates[i][1])*RAD/2),p[1]-coordinates[i][1]));
  const total=lengths.reduce((a,b)=>a+b,0);
  let distance=(((t%1)+1)%1)*total;
  for(let i=0;i<lengths.length;i++){
    if(distance<=lengths[i] || i===lengths.length-1){
      const f=lengths[i] ? distance/lengths[i] : 0, a=coordinates[i],b=coordinates[i+1];
      return {point:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],bearing:Math.atan2((b[0]-a[0])*Math.cos(a[1]*RAD),b[1]-a[1])/RAD};
    }
    distance-=lengths[i];
  }
  return {point:coordinates[0],bearing:0};
}
export function graticule(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[]=[];
  for(let lat=-60;lat<=60;lat+=30) features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:Array.from({length:181},(_,i)=>[-180+i*2,lat])}});
  for(let lon=-180;lon<180;lon+=30) features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:Array.from({length:91},(_,i)=>[lon,-90+i*2])}});
  return {type:'FeatureCollection',features};
}
export function exposureCircle(center: Position, radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: Position[]=Array.from({length:81},(_,i)=>{
    const a=i/80*Math.PI*2;
    return [center[0]+radiusKm/111.32*Math.cos(a)/Math.cos(center[1]*RAD),center[1]+radiusKm/111.32*Math.sin(a)];
  });
  return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[coords]}};
}
