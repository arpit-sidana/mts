import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type Map as LibreMap } from 'maplibre-gl';
import { categories, routes, signals, type Category, type Position } from '../data/snapshot';
import { exposureCircle, graticule, nightPolygon } from '../lib/geo';
import type { Aircraft, RadarReport, Vessel, WeatherEvent } from '../lib/telemetry';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);

export interface GlobeControls { home: () => void; zoom: (amount: number) => void; fly: (position: Position, zoom: number) => void; north: () => void }
interface Props {
  layers: Category[]; ships: boolean; flights: boolean; weather: boolean; grid: boolean; satellite: boolean;
  playing: boolean; orbit: boolean; solarTime: string; selected: string | null;
  aircraft: Aircraft[]; vessels: Vessel[]; weatherEvents: WeatherEvent[]; radar: RadarReport | null;
  observation: {kind:'aircraft'|'vessel'|'weather';id:string}|null;
  onObservation: (kind:'aircraft'|'vessel'|'weather',id:string) => void;
  onSelect: (id: string) => void; onRoute: (id: string) => void; onPoint: (position: Position) => void;
  onCamera: (position: Position, zoom: number, bearing: number) => void; onReady: (controls: GlobeControls) => void;
}
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const paths = routes.filter(r=>r.kind==='ship');
const homePosition: Position = [32, 18];
const homeZoom = () => window.innerWidth < 700 ? 1.05 : window.innerHeight < 800 ? 1.75 : 2.05;
const iconPaths: Record<string,string> = {
  trade: 'M8 6h8v9H8z M5 15l3 6h8l3-6 M12 3v3 M3 22h18',
  compute: 'M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h2',
  energy: 'M13 2L5 14h6l-1 8 9-13h-7z',
  minerals: 'M12 3l9 9-9 9-9-9z M7 12h10 M12 7v10',
  weather: 'M7 17a5 5 0 110-10 6 6 0 1111 10 M8 20l-1 3 M13 20l-1 3 M18 20l-1 3',
  macro: 'M4 20V13 M9 20V9 M14 20V5 M19 20V2',
  ship: 'M12 2l4 6v10l-4 4-4-4V8z M12 7v10',
  flight: 'M12 2l2 7 7 5v2l-7-2v5l2 2v1l-4-1-4 1v-1l2-2v-5l-7 2v-2l7-5z',
};
function createIcon(path: string, color: string): Promise<ImageBitmap> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path d="${path}" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return createImageBitmap(new Blob([svg], { type: 'image/svg+xml' })).catch(() => new Promise<ImageBitmap>((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => { createImageBitmap(img).then(resolve, reject); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Icon load failed')); }; img.src = url;
  }));
}
export default function Globe(props: Props) {
  const container = useRef<HTMLDivElement>(null), credits = useRef<HTMLDivElement>(null), map = useRef<LibreMap | null>(null), latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [hover, setHover] = useState<{ x: number; y: number; id: string } | null>(null);

  useEffect(() => {
    let alive = true, frame = 0, last = 0, touching = false;
    let m: LibreMap;
    try {
      m = new maplibregl.Map({ container: container.current!, style: `${import.meta.env.BASE_URL}basemap.json`, center: homePosition, zoom: homeZoom(), minZoom: -1, maxZoom: 19, attributionControl: false, canvasContextAttributes: { antialias: true }, fadeDuration: 250 });
    } catch { setError('This browser could not start the 3D globe. Explore the signal index below, or try a browser with WebGL enabled.'); return; }
    map.current = m;
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    // Keep MapLibre's source-aware attribution above the page vignette and HUD.
    const attributionPosition = m.getContainer().querySelector('.maplibregl-ctrl-bottom-right');
    if (attributionPosition) credits.current?.appendChild(attributionPosition);
    const controls: GlobeControls = {
      home: () => m.flyTo({ center: homePosition, zoom: homeZoom(), bearing: 0, pitch: 0, duration: 1400 }),
      zoom: amount => m.zoomTo(m.getZoom() + amount, { duration: 350 }),
      fly: (position, zoom) => m.flyTo({ center: position, zoom, pitch: zoom > 13 ? 48 : 0, duration: 1600, essential: false }),
      north: () => m.easeTo({ bearing: 0, pitch: 0, duration: 700 }),
    };
    const updateCamera = () => latest.current.onCamera([m.getCenter().lng, m.getCenter().lat], m.getZoom(), m.getBearing());
    m.on('move', updateCamera);
    m.on('dragstart', () => { touching = true; setHover(null); });
    m.on('dragend', () => { touching = false; });
    m.on('zoomstart', () => setHover(null));
    m.on('error', (e) => {
      // A single failed tile must not throw away a usable map.
      if (!m.isStyleLoaded() && e.error?.message?.includes('basemap')) setError('Map style could not load. The signal index remains available.');
    });
    m.once('load', async () => {
      if (!alive) return;
      try {
        const icons = await Promise.all(Object.entries(iconPaths).map(async ([key,path]) => [key, await createIcon(path, key === 'ship' ? '#e8b481' : key === 'flight' ? '#91bacd' : categories[key as Category].color)] as const));
        if(!alive) return;
        for(const [key,img] of icons) m.addImage(key,img,{pixelRatio:2});
        m.addSource('satellite', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS User Community' });
        m.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.5, 'raster-brightness-max': 0.7 } }, 'water');
        m.addSource('night', { type: 'geojson', data: nightPolygon(new Date(latest.current.solarTime)) });
        m.addLayer({ id: 'night', type: 'fill', source: 'night', paint: { 'fill-color': '#020609', 'fill-opacity': 0.58 } });
        m.addSource('grid', { type: 'geojson', data: graticule() });
        m.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': '#8aa99a', 'line-opacity': ['interpolate',['linear'],['zoom'],0,0.13,4,0.07,7,0], 'line-width': 0.5 } });
        m.addSource('weather-exposure', { type: 'geojson', data: exposureCircle([-90,27.2], 480) });
        m.addLayer({ id: 'weather-area', type: 'fill', source: 'weather-exposure', layout: { visibility: 'none' }, paint: { 'fill-color': '#679bd9', 'fill-opacity': 0.12 } });
        m.addLayer({ id: 'weather-edge', type: 'line', source: 'weather-exposure', layout: { visibility: 'none' }, paint: { 'line-color': '#87b6ed', 'line-width': 1, 'line-dasharray': [2,3], 'line-opacity': 0.6 } });
        m.addSource('corridors', { type: 'geojson', data: { type:'FeatureCollection', features: paths.map(r => ({ type:'Feature', properties:{ id:r.id, kind:r.kind }, geometry:{type:'LineString',coordinates:r.coordinates} })) } });
        for(const kind of ['ship']) {
          m.addLayer({ id:`${kind}-glow`, type:'line', source:'corridors', filter:['==',['get','kind'],kind], paint:{ 'line-color':kind==='ship'?'#dba36b':'#79acc4', 'line-width':5, 'line-opacity':0.04 } });
          m.addLayer({ id:`${kind}-routes`, type:'line', source:'corridors', filter:['==',['get','kind'],kind], paint:{ 'line-color':kind==='ship'?'#dba36b':'#79acc4', 'line-width':1, 'line-opacity':0.42, 'line-dasharray':kind==='ship'?[1,0]:[2,3] } });
        }
        m.addSource('aircraft', {type:'geojson',data:EMPTY,attribution:'Aircraft: <a href="https://opensky-network.org/" target="_blank" rel="noopener">OpenSky Network</a>'});
        m.addLayer({id:'aircraft-dots',type:'circle',source:'aircraft',paint:{'circle-radius':['interpolate',['linear'],['zoom'],0,1.1,4,1.8,8,2.4],'circle-color':['interpolate',['linear'],['get','altitude'],0,'#e8b481',5000,'#96cbb0',10000,'#79c8df',15000,'#b5b0f1'],'circle-opacity':['case',['get','stale'],0.22,0.8]}});
        m.addLayer({id:'aircraft-icons',type:'symbol',source:'aircraft',minzoom:3.5,layout:{'icon-image':'flight','icon-size':['interpolate',['linear'],['zoom'],3,0.5,8,0.85,14,1.1],'icon-rotate':['get','bearing'],'icon-rotation-alignment':'map','icon-allow-overlap':false},paint:{'icon-opacity':['case',['get','stale'],0.3,1]}});
        m.addSource('vessels',{type:'geojson',data:EMPTY,attribution:'AIS: <a href="https://www.digitraffic.fi/en/marine-traffic/" target="_blank" rel="noopener">Fintraffic / Digitraffic</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> (filtered)'});
        m.addLayer({id:'vessel-dots',type:'circle',source:'vessels',paint:{'circle-radius':['interpolate',['linear'],['zoom'],0,1.3,6,2.4,10,3],'circle-color':'#e8b481','circle-opacity':0.8}});
        m.addLayer({id:'vessel-icons',type:'symbol',source:'vessels',minzoom:5,layout:{'icon-image':'ship','icon-size':0.7,'icon-rotate':['get','bearing'],'icon-rotation-alignment':'map','icon-allow-overlap':false}});
        m.addSource('weather-alerts',{type:'geojson',data:EMPTY});
        m.addLayer({id:'alert-fills',type:'fill',source:'weather-alerts',filter:['in',['geometry-type'],['literal',['Polygon','MultiPolygon']]],paint:{'fill-color':['case',['==',['get','severity'],'Extreme'],'#f5785e','#eeaf67'],'fill-opacity':0.15}});
        m.addLayer({id:'alert-outlines',type:'line',source:'weather-alerts',filter:['in',['geometry-type'],['literal',['Polygon','MultiPolygon']]],paint:{'line-color':'#f3bc80','line-width':1.5,'line-opacity':0.75}});
        m.addSource('weather-points',{type:'geojson',data:EMPTY});
        m.addLayer({id:'weather-points',type:'circle',source:'weather-points',paint:{'circle-radius':5,'circle-color':'#edb37d','circle-stroke-color':'#ffe3bd','circle-stroke-width':1,'circle-opacity':0.8}});
        m.addSource('storm-tracks',{type:'geojson',data:EMPTY});
        m.addLayer({id:'storm-tracks',type:'line',source:'storm-tracks',paint:{'line-color':'#e4b2f1','line-width':1.4,'line-opacity':0.7,'line-dasharray':[2,3]}});
        m.addSource('signals', { type:'geojson', data:{type:'FeatureCollection', features:signals.map(s=>({type:'Feature',id:s.id,properties:{id:s.id,category:s.category,color:categories[s.category].color,location:s.location},geometry:{type:'Point',coordinates:s.coordinates}}))} });
        m.addLayer({ id:'signal-halo', type:'circle', source:'signals', paint:{'circle-color':['get','color'],'circle-radius':17,'circle-opacity':0.045,'circle-stroke-color':['get','color'],'circle-stroke-width':0.7,'circle-stroke-opacity':0.25} });
        m.addLayer({ id:'signal-base', type:'circle', source:'signals', paint:{'circle-radius':9,'circle-color':'#0b1515','circle-stroke-width':0.7,'circle-stroke-color':['get','color'],'circle-stroke-opacity':0.7} });
        m.addLayer({ id:'signal-icons', type:'symbol', source:'signals', layout:{'icon-image':['get','category'],'icon-size':0.55,'icon-allow-overlap':true} });
        m.addLayer({ id:'signal-label', type:'symbol', source:'signals', minzoom:3, layout:{'text-field':['get','location'],'text-font':['Noto Sans Regular'],'text-size':10,'text-offset':[0,2.5],'text-anchor':'top'},paint:{'text-color':['get','color'],'text-halo-color':'#071110','text-halo-width':1.5} });
        m.addSource('selection',{type:'geojson',data:EMPTY});
        m.addLayer({id:'selection',type:'circle',source:'selection',paint:{'circle-radius':23,'circle-color':'#edb37d','circle-opacity':0.05,'circle-stroke-width':1.5,'circle-stroke-color':'#edb37d'}});
        m.addSource('observation-selection',{type:'geojson',data:EMPTY});
        m.addLayer({id:'observation-selection',type:'circle',source:'observation-selection',paint:{'circle-radius':15,'circle-color':'#bce5e1','circle-opacity':0.1,'circle-stroke-color':'#bce5e1','circle-stroke-width':1.5}});
        if(m.getSource('openmaptiles')) m.addLayer({id:'mts-buildings',type:'fill-extrusion',source:'openmaptiles','source-layer':'building',minzoom:14,paint:{'fill-extrusion-color':'#496457','fill-extrusion-height':['coalesce',['get','render_height'],6],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':0.75}} ,'night');
        m.on('click', e=>{
          const observed=m.queryRenderedFeatures([[e.point.x-5,e.point.y-5],[e.point.x+5,e.point.y+5]],{layers:['aircraft-icons','aircraft-dots','vessel-icons','vessel-dots','weather-points','alert-fills']})[0];
          if(observed){latest.current.onObservation(String(observed.properties.kind) as 'aircraft'|'vessel'|'weather',String(observed.properties.id));return;}
          const hit=m.queryRenderedFeatures(e.point,{layers:['signal-icons','signal-base']})[0];
          if(hit) { latest.current.onSelect(String(hit.properties.id)); return; }
          const route=m.queryRenderedFeatures([[e.point.x-4,e.point.y-4],[e.point.x+4,e.point.y+4]],{layers:['ship-routes']})[0];
          if(route) { latest.current.onRoute(String(route.properties.id)); return; }
          latest.current.onPoint([e.lngLat.lng,e.lngLat.lat]);
        });
        m.on('mousemove',e=>{
          const hit=m.queryRenderedFeatures(e.point,{layers:['signal-icons','signal-base','aircraft-icons','aircraft-dots','vessel-icons','vessel-dots','weather-points']})[0];
          m.getCanvas().style.cursor=hit?'pointer':'';
          if(hit?.properties.id) setHover({x:e.point.x,y:e.point.y,id:String(hit.properties.id)}); else setHover(null);
        });
        m.getCanvas().addEventListener('mouseleave',()=>setHover(null));
        // The combined live-source credits no longer fit the footer when open.
        // Keep the standard accessible attribution disclosure available.
        credits.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        latest.current.onReady(controls); updateCamera(); setReady(true);
      } catch(e) { setError(`Map overlays could not initialize. ${e instanceof Error ? e.message : ''}`); }
    });
    function animate(time: number) {
      if(!alive) return;
      frame=requestAnimationFrame(animate);
      if(time-last<80 || document.hidden) return;
      const elapsed=Math.min(time-last,200); last=time;
      const p=latest.current;
      if(p.orbit && p.playing && !touching && !m.isMoving() && m.getZoom()<3) m.jumpTo({center:[m.getCenter().lng+elapsed*0.0003,m.getCenter().lat]});
      if(p.playing && m.getLayer('signal-halo')) m.setPaintProperty('signal-halo','circle-radius',14+(Math.sin(time/1200)+1)*4);
    }
    frame=requestAnimationFrame(animate);
    const timeout=window.setTimeout(()=>{if(alive && !m.getLayer('signal-icons'))setError('The map is taking longer to load. Check your connection; the signal index is available.');},18000);
    return()=>{alive=false;cancelAnimationFrame(frame);clearTimeout(timeout);m.remove();map.current=null;};
  },[]);

  useEffect(()=>{
    const m=map.current; if(!ready || !m) return;
    const filter: maplibregl.FilterSpecification=['in',['get','category'],['literal',props.layers]];
    for(const id of ['signal-halo','signal-base','signal-icons','signal-label']) m.setFilter(id,filter);
    const visibility=(id:string,visible:boolean)=>m.setLayoutProperty(id,'visibility',visible?'visible':'none');
    visibility('ship-routes',props.ships);visibility('ship-glow',props.ships);
    visibility('grid',props.grid);visibility('satellite',props.satellite);
    for(const id of ['aircraft-dots','aircraft-icons'])visibility(id,props.flights);
    for(const id of ['vessel-dots','vessel-icons'])visibility(id,props.ships);
    for(const id of ['alert-fills','alert-outlines','weather-points','storm-tracks'])visibility(id,props.weather);
    if(m.getLayer('radar'))visibility('radar',props.weather);
    visibility('weather-area',props.layers.includes('weather'));visibility('weather-edge',props.layers.includes('weather'));
    // Satellite must replace fills while retaining place/road labels at closer zoom.
    for(const layer of m.getStyle().layers ?? []) if(layer.type==='fill' && layer.source==='openmaptiles') visibility(layer.id,!props.satellite);
    const selected=signals.find(s=>s.id===props.selected);
    (m.getSource('selection') as GeoJSONSource).setData(selected && props.layers.includes(selected.category)?{type:'Feature',properties:{},geometry:{type:'Point',coordinates:selected.coordinates}}:EMPTY);
    setError('');
  },[ready,props.layers,props.ships,props.flights,props.weather,props.grid,props.satellite,props.selected]);
  useEffect(()=>{if(ready)(map.current?.getSource('night') as GeoJSONSource)?.setData(nightPolygon(new Date(props.solarTime)));},[ready,props.solarTime]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m)return;
    (m.getSource('aircraft') as GeoJSONSource).setData({type:'FeatureCollection',features:props.aircraft.map(a=>({type:'Feature',properties:{id:a.id,kind:'aircraft',bearing:a.track??0,altitude:a.altitudeM??0,stale:Date.now()/1000-a.positionTime>120},geometry:{type:'Point',coordinates:a.position}}))});
  },[ready,props.aircraft]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m)return;
    (m.getSource('vessels') as GeoJSONSource).setData({type:'FeatureCollection',features:props.vessels.map(v=>({type:'Feature',properties:{id:v.id,kind:'vessel',bearing:v.heading??v.track??0},geometry:{type:'Point',coordinates:v.position}}))});
  },[ready,props.vessels]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m)return;
    const properties=(w:WeatherEvent)=>({id:w.id,kind:'weather',severity:w.severity});
    (m.getSource('weather-alerts') as GeoJSONSource).setData({type:'FeatureCollection',features:props.weatherEvents.map(w=>({type:'Feature',properties:properties(w),geometry:w.geometry}))});
    (m.getSource('weather-points') as GeoJSONSource).setData({type:'FeatureCollection',features:props.weatherEvents.map(w=>({type:'Feature',properties:properties(w),geometry:{type:'Point',coordinates:w.position}}))});
    (m.getSource('storm-tracks') as GeoJSONSource).setData({type:'FeatureCollection',features:props.weatherEvents.filter(w=>w.track&&w.track.length>1).map(w=>({type:'Feature',properties:properties(w),geometry:{type:'LineString',coordinates:w.track!}}))});
  },[ready,props.weatherEvents]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m)return;const o=props.observation;
    const point=o?(o.kind==='aircraft'?props.aircraft:o.kind==='vessel'?props.vessels:props.weatherEvents).find(x=>x.id===o.id)?.position:null;
    (m.getSource('observation-selection') as GeoJSONSource).setData(point?{type:'Feature',properties:{},geometry:{type:'Point',coordinates:point}}:EMPTY);
  },[ready,props.observation,props.aircraft,props.vessels,props.weatherEvents]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m||!props.radar)return;
    const frame=props.radar.frames.at(-1)!;
    const tiles=[`${props.radar.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`];
    const source=m.getSource('radar') as maplibregl.RasterTileSource|undefined;
    if(source)source.setTiles(tiles);
    else{
      m.addSource('radar',{type:'raster',tiles,tileSize:256,maxzoom:7,attribution:'Weather radar © <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>'});
      m.addLayer({id:'radar',type:'raster',source:'radar',layout:{visibility:props.weather?'visible':'none'},paint:{'raster-opacity':0.72,'raster-fade-duration':500}},'ship-glow');
    }
  },[ready,props.radar,props.weather]);
  const hovered=signals.find(s=>s.id===hover?.id);
  const observed=props.aircraft.find(a=>a.id===hover?.id)??props.vessels.find(v=>v.id===hover?.id)??props.weatherEvents.find(w=>w.id===hover?.id);
  return <>
    <div ref={container} className="globe-map" aria-label="Interactive Earth map. Drag to rotate, scroll to zoom, click a signal to investigate." />
    <div ref={credits} className="map-credit-layer" />
    {!ready && !error && <div className="map-loading"><span className="loader-ring"/><span>Establishing planetary view<span className="loading-dots">...</span></span></div>}
    {error && <div role="status" className="map-error">{error}</div>}
    {hover && hovered && <div className="map-tooltip" style={{left:Math.min(hover.x+20,window.innerWidth-265),top:Math.max(85,hover.y-65)}}><span style={{color:categories[hovered.category].color}}>{categories[hovered.category].short} / {hovered.status.toUpperCase()}</span><strong>{hovered.location}</strong><small>Click to investigate ↗</small></div>}
    {hover && observed && !hovered && <div className="map-tooltip" style={{left:Math.min(hover.x+20,window.innerWidth-265),top:Math.max(85,hover.y-65)}}><span>OBSERVED / SOURCE TIMESTAMPED</span><strong>{'callsign' in observed?observed.callsign||observed.id:'name' in observed?observed.name||observed.id:observed.title}</strong><small>Click for telemetry ↗</small></div>}
    <span className="map-ready" data-ready={ready} hidden />
  </>;
}
