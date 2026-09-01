/* ============================================================
   CozAlyze · server-side Combined (compare) reading generator
   Node 18+. ANTHROPIC_API_KEY lives only in the server environment.
   Input: two calculated charts (tropical-chart.js, vedic-chart.js) for
   the same verified birth record, plus the calculation metadata.
   The model writes; it never calculates.
   ============================================================ */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const MODEL = process.env.COZ_GENERATOR_MODEL || "claude-sonnet-4-6";
const SYSTEM_PROMPT = await readFile(new URL("./compare-generator.system.md", import.meta.url), "utf8");
const IDS = ["at-your-core","love-desire-creativity","work-money-expression","wisdom-purpose-legacy","challenges-resilience","integrated-takeaway"];
const PARTS = ["tropicalPerspective","vedicPerspective","completeView"];
const wc = arr => (arr || []).join(" ").split(/\s+/).filter(Boolean).length;

export function compareChartId(tropical, vedic) {
  const key = JSON.stringify({ b:tropical.birth, t:Object.fromEntries(Object.entries(tropical.bodies).map(([k,v]) => [k, Math.round(v.longitude*100)/100])),
    v:Object.fromEntries(Object.entries(vedic.grahas).map(([k,g]) => [k, Math.round(g.longitude*100)/100])), asc:Math.round(tropical.angles.ascendant.longitude*100)/100, lagna:Math.round(vedic.lagna.longitude*100)/100 });
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

function validate(r) {
  const errs = [];
  if (!r || typeof r !== "object") return ["not an object"];
  if (r.system !== "compare") errs.push("system must be compare");
  if (r.fixture !== false) errs.push("fixture must be false");
  if (!Array.isArray(r.sections) || r.sections.length !== 6) return errs.concat("need exactly 6 sections");
  const vedicTerms = /\b(mahadasha|antardasha|dasha|navamsa|d-?9|d-?10)\b/i;   // timing/divisional content must stay out
  r.sections.forEach((s, i) => {
    if (s.id !== IDS[i]) errs.push(`section ${i+1} id should be ${IDS[i]}`);
    if (i < 5) {
      for (const p of PARTS) {
        const n = wc(s[p]);
        if (!Array.isArray(s[p]) || !s[p].length) errs.push(`${s.id}.${p}: missing`);
        else if (n < 120 || n > 260) errs.push(`${s.id}.${p}: ${n} words, expected 140–220`);
      }
      const all = PARTS.map(p => (s[p] || []).join(" ")).join(" ");
      if (/\u2014/.test(all)) errs.push(`${s.id}: em dash`);
      if (vedicTerms.test(all)) errs.push(`${s.id}: timing or divisional term present`);
    } else {
      const n = wc(s.body);
      if (n < 220 || n > 400) errs.push(`integrated-takeaway: ${n} words, expected 250–350`);
      if (/\u2014/.test((s.body || []).join(" "))) errs.push("integrated-takeaway: em dash");
    }
    if (!s.sourceFactors) errs.push(`${s.id}: sourceFactors missing`);
  });
  return errs;
}

async function callModel(payload, fixNotes) {
  const user = ["Two calculated charts for one verified birth record (JSON):", JSON.stringify(payload),
    fixNotes ? `\nYour previous output failed validation:\n- ${fixNotes.join("\n- ")}\nReturn corrected JSON only.` : ""].join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 12000, temperature: 0.7, system: SYSTEM_PROMPT, messages: [{ role: "user", content: user }] })
  });
  if (!res.ok) throw new Error(`model call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
}

/**
 * generateCompareReading({ tropical, vedic, calculation, userId, store })
 *   tropical    : buildTropicalChart() output      vedic : buildVedicChart() output
 *   calculation : { engineVersion, tropicalHouseSystemRequested:"placidus", tropicalHouseSystemUsed,
 *                   placidusFallbackReason, lahiri, nodeMethod:"mean", utcBirth, timeZone, dstOffset,
 *                   boundaryWarnings:[], readingAsOf }   (all from the calc engine, never from the model)
 *   userId      : authenticated user (from the entitlement check)
 *   store       : { get(id), put(id, reading) }
 */
export async function generateCompareReading({ tropical, vedic, calculation, userId, store }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing on the server");
  if (!calculation || !calculation.utcBirth || !calculation.timeZone) throw new Error("calculation metadata incomplete");
  const id = compareChartId(tropical, vedic);
  const existing = await store.get(id);
  if (existing) return existing;
  const payload = { tropical, vedic, calculation: { tropicalHouseSystemUsed: calculation.tropicalHouseSystemUsed, placidusFallbackReason: calculation.placidusFallbackReason || null, lahiri: calculation.lahiri, nodeMethod: calculation.nodeMethod } };
  let reading, errs, notes = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    reading = await callModel(payload, notes);
    Object.assign(reading, { fixture:false, userId, chartId:id, generatedAt:new Date().toISOString(), calculation });
    errs = validate(reading);
    if (!errs.length) break;
    notes = errs;
  }
  if (errs.length) throw new Error("combined reading failed validation after 3 attempts: " + errs.join("; "));
  await store.put(id, reading);
  return reading;
}
