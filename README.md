# MTS · Monitoring the Situation

**[Open MTS](https://arpit-sidana.github.io/mts/)**

A GPU-rendered planetary observatory with a detailed globe-to-street map, dated economic research, observed aircraft and AIS ships, precipitation radar, and severe-weather events. React, TypeScript, MapLibre GL JS 6, and Vite; hosted on GitHub Pages.

## Run

Use Node.js 22 or newer.

```sh
npm ci
node scripts/collect-flights.mjs
npm run dev
```

```sh
npm test
npm run build
npm run preview
npm run test:e2e
```

Browser tests use local Chrome on macOS; set `CHROME_PATH` elsewhere. Tests use explicitly synthetic fixtures, intercept telemetry requests, and do not consume live-provider flight credits. The actual free feeds were checked independently in a browser.

## Observation layers

| Layer | Source and coverage | Cadence and limitations |
| --- | --- | --- |
| Aircraft | [OpenSky state vectors](https://openskynetwork.github.io/opensky-api/rest.html); its global receiver network | Gateway polled every 60 seconds while visible. Anonymous upstream resolution is 10 seconds; provider quota is 400 credits/day and a global request costs 4. Actual coverage is incomplete, especially over oceans. Counts are positioned airborne aircraft in the received report, **not all flights on Earth**. |
| Ships | [Fintraffic Digitraffic](https://www.digitraffic.fi/en/marine-traffic/), CC BY 4.0; Finnish coastal AIS receiver coverage | REST bootstrap/fallback every 60 seconds; `vessels-v2/+/location` MQTT WebSocket messages batched into the map every second. No key. This is **regional**, not global satellite AIS. |
| Precipitation radar | [RainViewer](https://www.rainviewer.com/api/weather-maps-api.html) | Latest available observed radar frame. Manifest checked every 2 minutes; source frames arrive at 10-minute intervals. Free API max zoom 7, Universal Blue scheme, 100 requests/IP/minute. No free nowcast or IR imagery. Coverage varies; an unpainted area is not proof of clear weather. |
| Severe U.S. weather | [National Weather Service](https://www.weather.gov/documentation/services-web-api) | Actual, unexpired Severe/Extreme alerts with polygons, refreshed every 2 minutes. Geometry-free alerts cannot be mapped and are excluded. Counts are mapped alerts, not all active U.S. warnings. |
| Global storms | [NASA EONET v3](https://eonet.gsfc.nasa.gov/docs/v3) | Curated open severe-storm events, checked every 5 minutes; latest reported location must be no older than 72 hours. Reports may be hours apart. Dotted tracks join reported positions; no forecast cone is synthesized. |
| Day / night | [Astronomy Engine](https://github.com/cosinekitty/astronomy), MIT | Automatic calculation for the current UTC second, including apparent geocentric Sun direction, precession, nutation, aberration, and apparent sidereal time. No slider, date selector, or historical simulation. Clock accuracy depends on the device clock. This is a geometric horizon, not a terrain/refraction/cloud model. |

Aircraft and vessels are drawn at their **received coordinates**, not dead-reckoned to invented current positions. Aircraft details include ICAO24, callsign, source type, barometric altitude, ground speed, vertical speed, true track, squawk, and observation time. Transponder country is not a departure airport. Ship details include MMSI, name when available, vessel type, speed, heading/course, navigation state, and sender-reported destination. Unknown values remain unknown. AIS positions expire after 15 minutes; invalid sentinel heading/speed values are not shown as measurements.

No free feed guarantees complete worldwide coverage or positions measured at the current second. Source timestamps and live age counters make latency explicit. A clock ticking each second does not imply the upstream observations do.

## Free backend and static fallback

OpenSky blocks direct browser requests from GitHub Pages. `backend/worker.mjs` is a small fixed-upstream gateway for **Cloudflare Workers Free**, with caching and allowlisted browser origins. It cannot proxy arbitrary URLs or caller-supplied upstream parameters. It has no database, storage subscription, paid fallback, or secret in the client bundle.

Deploy it **only after confirming the Cloudflare Workers account plan is Free**:

```sh
wrangler deploy --config backend/wrangler.toml
```

Configure its public URL as `VITE_TELEMETRY_URL` before building the frontend. This URL is not a secret. Every provider still enforces its own quota. The gateway caches rate-limit responses rather than retrying aggressively. Do not enable paid billing or upgrade a plan to keep this prototype running.

When the gateway is unconfigured or unavailable, the application can use `public/live/flights.json`, a **dated OpenSky report** collected during deployment. The public Actions schedule republishes it every 20 minutes (actual scheduling can be delayed by GitHub). The interface labels cached reports, displays their original source time, and marks old data as delayed. Collection failures preserve the prior report without rebasing its timestamp; when no report exists, the UI shows unavailable rather than simulated traffic or a fake zero count. Generated reports are ignored by Git to avoid committing a global snapshot every refresh.

Anonymous global quotas are small: continuous one-minute polling will eventually exhaust a single upstream IP's daily allocation. The gateway then returns a quota status and the UI falls back to the dated report. A properly authorized free OpenSky account or provider partnership would be needed to increase that allowance; the app never purchases credits.

## Research and mapping

The 21 economic signals remain the **14 October 2026 research snapshot**. They cover trade chokepoints, ports, compute/semiconductor facilities, energy, minerals, weather exposure, and macro outlook. Each retains its source URL, report date, period, classification, and caveats in `src/data/snapshot.ts`. Forecasts and announced capacity remain distinct from delivered output. These research signals do not become live because telemetry refreshes.

The separate economic **Weather impacts** layer remains a dated Gulf energy-exposure report. The **Weather** observation switch independently controls current radar/alerts/storms. Maritime corridor lines are schematic geographic context; no synthetic aircraft or ship positions are rendered.

MapLibre uses [OpenFreeMap](https://openfreemap.org/) / [OpenStreetMap](https://www.openstreetmap.org/copyright) vector data and optional Esri World Imagery. Provider attribution stays visible. Imagery dates/resolution vary and are not live satellite imagery. OpenStreetMap buildings extrude at detailed zooms where geometry/heights are available. Place search uses Nominatim only after explicit submission. External tiles, fonts, and data need network access.

Drag to rotate; scroll/pinch to zoom; right-drag to pitch/rotate. Click observations for technical details or open the observation index from the feed status cards. `⌘/Ctrl K` or `/`: signal/place search. `H`: global view. `F`: focus. `Space`: pause decorative motion (data refresh and the real clock continue). `Esc`: close.

## Deploy

`.github/workflows/deploy.yml` runs tests, collects the dated flight fallback, builds, and publishes `dist/` on pushes to `main`, manual dispatch, and its 20-minute refresh schedule. Repository Pages source must be **GitHub Actions**. Relative assets support repository-path hosting. If a gateway has been deployed, set its non-secret `VITE_TELEMETRY_URL` in the workflow build environment.
