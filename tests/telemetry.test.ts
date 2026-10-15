import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAlerts, parseFlights, parseRadar, parseStorms, parseVesselLocation, parseVessels } from '../src/lib/telemetry';

const time=1792025400;
const row=(id='abc123',overrides:Record<number,unknown>={})=>Object.assign([id,' TEST123 ','United States',time-3,time-1,-74,41,10000,false,230,90,0,null,10500,'1234',false,0],overrides);
test('aircraft parsing excludes ground, missing coordinates and stale positions without coercing null to zero',()=>{
  const r=parseFlights({time,states:[row(),row('ground',{8:true}),row('missing',{5:null}),row('old',{3:time-150}),row('bad',{6:91}),row('unknown',{7:null,9:null,10:null})]},'live',time*1000);
  assert.equal(r.reported,6);assert.equal(r.airborne,5);assert.equal(r.aircraft.length,2);assert.equal(r.unlocated,2);assert.equal(r.excludedStale,1);
  assert.equal(r.aircraft[0].callsign,'TEST123');assert.equal(r.aircraft[1].altitudeM,null);assert.equal(r.aircraft[1].speedMps,null);assert.equal(r.aircraft[1].track,null);
  assert.equal(r.time,time);assert.equal(r.aircraft[0].positionTime,time-3);
});
test('duplicate aircraft retain the newest true position and cached reports retain original time',()=>{
  const r=parseFlights({time,states:[row(),row('abc123',{3:time-1,5:12})]},'cached',(time+1200)*1000);
  assert.equal(r.aircraft.length,1);assert.equal(r.aircraft[0].position[0],12);assert.equal(r.transport,'cached');assert.equal(r.time,time);
  assert.throws(()=>parseFlights({states:[]}),/invalid/);
});
test('AIS decodes units, drops invalid sentinel values and expires old positions',()=>{
  const v=parseVesselLocation('123456789',{lon:24,lat:60,time,sog:102.3,cog:360,heading:511,navStat:0},{name:' VESSEL ',type:80,destination:' HELSINKI '})!;
  assert.equal(v.shipType,'Tanker');assert.equal(v.name,'VESSEL');assert.equal(v.destination,'HELSINKI');assert.equal(v.speedKnots,null);assert.equal(v.heading,null);assert.equal(v.track,null);
  const f=(timestamp:number)=>({mmsi:123456789,geometry:{type:'Point',coordinates:[24,60]},properties:{mmsi:123456789,timestampExternal:timestamp*1000,sog:5,cog:12,heading:20}});
  assert.equal(parseVessels({features:[f(time-950)]},[],time*1000).length,0);
  assert.equal(parseVessels({features:[f(time-10)]},[],time*1000)[0].positionTime,time-10);
});
test('radar accepts only provider-owned HTTPS hosts and valid frame paths',()=>{
  const r=parseRadar({host:'https://tilecache.rainviewer.com',generated:time,radar:{past:[{time:time-600,path:'/v2/radar/abc123'},{time:time-1200,path:'/v2/radar/456'}]}});
  assert.equal(r.frames.at(-1)!.time,time-600);
  assert.throws(()=>parseRadar({host:'https://evil.example',generated:time,radar:{past:r.frames}}),/invalid/);
  assert.throws(()=>parseRadar({host:r.host,generated:time,radar:{past:[{time,path:'//evil.example'}]}}),/No radar/);
});
test('only actual unexpired severe/extreme alerts with geographic polygons are rendered',()=>{
  const p={id:'alert',status:'Actual',severity:'Severe',sent:new Date((time-60)*1000).toISOString(),expires:new Date((time+600)*1000).toISOString(),event:'Thunderstorm warning',areaDesc:'Area'};
  const g={type:'Polygon',coordinates:[[[-100,30],[-99,30],[-99,31],[-100,30]]]};
  const features=[{properties:p,geometry:g},{properties:{...p,status:'Test'},geometry:g},{properties:{...p,severity:'Minor'},geometry:g},{properties:{...p,expires:new Date((time-1)*1000).toISOString()},geometry:g},{properties:p,geometry:null}];
  const r=parseAlerts({features},time*1000);assert.equal(r.length,1);assert.equal(r[0].source,'NWS');assert.equal(r[0].sent,time-60);
});
test('global storm markers use the latest reported point, never the current clock as their observation time',()=>{
  const e={id:'EONET_1',title:'Storm',closed:null,categories:[{id:'severeStorms'}],geometry:[{type:'Point',coordinates:[100,10],date:new Date((time-3600)*1000).toISOString()},{type:'Point',coordinates:[101,11],date:new Date((time-1800)*1000).toISOString()}]};
  const r=parseStorms({events:[e]},time*1000);assert.equal(r.length,1);assert.deepEqual(r[0].position,[101,11]);assert.equal(r[0].sent,time-1800);assert.equal(r[0].track?.length,2);
  assert.equal(parseStorms({events:[e]},(time+4*86400)*1000).length,0);
});
