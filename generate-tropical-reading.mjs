/* ============================================================
   CozAlyze · server-side Tropical reading generator
   Node 18+. The API key lives ONLY in the server environment
   (ANTHROPIC_API_KEY). Nothing here is ever shipped to GitHub Pages.

   Flow:  chart JSON (from tropical-chart.js) → model → validated
          reading JSON (fixture:false, userId, chartId) → store → return.
   Never regenerate for a chartId that already has a stored reading.
   ============================================================ */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const MODEL = process.env.COZ_GENERATOR_MODEL || "claude-sonnet-4-6";
const SYSTEM_PROMPT = await readFile(new URL("./tropical-generator.system.md", import.meta.url), "utf8");
const SECTION_IDS = ["at-your-core","love-desire-creativity","work-money-expression","wisdom-purpose-legacy","challenges-resilience","essential-takeaway"];
const WORD_RANGE = { default:[400, 720], "essential-takeaway":[220, 400] };   // soft bounds around the spec's 450–650 / 250–350

export function chartId(chart) {
  // stable id for "generate once": birth data + house system + rounded positions
  const key = JSON.stringify({ b:chart.birth, hs:chart.houseSystem, p:Object.fromEntries(Object.entries(chart.bodies).map(([k,v]) => [k, Math.round(v.longitude*100)/100])), asc:Math.round(chart.angles.ascendant.longitude*100)/100 });
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

function validate(reading) {
  const errs = [];
  if (!reading || typeof reading !== "object") return ["not an object"];
  if (reading.system !== "tropical") errs.push("system must be tropical");
  if (reading.fixture !== false) errs.push("fixture must be false");
  if (!Array.isArray(reading.sections) || reading.sections.length !== 6) errs.push("need exactly 6 sections");
  else reading.sections.forEach((s, i) => {
    if (s.id !== SECTION_IDS[i]) errs.push(`section ${i+1} id should be ${SECTION_IDS[i]}`);
    if (!Array.isArray(s.body) || s.body.length < 3) errs.push(`${s.id}: body needs 3+ paragraphs`);
    else {
      const words = s.body.join(" ").split(/\s+/).filter(Boolean).length;
      const [lo, hi] = WORD_RANGE[s.id] || WORD_RANGE.default;
      if (words < lo || words > hi) errs.push(`${s.id}: ${words} words, expected ${lo}–${hi}`);
      if (/\u2014/.test(s.body.join(" "))) errs.push(`${s.id}: em dash present`);
      if (/\b(nakshatra|pada|dasha|mahadasha|atmakaraka|navamsa|lahiri|ayanamsa|yoga|drishti)\b/i.test(s.body.join(" "))) errs.push(`${s.id}: Vedic term present`);
    }
  });
  return errs;
}

async function callModel(chart, fixNotes) {
  const user = [
    "Calculated Tropical natal chart (JSON):",
    JSON.stringify(chart),
    fixNotes ? `\nYour previous output failed validation:\n- ${fixNotes.join("\n- ")}\nReturn corrected JSON only.` : ""
  ].join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, temperature: 0.7, system: SYSTEM_PROMPT, messages: [{ role: "user", content: user }] })
  });
  if (!res.ok) throw new Error(`model call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(clean);
}

/**
 * generateTropicalReading({ chart, userId, store })
 *   chart : output of buildTropicalChart()
 *   userId: authenticated user id (from the entitlement check, never from the client)
 *   store : { get(chartId) → reading|null, put(chartId, reading) }
 */
export async function generateTropicalReading({ chart, userId, store }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing on the server");
  const id = chartId(chart);
  const existing = await store.get(id);
  if (existing) return existing;                         // generate once, never on refresh
  let reading, errs, notes = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    reading = await callModel(chart, notes);
    reading.fixture = false; reading.userId = userId; reading.chartId = id; reading.generatedAt = new Date().toISOString();
    errs = validate(reading);
    if (!errs.length) break;
    notes = errs;
  }
  if (errs.length) throw new Error("reading failed validation after 3 attempts: " + errs.join("; "));
  await store.put(id, reading);
  return reading;
}

/* ---- minimal HTTP handler sketch (framework-agnostic) ----
   POST /api/tropical-reading   { chart }        (or { birth } if the server also runs the calc)
   1. authenticate the user, check the "tropical-reading-49" entitlement server-side
   2. reading = await generateTropicalReading({ chart, userId, store })
   3. respond { status:"ready", reading }  — the page stores it as cozTropicalReading
   While generating, respond { status:"preparing" } so the page sets
   window.COZ_TROPICAL_READING_STATUS = "preparing" and disables the button.
*/
