# MTS · Monitoring the Situation

A planetary observatory for the infrastructure, energy, materials, and trade corridors shaping the global economy. A static, GitHub Pages-compatible React/TypeScript application with a genuine WebGL globe and detailed vector maps.

**[Open MTS](https://arpit-sidana.github.io/mts/)**

## Run

Use Node.js 22 or newer.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

The browser checks use installed Chrome on macOS by default. Set `CHROME_PATH` to the browser executable on another machine, then run `npm run test:e2e`. All dependencies are pinned by `package-lock.json`.

## Explore

- Drag/pinch/scroll from the globe to street detail. Right-drag adjusts bearing and pitch. Mapped buildings extrude at zoom 14+ where OpenStreetMap provides geometry and heights.
- Toggle six economic layers, illustrative ships/aircraft, a coordinate grid, satellite imagery, and auto orbit.
- Click researched signals for their report, source, economic significance, limitations, connected signals, and closer map views. The **Street map** action zooms the approximate locality; it is not street-level photography.
- Click unmarked locations to inspect coordinates and solar illumination.
- Search the signal index or explicitly query OpenStreetMap place search.
- Inspect and export the visible research snapshot through Sources.
- `⌘/Ctrl K` or `/`: search. `H`: global view. `F`: focus mode. `Space`: pause. `Esc`: close.

## Research and accuracy

The snapshot was researched on **14 October 2026**. Its 21 records cover trade chokepoints and ports, compute and semiconductor facilities, energy, critical minerals, weather exposure, and the macro outlook. Sources include EIA, IEA, IMF, Microsoft, OpenAI, TSMC, MPA Singapore, and the Port of Rotterdam. Exact source URLs, published dates, reporting periods, status classifications, and caveats are stored in `src/data/snapshot.ts` and visible in the product. Month-only publication dates retain month precision.

This is a curated research index, not a complete global dataset. Dates vary by source. Forecasts and announced capacity are distinguished from observations. Regional and locality-level coordinates do not establish precise facility boundaries. The application calculates counts of indexed records; those counts are not economic totals.

Ships and aircraft are **synthetic animation over hand-authored schematic corridors**. Neither positions, count, speed, cargo, nor route availability represent observations. The weather layer shows a representative Gulf energy-exposure area for the October 8–9 report, **not live radar, rainfall, a forecast cone, or current storm position**. These classifications remain attached to exported data.

Day/night shading uses an approximate solar ephemeris and a meridian-sampled terminator for a selected UTC hour or the current clock. It accounts for latitude, axial tilt, and Earth rotation; it does not model cloud cover, terrain shadows, atmospheric refraction, or civil twilight. Changing solar time does not change economic evidence.

## Mapping

- **MapLibre GL JS 6**: GPU-rendered globe, map navigation, geographic layers, and building extrusions. Its worker is bundled explicitly with Vite for production compatibility.
- **OpenFreeMap / OpenStreetMap**: detailed vector mapping, roads, buildings, and labels. The customized style is committed in `public/basemap.json`.
- **Esri World Imagery**: optional satellite basemap. Imagery dates and resolution vary. Attribution remains visible.
- **Nominatim**: public place search runs only after explicitly submitting a query, with a timeout and an error state. Queries are sent to that public service.

No API key is required for the current build. Map tiles, glyphs, imagery, place search, and optional web fonts require an internet connection. The evidence index remains usable if WebGL cannot initialize. Mapping providers have their own terms and coverage; this application does not bundle Google Maps or Apple Maps proprietary data, photogrammetry, or Street View.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes `dist/` on pushes to `main` or manual dispatch. Enable **Settings → Pages → Source: GitHub Actions** in the GitHub repository. Relative asset URLs support both domain-root and repository-path hosting; no server or SPA route rewrite is needed.

## Next data integrations

Keep secrets out of this static application. A scheduled ingestion job or separate backend can write reviewed, timestamped snapshots into a public data asset. This should retain source, observation time, geographic accuracy, coverage, and classification per feature. AIS vessel tracking, ADS-B aircraft tracking, weather radar/satellite products, facility progress, and commodity/market feeds require their own source access and licensing. OpenAI integration can summarize evidence later but does not supply tracking telemetry.

The first version implements the globe and exploration foundation. Dense real telemetry, facility models, terrain meshes, live radar, global 3D photogrammetry, and game-quality environmental rendering are future integrations, not features claimed by this build.
