/* ============================================================
   CozAlyze · Tropical chart layer  (calc → chart JSON for the generator)

   This module does NOT compute planetary positions or house cusps.
   Those come from the verified math already in tropical-reveal.html
   (astronomy-engine positions, mean node, cozPlacidus() cusps/angles,
   Whole Sign fallback). This layer takes those numbers and derives
   everything the Tropical generator spec asks for: signs, houses,
   aspects, house rulers, chart ruler, elements, modalities, angularity
   and repeating patterns, in one JSON object.

   Input (all longitudes are TROPICAL ecliptic degrees 0–360):
   {
     birth: { date:"1990-01-01", time:"12:00", tz:"America/New_York", utc:"1990-01-01T17:00:00Z",
              place:"New York, NY", lat:40.7128, lon:-74.0060, timeConfidence:"exact|approximate|unknown" },
     houseSystem: "placidus" | "whole-sign",          // whole-sign only as the documented fallback
     houseSystemNote: "",                             // why the fallback was used, if it was
     angles: { asc:123.45, mc:45.67 },                // dsc/ic derived here
     cusps: [asc, c2, c3, ic, c5, c6, dsc, c8, c9, mc, c11, c12],   // 12 cusp longitudes
     bodies: { sun:..., moon:..., mercury:..., venus:..., mars:..., jupiter:..., saturn:...,
               uranus:..., neptune:..., pluto:..., northNode:... },
     retrograde: { mercury:false, venus:false, mars:false, jupiter:false, saturn:false,
                   uranus:false, neptune:false, pluto:false }         // optional
   }
   Works in the browser (window.buildTropicalChart) and in Node (module.exports).
   ============================================================ */
(function (root) {
  "use strict";

  const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const ELEMENT = { Aries:"fire", Taurus:"earth", Gemini:"air", Cancer:"water", Leo:"fire", Virgo:"earth",
                    Libra:"air", Scorpio:"water", Sagittarius:"fire", Capricorn:"earth", Aquarius:"air", Pisces:"water" };
  const MODALITY = { Aries:"cardinal", Taurus:"fixed", Gemini:"mutable", Cancer:"cardinal", Leo:"fixed", Virgo:"mutable",
                     Libra:"cardinal", Scorpio:"fixed", Sagittarius:"mutable", Capricorn:"cardinal", Aquarius:"fixed", Pisces:"mutable" };
  // modern rulers, with the traditional co-ruler where one exists
  const RULER = { Aries:["mars"], Taurus:["venus"], Gemini:["mercury"], Cancer:["moon"], Leo:["sun"], Virgo:["mercury"],
                  Libra:["venus"], Scorpio:["pluto","mars"], Sagittarius:["jupiter"], Capricorn:["saturn"],
                  Aquarius:["uranus","saturn"], Pisces:["neptune","jupiter"] };
  const BODY_ORDER = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","northNode","southNode"];
  const PERSONAL = ["sun","moon","mercury","venus","mars"];
  // ORBS: these placeholders MUST be replaced with the orb table already used in
  // tropical-reveal.html so the Combined reading never uses a second, different set.
  // Pass input.orbs = { conjunction:8, opposition:8, trine:7, square:7, sextile:5, quincunx:3, luminaryBonus:2 }
  // from the verified file, or edit the defaults below to match it exactly.
  const DEFAULT_ORBS = { conjunction:8, opposition:8, trine:7, square:7, sextile:5, quincunx:3, luminaryBonus:2 };
  const ASPECT_ANGLES = { conjunction:0, opposition:180, trine:120, square:90, sextile:60, quincunx:150 };

  const norm = d => ((d % 360) + 360) % 360;
  const signOf = lon => SIGNS[Math.floor(norm(lon) / 30)];
  const degIn = lon => norm(lon) % 30;
  const sep = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return d > 180 ? 360 - d : d; };
  const fmt = lon => { const d = degIn(lon); const dd = Math.floor(d); const mm = Math.round((d - dd) * 60); return `${dd}°${String(mm).padStart(2,"0")}' ${signOf(lon)}`; };

  function houseOf(lon, cusps) {
    // house whose cusp is the last one at or before lon, going round the wheel
    for (let h = 0; h < 12; h++) {
      const start = cusps[h], end = cusps[(h + 1) % 12];
      const span = norm(end - start), pos = norm(lon - start);
      if (pos < span) return h + 1;
    }
    return 12;
  }
  function wholeSignHouse(lon, asc) { return ((Math.floor(norm(lon) / 30) - Math.floor(norm(asc) / 30) + 12) % 12) + 1; }

  function buildTropicalChart(input) {
    if (!input || !input.bodies || !input.angles || !Array.isArray(input.cusps) || input.cusps.length !== 12) {
      throw new Error("buildTropicalChart: need bodies, angles.asc/mc and 12 cusps");
    }
    const houseSystem = input.houseSystem === "whole-sign" ? "whole-sign" : "placidus";
    const ORBS = Object.assign({}, DEFAULT_ORBS, input.orbs || {});
    const ASPECTS = Object.keys(ASPECT_ANGLES).map(name => ({ name, angle:ASPECT_ANGLES[name], orb:ORBS[name] }));
    const LUMINARY_BONUS = ORBS.luminaryBonus;
    const asc = norm(input.angles.asc), mc = norm(input.angles.mc);
    const dsc = norm(asc + 180), ic = norm(mc + 180);
    const cusps = input.cusps.map(norm);
    const house = lon => houseSystem === "placidus" ? houseOf(lon, cusps) : wholeSignHouse(lon, asc);

    const lons = Object.assign({}, input.bodies);
    if (lons.northNode != null && lons.southNode == null) lons.southNode = norm(lons.northNode + 180);

    const bodies = {};
    for (const b of BODY_ORDER) {
      if (lons[b] == null) continue;
      const lon = norm(lons[b]);
      bodies[b] = {
        longitude: +lon.toFixed(4), sign: signOf(lon), degree: +degIn(lon).toFixed(2), position: fmt(lon),
        house: house(lon), element: ELEMENT[signOf(lon)], modality: MODALITY[signOf(lon)],
        retrograde: !!(input.retrograde && input.retrograde[b])
      };
    }

    const angles = {
      ascendant:  { longitude:+asc.toFixed(4), sign:signOf(asc), position:fmt(asc) },
      descendant: { longitude:+dsc.toFixed(4), sign:signOf(dsc), position:fmt(dsc) },
      midheaven:  { longitude:+mc.toFixed(4),  sign:signOf(mc),  position:fmt(mc) },
      ic:         { longitude:+ic.toFixed(4),  sign:signOf(ic),  position:fmt(ic) }
    };

    // houses: cusp sign, ruler(s) and where the ruler sits
    const houses = cusps.map((c, i) => {
      const sgn = signOf(c);
      const rulers = RULER[sgn].filter(r => bodies[r]).map(r => ({ planet:r, sign:bodies[r].sign, house:bodies[r].house }));
      return { number:i+1, cusp:+c.toFixed(4), sign:sgn, rulers, occupants: BODY_ORDER.filter(b => bodies[b] && bodies[b].house === i+1) };
    });

    const chartRuler = RULER[signOf(asc)].filter(r => bodies[r]).map(r => ({ planet:r, sign:bodies[r].sign, house:bodies[r].house }));

    // aspects between the ten planets plus nodes and angles
    const points = Object.assign({}, bodies, {
      ascendant:{ longitude:asc }, midheaven:{ longitude:mc }
    });
    const names = Object.keys(points);
    const aspects = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      if ((a === "northNode" && b === "southNode")) continue;
      const d = sep(points[a].longitude, points[b].longitude);
      for (const asp of ASPECTS) {
        let orb = asp.orb;
        if (a === "sun" || a === "moon" || b === "sun" || b === "moon") orb += LUMINARY_BONUS;
        if (a === "ascendant" || a === "midheaven" || b === "ascendant" || b === "midheaven") orb = Math.min(orb, 6);
        const diff = Math.abs(d - asp.angle);
        if (diff <= orb) {
          aspects.push({ a, b, aspect:asp.name, orb:+diff.toFixed(2), tight:diff <= orb / 2,
            hard:["opposition","square","quincunx"].includes(asp.name), personal: PERSONAL.includes(a) || PERSONAL.includes(b) });
          break;
        }
      }
    }
    aspects.sort((x, y) => x.orb - y.orb);

    // element / modality balance: ten planets plus ASC, Sun Moon ASC weighted 2
    const weight = b => (b === "sun" || b === "moon" || b === "ascendant") ? 2 : 1;
    const elements = { fire:0, earth:0, air:0, water:0 }, modalities = { cardinal:0, fixed:0, mutable:0 };
    for (const b of ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"]) {
      if (!bodies[b]) continue;
      elements[bodies[b].element] += weight(b); modalities[bodies[b].modality] += weight(b);
    }
    elements[ELEMENT[signOf(asc)]] += 2; modalities[MODALITY[signOf(asc)]] += 2;
    const rank = o => Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ [k]:v }));

    // angularity: within 8° of an angle, or in an angular house
    const angular = [];
    for (const b of Object.keys(bodies)) {
      if (b === "southNode") continue;
      const lon = bodies[b].longitude;
      const near = [["ascendant",asc],["midheaven",mc],["descendant",dsc],["ic",ic]].filter(([,L]) => sep(lon, L) <= 8).map(([n]) => n);
      if (near.length || [1,4,7,10].includes(bodies[b].house)) angular.push({ planet:b, house:bodies[b].house, conjunctAngle: near });
    }

    // repeating patterns
    const patterns = [];
    const bySign = {}, byHouse = {};
    for (const b of ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"]) {
      if (!bodies[b]) continue;
      (bySign[bodies[b].sign] = bySign[bodies[b].sign] || []).push(b);
      (byHouse[bodies[b].house] = byHouse[bodies[b].house] || []).push(b);
    }
    for (const [s, l] of Object.entries(bySign)) if (l.length >= 3) patterns.push({ type:"stellium-sign", sign:s, planets:l });
    for (const [h, l] of Object.entries(byHouse)) if (l.length >= 3) patterns.push({ type:"stellium-house", house:+h, planets:l });
    const dominantElement = rank(elements)[0], dominantModality = rank(modalities)[0];
    patterns.push({ type:"dominant-element", value:Object.keys(dominantElement)[0], weight:Object.values(dominantElement)[0] });
    patterns.push({ type:"dominant-modality", value:Object.keys(dominantModality)[0], weight:Object.values(dominantModality)[0] });
    const missing = Object.entries(elements).filter(([, v]) => v === 0).map(([k]) => k);
    if (missing.length) patterns.push({ type:"missing-element", value:missing });
    let east = 0, west = 0, above = 0, below = 0;
    for (const b of ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"]) {
      if (!bodies[b]) continue;
      const h = bodies[b].house;
      ([10,11,12,1,2,3].includes(h) ? east++ : west++);
      ([7,8,9,10,11,12].includes(h) ? above++ : below++);
    }
    patterns.push({ type:"hemisphere", east, west, above, below });
    for (const b of ["sun","moon","mercury","venus","mars","jupiter","saturn"]) {
      if (bodies[b] && !aspects.some(x => (x.a === b || x.b === b) && !["ascendant","midheaven","northNode","southNode"].includes(x.a === b ? x.b : x.a)))
        patterns.push({ type:"unaspected", planet:b });
    }
    // mutual reception by modern rulers
    for (const [a, b] of [["sun","moon"],["sun","mercury"],["sun","venus"],["sun","mars"],["moon","mercury"],["moon","venus"],["moon","mars"],["mercury","venus"],["mercury","mars"],["venus","mars"],["jupiter","saturn"]]) {
      if (!bodies[a] || !bodies[b]) continue;
      if (RULER[bodies[a].sign][0] === b && RULER[bodies[b].sign][0] === a) patterns.push({ type:"mutual-reception", planets:[a, b] });
    }

    return {
      system: "tropical",
      houseSystem, houseSystemNote: input.houseSystemNote || "",
      birth: input.birth || {},
      angles, bodies, houses, chartRuler, aspects,
      balance: { elements, modalities, dominantElement:Object.keys(dominantElement)[0], dominantModality:Object.keys(dominantModality)[0] },
      angular, patterns,
      nodes: bodies.northNode ? { north:{ sign:bodies.northNode.sign, house:bodies.northNode.house }, south:{ sign:bodies.southNode.sign, house:bodies.southNode.house } } : null,
      orbsUsed: ORBS,
      generatedAt: new Date().toISOString(),
      layer: "tropical-chart 1.1"
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { buildTropicalChart };
  else root.buildTropicalChart = buildTropicalChart;
})(typeof window !== "undefined" ? window : globalThis);
