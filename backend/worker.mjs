const upstreams = {
  flights: ['https://opensky-network.org/api/states/all', 60],
  ships: ['https://meri.digitraffic.fi/api/ais/v1/locations', 30],
  'ship-metadata': ['https://meri.digitraffic.fi/api/ais/v1/vessels', 3600],
  radar: ['https://api.rainviewer.com/public/weather-maps.json', 120],
  alerts: ['https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe', 90],
  storms: ['https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=severeStorms&days=14&limit=100', 300],
};
const origins = new Set(['https://arpit-sidana.github.io','http://127.0.0.1:5173','http://127.0.0.1:4173']);
export default {
  async fetch(request, env, ctx) {
    const origin=request.headers.get('Origin');
    if(origin&&!origins.has(origin))return new Response('Origin not allowed',{status:403});
    const headers={ 'Access-Control-Allow-Origin':origin||'https://arpit-sidana.github.io', 'Access-Control-Allow-Methods':'GET, OPTIONS', 'Access-Control-Allow-Headers':'Accept', 'Access-Control-Expose-Headers':'X-Source-Time, X-Rate-Limit-Remaining, Retry-After', Vary:'Origin', 'X-Content-Type-Options':'nosniff' };
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers});
    const key=new URL(request.url).pathname.replace(/^\//,'');
    if(key==='health')return Response.json({status:'ok',serverTime:Date.now(),paidFallback:false},{headers:{...headers,'Cache-Control':'no-store'}});
    if(!upstreams[key])return new Response('Not found',{status:404,headers});
    // No caller-supplied upstream URLs or parameters: this cannot be used as an open proxy.
    const [url,ttl]=upstreams[key],cache=caches.default;
    const cacheKey=new Request(`https://mts-cache.internal/${key}`),hit=await cache.match(cacheKey);
    if(hit){const out=new Response(hit.body,hit);Object.entries(headers).forEach(([k,v])=>out.headers.set(k,v));return out;}
    try{
      const upstream=await fetch(url,{headers:{Accept:'application/json','User-Agent':'MTS/0.2 (https://github.com/arpit-sidana/mts)','Accept-Encoding':'gzip'},signal:AbortSignal.timeout(20000)});
      if(!upstream.ok){
        const retry=upstream.headers.get('X-Rate-Limit-Retry-After-Seconds')||upstream.headers.get('Retry-After')||(upstream.status===429?'3600':'60');
        const out=Response.json({error:`Provider returned HTTP ${upstream.status}`,retryAfter:Number(retry),paidFallback:false},{status:upstream.status===429?429:502,headers:{...headers,'Retry-After':retry,'Cache-Control':`public,max-age=${Math.min(Number(retry)||60,3600)}`}});
        ctx.waitUntil(cache.put(cacheKey,out.clone()));return out;
      }
      const remaining=upstream.headers.get('x-rate-limit-remaining');
      // Stream the report instead of parsing thousands of aircraft in the Free
      // worker's 10 ms CPU budget. The browser validates every record.
      const out=new Response(upstream.body,{headers:{...headers,'Content-Type':'application/json','Cache-Control':`public,max-age=${ttl}`,...(remaining?{'X-Rate-Limit-Remaining':remaining}:{}),...(upstream.headers.has('Content-Encoding')?{'Content-Encoding':upstream.headers.get('Content-Encoding')}:{})}});
      ctx.waitUntil(cache.put(cacheKey,out.clone()));return out;
    }catch{return Response.json({error:'Upstream unavailable',paidFallback:false},{status:502,headers:{...headers,'Cache-Control':'no-store'}});}
  },
};
