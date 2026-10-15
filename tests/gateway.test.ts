import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';

test('free gateway restricts origins and upstreams, retains source time, and caches quota failures',async()=>{
  const originalFetch=globalThis.fetch,originalCaches=Object.getOwnPropertyDescriptor(globalThis,'caches');
  const stored=new Map<string,Response>();const pending:Promise<unknown>[]=[];
  Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{match:async(r:Request)=>stored.get(r.url)?.clone(),put:async(r:Request,s:Response)=>{stored.set(r.url,s.clone());}}}});
  const context={waitUntil:(p:Promise<unknown>)=>pending.push(p)};
  const request=(path:string,origin='https://arpit-sidana.github.io')=>new Request(`https://mts.example/${path}`,{headers:{Origin:origin}});
  let upstreamCalls=0,mode='ok';
  globalThis.fetch=async(input)=>{
    upstreamCalls++;assert.equal(String(input),'https://opensky-network.org/api/states/all');
    return mode==='quota'?new Response('Quota exceeded',{status:429,headers:{'X-Rate-Limit-Retry-After-Seconds':'600'}}):Response.json({time:1234567890,states:[]},{headers:{'x-rate-limit-remaining':'396'}});
  };
  try{
    assert.equal((await worker.fetch(request('flights','https://untrusted.example'),{},context)).status,403);
    assert.equal((await worker.fetch(request('https://evil.example'),{},context)).status,404);assert.equal(upstreamCalls,0);
    const response=await worker.fetch(request('flights'),{},context);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://arpit-sidana.github.io');
    assert.equal((await response.json()).time,1234567890);await Promise.all(pending);
    await worker.fetch(request('flights'),{},context);assert.equal(upstreamCalls,1);
    stored.clear();mode='quota';
    const limited=await worker.fetch(request('flights'),{},context);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'600');
    await Promise.all(pending);const again=await worker.fetch(request('flights'),{},context);assert.equal(again.status,429);assert.equal(upstreamCalls,2);
    const health=await (await worker.fetch(request('health'),{},context)).json();assert.equal(health.paidFallback,false);assert.ok(Math.abs(health.serverTime-Date.now())<1000);
  }finally{globalThis.fetch=originalFetch;if(originalCaches)Object.defineProperty(globalThis,'caches',originalCaches);else delete (globalThis as unknown as {caches?:unknown}).caches;}
});
