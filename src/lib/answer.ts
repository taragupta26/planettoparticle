import type {
  Conflict,
  DataGap,
  Entity,
  Evidence,
  GroundedAnswer,
  NarrativeSegment,
  Relation,
} from "@/lib/types";
import { getCobaltDomain, topProducers } from "@/lib/cobalt";
import { worldBankCountryEvidence } from "@/lib/connectors/worldbank";
import { wikidataEntityEvidence } from "@/lib/connectors/wikidata";
import { getLayer, type LayerMeta, type MetricValue } from "@/lib/db";
import { getOutlook, detectCountry } from "@/lib/outlook";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtVal = (n: number, unit: string) => {
  const s = n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return unit === "%" ? `${s}%` : `${s} ${unit}`;
};

// QIDs for safe direct entity lookups (label + description only).
const COUNTRY_QID: Record<string, string> = {
  COD: "Q974",
  IDN: "Q252",
  RUS: "Q159",
  AUS: "Q408",
  CAN: "Q16",
};

function detectResource(question: string): "cobalt" | null {
  return /cobalt/i.test(question) ? "cobalt" : null;
}

// Builds the cobalt answer. Used as the default vertical.
export async function answerCobalt(question: string): Promise<GroundedAnswer> {
  const domain = getCobaltDomain();
  const evidence: Evidence[] = [...domain.evidence];
  const narrative: NarrativeSegment[] = [];
  const gaps: DataGap[] = [];
  const conflicts: Conflict[] = [];

  const world = domain.world;
  const top = topProducers(5);
  const leader = top[0];

  const evId = (id: string) => (evidence.find((e) => e.id === id) ? [id] : []);

  // --- WHO CONTROLS ---
  if (leader && world?.production2023_t) {
    const share = (leader.production2023_t! / world.production2023_t) * 100;
    narrative.push({
      text: `Cobalt mine production is highly concentrated. ${leader.country} produced ${fmt(
        leader.production2023_t!
      )} metric tons of contained cobalt in 2023 — about ${share.toFixed(
        0
      )}% of the world total of ${fmt(
        world.production2023_t
      )} t (USGS, estimated).`,
      evidenceIds: [
        ...evId(`usgs:prod2023:${leader.iso3}`),
        ...evId("usgs:prod2023:WORLD"),
      ],
    });
  }
  if (top.length > 1) {
    const others = top.slice(1, 4);
    narrative.push({
      text: `The next-largest producers in 2023 were ${others
        .map((r) => `${r.country} (${fmt(r.production2023_t!)} t)`)
        .join(", ")}.`,
      evidenceIds: others.flatMap((r) => evId(`usgs:prod2023:${r.iso3}`)),
    });
  }

  // --- RESERVES / LONG-TERM CONTROL ---
  const reserveLeader = [...domain.producerRows]
    .filter((r) => r.reserves_t !== null)
    .sort((a, b) => b.reserves_t! - a.reserves_t!)[0];
  if (reserveLeader && world?.reserves_t) {
    const rshare = (reserveLeader.reserves_t! / world.reserves_t) * 100;
    narrative.push({
      text: `Known reserves are similarly concentrated: ${reserveLeader.country} holds ${fmt(
        reserveLeader.reserves_t!
      )} t of an estimated ${fmt(
        world.reserves_t
      )} t worldwide (~${rshare.toFixed(0)}%), per USGS.`,
      evidenceIds: [
        ...evId(`usgs:reserves:${reserveLeader.iso3}`),
        ...evId("usgs:reserves:WORLD"),
      ],
    });
  }

  // --- WHO BENEFITS (national economic context, live World Bank) ---
  const wbTargets = top.slice(0, 3).filter((r) => r.iso3);
  const wbEvidence = (
    await Promise.all(
      wbTargets.map((r) => worldBankCountryEvidence(r.iso3!, r.country))
    )
  ).flat();
  evidence.push(...wbEvidence);
  for (const r of wbTargets) {
    const gdp = wbEvidence.find((e) => e.id === `wb:${r.iso3}:NY.GDP.MKTP.CD`);
    const pcap = wbEvidence.find((e) => e.id === `wb:${r.iso3}:NY.GDP.PCAP.CD`);
    if (gdp || pcap) {
      const parts: string[] = [];
      if (gdp) parts.push(gdp.statement.replace(/^.*?—\s*/, ""));
      if (pcap) parts.push(pcap.statement.replace(/^.*?—\s*/, ""));
      narrative.push({
        text: `Economic context for ${r.country}: ${parts.join(" ")}`,
        evidenceIds: [gdp?.id, pcap?.id].filter(Boolean) as string[],
      });
    }
  }
  narrative.push({
    text: "National indicators above describe whole economies, not how cobalt revenue is distributed within a country. The split between artisanal miners, industrial operators, the state, and foreign owners is not captured by these sources.",
    evidenceIds: [],
  });

  // --- Wikidata canonical descriptions (medium confidence enrichment) ---
  const wdCobalt = await wikidataEntityEvidence("Q740", "Cobalt");
  if (wdCobalt) {
    evidence.push(wdCobalt);
    narrative.unshift({ text: wdCobalt.statement, evidenceIds: [wdCobalt.id] });
  }
  if (leader?.iso3 && COUNTRY_QID[leader.iso3]) {
    const wdC = await wikidataEntityEvidence(
      COUNTRY_QID[leader.iso3],
      leader.country
    );
    if (wdC) evidence.push(wdC);
  }

  // --- DATA GAPS (exposed, never invented) ---
  gaps.push(
    {
      id: "gap:trade",
      topic: "Resource flows / trade",
      description:
        "Bilateral cobalt trade flows (who exports to whom) are not shown.",
      attemptedSource: "UN Comtrade",
      reason:
        "The UN Comtrade public API now requires a subscription key, which is not configured in this MVP.",
    },
    {
      id: "gap:ownership",
      topic: "Ownership & processing",
      description:
        "Company ownership of mines and the refining/processing chain (e.g. where ore is smelted) are not shown.",
      attemptedSource: "Wikidata / OpenCorporates",
      reason:
        "Freely-available structured data does not cleanly link specific companies to cobalt operations with reliable provenance; asserting these links would be unsourced.",
    },
    {
      id: "gap:impacts",
      topic: "Community & environmental impacts",
      description:
        "Local impacts (artisanal mining conditions, water, health, displacement) are not shown.",
      attemptedSource: "EJAtlas / government open data",
      reason:
        "Not integrated in this MVP. Will be added as source-backed records with citations.",
    },
    {
      id: "gap:activism",
      topic: "Community & activist efforts",
      description:
        "Organized community responses and advocacy campaigns are not shown.",
      attemptedSource: "EJAtlas / NGO reporting",
      reason:
        "Not integrated in this MVP. Will be added only when each effort can be cited to a source.",
    }
  );

  // Build entity collections.
  const entities: Entity[] = [domain.resource, ...domain.countries];
  const relations: Relation[] = domain.relations;
  const countries = domain.countries;
  const actors = [domain.resource, ...domain.countries]; // sourced actors only
  const communityActions: Entity[] = []; // none source-backed yet -> see gaps

  return {
    question,
    resource: "cobalt",
    narrative,
    entities,
    relations,
    evidence,
    countries,
    actors,
    communityActions,
    gaps,
    conflicts,
    generatedAt: new Date().toISOString(),
  };
}

// Keyword → layer routing for the generic (DB-backed) verticals. Cobalt has its
// own richer vertical and is handled before this list is consulted.
const LAYER_KEYWORDS: { id: string; re: RegExp }[] = [
  // Minerals & extraction (most specific first).
  { id: "lithium_production", re: /\blithium\b/i },
  { id: "graphite_production", re: /\bgraphite\b/i },
  // USGS MCS 2024 mined commodities (mine production, world-share).
  { id: "rare_earths_production", re: /\b(rare[- ]?earths?|rare[- ]?earth elements?|\brees?\b|lanthanide)/i },
  { id: "copper_production", re: /\bcopper\b/i },
  { id: "nickel_production", re: /\bnickel\b/i },
  { id: "tin_production", re: /\btin\b/i },
  { id: "tungsten_production", re: /\b(tungsten|wolfram)\b/i },
  { id: "tantalum_production", re: /\b(tantalum|coltan)\b/i },
  { id: "manganese_production", re: /\bmanganese\b/i },
  { id: "phosphate_production", re: /\b(phosphate|phosphate rock)\b/i },
  { id: "potash_production", re: /\bpotash\b/i },
  { id: "gold_production", re: /\bgold\b/i },
  { id: "silver_production", re: /\bsilver\b/i },
  { id: "iron_ore_production", re: /\b(iron ore|iron[- ]?ore)\b/i },
  { id: "zinc_production", re: /\bzinc\b/i },
  { id: "lead_production", re: /\blead (ore|mining|production)|\bplumbum\b/i },
  { id: "bauxite_production", re: /\b(bauxite|alumina|aluminium ore|aluminum ore)\b/i },
  { id: "antimony_production", re: /\bantimony\b/i },
  { id: "molybdenum_production", re: /\b(molybdenum|moly)\b/i },
  { id: "oil_rents", re: /\boil rent|petroleum rent\b/i },
  { id: "gas_rents", re: /\b(gas rent|natural gas rent)\b/i },
  { id: "coal_rents", re: /\bcoal rent\b/i },
  { id: "forest_rents", re: /\bforest rent\b/i },
  { id: "resource_rents_total", re: /\b(natural[- ]?resource rent|resource rent|total rent|resource[- ]?dependent)\b/i },
  { id: "mineral_rents", re: /\b(mineral rent|mineral extraction|extracti)/i },
  // Energy production.
  { id: "coal_production", re: /\bcoal\b/i },
  { id: "oil_production", re: /\b(oil|petroleum|crude)\b/i },
  { id: "gas_production", re: /\b(natural gas|gas production|\bgas\b)/i },
  // Emissions.
  { id: "methane_total", re: /\b(methane|ch4)\b/i },
  { id: "co2_total", re: /\b(total (co2|co₂|carbon|emission)|co2 emissions? (total|overall))\b/i },
  { id: "co2_per_capita", re: /\b(co2|co₂|carbon|emission|emit|greenhouse)\b/i },
  // Forests, energy access, water.
  { id: "forest_area", re: /\b(forest|deforest|woodland|tree cover)\b/i },
  { id: "renewable_energy", re: /\b(renewable|clean energy|energy transition)\b/i },
  { id: "clean_cooking", re: /\b(clean cooking|cooking fuel|cookstove)\b/i },
  { id: "electricity_access", re: /\b(electricity|electrification|power access|energy poverty)\b/i },
  { id: "water_access_basic", re: /\b(drinking[- ]?water|water access|safe water)\b/i },
  { id: "renew_water_pc", re: /\b(freshwater|water per (capita|person)|water[- ]?scarc)/i },
  { id: "water_stress", re: /\b(water stress|water withdrawal|water[- ]?stressed)\b/i },
  { id: "land_degradation", re: /\b(degrad|soil|desertif)\w*/i },
  // Aggregate trade flows (World Bank).
  { id: "exports_value", re: /\b(export(s|ers|ing)?)\b/i },
  { id: "imports_value", re: /\b(import(s|ers|ing)?|import depend\w*)\b/i },
  // Plastic pollution (ocean-specific check first so it wins over generic plastic).
  { id: "plastic_to_ocean_share", re: /plastic[\s\S]*\b(ocean|sea|marine|emit\w*)\b|\b(ocean|marine)\b[\s\S]*plastic/i },
  { id: "plastic_waste_pc", re: /\bplastic\w*\b/i },
  // Biodiversity (specific before generic).
  { id: "marine_protected", re: /\bmarine protect\w*|\bmpa\b/i },
  { id: "terrestrial_protected", re: /\b(protected area\w*|conservation area\w*|terrestrial protect\w*)\b/i },
  { id: "threatened_birds", re: /\b(threatened|endangered)\b[\s\S]*\bbird/i },
  { id: "threatened_plants", re: /\b(threatened|endangered)\b[\s\S]*\bplant|\bbiodiversit\w*|\bspecies\b/i },
  // People / productivity.
  { id: "gini", re: /\b(inequality|gini|income gap)\b/i },
  { id: "poverty_headcount", re: /\b(poverty|poor|extreme poverty)\b/i },
  { id: "undernourishment", re: /\b(hunger|undernourish|malnutri|food insecur)\w*/i },
  { id: "fertilizer_use", re: /\bfertili[sz]er\b/i },
  { id: "cereal_yield", re: /\b(cereal yield|crop yield|yield per)\b/i },
  // Crops & livestock.
  { id: "wheat_production", re: /\bwheat\b/i },
  { id: "maize_production", re: /\b(maize|corn)\b/i },
  { id: "rice_production", re: /\brice\b/i },
  { id: "soybean_production", re: /\b(soy|soybean)\b/i },
  { id: "coffee_production", re: /\bcoffee\b/i },
  { id: "cocoa_production", re: /\b(cocoa|cacao|chocolate)\b/i },
  { id: "palm_oil_production", re: /\bpalm oil\b/i },
  { id: "sugarcane_production", re: /\b(sugar ?cane|sugar)\b/i },
  { id: "banana_production", re: /\bbanana\b/i },
  { id: "potato_production", re: /\bpotato\b/i },
  { id: "cassava_production", re: /\b(cassava|manioc)\b/i },
  { id: "meat_production", re: /\b(meat|livestock|beef|poultry|pork)\b/i },
  { id: "milk_production", re: /\b(milk|dairy)\b/i },
];

function detectLayer(question: string): string | null {
  for (const { id, re } of LAYER_KEYWORDS) if (re.test(question)) return id;
  return null;
}

// Direction-aware "worst first" ranking, mirroring the map's severity model.
function rankValues(values: MetricValue[], meta: LayerMeta): MetricValue[] {
  const lowestIsWorst = meta.display !== "world_share" && !meta.higher_is_worse;
  return [...values]
    .filter((v) => Number.isFinite(v.value))
    .sort((a, b) => (lowestIsWorst ? a.value - b.value : b.value - a.value));
}

// Generic, fully source-grounded answer for any loaded DB layer. Every sentence
// is assembled from real retrieved values; each carries an Evidence record that
// cites the layer's underlying source. No narrative is invented.
export async function answerLayer(
  layerId: string,
  question: string
): Promise<GroundedAnswer | null> {
  const { meta, values } = await getLayer(layerId);
  if (!meta || values.length === 0) return null;

  const ranked = rankValues(values, meta);
  const top = ranked.slice(0, 6);
  const lowestIsWorst = meta.display !== "world_share" && !meta.higher_is_worse;
  const worldTotal = values.reduce((s, v) => s + (v.value > 0 ? v.value : 0), 0);

  const evidence: Evidence[] = top.map((v) => ({
    id: `db:${layerId}:${v.iso3}`,
    sourceId: layerId,
    statement: `${v.name}: ${fmtVal(v.value, meta.unit)}${
      v.year ? ` (${v.year})` : ""
    } — ${meta.label}.`,
    value: v.value,
    unit: meta.unit,
    asOf: v.year ?? undefined,
    confidence: "high",
    sourceUrl: v.source_url,
    sourceName: v.source_name,
  }));

  const narrative: NarrativeSegment[] = [];
  const lead = top[0];

  if (meta.display === "world_share" && worldTotal > 0 && lead) {
    const share = (lead.value / worldTotal) * 100;
    narrative.push({
      text: `${meta.label} is concentrated: ${lead.name} accounts for ${fmtVal(
        lead.value,
        meta.unit
      )}${lead.year ? ` (${lead.year})` : ""} — about ${share.toFixed(
        0
      )}% of the ${fmtVal(worldTotal, meta.unit)} world total, per ${
        meta.source_name
      }.`,
      evidenceIds: [`db:${layerId}:${lead.iso3}`],
    });
  } else if (lead) {
    const dir = lowestIsWorst ? "lowest" : "highest";
    narrative.push({
      text: `By ${meta.label.toLowerCase()}, ${lead.name} ranks ${dir}: ${fmtVal(
        lead.value,
        meta.unit
      )}${lead.year ? ` (${lead.year})` : ""}, per ${meta.source_name}.`,
      evidenceIds: [`db:${layerId}:${lead.iso3}`],
    });
  }

  if (top.length > 1) {
    const others = top.slice(1, 5);
    narrative.push({
      text: `${
        meta.display === "world_share"
          ? "Next-largest"
          : lowestIsWorst
          ? "Also among the lowest"
          : "Also among the highest"
      }: ${others
        .map(
          (v) =>
            `${v.name} (${
              meta.display === "world_share" && worldTotal > 0
                ? `${((v.value / worldTotal) * 100).toFixed(1)}%`
                : fmtVal(v.value, meta.unit)
            })`
        )
        .join(", ")}.`,
      evidenceIds: others.map((v) => `db:${layerId}:${v.iso3}`),
    });
  }

  narrative.push({
    text: `This is a single national indicator (${meta.source_name}). It shows the country-level figure, not who controls the resource, who profits, or who bears the local cost — those require their own sourced records and are listed as data gaps.`,
    evidenceIds: [],
  });

  const countries: Entity[] = top.map((v) => ({
    id: `country:${v.iso3}`,
    type: "country",
    label: v.name,
    iso3: v.iso3,
    evidenceIds: [`db:${layerId}:${v.iso3}`],
  }));

  const gaps: DataGap[] = [
    {
      id: `gap:distribution:${layerId}`,
      topic: "Distribution & control",
      description: `Who controls and who benefits within each country is not captured by ${meta.label.toLowerCase()} alone.`,
      reason:
        "A single national indicator cannot show intra-country distribution; that would require additional sourced datasets.",
    },
    {
      id: `gap:impacts:${layerId}`,
      topic: "Community & environmental impacts",
      description:
        "Local impacts and organized community responses are not shown for this indicator.",
      attemptedSource: "EJAtlas / NGO reporting",
      reason:
        "Not integrated yet. Will be added only when each effort can be cited to a source.",
    },
  ];

  return {
    question,
    resource: layerId,
    narrative,
    entities: countries,
    relations: [],
    evidence,
    countries,
    actors: countries,
    communityActions: [],
    gaps,
    conflicts: [],
    generatedAt: new Date().toISOString(),
  };
}

// "How will this region change over the next 10/20 years?" — future climate +
// present hazard baseline. Fires only when the question is clearly forward- or
// risk-looking AND names a country we can resolve.
const OUTLOOK_RE =
  /\b(next\s+\d+\s*years?|over the next|coming (decade|years)|by\s*20(2|3|4)\d|future|outlook|projection|warmer|hotter|heat ?wave|extreme (heat|temp)|flood(ing)?|drought|cyclone|hazard|disaster risk|climate (change|risk)|will .*(change|warm|flood|worsen))\b/i;

function detectOutlookIntent(q: string): boolean {
  return OUTLOOK_RE.test(q);
}

export async function answerOutlook(
  iso: string,
  name: string,
  question: string
): Promise<GroundedAnswer> {
  const o = await getOutlook(iso);
  const generatedAt = new Date().toISOString();
  const country: Entity = {
    id: `country:${iso}`,
    type: "country",
    label: name,
    iso3: iso,
    evidenceIds: [],
  };
  const evidence: Evidence[] = [];
  const narrative: NarrativeSegment[] = [];
  const gaps: DataGap[] = [];

  const clim = o?.climate;
  if (clim && clim.available && clim.periods.length) {
    const far = clim.periods[clim.periods.length - 1];
    const b = clim.baseline;
    const dT = far.meanTmax - b.meanTmax;
    const dHot = far.hotDays35 - b.hotDays35;
    const dHeavy = far.heavyRain20 - b.heavyRain20;
    const mk = (suffix: string, statement: string, value: number, unit: string) => {
      const id = `outlook:${iso}:${suffix}`;
      evidence.push({
        id,
        sourceId: "open-meteo-cmip6",
        statement,
        value,
        unit,
        asOf: far.decade,
        confidence: "medium",
        sourceUrl: clim.sourceUrl,
        sourceName: clim.source,
      });
      return id;
    };
    const eT = mk(
      "tmax",
      `${name}: average daily-high temperature ${b.meanTmax.toFixed(
        1
      )}°C (2010s) → ${far.meanTmax.toFixed(1)}°C (${far.decade}), a ${
        dT >= 0 ? "+" : ""
      }${dT.toFixed(1)}°C change.`,
      far.meanTmax,
      "°C"
    );
    const eHot = mk(
      "hot",
      `${name}: extreme-heat days (≥35°C) ${b.hotDays35.toFixed(
        0
      )}/yr (2010s) → ${far.hotDays35.toFixed(0)}/yr (${far.decade}).`,
      far.hotDays35,
      "days/yr"
    );
    const eHeavy = mk(
      "heavy",
      `${name}: heavy-rain days (≥20mm) ${b.heavyRain20.toFixed(
        1
      )}/yr (2010s) → ${far.heavyRain20.toFixed(1)}/yr (${far.decade}).`,
      far.heavyRain20,
      "days/yr"
    );
    country.evidenceIds.push(eT, eHot, eHeavy);
    narrative.push({
      text: `Under a high-emissions pathway, ${name}'s average daily-high temperature is projected to move from ${b.meanTmax.toFixed(
        1
      )}°C in the 2010s to ${far.meanTmax.toFixed(1)}°C by the ${far.decade} (${
        dT >= 0 ? "+" : ""
      }${dT.toFixed(1)}°C), with extreme-heat days (≥35°C) going ${b.hotDays35.toFixed(
        0
      )}→${far.hotDays35.toFixed(0)} per year and heavy-rain days (≥20mm) ${b.heavyRain20.toFixed(
        1
      )}→${far.heavyRain20.toFixed(1)} per year. This is a ${clim.models.length}-model CMIP6 mean at the country's centroid — a single point under one scenario, not a full regional downscaling.`,
      evidenceIds: [eT, eHot, eHeavy],
    });
  } else {
    gaps.push({
      id: `gap:climate:${iso}`,
      topic: "Forward climate",
      description: `No usable climate projection for ${name}.`,
      attemptedSource: "Open-Meteo Climate API (CMIP6)",
      reason:
        clim && !clim.available ? clim.reason : "No centroid on record for this country.",
    });
  }

  const haz = o?.hazards;
  if (haz && haz.available) {
    const notable = haz.items.filter((h) =>
      ["HIG", "MED"].includes(h.levelCode)
    );
    const ev = haz.items.map((h) => {
      const id = `outlook:${iso}:hz:${h.mnemonic}`;
      evidence.push({
        id,
        sourceId: "thinkhazard",
        statement: `${name}: ${h.type} hazard classified as ${h.level} (current baseline).`,
        value: h.level,
        confidence: "high",
        sourceUrl: haz.sourceUrl,
        sourceName: haz.source,
      });
      return id;
    });
    country.evidenceIds.push(...ev);
    narrative.push({
      text:
        notable.length > 0
          ? `Present-day natural-hazard baseline (GFDRR ThinkHazard!): ${notable
              .map((h) => `${h.type.toLowerCase()} (${h.level})`)
              .join(
                ", "
              )} are the elevated hazards here. These are current classifications, not projections; climate change can intensify the climate-driven ones over time.`
          : `Present-day natural-hazard baseline (GFDRR ThinkHazard!): no hazards classified High or Medium for ${name}.`,
      evidenceIds: ev,
    });
  } else {
    gaps.push({
      id: `gap:hazard:${iso}`,
      topic: "Natural-hazard baseline",
      description: `No hazard classification for ${name}.`,
      attemptedSource: "GFDRR ThinkHazard!",
      reason: haz && !haz.available ? haz.reason : "No region match.",
    });
  }

  narrative.push({
    text: "Climate figures are forward projections (downscaled CMIP6, high-emissions pathway); hazard classes are today's baseline risk. Both are global free sources; neither is a forecast of a specific event.",
    evidenceIds: [],
  });

  return {
    question,
    resource: "outlook",
    narrative,
    entities: [country],
    relations: [],
    evidence,
    countries: [country],
    actors: [],
    communityActions: [],
    gaps,
    conflicts: [],
    generatedAt,
  };
}

export async function answerQuestion(
  question: string,
  activeLayers: string[] = []
): Promise<GroundedAnswer> {
  // 0) Forward-looking / risk question about a named country → regional outlook.
  if (detectOutlookIntent(question)) {
    const c = detectCountry(question);
    if (c) return answerOutlook(c.iso, c.name, question);
  }

  // 1) Cobalt has the richest, hand-built vertical — always prefer it.
  if (detectResource(question) === "cobalt") return answerCobalt(question);

  // 2) Route by keyword to a DB-backed layer; otherwise fall back to whatever
  //    filter the user most recently turned on (so the chat tracks the map).
  const fallback = [...activeLayers]
    .reverse()
    .find((id) => id && !id.startsWith("cobalt"));
  const layerId = detectLayer(question) ?? fallback ?? null;

  if (
    activeLayers[activeLayers.length - 1]?.startsWith("cobalt") &&
    !detectLayer(question)
  ) {
    // Last active filter is cobalt and nothing else matched → cobalt vertical.
    return answerCobalt(question);
  }

  if (layerId) {
    const layered = await answerLayer(layerId, question);
    if (layered) return layered;
  }

  // 3) Nothing matched a loaded dataset: do NOT invent an answer. Return a
  //    grounded "gap" response and show the cobalt map as the live example.
  const cobalt = await answerCobalt(question);
  return {
    ...cobalt,
    narrative: [
      {
        text: "No loaded dataset matches that question yet, so to honor the no-fabricated-data rule it isn't answered. Turn on a relevant filter on the left, or ask about one of the loaded indicators (emissions, water stress, forests, mineral rents, crops, poverty, hunger, and more). Showing the cobalt map below as the live example.",
        evidenceIds: [],
      },
      ...cobalt.narrative,
    ],
    gaps: [
      {
        id: "gap:scope",
        topic: "Requested topic",
        description: `No source-grounded dataset is loaded for: "${question}".`,
        reason:
          "Each topic needs its own verified dataset before any answer is shown. The loaded layers are listed as filters on the map.",
      },
      ...cobalt.gaps,
    ],
  };
}
