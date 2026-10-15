import { useCallback, useEffect, useRef, useState, type ElementType } from 'react';
import { Activity, ArrowDown, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Compass, Cpu, Crosshair, Download, Expand, Eye, Globe2, Layers, LocateFixed, Maximize, Menu, Minus, Moon, Orbit, Pause, Pickaxe, Plane, Play, Plus, Radar, Search, Ship, SlidersHorizontal, Sun, Waves, X, Zap, CloudRain } from 'lucide-react';
import Globe, { type GlobeControls } from './components/Globe';
import { categories, routes, signals, SNAPSHOT_DATE, SNAPSHOT_TIME, type Category, type Position, type Signal } from './data/snapshot';
import { normalizeLongitude, solarAltitude, solarPosition } from './lib/geo';

const icons: Record<Category,ElementType>={trade:Ship,compute:Cpu,energy:Zap,minerals:Pickaxe,weather:CloudRain,macro:Activity};
const dateLabel=(s:string)=>new Date(`${s.length===7?s+'-01':s.slice(0,10)}T12:00:00Z`).toLocaleDateString('en-US',{...(s.length===7?{}:{day:'2-digit' as const}),month:'short',year:'numeric',timeZone:'UTC'});
const coordinateLabel=([lon,lat]:Position)=>`${Math.abs(lat).toFixed(2)}° ${lat>=0?'N':'S'}  /  ${Math.abs(normalizeLongitude(lon)).toFixed(2)}° ${normalizeLongitude(lon)>=0?'E':'W'}`;
const primaryIds=['hormuz','abilene','new-england'];

function Toggle({on,onClick,label}: {on:boolean;onClick:()=>void;label:string}) {
  return <button className={`switch ${on?'on':''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick}><span/></button>;
}
function Dialog({title,children,onClose}: {title:string;children:React.ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const old=document.activeElement as HTMLElement;
    (ref.current?.querySelector<HTMLInputElement>('input[autofocus], input') ?? ref.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape')onClose();
      if(e.key==='Tab'){
        const all=Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, a[href], select, [tabindex="0"]')??[]).filter(el=>!el.hasAttribute('disabled'));
        if(!all.length)return;
        if(e.shiftKey && document.activeElement===all[0]){e.preventDefault();all.at(-1)?.focus();}
        else if(!e.shiftKey && document.activeElement===all.at(-1)){e.preventDefault();all[0].focus();}
      }
    };
    document.addEventListener('keydown',key); return()=>{document.removeEventListener('keydown',key);old?.focus();};
  },[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="modal-heading"><span className="eyebrow">MTS / FIELD NOTES</span><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></div><h2>{title}</h2>{children}</div></div>;
}

export default function App() {
  const [active,setActive]=useState<Category[]>(['trade','compute','energy','minerals','macro']);
  const [ships,setShips]=useState(true),[flights,setFlights]=useState(false),[sunlight,setSunlight]=useState(false),[grid,setGrid]=useState(true),[satellite,setSatellite]=useState(false);
  const [playing,setPlaying]=useState(!matchMedia('(prefers-reduced-motion: reduce)').matches),[orbit,setOrbit]=useState(false);
  const [selected,setSelected]=useState<string|null>(null),[selectedRoute,setSelectedRoute]=useState<string|null>(null),[point,setPoint]=useState<Position|null>(null);
  const [camera,setCamera]=useState<{position:Position;zoom:number;bearing:number}>({position:[32,18],zoom:0.9,bearing:0});
  const [dock,setDock]=useState(window.innerWidth>650),[briefing,setBriefing]=useState(true),[focus,setFocus]=useState(false);
  const [dialog,setDialog]=useState<'sources'|'help'|'search'|null>(null),[search,setSearch]=useState(''),[querying,setQuerying]=useState(false),[geoResults,setGeoResults]=useState<{name:string;position:Position}[]>([]),[searchMessage,setSearchMessage]=useState('');
  const [sourceCategory,setSourceCategory]=useState('all');
  const [solarHour,setSolarHour]=useState(16),[currentSun,setCurrentSun]=useState(false),[now,setNow]=useState(new Date()),[toast,setToast]=useState('');
  const controls=useRef<GlobeControls|null>(null);
  const visible=signals.filter(s=>active.includes(s.category));
  const signal=signals.find(s=>s.id===selected), route=routes.find(r=>r.id===selectedRoute);
  const solarTime=currentSun?now.toISOString():`${SNAPSHOT_DATE}T${String(solarHour).padStart(2,'0')}:00:00Z`;
  const sun=solarPosition(new Date(solarTime));
  useEffect(()=>{const id=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id);},[]);
  useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t);}},[toast]);
  const closeDialog=useCallback(()=>setDialog(null),[]);
  const select=(id:string)=>{
    const s=signals.find(x=>x.id===id);if(!s)return;
    setSelected(id);setPoint(null);setSelectedRoute(null);setOrbit(false);setDialog(null);
    setActive(a=>a.includes(s.category)?a:[...a,s.category]);
    controls.current?.fly(s.coordinates,Math.min(s.zoom,5.8));
  };
  const clearSelection=()=>{setSelected(null);setSelectedRoute(null);setPoint(null);};
  const reset=()=>{clearSelection();setOrbit(false);controls.current?.home();};
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)return;
      if((e.key==='k'&&(e.metaKey||e.ctrlKey)) || e.key==='/'){e.preventDefault();setDialog('search');}
      if(dialog)return;
      if(e.key==='Escape'){clearSelection();setFocus(false);}
      if(e.key===' '){e.preventDefault();setPlaying(p=>!p);}
      if(e.key.toLowerCase()==='h')reset();
      if(e.key.toLowerCase()==='f')setFocus(f=>!f);
    };
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  },[dialog]);
  const searchPlaces=async()=>{
    if(search.trim().length<2)return;
    setQuerying(true);setSearchMessage('');setGeoResults([]);
    try {
      const url=new URL('https://nominatim.openstreetmap.org/search');url.searchParams.set('q',search.trim());url.searchParams.set('format','jsonv2');url.searchParams.set('limit','5');
      const res=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!res.ok)throw new Error();
      const places=await res.json() as {display_name:string;lon:string;lat:string}[];
      setGeoResults(places.map(p=>({name:p.display_name,position:[Number(p.lon),Number(p.lat)]})));
      if(!places.length)setSearchMessage('No places found. Try a city, country, or coordinates.');
    } catch {setSearchMessage('Place search is unavailable. You can still search the signal index or navigate the globe.');}
    finally{setQuerying(false);}
  };
  const exportSnapshot=()=>{
    const blob=new Blob([JSON.stringify({title:'MTS research snapshot',snapshotDate:SNAPSHOT_DATE,classification:'Dated reported evidence, announcements, and geographic references; not live telemetry',coordinates:'Representative locations; not precise facilities or assets',signals:visible,routes:routes.filter(r=>r.kind==='ship'?ships:flights),routeClassification:'Hand-authored illustrative corridors; animated positions are not observations'},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`mts-snapshot-${SNAPSHOT_DATE}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setToast('Visible signals and source notes exported');
  };
  const hasDetail=!!(signal||route||point);
  return <main className={`observatory ${focus?'focus-mode':''} ${hasDetail?'has-detail':''}`}>
    <div className="starfield"/><Globe layers={active} ships={ships} flights={flights} sunlight={sunlight} grid={grid} satellite={satellite} playing={playing} orbit={orbit} solarTime={solarTime} selected={selected} onSelect={select} onRoute={id=>{setSelectedRoute(id);setSelected(null);setPoint(null);setOrbit(false);}} onPoint={p=>{setPoint(p);setSelected(null);setSelectedRoute(null);setOrbit(false);}} onCamera={(position,zoom,bearing)=>setCamera({position,zoom,bearing})} onReady={c=>{controls.current=c;}}/>
    <div className="vignette"/>
    <header className="topbar">
      <a className="brand" href="./" onClick={e=>{e.preventDefault();reset();}} aria-label="MTS, return to global view"><span className="brand-symbol"><Globe2 size={28}/><i/></span><span className="wordmark">mts<span className="brand-dot">.</span></span><span className="brand-caption">MONITORING<br/>THE SITUATION</span></a>
      <div className="topbar-center"><span className="status-dot"/> PLANETARY OBSERVATORY <span className="version">/ 01</span></div>
      <nav className="header-actions" aria-label="Main navigation"><button className="search-button" onClick={()=>setDialog('search')} aria-label="Search signals or places"><Search size={15}/><span>Explore</span><kbd>⌘ K</kbd></button><button className="text-button sources-button" onClick={()=>setDialog('sources')}><BookOpen size={15}/><span>Sources</span></button><button className="icon-button" onClick={()=>setDialog('help')} aria-label="How to explore MTS"><CircleHelp size={18}/></button></nav>
    </header>
    <section className="context-heading"><div className="eyebrow"><span className="tiny-cross"/> EARTH / GLOBAL VIEW</div><h1>The world, in motion.</h1><p>Follow the forces shaping what comes next.</p><div className="snapshot-badge"><span className="status-dot amber"/> RESEARCH SNAPSHOT <span>14 OCT 2026</span></div></section>

    <aside className={`layer-dock ${dock?'':'collapsed'}`} aria-label="Map layers">
      <button className="dock-heading" onClick={()=>setDock(d=>!d)} aria-expanded={dock}><span><Layers size={15}/> Layers</span><ChevronDown size={15} className={!dock?'rotate':''}/></button>
      {dock&&<><div className="dock-section-label">ECONOMIC ACTIVITY <span>{visible.length} SIGNALS</span></div><div className="layer-list">{(Object.entries(categories) as [Category,typeof categories[Category]][]).map(([key,cat])=>{const Icon=icons[key];return <button key={key} className={`layer-row ${active.includes(key)?'active':''}`} onClick={()=>setActive(a=>a.includes(key)?a.filter(c=>c!==key):[...a,key])} aria-pressed={active.includes(key)}><span className="layer-icon" style={{color:cat.color}}><Icon size={15}/></span><span>{cat.label}</span><span className="layer-count">{signals.filter(s=>s.category===key).length.toString().padStart(2,'0')}</span><span className="checkbox">{active.includes(key)&&<Check size={10}/>}</span></button>;})}</div><div className="dock-divider"/><div className="dock-section-label">ILLUSTRATIVE MOVEMENT</div><div className="setting-row"><span><Ship size={14}/> Ships</span><Toggle on={ships} onClick={()=>setShips(v=>!v)} label="Illustrative ship movement"/></div><div className="setting-row"><span><Plane size={14}/> Flights</span><Toggle on={flights} onClick={()=>setFlights(v=>!v)} label="Illustrative flight movement"/></div><div className="dock-divider"/><div className="setting-row"><span><Sun size={14}/> Day / night</span><Toggle on={sunlight} onClick={()=>setSunlight(v=>!v)} label="Day and night overlay"/></div><div className="setting-row"><span><Orbit size={14}/> Auto orbit</span><Toggle on={orbit} onClick={()=>{setOrbit(v=>!v);setPlaying(true);if(camera.zoom>3)controls.current?.home();}} label="Automatically orbit the globe"/></div><div className="dock-footnote">Traffic is illustrative. Signals are sourced.</div></>}
    </aside>
    <div className="view-options"><button className={satellite?'':'chosen'} onClick={()=>setSatellite(false)} aria-pressed={!satellite}>Tactical</button><button className={satellite?'chosen':''} onClick={()=>setSatellite(true)} aria-pressed={satellite}>Satellite</button><span/><button className={grid?'chosen grid-control':'grid-control'} onClick={()=>setGrid(v=>!v)} aria-label="Toggle coordinate grid" aria-pressed={grid}><Crosshair size={14}/></button></div>

    <aside className="map-navigation" aria-label="Map navigation"><button aria-label="Reset north and pitch" title="Reset north and pitch" onClick={()=>controls.current?.north()} className="compass-button"><span>N</span><Compass size={23} style={{transform:`rotate(${-camera.bearing}deg)`}}/></button><div className="zoom-buttons"><button aria-label="Zoom in" title="Zoom in" onClick={()=>controls.current?.zoom(1)}><Plus size={18}/></button><button aria-label="Zoom out" title="Zoom out" onClick={()=>controls.current?.zoom(-1)}><Minus size={18}/></button></div><button aria-label="Return to global view" title="Global view · H" onClick={reset}><Globe2 size={18}/></button><button aria-label={focus?'Exit focus mode':'Enter focus mode'} title="Focus mode · F" onClick={()=>setFocus(f=>!f)}>{focus?<Eye size={18}/>:<Expand size={18}/>}</button></aside>

    {!hasDetail&&<div className="orbit-note"><span className="orbit-note-line"/><span>ONE PLANET.<br/>COUNTLESS CONNECTIONS.</span><span className="orbit-note-coord">SYS / GEO.01</span></div>}
    {hasDetail&&<aside className="detail-panel" aria-label={signal?'Signal details':route?'Corridor details':'Location details'}><div className="detail-top"><span className="eyebrow">{signal?'SIGNAL INTELLIGENCE':route?'CORRIDOR REFERENCE':'LOCATION INSPECTOR'}</span><button className="icon-button" onClick={clearSelection} aria-label="Close details"><X size={18}/></button></div>
      {signal&&<SignalDetail signal={signal} onSelect={select} onDive={()=>controls.current?.fly(signal.coordinates,signal.zoom)} onStreet={()=>controls.current?.fly(signal.coordinates,16)} solarTime={solarTime}/>}
      {route&&<><span className="category-tag" style={{color:route.kind==='ship'?categories.trade.color:'#91bacd'}}>{route.kind==='ship'?<Ship size={13}/>:<Plane size={13}/>} ILLUSTRATIVE {route.kind==='ship'?'MARITIME':'AIR'} CORRIDOR</span><h2>{route.name}</h2><p>{route.note}</p><div className="detail-note">The moving icons demonstrate the interface. They are not vessel or aircraft observations; positions, speeds, counts, and timing are synthetic.</div><button className="primary-button" onClick={()=>select(route.related)}>Explore related signal <ArrowUpRight size={16}/></button></>}
      {point&&<><span className="category-tag"><LocateFixed size={13}/> SELECTED COORDINATE</span><h2>{coordinateLabel(point)}</h2><p>A closer look at this part of the world.</p><div className="location-sun"><Sun size={16}/>{solarAltitude(point,new Date(solarTime))>0?'Daylight':'Night'} at {currentSun?'current time':`${String(solarHour).padStart(2,'0')}:00 UTC · 14 Oct 2026`}</div><button className="primary-button" onClick={()=>controls.current?.fly(point,Math.min(camera.zoom+3,16))}>Zoom into this location <Maximize size={15}/></button><p className="detail-note">The globe is an open geographic canvas. Only indexed signals carry researched activity; an unmarked location does not mean no activity is occurring.</p></>}
    </aside>}

    {sunlight&&<section className="solar-controls" aria-label="Day and night time"><div><Sun size={14}/><span>SOLAR MODEL</span><button className={currentSun?'current active':'current'} onClick={()=>setCurrentSun(v=>!v)} aria-pressed={currentSun}>{currentSun?'Current time':'Snapshot time'}</button></div><label htmlFor="solar-hour">{currentSun?now.toISOString().slice(11,16):`${String(solarHour).padStart(2,'0')}:00`} UTC <span>{currentSun?now.toISOString().slice(0,10):'14 OCT 2026'}</span></label><input id="solar-hour" aria-label="Snapshot UTC hour" type="range" min="0" max="23" value={solarHour} disabled={currentSun} onChange={e=>setSolarHour(Number(e.target.value))}/><small>Subsolar point {sun.latitude.toFixed(1)}° / {sun.longitude.toFixed(1)}°</small></section>}
    <div className="bottom-zone">
      <div className="bottom-meta"><div className="coordinate-readout"><Crosshair size={12}/><span>{coordinateLabel(camera.position)}</span><span className="zoom-readout" data-zoom={camera.zoom.toFixed(2)}>Z {camera.zoom.toFixed(2)}</span></div><div className="map-hint">DRAG TO ROTATE <span>·</span> SCROLL TO EXPLORE <span>·</span> CLICK TO INVESTIGATE</div><button className="briefing-toggle" onClick={()=>setBriefing(b=>!b)} aria-expanded={briefing}><Radar size={13}/> Field briefing <ChevronDown size={13} className={!briefing?'rotate':''}/></button></div>
      {briefing&&<section className="briefing-strip" aria-label="Field briefing"><div className="briefing-intro"><span className="eyebrow">IN THE FIELD</span><strong>Signals to follow</strong><button onClick={()=>setDialog('search')}>View all {signals.length} <ArrowUpRight size={13}/></button></div>{primaryIds.map((id,i)=>{const s=signals.find(x=>x.id===id)!;const Icon=icons[s.category];return <button key={id} className="briefing-card" onClick={()=>select(id)}><div className="briefing-card-top"><span className="signal-number">0{i+1}</span><span style={{color:categories[s.category].color}}><Icon size={11}/>{categories[s.category].short}</span><ArrowUpRight size={14}/></div><strong>{s.location}</strong><p>{id==='hormuz'?'Energy flows under pressure':id==='abilene'?'The physical footprint of AI':'A changing power mix'}</p><span className="briefing-date">{dateLabel(s.evidence.published)}<i className={s.status==='Disruption'?'disruption':''}/></span></button>;})}</section>}
      <footer className="statusbar"><div><span className="status-dot"/> {visible.length.toString().padStart(2,'0')} INDEXED SIGNALS <span className="footer-divider">/</span> 06 ACTIVITY LAYERS <span className="footer-version">MTS.01</span></div><div className="animation-control"><button aria-label={playing?'Pause animations':'Play animations'} onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={11}/>:<Play size={11}/>}</button><span>{playing?'ANIMATION ON':'ANIMATION PAUSED'}</span><span className="footer-divider">/</span><span className="illustrative-label">ILLUSTRATIVE TRAFFIC</span></div><time>{now.toLocaleTimeString('en-GB',{timeZone:'UTC'})} UTC</time></footer>
    </div>
    {focus&&<button className="exit-focus" onClick={()=>setFocus(false)}><Eye size={14}/> Exit focus <kbd>F</kbd></button>}
    {toast&&<div className="toast" role="status"><Check size={14}/>{toast}</div>}

    {dialog==='search'&&<Dialog title="Explore the situation" onClose={closeDialog}><form className="search-form" onSubmit={e=>{e.preventDefault();searchPlaces();}}><Search size={18}/><input autoFocus placeholder="Search a signal, city, or country…" aria-label="Search signals and places" value={search} onChange={e=>{setSearch(e.target.value);setGeoResults([]);setSearchMessage('');}}/><button type="submit" disabled={querying||search.trim().length<2}>{querying?'Searching…':'Find place'}<ArrowUpRight size={14}/></button></form><div className="search-hint">Indexed signals search instantly. “Find place” searches OpenStreetMap.</div>{searchMessage&&<p role="status" className="search-message">{searchMessage}</p>}{geoResults.length>0&&<div className="search-results"><span className="eyebrow">PLACES / OPENSTREETMAP</span>{geoResults.map((r,i)=><button key={i} onClick={()=>{setPoint(r.position);setSelected(null);setSelectedRoute(null);setDialog(null);setOrbit(false);controls.current?.fly(r.position,7);}}><LocateFixed size={16}/><span>{r.name}</span><ArrowUpRight size={14}/></button>)}</div>}<div className="search-results"><div className="search-results-heading"><span className="eyebrow">SIGNAL INDEX</span><span>{signals.filter(s=>`${s.title} ${s.location} ${s.category} ${s.summary}`.toLowerCase().includes(search.toLowerCase())).length} RESULTS</span></div>{signals.filter(s=>`${s.title} ${s.location} ${s.category} ${s.summary}`.toLowerCase().includes(search.toLowerCase())).map(s=>{const Icon=icons[s.category];return <button key={s.id} onClick={()=>select(s.id)}><Icon size={17} style={{color:categories[s.category].color}}/><span><strong>{s.location}</strong><small>{s.title}</small></span><span className="result-status">{s.status}</span><ArrowUpRight size={15}/></button>;})}</div></Dialog>}
    {dialog==='sources'&&<Dialog title="A sourced view of the world." onClose={closeDialog}><p className="modal-description">Researched 14 October 2026. Each signal retains its own report date and observation window. This is a curated index, not a comprehensive census or a live monitoring feed.</p><div className="source-method"><span><BookOpen size={16}/><strong>{new Set(signals.map(s=>s.evidence.url)).size}</strong> source documents</span><span><LocateFixed size={16}/><strong>{signals.length}</strong> representative locations</span></div><div className="source-toolbar"><select aria-label="Filter sources by activity" value={sourceCategory} onChange={e=>setSourceCategory(e.target.value)}><option value="all">All activity layers</option>{Object.entries(categories).map(([key,c])=><option key={key} value={key}>{c.label}</option>)}</select><button className="text-button" onClick={exportSnapshot}><Download size={14}/> Export visible snapshot</button></div><div className="source-list">{signals.filter(s=>sourceCategory==='all'||s.category===sourceCategory).map(s=><article key={s.id}><div><span className="source-color" style={{background:categories[s.category].color}}/><button onClick={()=>select(s.id)}>{s.location}<ArrowUpRight size={12}/></button><span>{dateLabel(s.evidence.published)}</span></div><a href={s.evidence.url} target="_blank" rel="noreferrer">{s.evidence.publisher} · {s.evidence.title}<ArrowUpRight size={12}/></a><small>{s.evidence.period}</small></article>)}</div><div className="method-notes"><h3>How to read this world</h3><p><strong>Evidence:</strong> reported facts, forecasts, announcements, and historical geographic references are labeled separately. Coordinates represent localities or regions unless stated otherwise.</p><p><strong>Movement:</strong> corridors and moving icons are schematic. Their positions and density have no relationship to actual ships or flights.</p><p><strong>Weather:</strong> the Gulf footprint marks a dated energy-exposure report. It is not current weather, radar, or a navigational forecast.</p><p><strong>Sunlight:</strong> a solar ephemeris estimates Earth’s day/night boundary for the selected UTC time. It is independent of the research snapshot.</p><p><strong>Maps:</strong> OpenFreeMap / OpenStreetMap vector mapping and optional Esri imagery load over the internet. Imagery dates vary; the satellite map is not live imagery.</p></div></Dialog>}
    {dialog==='help'&&<Dialog title="A wider perspective." onClose={closeDialog}><p className="modal-description">Move from the planetary view to the places, infrastructure, and corridors that connect the global economy.</p><div className="help-grid"><div><Globe2/><h3>Explore the planet</h3><p>Drag to rotate. Scroll or pinch to zoom. Right-drag to change bearing and pitch. Click any coordinate for a closer view.</p></div><div><Layers/><h3>Reveal connections</h3><p>Toggle economic layers, schematic traffic, the coordinate grid, and the solar day/night model.</p></div><div><Radar/><h3>Investigate a signal</h3><p>Click a map icon or use the searchable index. Read its date, evidence, limitations, and related locations.</p></div><div><BookOpen/><h3>Keep the context</h3><p>Every researched signal links to its source. Announcements remain announcements; animated traffic is illustrative.</p></div></div><div className="keyboard-shortcuts"><span><kbd>⌘ K</kbd> Search</span><span><kbd>H</kbd> Global view</span><span><kbd>F</kbd> Focus</span><span><kbd>Space</kbd> Pause</span><span><kbd>Esc</kbd> Close</span></div></Dialog>}
  </main>;
}

function SignalDetail({signal:s,onSelect,onDive,onStreet,solarTime}:{signal:Signal;onSelect:(id:string)=>void;onDive:()=>void;onStreet:()=>void;solarTime:string}) {
  const category=categories[s.category],Icon=icons[s.category];
  const age=Math.floor((new Date(SNAPSHOT_TIME).getTime()-new Date(s.evidence.published).getTime())/86400000);
  return <><span className="category-tag" style={{color:category.color}}><Icon size={13}/>{category.short}<span className={`signal-status ${s.status==='Disruption'?'disruption':''}`}>{s.status}</span></span><div className="detail-location">{s.location}</div><h2>{s.title}</h2><p className="detail-summary">{s.summary}</p>{s.metric&&<div className="signal-metric"><strong>{s.metric.value}</strong><span>{s.metric.label}</span></div>}<div className="detail-section"><span className="eyebrow">WHY IT MATTERS</span><p>{s.significance}</p></div><div className="detail-actions"><button className="primary-button" onClick={onDive}>Dive deeper<ArrowDown size={15}/></button><button className="secondary-button" onClick={onStreet} title="Approximate locality; not a verified facility boundary">Street map<Maximize size={14}/></button></div><div className="detail-section source-detail"><div className="source-detail-heading"><span className="eyebrow">THE EVIDENCE</span><span className={age>180?'age-tag old':'age-tag'}>{s.evidence.published.length===7?'MONTH PRECISION':age===0?'TODAY':`${age}D OLD`}</span></div><a href={s.evidence.url} target="_blank" rel="noreferrer">{s.evidence.publisher}<ArrowUpRight size={14}/></a><span className="report-date">Reported {dateLabel(s.evidence.published)}</span><small>{s.evidence.period}</small><p className="detail-note">{s.caveat}</p></div><div className="detail-section related-signals"><span className="eyebrow">CONNECTED SIGNALS</span>{s.related.map(id=>{const r=signals.find(x=>x.id===id);return r?<button key={id} onClick={()=>onSelect(id)}><span className="source-color" style={{background:categories[r.category].color}}/>{r.location}<ChevronRight size={14}/></button>:null;})}</div><div className="detail-coordinate"><span>{coordinateLabel(s.coordinates)}</span><span>{solarAltitude(s.coordinates,new Date(solarTime))>0?<Sun size={12}/>:<Moon size={12}/>}</span></div></>;
}
