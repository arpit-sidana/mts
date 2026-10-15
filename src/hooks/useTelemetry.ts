import { useEffect, useState } from 'react';
import { emptyFeed, parseAlerts, parseFlights, parseRadar, parseStorms, parseVesselLocation, parseVessels, shipType, type Aircraft, type Feed, type FlightReport, type RadarReport, type Vessel, type WeatherEvent } from '../lib/telemetry';

// This is a public, fixed-upstream API gateway, never a credential or an open proxy.
export const TELEMETRY_URL = (import.meta.env.VITE_TELEMETRY_URL || '').replace(/\/$/,'');
const api=(path:string,direct:string)=>TELEMETRY_URL?`${TELEMETRY_URL}/${path}`:direct;
async function getJson(url:string,signal:AbortSignal): Promise<unknown> {
  const res=await fetch(url,{signal,headers:{Accept:'application/json'}});
  if(!res.ok){
    const retry=res.headers.get('Retry-After');
    throw new Error(res.status===429?`Free provider quota reached${retry?`; retry after ${retry}s`:''}. No paid fallback is used.`:`Provider returned HTTP ${res.status}.`);
  }
  return res.json();
}
function usePolling<T>(enabled:boolean,interval:number,load:(signal:AbortSignal)=>Promise<T>,classify?:(data:T)=>'live'|'delayed') {
  const [feed,setFeed]=useState<Feed<T>>(emptyFeed);
  useEffect(()=>{
    if(!enabled){setFeed(f=>({...f,status:'off'}));return;}
    let alive=true,busy=false; const controllers=new Set<AbortController>();
    const run=async()=>{
      if(busy||document.hidden)return;busy=true;
      const controller=new AbortController();controllers.add(controller);
      const timeout=setTimeout(()=>controller.abort(),25000);
      setFeed(f=>({...f,status:f.data?f.status:'loading'}));
      try{const data=await load(controller.signal);if(alive)setFeed({data,status:classify?.(data)??'live',error:'',receivedAt:Date.now()});}
      catch(e){if(alive)setFeed(f=>({...f,status:f.data?'delayed':'unavailable',error:e instanceof Error?e.message:'Provider unavailable.'}));}
      finally{clearTimeout(timeout);controllers.delete(controller);busy=false;}
    };
    const first=setTimeout(run,200),timer=setInterval(run,interval);
    const visible=()=>{if(!document.hidden)run();};document.addEventListener('visibilitychange',visible);
    return()=>{alive=false;clearTimeout(first);clearInterval(timer);controllers.forEach(c=>c.abort());document.removeEventListener('visibilitychange',visible);};
    // Provider definitions are module-stable, not user-controlled callback dependencies.
  },[enabled,interval]);
  return feed;
}
const loadFlights=async(signal:AbortSignal)=>{
  if(TELEMETRY_URL){
    try{return parseFlights(await getJson(`${TELEMETRY_URL}/flights`,signal),'live');}
    catch(error){
      if(signal.aborted)throw error;
      const cached=parseFlights(await getJson(`${import.meta.env.BASE_URL}live/flights.json`,signal),'cached');
      if(Date.now()/1000-cached.time>3600)throw error;
      cached.gatewayError=error instanceof Error?error.message:'Live gateway unavailable.';
      return cached;
    }
  }
  return parseFlights(await getJson(`${import.meta.env.BASE_URL}live/flights.json`,signal),'cached');
};
const flightClassification=(r:FlightReport)=>r.transport==='cached'||Date.now()/1000-r.time>120?'delayed' as const:'live' as const;
const loadRadar=async(signal:AbortSignal)=>parseRadar(await getJson(api('radar','https://api.rainviewer.com/public/weather-maps.json'),signal));
const loadAlerts=async(signal:AbortSignal)=>parseAlerts(await getJson(api('alerts','https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe'),signal));
const loadStorms=async(signal:AbortSignal)=>parseStorms(await getJson(api('storms','https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=severeStorms&days=14&limit=100'),signal));

export function useTelemetry(options:{flights:boolean;ships:boolean;weather:boolean}) {
  const flights=usePolling(options.flights,60000,loadFlights,flightClassification);
  const radar=usePolling(options.weather,120000,loadRadar,r=>Date.now()/1000-r.frames.at(-1)!.time>1800?'delayed':'live');
  const alerts=usePolling(options.weather,120000,loadAlerts);
  const storms=usePolling(options.weather,300000,loadStorms);
  const vessels=useVessels(options.ships);
  return {flights,radar,alerts,storms,vessels};
}
export type Telemetry = ReturnType<typeof useTelemetry>;
export type SelectedObservation = {kind:'aircraft';data:Aircraft}|{kind:'vessel';data:Vessel}|{kind:'weather';data:WeatherEvent};

let metadataCache:{time:number;data:Record<string,unknown>[]} | null=null;
function useVessels(enabled:boolean):Feed<Vessel[]> & {streaming:boolean} {
  const [feed,setFeed]=useState<Feed<Vessel[]>&{streaming:boolean}>({...emptyFeed<Vessel[]>(),streaming:false});
  useEffect(()=>{
    if(!enabled){setFeed(f=>({...f,status:'off',streaming:false}));return;}
    let alive=true,dirty=false,streaming=false,lastMessage=0,client:import('mqtt').MqttClient|null=null;
    const abort=new AbortController(),vessels=new Map<string,Vessel>(),metadata=new Map<string,Record<string,unknown>>();
    const flush=()=>{
      if(!alive)return;
      const now=Date.now()/1000;
      for(const [id,v] of vessels)if(now-v.positionTime>900)vessels.delete(id);
      if(dirty){dirty=false;setFeed({data:[...vessels.values()],status:'live',error:'',receivedAt:Date.now(),streaming:streaming&&Date.now()-lastMessage<45000});}
    };
    const bootstrap=async()=>{
      setFeed(f=>({...f,status:f.data?'delayed':'loading'}));
      try{
        const data=await getJson(api('ships','https://meri.digitraffic.fi/api/ais/v1/locations'),abort.signal);
        for(const v of parseVessels(data,[...metadata.values()]))if(!vessels.has(v.id)||vessels.get(v.id)!.positionTime<v.positionTime)vessels.set(v.id,v);
        dirty=true;flush();
      }catch(e){if(alive)setFeed(f=>({...f,status:f.data?'delayed':'unavailable',error:e instanceof Error?e.message:'AIS unavailable.'}));}
    };
    const start=async()=>{
      await bootstrap();if(!alive)return;
      try{
        const meta=metadataCache&&Date.now()-metadataCache.time<3600000?metadataCache.data:await getJson(api('ship-metadata','https://meri.digitraffic.fi/api/ais/v1/vessels'),abort.signal);
        if(Array.isArray(meta)){
          metadataCache={time:Date.now(),data:meta};for(const m of meta)metadata.set(String(m.mmsi),m);
          for(const [id,v] of vessels){const m=metadata.get(id);if(m)vessels.set(id,{...v,name:typeof m.name==='string'?m.name.trim():v.name,destination:typeof m.destination==='string'?m.destination.trim():v.destination,shipType:shipType(m.shipType??m.type)});}
          dirty=true;flush();
        }
      }catch{/* Position data is useful even when optional vessel names fail. */}
      if(!alive)return;
      const mqtt=await import('mqtt');if(!alive)return;
      client=mqtt.connect('wss://meri.digitraffic.fi/mqtt',{clientId:`MTS-${crypto.randomUUID()}`,reconnectPeriod:15000,connectTimeout:20000,keepalive:45,clean:true});
      client.on('connect',()=>{streaming=true;client?.subscribe('vessels-v2/+/location');});
      client.on('close',()=>{streaming=false;if(alive)setFeed(f=>({...f,streaming:false}));});
      client.on('error',()=>{streaming=false;});
      client.on('message',(topic,payload)=>{
        try{
          const id=topic.split('/')[1],v=parseVesselLocation(id,JSON.parse(payload.toString()),metadata.get(id));
          if(v && v.positionTime<=Date.now()/1000+30 && (!vessels.has(id)||vessels.get(id)!.positionTime<=v.positionTime)){vessels.set(id,v);dirty=true;lastMessage=Date.now();}
        }catch{/* Ignore malformed messages; never invent a replacement position. */}
      });
    };
    const first=setTimeout(()=>{void start().catch(()=>{if(alive)setFeed(f=>({...f,streaming:false}));});},200);
    const interval=setInterval(bootstrap,60000),batch=setInterval(flush,1000);
    return()=>{alive=false;clearTimeout(first);clearInterval(interval);clearInterval(batch);abort.abort();client?.end(true);};
  },[enabled]);
  return feed;
}
