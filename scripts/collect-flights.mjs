import { mkdir, writeFile } from 'node:fs/promises';

// A scheduled global anonymous query costs 4 credits. At 20-minute intervals,
// 72 scheduled queries/day use 288 of the documented 400 daily credits.
let report;
try {
  const response = await fetch('https://opensky-network.org/api/states/all', {
    headers: { 'User-Agent': 'MTS/0.2 (https://github.com/arpit-sidana/mts)', Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`OpenSky HTTP ${response.status}`);
  const data = await response.json();
  if (!Number.isFinite(data.time) || !Array.isArray(data.states) || Math.abs(Date.now()/1000-data.time)>300) throw new Error('Invalid or stale upstream report');
  report={time:data.time,states:data.states,fetchedAt:Date.now(),remaining:response.headers.has('x-rate-limit-remaining')?Number(response.headers.get('x-rate-limit-remaining')):null,attribution:'The OpenSky Network',source:'https://opensky-network.org/api/states/all'};
} catch(error) {
  console.warn(`${error.message}. Preserving the last published timestamp if available.`);
  try {
    const previous=await fetch('https://arpit-sidana.github.io/mts/live/flights.json',{signal:AbortSignal.timeout(15000)});
    if(!previous.ok)throw new Error('No prior report');
    const data=await previous.json();
    if(!Number.isFinite(data.time)||!Array.isArray(data.states))throw new Error('Invalid prior report');
    report={...data,collectionError:error.message};
  } catch { report={error:'Aircraft feed is currently unavailable. No synthetic positions are substituted.'}; }
}
await mkdir('public/live',{recursive:true});
await writeFile('public/live/flights.json',JSON.stringify(report));
console.log(report.states?`Saved ${report.states.length} observed aircraft states at ${new Date(report.time*1000).toISOString()}.`:'Saved an explicit unavailable state.');
