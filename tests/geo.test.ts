import test from 'node:test';
import assert from 'node:assert/strict';
import { greatCircle, nightPolygon, pointAlongLine, solarAltitude, solarPosition } from '../src/lib/geo';
import { routes, signals, SNAPSHOT_DATE } from '../src/data/snapshot';

test('solar ephemeris puts the sun above the equator at the March equinox',()=>{
  const sun=solarPosition(new Date('2026-03-20T14:46:00Z'));
  assert.ok(Math.abs(sun.latitude)<0.1);
  assert.ok(sun.longitude< -38 && sun.longitude> -43);
});
test('solstice declinations and opposite hemispheres have the correct sign',()=>{
  for(const [date,sign] of [['2026-06-21T12:00:00Z',1],['2026-12-21T12:00:00Z',-1]] as const){
    const d=new Date(date),sun=solarPosition(d);
    assert.ok(sun.latitude*sign>23.3 && sun.latitude*sign<23.6);
    assert.ok(solarAltitude([sun.longitude,sun.latitude],d)>89.99);
    assert.ok(solarAltitude([sun.longitude+180,-sun.latitude],d)<-89.99);
  }
});
test('the day/night boundary lies on the solar horizon throughout the year',()=>{
  for(const month of ['01','03','06','09','10','12']){
    const d=new Date(`2026-${month}-14T16:00:00Z`),polygon=nightPolygon(d).geometry.coordinates[0];
    assert.deepEqual(polygon[0],polygon.at(-1));
    for(const p of polygon.slice(1,-2)) assert.ok(Math.abs(solarAltitude(p as [number,number],d))<0.001);
  }
});
test('great circle crosses the Pacific without a map-spanning dateline jump',()=>{
  const line=greatCircle([-122.38,37.62],[139.78,35.55]);
  assert.ok(line.some(p=>p[1]>40));
  for(let i=1;i<line.length;i++)assert.ok(Math.abs(line[i][0]-line[i-1][0])<5);
  assert.ok(Math.abs(line.at(-1)![0]+220.22)<0.001);
});
test('route interpolation preserves endpoints and wraps animation progress',()=>{
  assert.deepEqual(pointAlongLine([[0,0],[10,0]],0).point,[0,0]);
  assert.deepEqual(pointAlongLine([[0,0],[10,0]],0.5).point,[5,0]);
  assert.deepEqual(pointAlongLine([[0,0],[10,0]],1.5).point,[5,0]);
  assert.equal(pointAlongLine([[0,0],[10,0]],0.5).bearing,90);
});
test('research index has unique identities, bounded locations, dated sources, and valid connections',()=>{
  const ids=signals.map(s=>s.id);assert.equal(new Set(ids).size,signals.length);
  assert.equal(signals.length,21);
  for(const s of signals){
    assert.ok(s.coordinates[0]>=-180 && s.coordinates[0]<=180);
    assert.ok(s.coordinates[1]>=-90 && s.coordinates[1]<=90);
    assert.ok(s.evidence.published<=SNAPSHOT_DATE);
    assert.equal(new URL(s.evidence.url).protocol,'https:');
    assert.ok(s.evidence.period.trim().length>0 && s.caveat.trim().length>0,`${s.id} must carry its period and limitations`);
    for(const id of s.related)assert.ok(ids.includes(id),`${s.id} → ${id}`);
  }
  for(const r of routes){assert.ok(ids.includes(r.related));assert.ok(r.note.toLowerCase().match(/illustrative|schematic/));}
});
