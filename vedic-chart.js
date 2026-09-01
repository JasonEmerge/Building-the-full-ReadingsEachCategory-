/* ============================================================
   CozAlyze · Vedic chart layer  (calc → chart JSON for the generator)

   Like tropical-chart.js, this does NOT compute positions. It takes the
   SIDEREAL (Lahiri) longitudes and Lagna already produced by the verified
   engine and derives what the Combined-reading spec asks for on the Vedic
   side: signs, Whole Sign houses, house lords, Lagna lord, Nakshatra and
   Pada for Lagna, Moon and every classical graha, Graha Drishti,
   conjunctions. Uranus, Neptune and Pluto are accepted but marked
   secondary. No yogas, no divisional charts, no dashas here.

   Input (sidereal degrees 0–360, Lahiri):
   {
     birth: {...same record as the tropical input...},
     ayanamsha: { name:"Lahiri", value: 24.1234, method:"<verified engine's description>" },
     lagna: 123.45,
     bodies: { sun, moon, mercury, venus, mars, jupiter, saturn, rahu, [ketu], [uranus, neptune, pluto] },
     retrograde: { mercury:false, ... }      // optional
   }
   ============================================================ */
(function (root) {
  "use strict";
  const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const LORD  = { Aries:"mars", Taurus:"venus", Gemini:"mercury", Cancer:"moon", Leo:"sun", Virgo:"mercury",
                  Libra:"venus", Scorpio:"mars", Sagittarius:"jupiter", Capricorn:"saturn", Aquarius:"saturn", Pisces:"jupiter" };
  const NAKSHATRAS = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"];
  const NAK_LORDS = ["ketu","venus","sun","moon","mars","rahu","jupiter","saturn","mercury"];   // repeats 3x
  const CLASSICAL = ["sun","moon","mercury","venus","mars","jupiter","saturn"];
  const NODES = ["rahu","ketu"];
  const OUTER = ["uranus","neptune","pluto"];
  const SPECIAL = { mars:[4,8], jupiter:[5,9], saturn:[3,10] };   // special full aspects, in addition to the 7th

  const norm = d => ((d % 360) + 360) % 360;
  const signIdx = lon => Math.floor(norm(lon) / 30);
  const degIn = lon => norm(lon) % 30;
  const fmt = lon => { const d = degIn(lon), dd = Math.floor(d), mm = Math.round((d - dd) * 60); return `${dd}°${String(mm).padStart(2,"0")}' ${SIGNS[signIdx(lon)]}`; };
  function nakshatra(lon) {
    const span = 360 / 27, n = Math.floor(norm(lon) / span), within = norm(lon) - n * span;
    return { name:NAKSHATRAS[n], index:n + 1, pada:Math.floor(within / (span / 4)) + 1, lord:NAK_LORDS[n % 9] };
  }

  function buildVedicChart(input) {
    if (!input || !input.bodies || input.lagna == null) throw new Error("buildVedicChart: need lagna and bodies");
    const lagna = norm(input.lagna), lagnaSign = signIdx(lagna);
    const houseOf = lon => ((signIdx(lon) - lagnaSign + 12) % 12) + 1;
    const lons = Object.assign({}, input.bodies);
    if (lons.rahu != null && lons.ketu == null) lons.ketu = norm(lons.rahu + 180);

    const grahas = {};
    for (const g of [...CLASSICAL, ...NODES, ...OUTER]) {
      if (lons[g] == null) continue;
      const lon = norm(lons[g]);
      grahas[g] = { longitude:+lon.toFixed(4), sign:SIGNS[signIdx(lon)], degree:+degIn(lon).toFixed(2), position:fmt(lon),
        house:houseOf(lon), nakshatra:nakshatra(lon), retrograde:!!(input.retrograde && input.retrograde[g]),
        role: OUTER.includes(g) ? "secondary (not a primary Vedic factor)" : "primary" };
    }
    const lagnaInfo = { longitude:+lagna.toFixed(4), sign:SIGNS[lagnaSign], position:fmt(lagna), nakshatra:nakshatra(lagna), lord:LORD[SIGNS[lagnaSign]] };
    lagnaInfo.lordPlacement = grahas[lagnaInfo.lord] ? { sign:grahas[lagnaInfo.lord].sign, house:grahas[lagnaInfo.lord].house } : null;

    const houses = [];
    for (let h = 1; h <= 12; h++) {
      const sign = SIGNS[(lagnaSign + h - 1) % 12], lord = LORD[sign];
      houses.push({ number:h, sign, lord, lordPlacement: grahas[lord] ? { sign:grahas[lord].sign, house:grahas[lord].house } : null,
        occupants: Object.keys(grahas).filter(g => grahas[g].house === h && !OUTER.includes(g)) });
    }

    const primary = [...CLASSICAL, ...NODES].filter(g => grahas[g]);
    const conjunctions = [];
    for (let i = 0; i < primary.length; i++) for (let j = i + 1; j < primary.length; j++) {
      const a = primary[i], b = primary[j];
      if (grahas[a].house === grahas[b].house) conjunctions.push({ a, b, house:grahas[a].house, sign:grahas[a].sign, separation:+Math.abs(grahas[a].degree - grahas[b].degree).toFixed(2) });
    }

    const drishti = [];
    for (const g of CLASSICAL) {
      if (!grahas[g]) continue;
      const from = grahas[g].house;
      for (const t of [7, ...(SPECIAL[g] || [])]) {
        const toHouse = ((from + t - 2) % 12) + 1;
        drishti.push({ graha:g, aspectType: t === 7 ? "7th" : `${t}th (special)`, toHouse, toSign:houses[toHouse - 1].sign,
          grahasAspected: primary.filter(o => o !== g && grahas[o].house === toHouse) });
      }
    }

    const patterns = [];
    const byHouse = {};
    for (const g of primary) (byHouse[grahas[g].house] = byHouse[grahas[g].house] || []).push(g);
    for (const [h, l] of Object.entries(byHouse)) if (l.length >= 3) patterns.push({ type:"cluster-house", house:+h, grahas:l });
    const kendra = [1,4,7,10], trikona = [1,5,9], dusthana = [6,8,12];
    patterns.push({ type:"kendra-grahas", grahas: primary.filter(g => kendra.includes(grahas[g].house)) });
    patterns.push({ type:"trikona-grahas", grahas: primary.filter(g => trikona.includes(grahas[g].house)) });
    patterns.push({ type:"dusthana-grahas", grahas: primary.filter(g => dusthana.includes(grahas[g].house)) });
    if (grahas.rahu) patterns.push({ type:"nodal-axis", rahu:{ sign:grahas.rahu.sign, house:grahas.rahu.house }, ketu:{ sign:grahas.ketu.sign, house:grahas.ketu.house } });
    if (grahas.moon) {
      const mh = grahas.moon.house;
      const nearHouses = [((mh + 10) % 12) + 1, mh, (mh % 12) + 1];             // 12th, same, 2nd from the Moon
      const neighbours = CLASSICAL.filter(g => g !== "moon" && g !== "sun" && grahas[g] && nearHouses.includes(grahas[g].house));
      if (!neighbours.length) patterns.push({ type:"moon-without-neighbours", note:"no classical graha other than the Sun in the 12th, 1st or 2nd from the Moon; a candidate for the verified yoga layer, not asserted here" });
    }

    return {
      system:"vedic", zodiac:"sidereal", ayanamsha: input.ayanamsha || { name:"Lahiri" }, houseSystem:"whole-sign",
      birth: input.birth || {},
      lagna: lagnaInfo, grahas, houses, conjunctions, drishti, patterns,
      nodes: grahas.rahu ? { rahu:{ sign:grahas.rahu.sign, house:grahas.rahu.house, nakshatra:grahas.rahu.nakshatra }, ketu:{ sign:grahas.ketu.sign, house:grahas.ketu.house, nakshatra:grahas.ketu.nakshatra }, method:"mean node; Ketu opposite" } : null,
      notes: ["No yogas asserted: add only from verified calculation rules.", "No divisional charts, no dashas: Mahadasha belongs to Your Current Timing."],
      generatedAt: new Date().toISOString(),
      layer: "vedic-chart 1.0"
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { buildVedicChart };
  else root.buildVedicChart = buildVedicChart;
})(typeof window !== "undefined" ? window : globalThis);
