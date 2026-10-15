import type { Page } from '@playwright/test';
export async function mockTelemetry(page: Page, fail=false) {
  const time=Math.floor(Date.now()/1000);
  const flight=["abc123","MTS123  ","United States",time-2,time-1,32,18,10000,false,230,90,0,null,10500,"1234",false,0];
  await page.route('**/live/flights.json',r=>fail?r.fulfill({status:503,body:'Unavailable'}):r.fulfill({json:{time,states:[flight]}}));
  await page.route('https://meri.digitraffic.fi/api/ais/v1/locations',r=>r.fulfill({json:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[24.9,60.1]},properties:{mmsi:123456789,timestampExternal:(time-3)*1000,sog:10,cog:20,heading:22,navStat:0}}]}}));
  await page.route('https://meri.digitraffic.fi/api/ais/v1/vessels',r=>r.fulfill({json:[{mmsi:123456789,name:'MTS TEST SHIP',shipType:80,destination:'HELSINKI'}]}));
  await page.routeWebSocket('wss://meri.digitraffic.fi/mqtt',ws=>ws.close());
  await page.route('https://api.rainviewer.com/public/weather-maps.json',r=>fail?r.fulfill({status:503,body:'Unavailable'}):r.fulfill({json:{host:'https://tilecache.rainviewer.com',generated:time,radar:{past:[{time:time-600,path:'/v2/radar/testframe'}]}}}));
  const transparentPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
  await page.route('https://tilecache.rainviewer.com/**',r=>r.fulfill({contentType:'image/png',body:transparentPng}));
  await page.route('https://api.weather.gov/alerts/**',r=>r.fulfill({json:{type:'FeatureCollection',features:[{type:'Feature',id:'https://api.weather.gov/alerts/test',geometry:{type:'Polygon',coordinates:[[[-100,30],[-99,30],[-99,31],[-100,30]]]},properties:{id:'test-alert',status:'Actual',severity:'Severe',sent:new Date((time-60)*1000).toISOString(),expires:new Date((time+600)*1000).toISOString(),event:'Severe Thunderstorm Warning',areaDesc:'Test area',description:'Test-only alert fixture',instruction:'Test-only instruction'}}]}}));
  await page.route('https://eonet.gsfc.nasa.gov/**',r=>r.fulfill({json:{events:[{id:'EONET_TEST',title:'Tropical Storm Test',closed:null,categories:[{id:'severeStorms'}],geometry:[{type:'Point',coordinates:[100,10],date:new Date((time-3600)*1000).toISOString()}]}]}}));
}
