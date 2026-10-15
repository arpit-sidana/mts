import { useMemo, useState } from 'react';
import { ArrowUpRight, CloudRain, Plane, Radar, Ship, Sun, X } from 'lucide-react';
import { ageLabel, type Aircraft, type Vessel, type WeatherEvent } from '../lib/telemetry';
import type { SelectedObservation, Telemetry } from '../hooks/useTelemetry';

export function TelemetryPanel({telemetry:t,now,flights,ships,weather,onIndex}:{telemetry:Telemetry;now:Date;flights:boolean;ships:boolean;weather:boolean;onIndex:(tab:'aircraft'|'vessel'|'weather')=>void}){
  const sec=now.getTime()/1000,report=t.flights.data,latestRadar=t.radar.data?.frames.at(-1);
  return <section className="telemetry-panel" aria-label="Live feed status"><div className="telemetry-heading"><span className="status-dot"/><span>OBSERVATION NETWORK</span><time>{now.toISOString().slice(11,19)} UTC</time></div>
    {flights&&<button className="feed-row" onClick={()=>onIndex('aircraft')}><Plane size={15}/><span><strong>{report?report.aircraft.length.toLocaleString():'—'}<small> aircraft positioned</small></strong><span>OpenSky · global receiver network</span></span><span className={`feed-status ${report&&sec-report.time>120?'delayed':t.flights.status}`}>{report?`${ageLabel(sec-report.time)} old`:t.flights.status}<ArrowUpRight size={11}/></span></button>}
    {ships&&<button className="feed-row" onClick={()=>onIndex('vessel')}><Ship size={15}/><span><strong>{t.vessels.data?t.vessels.data.length.toLocaleString():'—'}<small> vessels observed</small></strong><span>Digitraffic · Finnish AIS coverage</span></span><span className={`feed-status ${t.vessels.status}`}>{t.vessels.streaming?'STREAM':t.vessels.status}<ArrowUpRight size={11}/></span></button>}
    {weather&&<button className="feed-row" onClick={()=>onIndex('weather')}><CloudRain size={15}/><span><strong>{(t.alerts.data?.length??0)+(t.storms.data?.length??0)}<small> alerts / tracked storms</small></strong><span>NWS U.S. alerts · NASA global storms</span></span><span className={`feed-status ${t.radar.status}`}>{latestRadar?`${ageLabel(sec-latestRadar.time)} radar`:t.radar.status}<ArrowUpRight size={11}/></span></button>}
    <div className="telemetry-foot"><Sun size={11}/><span>Day / night follows current UTC automatically</span></div>
    {flights&&<p className="feed-coverage">{report?.transport==='cached'?'Global aircraft report served from a dated cache. ':''}Counts reflect provider coverage, not every flight or ship on Earth.</p>}
    {flights&&report?.gatewayError&&<p className="feed-error">Live gateway: {report.gatewayError} Showing the dated report.</p>}
    {[flights?t.flights:null,ships?t.vessels:null,weather?t.radar:null,weather?t.alerts:null,weather?t.storms:null].filter(f=>f?.error).map((f,i)=><p className="feed-error" key={i}>{f!.error}</p>)}
  </section>;
}
const utc=(s:number)=>new Date(s*1000).toISOString().replace('T',' ').slice(0,19)+' UTC';
const number=(v:number|null,suffix:string,convert=1)=>v===null?'Not reported':`${Math.round(v*convert).toLocaleString()} ${suffix}`;
export function ObservationDetail({observation:o,now,onLocate}:{observation:SelectedObservation;now:Date;onLocate:()=>void}){
  const d=o.data,isAircraft=o.kind==='aircraft',isVessel=o.kind==='vessel',time='positionTime'in d?d.positionTime:d.sent;
  const a=d as Aircraft,v=d as Vessel,w=d as WeatherEvent;
  return <><span className="category-tag">{isAircraft?<Plane size={13}/>:isVessel?<Ship size={13}/>:<CloudRain size={13}/>} {isAircraft?'OBSERVED AIRCRAFT':isVessel?'OBSERVED AIS VESSEL':w.source+' / '+w.severity.toUpperCase()}</span>
    <h2>{isAircraft?a.callsign||a.id.toUpperCase():isVessel?v.name||`MMSI ${v.id}`:w.title}</h2><div className={`observation-age ${now.getTime()/1000-time>120?'delayed':''}`}><span className="status-dot"/> Reported {ageLabel(now.getTime()/1000-time)} ago</div>
    {isAircraft&&<><p className="detail-note">Actual received position. The marker is held at the last report; it is not extrapolated to an invented current coordinate.</p><dl className="telemetry-grid"><div><dt>ICAO24</dt><dd>{a.id.toUpperCase()}</dd></div><div><dt>Position source</dt><dd>{a.positionSource}</dd></div><div><dt>Barometric altitude</dt><dd>{number(a.altitudeM,'ft',3.28084)}</dd></div><div><dt>Ground speed</dt><dd>{number(a.speedMps,'kt',1.94384)}</dd></div><div><dt>True ground track</dt><dd>{number(a.track,'°')}</dd></div><div><dt>Vertical speed</dt><dd>{number(a.verticalMps,'ft/min',196.8504)}</dd></div><div><dt>Transponder country</dt><dd>{a.country}</dd></div><div><dt>Squawk</dt><dd>{a.squawk??'Not reported'}</dd></div></dl><p className="detail-note">Transponder country is not departure or destination. This feed does not supply verified flight routes or passenger counts.</p></>}
    {isVessel&&<><p className="detail-note">Actual AIS report from the Finnish coastal receiver network. Coverage is regional; this is not a global ship count.</p><dl className="telemetry-grid"><div><dt>MMSI</dt><dd>{v.id}</dd></div><div><dt>Vessel type</dt><dd>{v.shipType}</dd></div><div><dt>Speed over ground</dt><dd>{number(v.speedKnots,'kt')}</dd></div><div><dt>Course over ground</dt><dd>{number(v.track,'°')}</dd></div><div><dt>Heading</dt><dd>{number(v.heading,'°')}</dd></div><div><dt>Navigation status</dt><dd>{v.navStatus}</dd></div></dl><div className="detail-section"><span className="eyebrow">AIS DESTINATION / SELF-REPORTED</span><p>{v.destination||'Not reported'}</p></div></>}
    {!isAircraft&&!isVessel&&<><p>{w.area}</p><div className="alert-description">{w.description}</div>{w.instruction&&<div className="detail-note">{w.instruction}</div>}{w.expires&&<p className="report-date">Ends {utc(w.expires)}</p>}<p className="detail-note">{w.source==='NWS'?'Official U.S. alert polygon. Some warnings have no geometry and cannot be placed on this map.':'Curated storm location; updates can be hours apart. Dotted track joins reported points and is not a forecast.'}</p></>}
    <button className="primary-button" onClick={onLocate}>Inspect this location<ArrowUpRight size={14}/></button>
    <div className="detail-section source-detail"><span className="eyebrow">SOURCE OBSERVATION TIME</span><span className="report-date">{utc(time)}</span><p className="detail-note">{d.position[1].toFixed(5)}°, {d.position[0].toFixed(5)}° · received coordinates</p><a href={isAircraft?'https://opensky-network.org/':isVessel?'https://www.digitraffic.fi/en/marine-traffic/':w.url} target="_blank" rel="noreferrer">{isAircraft?'The OpenSky Network':isVessel?'Fintraffic Digitraffic · CC BY 4.0':w.source}<ArrowUpRight size={13}/></a></div>
  </>;
}

export function ObservationIndex({telemetry:t,initialTab,onSelect,now}:{telemetry:Telemetry;initialTab:'aircraft'|'vessel'|'weather';onSelect:(o:SelectedObservation)=>void;now:Date}){
  const [tab,setTab]=useState(initialTab),[query,setQuery]=useState('');
  const aircraft=useMemo(()=>t.flights.data?.aircraft??[],[t.flights.data]);
  const vessels=t.vessels.data??[];const weather=useMemo(()=>[...(t.alerts.data??[]),...(t.storms.data??[])],[t.alerts.data,t.storms.data]);
  const filtered=useMemo(()=>{
    const q=query.toLowerCase();
    return (tab==='aircraft'?aircraft:tab==='vessel'?vessels:weather).filter(item=>JSON.stringify(item).toLowerCase().includes(q));
  },[tab,query,aircraft,vessels,weather]);
  return <><div className="observation-tabs">{(['aircraft','vessel','weather'] as const).map(key=><button key={key} className={tab===key?'active':''} onClick={()=>{setTab(key);setQuery('');}}>{key==='aircraft'?'Aircraft':key==='vessel'?'Ships':'Weather'}</button>)}</div><input className="observation-search" aria-label="Search live observations" placeholder={tab==='aircraft'?'Callsign, ICAO24, transponder country…':tab==='vessel'?'Vessel name, MMSI, destination…':'Storm, alert, or affected area…'} value={query} onChange={e=>setQuery(e.target.value)}/>
    <p className="observation-index-note">{tab==='aircraft'?'Airborne aircraft with valid, recently reported coordinates in OpenSky’s received report. Not a census of world aviation.':tab==='vessel'?'AIS vessels in Finnish coastal receiver coverage. Positions older than 15 minutes are removed.':'NWS severe/extreme alerts with polygons, plus NASA-curated global storms reported within 72 hours.'}</p>
    <div className="observation-index-count">{filtered.length.toLocaleString()} matching observations{filtered.length>200?' · showing first 200; search to narrow':''}</div>
    <div className="observation-list">{filtered.slice(0,200).map(item=><button key={item.id} onClick={()=>onSelect({kind:tab,data:item} as SelectedObservation)}><span><strong>{'callsign'in item?item.callsign||item.id.toUpperCase():'name'in item?item.name||item.id:item.title}</strong><small>{'country'in item?`${item.country} · ${number(item.altitudeM,'ft',3.28084)} · ${number(item.speedMps,'kt',1.94384)}`:'destination'in item?`${item.shipType} · ${item.destination||item.navStatus}`:`${item.source} · ${item.area}`}</small></span><span className="observation-list-age">{ageLabel(now.getTime()/1000-('positionTime'in item?item.positionTime:item.sent))} old</span><ArrowUpRight size={13}/></button>)}</div>
    {!filtered.length&&<p className="observation-index-note">{(tab==='aircraft'?t.flights:tab==='vessel'?t.vessels:t.alerts).error||'No matching observations in the latest available report.'}</p>}
  </>;
}
