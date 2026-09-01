# CozAlyze · Tropical and Combined reading generation (server side)

GitHub Pages serves the front end only. Everything in this folder runs on the server that will also handle payments. No API key and no model call ever go into the Pages files.

## Pieces

| file | role |
|---|---|
| `tropical-chart.js` | Calculation layer. Takes the verified numbers already produced in `tropical-reveal.html` (astronomy-engine positions, mean node, `cozPlacidus()` cusps and angles, Whole Sign fallback flag) and derives the full chart JSON the generator needs: signs, houses, aspects, house rulers, chart ruler, element/modality balance, angularity, repeating patterns. Runs in the browser or in Node. It does NOT recompute positions or cusps. |
| `tropical-generator.system.md` | The Tropical generator specification, word for word, as the model's system prompt, with the JSON output contract. |
| `tropical-reading.schema.json` | JSON Schema for the reading the generator returns. |
| `vedic-chart.js` | Vedic calculation layer. Takes the verified SIDEREAL (Lahiri) longitudes and Lagna and derives Whole Sign houses, house lords, Lagna lord, Nakshatra and Pada for Lagna, Moon and every classical graha, Graha Drishti, conjunctions and repeating patterns. No yogas, divisional charts or dashas (those need their own verified layers; Mahadasha belongs to Your Current Timing). |
| `compare-generator.system.md` | The Combined (compare) reading specification as the system prompt: three parts per category (tropicalPerspective, vedicPerspective, completeView), reinforcement / complement / contrast / integration, no mechanical sign matching, Your Integrated Takeaway as a single synthesis. |
| `compare-reading.schema.json` | JSON Schema for the Combined reading, including the required calculation metadata block. |
| `generate-compare-reading.mjs` | Server function: two charts + calculation metadata → model → validated Combined reading (`fixture:false`, per-part word counts, no em dashes, no timing or divisional terms) stored once per chart pair. The `calculation` block (engine version, house systems requested and used, Placidus fallback reason, Lahiri method, node method, UTC birth, time zone, DST offset, boundary warnings, READING_AS_OF) comes from the calc engine and is attached by the server; the model never fabricates it. |
| `generate-tropical-reading.mjs` | Server function: chart JSON → model → validated reading (word counts, no em dashes, no Vedic terms, `fixture:false`, `userId`, `chartId`) → stored once per chart. Retries up to 3 times with the validation notes. |

## Flow

1. Payment verified server-side, entitlement `tropical-reading-49` granted (not built yet).
2. The app runs the verified calc in `tropical-reveal.html`, then `buildTropicalChart(input)` on its output, and POSTs the chart JSON to `/api/tropical-reading` with the user's session.
3. Server checks the entitlement, calls `generateTropicalReading({ chart, userId, store })`. If a reading already exists for that `chartId` it is returned as is. Nothing is regenerated on refresh.
4. Response `{ status:"ready", reading }`. The page stores `reading` as `localStorage.cozTropicalReading` (or sets `window.COZ_TROPICAL_READING`) and renders it. While generating, `{ status:"preparing" }` → the page sets `window.COZ_TROPICAL_READING_STATUS = "preparing"` and the dashboard button shows disabled.

## Orbs

`tropical-chart.js` ships with placeholder orbs and accepts `input.orbs`. Pass the orb table from tropical-reveal.html so the Combined reading never uses a second set (the spec forbids that). The orbs actually used are recorded in the chart JSON as `orbsUsed`.

## Splice point in tropical-reveal.html (needs the current file)

Where `tropical-reveal.html` assembles its profile after `cozPlacidus()`, call:

```js
const chart = buildTropicalChart({
  birth, houseSystem, houseSystemNote, angles:{ asc, mc }, cusps, bodies, retrograde
});
```

with the input shape documented at the top of `tropical-chart.js`. Send me the current `tropical-reveal.html` and I will wire it to the exact variable names.

## Sample content

`tropical-reading.html` carries `COZ_TROPICAL_SAMPLE_READING` marked `fixture:true, sample:true, customer:null`. The page refuses any stored reading that carries `fixture:true`, so the sample can never be mistaken for a customer's reading; it is displayed only when no generated reading exists.
