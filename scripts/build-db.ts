/**
 * build-db.ts — preloads REAL data into a DuckDB store (data/p2p.duckdb).
 * No values are invented. Missing values are dropped (shown as data gaps in UI).
 *
 * Sources ingested here:
 *   - USGS MCS 2024 cobalt (from data/cobalt_usgs.json, already ingested)
 *   - World Bank WDI human indices (poverty, undernourishment, water access),
 *     fetched live for every country in one call per indicator.
 *
 * Run: npm run build-db
 */
import { writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const DATA = join(process.cwd(), "data");
const DB_PATH = join(DATA, "p2p.duckdb");

interface MetricRow {
  metric: string;
  iso3: string;
  name: string;
  value: number;
  unit: string;
  year: string | null;
  source_id: string;
  source_name: string;
  source_url: string;
  note: string | null;
}

const USGS = {
  id: "usgs_mcs_cobalt_2024",
  name: "USGS Mineral Commodity Summaries 2024 — Cobalt",
  url: "https://www.sciencebase.gov/catalog/item/65b7d778d34e36a39045b4af",
};

// USGS Mineral Commodity Summaries 2024 — per-commodity world production.
// Each commodity is a ScienceBase item whose `mcs2024-*_world.csv` file lists
// per-country mine production (most recent estimate). Real values only; the
// world.csv download URL is resolved live from the item's file list so it
// survives re-hosting. metric, label, ScienceBase item id.
const USGS_MCS_COMMODITIES: [string, string, string][] = [
  ["copper_production", "Copper mine production", "65b7d77ed34e36a39045b4b2"],
  ["nickel_production", "Nickel mine production", "65b7d826d34e36a39045b4f6"],
  ["rare_earths_production", "Rare-earths mine production", "65b7d85dd34e36a39045b50b"],
  ["tin_production", "Tin mine production", "65b7d8c7d34e36a39045b536"],
  ["tungsten_production", "Tungsten mine production", "65b7d8d8d34e36a39045b53d"],
  ["tantalum_production", "Tantalum mine production", "65b7d8b4d34e36a39045b52d"],
  ["manganese_production", "Manganese mine production", "65b7d805d34e36a39045b4ea"],
  ["phosphate_production", "Phosphate rock mine production", "65b7d847d34e36a39045b503"],
  ["potash_production", "Potash mine production", "65b7d84ed34e36a39045b505"],
  ["gold_production", "Gold mine production", "65b7d7b2d34e36a39045b4c8"],
  ["silver_production", "Silver mine production", "65b7d88dd34e36a39045b51d"],
  ["iron_ore_production", "Iron ore mine production", "65b7d7d4d34e36a39045b4d6"],
  ["zinc_production", "Zinc mine production", "65b7d8f6d34e36a39045b54a"],
  ["lead_production", "Lead mine production", "65b7d7f3d34e36a39045b4e3"],
  ["bauxite_production", "Bauxite mine production", "65b7d744d34e36a39045b499"],
  ["antimony_production", "Antimony mine production", "65b7d72ad34e36a39045b48f"],
  ["molybdenum_production", "Molybdenum mine production", "65b7d820d34e36a39045b4f4"],
];

// USGS country label -> ISO A3, covering every producer present across the
// commodities above (validated: zero unmapped names). Unmapped future names
// are logged and skipped — never guessed.
const USGS_NAME_TO_ISO3: Record<string, string> = {
  Algeria: "DZA", Argentina: "ARG", Armenia: "ARM", Australia: "AUS",
  Austria: "AUT", Belarus: "BLR", Bolivia: "BOL", Brazil: "BRA",
  "Burkina Faso": "BFA", Burma: "MMR", Burundi: "BDI", Canada: "CAN",
  Chile: "CHL", China: "CHN", "Congo (Kinshasa)": "COD",
  "Congo (Brazzaville)": "COG", "Côte d’Ivoire": "CIV", "Cote d'Ivoire": "CIV",
  Egypt: "EGY", Finland: "FIN", Gabon: "GAB", Georgia: "GEO", Germany: "DEU",
  Ghana: "GHA", Greece: "GRC", Greenland: "GRL", Guatemala: "GTM", Guinea: "GIN",
  India: "IND", Indonesia: "IDN", Iran: "IRN", Ireland: "IRL", Israel: "ISR",
  Jamaica: "JAM", Japan: "JPN", Jordan: "JOR", Kazakhstan: "KAZ",
  "Korea, North": "PRK", "Korea, Republic of": "KOR", Kyrgyzstan: "KGZ",
  Laos: "LAO", Madagascar: "MDG", Malaysia: "MYS", Mali: "MLI",
  Mauritania: "MRT", Mexico: "MEX", Mongolia: "MNG", Morocco: "MAR",
  "New Caledonia": "NCL", Nigeria: "NGA", Pakistan: "PAK", Peru: "PER",
  Philippines: "PHL", Poland: "POL", Portugal: "PRT", Russia: "RUS",
  Rwanda: "RWA", "Saudi Arabia": "SAU", Senegal: "SEN", "South Africa": "ZAF",
  Spain: "ESP", Sweden: "SWE", Syria: "SYR", Tajikistan: "TJK",
  Tanzania: "TZA", Thailand: "THA", Togo: "TGO", Tunisia: "TUN", Turkey: "TUR",
  Ukraine: "UKR", "United Arab Emirates": "ARE", "United States": "USA",
  Uzbekistan: "UZB", Vietnam: "VNM", Zambia: "ZMB",
};
const WB = {
  id: "worldbank_wdi",
  name: "World Bank — World Development Indicators",
};
const OWID = {
  id: "owid_grapher",
  name: "Our World in Data",
};
// Accurate upstream attributions for the different OWID/grapher series.
const OWID_FAO = "Our World in Data — FAOSTAT";
const OWID_USGS = "Our World in Data — USGS (Mineral Commodity Summaries)";
const OWID_EI = "Our World in Data — Energy Institute Statistical Review";
const OWID_UNCCD = "Our World in Data — UNCCD (SDG 15.3.1)";
const OWID_JAMBECK = "Our World in Data — Jambeck et al. (2015), Science";
const OWID_MEIJER = "Our World in Data — Meijer et al. (2021), Science Advances";

// metric, OWID grapher slug, label, unit, source_name — OWID/grapher CSV series.
// Each series is a single value column (entity,code,year,value), parsed from the
// end of the line so comma-containing country names stay intact. Upstream source
// is recorded per series (FAO crops/livestock, USGS minerals, EI energy, UNCCD).
const OWID_SERIES: [string, string, string, string, string][] = [
  // --- Crops (FAOSTAT, tonnes) ---
  ["wheat_production", "wheat-production", "Wheat production", "t", OWID_FAO],
  ["maize_production", "maize-production", "Maize/corn production", "t", OWID_FAO],
  ["rice_production", "rice-production", "Rice production", "t", OWID_FAO],
  ["soybean_production", "soybean-production", "Soybean production", "t", OWID_FAO],
  ["coffee_production", "coffee-bean-production", "Coffee production", "t", OWID_FAO],
  ["cocoa_production", "cocoa-bean-production", "Cocoa production", "t", OWID_FAO],
  ["palm_oil_production", "palm-oil-production", "Palm oil production", "t", OWID_FAO],
  ["sugarcane_production", "sugar-cane-production", "Sugar cane production", "t", OWID_FAO],
  ["banana_production", "banana-production", "Banana production", "t", OWID_FAO],
  ["potato_production", "potato-production", "Potato production", "t", OWID_FAO],
  ["cassava_production", "cassava-production", "Cassava production", "t", OWID_FAO],
  // --- Livestock (FAOSTAT, tonnes) ---
  ["meat_production", "meat-production-tonnes", "Meat production, total", "t", OWID_FAO],
  ["milk_production", "milk-production-tonnes", "Milk production", "t", OWID_FAO],
  // --- Minerals (USGS, tonnes; OWID's "_kt" column is actually tonnes —
  //     verified against real world totals, e.g. ~244,637 t lithium in 2024) ---
  ["lithium_production", "lithium-production", "Lithium mine production", "t", OWID_USGS],
  ["graphite_production", "graphite-production", "Graphite mine production", "t", OWID_USGS],
  // --- Energy production (Energy Institute, TWh) ---
  ["coal_production", "coal-production-by-country", "Coal production", "TWh", OWID_EI],
  ["oil_production", "oil-production-by-country", "Oil production", "TWh", OWID_EI],
  ["gas_production", "gas-production-by-country", "Gas production", "TWh", OWID_EI],
  // --- Land (UNCCD) ---
  ["land_degradation", "share-degraded-land", "Degraded land (SDG 15.3.1)", "%", OWID_UNCCD],
  // --- Materials: plastics (per-country; PRIMARY-polymer production-by-country
  //     has no free authoritative source, so we map the verifiable lifecycle —
  //     waste generation, fate, and ocean leakage — not invented production) ---
  ["plastic_waste_pc", "plastic-waste-per-capita", "Plastic waste per capita", "kg/person/day", OWID_JAMBECK],
  ["plastic_to_ocean_share", "share-of-global-plastic-waste-emitted-to-the-ocean", "Share of global plastic emitted to ocean", "%", OWID_MEIJER],
  ["plastic_waste_total", "plastic-waste-generation-total", "Plastic waste generation, total", "t", OWID_JAMBECK],
  ["plastic_to_ocean_total", "plastic-waste-emitted-to-the-ocean", "Plastic emitted to ocean, total", "t/year", OWID_MEIJER],
  // NOTE: OECD's "share mismanaged" is reported by REGION, not per country
  // (only ~3 countries broken out) — omitted rather than ship a near-empty
  // choropleth that would read as global coverage.
];

const WB_INDICATORS = [
  { metric: "poverty_headcount", code: "SI.POV.DDAY", unit: "%" },
  { metric: "undernourishment", code: "SN.ITK.DEFC.ZS", unit: "%" },
  { metric: "water_access_basic", code: "SH.H2O.BASW.ZS", unit: "%" },
  { metric: "electricity_access", code: "EG.ELC.ACCS.ZS", unit: "%" },
  { metric: "clean_cooking", code: "EG.CFT.ACCS.ZS", unit: "%" },
  { metric: "forest_area", code: "AG.LND.FRST.ZS", unit: "%" },
  { metric: "renewable_energy", code: "EG.FEC.RNEW.ZS", unit: "%" },
  { metric: "mineral_rents", code: "NY.GDP.MINR.RT.ZS", unit: "%" },
  { metric: "resource_rents_total", code: "NY.GDP.TOTL.RT.ZS", unit: "%" },
  { metric: "oil_rents", code: "NY.GDP.PETR.RT.ZS", unit: "%" },
  { metric: "gas_rents", code: "NY.GDP.NGAS.RT.ZS", unit: "%" },
  { metric: "coal_rents", code: "NY.GDP.COAL.RT.ZS", unit: "%" },
  { metric: "forest_rents", code: "NY.GDP.FRST.RT.ZS", unit: "%" },
  { metric: "co2_per_capita", code: "EN.GHG.CO2.PC.CE.AR5", unit: "t/capita" },
  { metric: "co2_total", code: "EN.GHG.CO2.MT.CE.AR5", unit: "Mt" },
  { metric: "methane_total", code: "EN.GHG.CH4.MT.CE.AR5", unit: "Mt" },
  { metric: "gini", code: "SI.POV.GINI", unit: "index" },
  { metric: "cereal_yield", code: "AG.YLD.CREL.KG", unit: "kg/ha" },
  { metric: "fertilizer_use", code: "AG.CON.FERT.ZS", unit: "kg/ha" },
  { metric: "renew_water_pc", code: "ER.H2O.INTR.PC", unit: "m³/capita" },
  { metric: "water_stress", code: "ER.H2O.FWST.ZS", unit: "%" },
  // Aggregate trade flows (total, not bilateral): exports and imports of goods
  // and services in current US$. World Bank national accounts — free API.
  { metric: "exports_value", code: "NE.EXP.GNFS.CD", unit: "US$" },
  { metric: "imports_value", code: "NE.IMP.GNFS.CD", unit: "US$" },
  // Biodiversity (World Bank, sourced to IUCN / UNEP-WCMC) — free API.
  { metric: "terrestrial_protected", code: "ER.LND.PTLD.ZS", unit: "%" },
  { metric: "marine_protected", code: "ER.MRN.PTMR.ZS", unit: "%" },
  { metric: "threatened_birds", code: "EN.BIR.THRD.NO", unit: "species" },
  { metric: "threatened_plants", code: "EN.HPT.THRD.NO", unit: "species" },
];

// id, label, unit, display, higher_is_worse, source_name, source_url
const LAYERS: [string, string, string, string, boolean, string, string][] = [
  [
    "cobalt_production",
    "Cobalt mine production (2023)",
    "t",
    "world_share",
    true,
    USGS.name,
    USGS.url,
  ],
  [
    "poverty_headcount",
    "Poverty headcount, $2.15/day",
    "%",
    "percent",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/SI.POV.DDAY",
  ],
  [
    "undernourishment",
    "Undernourishment (hunger)",
    "%",
    "percent",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/SN.ITK.DEFC.ZS",
  ],
  [
    "water_access_basic",
    "Basic drinking-water access",
    "%",
    "percent",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/SH.H2O.BASW.ZS",
  ],
  [
    "electricity_access",
    "Access to electricity",
    "%",
    "percent",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/EG.ELC.ACCS.ZS",
  ],
  [
    "forest_area",
    "Forest area (% of land)",
    "%",
    "percent",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/AG.LND.FRST.ZS",
  ],
  [
    "renewable_energy",
    "Renewable energy share",
    "%",
    "percent",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/EG.FEC.RNEW.ZS",
  ],
  [
    "mineral_rents",
    "Mineral rents (% of GDP)",
    "%",
    "percent",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/NY.GDP.MINR.RT.ZS",
  ],
  [
    "co2_per_capita",
    "CO₂ emissions per capita",
    "t/capita",
    "magnitude",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/EN.GHG.CO2.PC.CE.AR5",
  ],
  [
    "renew_water_pc",
    "Renewable freshwater per capita",
    "m³/capita",
    "magnitude",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/ER.H2O.INTR.PC",
  ],
  [
    "water_stress",
    "Water stress (withdrawal vs. supply)",
    "%",
    "magnitude",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/ER.H2O.FWST.ZS",
  ],
  // ---- Crops (FAOSTAT via OWID), world-share of production ----
  ...([
    ["wheat_production", "Wheat production (FAO)", "wheat-production"],
    ["maize_production", "Maize/corn production (FAO)", "maize-production"],
    ["rice_production", "Rice production (FAO)", "rice-production"],
    ["soybean_production", "Soybean production (FAO)", "soybean-production"],
    ["coffee_production", "Coffee production (FAO)", "coffee-bean-production"],
    ["cocoa_production", "Cocoa production (FAO)", "cocoa-bean-production"],
    ["palm_oil_production", "Palm oil production (FAO)", "palm-oil-production"],
    ["sugarcane_production", "Sugar cane production (FAO)", "sugar-cane-production"],
    ["banana_production", "Banana production (FAO)", "banana-production"],
    ["potato_production", "Potato production (FAO)", "potato-production"],
    ["cassava_production", "Cassava production (FAO)", "cassava-production"],
    ["meat_production", "Meat production, total (FAO)", "meat-production-tonnes"],
    ["milk_production", "Milk production (FAO)", "milk-production-tonnes"],
  ].map(
    ([id, label, slug]) =>
      [
        id,
        label,
        "t",
        "world_share",
        false,
        OWID_FAO,
        `https://ourworldindata.org/grapher/${slug}`,
      ] as [string, string, string, string, boolean, string, string]
  )),
  // ---- Minerals (USGS via OWID), world-share of mine production (kt) ----
  ...([
    ["lithium_production", "Lithium mine production (USGS)", "lithium-production"],
    ["graphite_production", "Graphite mine production (USGS)", "graphite-production"],
  ].map(
    ([id, label, slug]) =>
      [
        id,
        label,
        "t",
        "world_share",
        true,
        OWID_USGS,
        `https://ourworldindata.org/grapher/${slug}`,
      ] as [string, string, string, string, boolean, string, string]
  )),
  // ---- Minerals (USGS MCS 2024 direct), world-share of mine production (t) ----
  ...USGS_MCS_COMMODITIES.map(
    ([id, label, itemId]) =>
      [
        id,
        `${label} (USGS)`,
        "t",
        "world_share",
        true,
        `USGS Mineral Commodity Summaries 2024 — ${label}`,
        `https://www.sciencebase.gov/catalog/item/${itemId}`,
      ] as [string, string, string, string, boolean, string, string]
  ),
  // ---- Fossil energy production (Energy Institute via OWID), world-share (TWh) ----
  ...([
    ["coal_production", "Coal production", "coal-production-by-country"],
    ["oil_production", "Oil production", "oil-production-by-country"],
    ["gas_production", "Gas production", "gas-production-by-country"],
  ].map(
    ([id, label, slug]) =>
      [
        id,
        label,
        "TWh",
        "world_share",
        true,
        OWID_EI,
        `https://ourworldindata.org/grapher/${slug}`,
      ] as [string, string, string, string, boolean, string, string]
  )),
  // ---- Emissions totals (World Bank), world-share ----
  [
    "co2_total",
    "CO₂ emissions, total",
    "Mt",
    "world_share",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/EN.GHG.CO2.MT.CE.AR5",
  ],
  [
    "methane_total",
    "Methane emissions, total",
    "Mt",
    "world_share",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/EN.GHG.CH4.MT.CE.AR5",
  ],
  // ---- Resource-rent dependence (World Bank), % of GDP ----
  ...([
    ["resource_rents_total", "Total natural-resource rents (% GDP)", "NY.GDP.TOTL.RT.ZS"],
    ["oil_rents", "Oil rents (% of GDP)", "NY.GDP.PETR.RT.ZS"],
    ["gas_rents", "Natural gas rents (% of GDP)", "NY.GDP.NGAS.RT.ZS"],
    ["coal_rents", "Coal rents (% of GDP)", "NY.GDP.COAL.RT.ZS"],
    ["forest_rents", "Forest rents (% of GDP)", "NY.GDP.FRST.RT.ZS"],
  ].map(
    ([id, label, code]) =>
      [
        id,
        label,
        "%",
        "percent",
        true,
        WB.name,
        `https://data.worldbank.org/indicator/${code}`,
      ] as [string, string, string, string, boolean, string, string]
  )),
  // ---- People / productivity (World Bank) ----
  [
    "clean_cooking",
    "Clean cooking access",
    "%",
    "percent",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/EG.CFT.ACCS.ZS",
  ],
  [
    "gini",
    "Income inequality (Gini)",
    "index",
    "percent",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/SI.POV.GINI",
  ],
  [
    "cereal_yield",
    "Cereal yield",
    "kg/ha",
    "magnitude",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/AG.YLD.CREL.KG",
  ],
  [
    "fertilizer_use",
    "Fertilizer use intensity",
    "kg/ha",
    "magnitude",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/AG.CON.FERT.ZS",
  ],
  [
    "land_degradation",
    "Degraded land (SDG 15.3.1)",
    "%",
    "percent",
    true,
    OWID_UNCCD,
    "https://ourworldindata.org/grapher/share-degraded-land",
  ],
  // ---- Aggregate trade flows (World Bank), world-share of global value ----
  [
    "exports_value",
    "Exports of goods & services (US$)",
    "US$",
    "world_share",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/NE.EXP.GNFS.CD",
  ],
  [
    "imports_value",
    "Imports of goods & services (US$)",
    "US$",
    "world_share",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/NE.IMP.GNFS.CD",
  ],
  // ---- Plastic pollution (Our World in Data) ----
  [
    "plastic_waste_pc",
    "Plastic waste per capita (kg/person/day)",
    "kg/person/day",
    "magnitude",
    true,
    OWID_JAMBECK,
    "https://ourworldindata.org/grapher/plastic-waste-per-capita",
  ],
  [
    "plastic_to_ocean_share",
    "Share of global plastic emitted to ocean",
    "%",
    "world_share",
    true,
    OWID_MEIJER,
    "https://ourworldindata.org/grapher/share-of-global-plastic-waste-emitted-to-the-ocean",
  ],
  [
    "plastic_waste_total",
    "Plastic waste generation, total",
    "t",
    "world_share",
    true,
    OWID_JAMBECK,
    "https://ourworldindata.org/grapher/plastic-waste-generation-total",
  ],
  [
    "plastic_to_ocean_total",
    "Plastic emitted to ocean, total",
    "t/year",
    "world_share",
    true,
    OWID_MEIJER,
    "https://ourworldindata.org/grapher/plastic-waste-emitted-to-the-ocean",
  ],
  // ---- Biodiversity (World Bank → IUCN / UNEP-WCMC) ----
  [
    "terrestrial_protected",
    "Terrestrial protected areas (% of land)",
    "%",
    "percent",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/ER.LND.PTLD.ZS",
  ],
  [
    "marine_protected",
    "Marine protected areas (% of waters)",
    "%",
    "percent",
    false,
    WB.name,
    "https://data.worldbank.org/indicator/ER.MRN.PTMR.ZS",
  ],
  [
    "threatened_birds",
    "Threatened bird species (IUCN)",
    "species",
    "magnitude",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/EN.BIR.THRD.NO",
  ],
  [
    "threatened_plants",
    "Threatened plant species (IUCN)",
    "species",
    "magnitude",
    true,
    WB.name,
    "https://data.worldbank.org/indicator/EN.HPT.THRD.NO",
  ],
];

const sq = (s: string) => s.replace(/'/g, "''");

async function fetchJson(url: string, tries = 4): Promise<any> {
  let lastErr = "";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        // The World Bank API intermittently returns a BOM-prefixed body or an
        // XML error page with a 200 status. Read as text, strip the BOM, and
        // JSON.parse — a parse failure is treated as transient and retried.
        const text = (await res.text()).replace(/^﻿/, "").trim();
        if (text.startsWith("<")) throw new Error("non-JSON (XML) body");
        return JSON.parse(text);
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
    if (i === tries - 1) throw new Error(`${lastErr} for ${url}`);
    await new Promise((r) => setTimeout(r, 700 * (i + 1)));
  }
}

// Minimal RFC-4180 CSV parser (handles quoted fields with commas/newlines).
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Normalize a USGS country label: non-breaking spaces, a ", concentrate"
// production-stage qualifier, and trailing footnote digits ("China6").
function cleanUsgsCountry(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .trim()
    .replace(/,\s*concentrate$/i, "")
    .replace(/\d+$/, "")
    .trim();
}

async function fetchText(url: string, tries = 3): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.text();
    if (i === tries - 1) throw new Error(`HTTP ${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  throw new Error("unreachable");
}

// Real sovereign/territory ISO3 set — excludes World Bank region aggregates
// (AFE, ARB, WLD, …) which carry valid 3-letter codes but are not countries.
async function realCountrySet(): Promise<Set<string>> {
  const json = await fetchJson(
    "https://api.worldbank.org/v2/country?format=json&per_page=400"
  );
  const set = new Set<string>();
  for (const c of json?.[1] ?? [])
    if (c?.region?.value && c.region.value !== "Aggregates" && c.id)
      set.add(c.id);
  return set;
}

async function collectRows(): Promise<MetricRow[]> {
  const rows: MetricRow[] = [];
  const realCountries = await realCountrySet();
  console.log(`WB real countries: ${realCountries.size}`);

  // --- Cobalt (USGS) from existing ingested JSON ---
  const cobalt = JSON.parse(
    readFileSync(join(DATA, "cobalt_usgs.json"), "utf8")
  );
  for (const r of cobalt.rows) {
    if (r.isAggregate || !r.iso3) continue;
    if (r.production2023_t != null)
      rows.push({
        metric: "cobalt_production",
        iso3: r.iso3,
        name: r.country ?? r.iso3,
        value: r.production2023_t,
        unit: "t",
        year: "2023",
        source_id: USGS.id,
        source_name: USGS.name,
        source_url: USGS.url,
        note: r.productionNotes ?? null,
      });
    if (r.reserves_t != null)
      rows.push({
        metric: "cobalt_reserves",
        iso3: r.iso3,
        name: r.country ?? r.iso3,
        value: r.reserves_t,
        unit: "t",
        year: null,
        source_id: USGS.id,
        source_name: USGS.name,
        source_url: USGS.url,
        note: r.reservesNotes ?? null,
      });
  }

  // --- USGS MCS 2024 per-commodity world mine production ---
  // For each commodity we read its `*_world.csv` (resolved live from the item's
  // file list), parse only the FIRST production block (mine production, the rows
  // before "World total"), convert to tonnes, and map country names to ISO3.
  // Production columns vary by commodity: Prod_<t|kt|mt>_[est_]<year>.
  const KT_TO_T: Record<string, number> = { t: 1, kt: 1e3, mt: 1e6 };
  for (const [metric, label, itemId] of USGS_MCS_COMMODITIES) {
    const itemUrl = `https://www.sciencebase.gov/catalog/item/${itemId}`;
    let csv: string;
    try {
      const meta = await fetchJson(`${itemUrl}?format=json`);
      const file = (meta?.files ?? []).find((f: any) =>
        /_world\.csv$/i.test(f?.name ?? "")
      );
      if (!file?.url) throw new Error("no _world.csv file on item");
      csv = await fetchText(file.url);
    } catch (e) {
      console.warn(`USGS ${metric}: ${(e as Error).message}`);
      continue;
    }
    const table = parseCSV(csv.replace(/^﻿/, "")).filter(
      (r) => r.length > 1 && r[0].trim() !== ""
    );
    if (!table.length) {
      console.warn(`USGS ${metric}: empty CSV`);
      continue;
    }
    const header = table[0].map((h) => h.replace(/^﻿/, "").trim());
    const iCountry = header.indexOf("Country");
    const iType = header.indexOf("Type");
    const iNotes = header.indexOf("Prod_notes");
    // Pick the most-recent production estimate column and its unit.
    let prodCol = -1;
    let prodUnit = "t";
    let prodYear = "";
    header.forEach((h, i) => {
      const m = /^Prod_(t|kt|mt)_(?:est_)?(\d{4})$/i.exec(h);
      if (m && m[2] > prodYear) {
        prodYear = m[2];
        prodUnit = m[1].toLowerCase();
        prodCol = i;
      }
    });
    if (iCountry < 0 || prodCol < 0) {
      console.warn(`USGS ${metric}: missing Country/production column`);
      continue;
    }
    const scale = KT_TO_T[prodUnit] ?? 1;
    // Some commodities list several production blocks (e.g. bauxite leads with
    // alumina *refinery* output; iron ore lists usable ore then iron content).
    // Target the first block whose Type names "mine production" so the layer is
    // genuinely mine production — not whichever block happens to come first.
    // When there is no Type column, fall back to the first block.
    let targetType = "";
    if (iType >= 0) {
      const firstMine = table
        .slice(1)
        .find((r) => /mine production/i.test(r[iType] || ""));
      if (firstMine) targetType = (firstMine[iType] || "").trim();
    }
    let inBlock = targetType === ""; // no Type → take rows until first World total
    let blockType = targetType;
    let kept = 0;
    for (const r of table.slice(1)) {
      const rawCountry = (r[iCountry] || "").trim();
      if (!rawCountry) continue;
      if (targetType) {
        // Only the rows belonging to the chosen mine-production block.
        if ((r[iType] || "").trim() !== targetType) {
          if (inBlock) break; // walked past the block
          continue;
        }
        inBlock = true;
      }
      // Stop at the block's "World total" summary row.
      if (/world total/i.test(rawCountry)) break;
      if (/^other( countries)?$/i.test(rawCountry)) continue; // aggregate
      const name = cleanUsgsCountry(rawCountry);
      const iso3 = USGS_NAME_TO_ISO3[name];
      if (!iso3) {
        console.warn(`USGS ${metric}: unmapped country "${name}" — skipped`);
        continue;
      }
      const raw = (r[prodCol] || "").replace(/,/g, "").trim();
      const v = Number(raw);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (!blockType && iType >= 0) blockType = (r[iType] || "").trim();
      rows.push({
        metric,
        iso3,
        name,
        value: v * scale,
        unit: "t",
        year: prodYear,
        source_id: "usgs_mcs_2024",
        source_name: `USGS Mineral Commodity Summaries 2024 — ${label}`,
        source_url: itemUrl,
        note: (iNotes >= 0 ? (r[iNotes] || "").trim() : "") || null,
      });
      kept++;
    }
    console.log(
      `USGS ${metric}: ${kept} countries (${prodYear}, ${prodUnit}) — ${blockType}`
    );
  }

  // --- World Bank human indices for all countries ---
  for (const ind of WB_INDICATORS) {
    // Pace requests — the WB API rate-limits bursts (HTTP 400 / XML) once we
    // fire ~20 indicator calls back to back. A short gap keeps every call clean.
    await new Promise((r) => setTimeout(r, 500));
    const base = `https://api.worldbank.org/v2/country/all/indicator/${ind.code}?format=json&per_page=500`;
    let json: any[];
    try {
      json = (await fetchJson(`${base}&mrnev=1`)) as any[];
    } catch (e) {
      // A few indicators (e.g. NE.EXP.GNFS.CD) error on mrnev=1 server-side;
      // fall back to mrv=1 (most-recent value), which returns the same shape.
      try {
        await new Promise((r) => setTimeout(r, 500));
        json = (await fetchJson(`${base}&mrv=1`)) as any[];
      } catch (e2) {
        console.warn(`WB ${ind.metric}: ${(e2 as Error).message}`);
        continue;
      }
    }
    const series = json?.[1] ?? [];
    let kept = 0;
    for (const o of series) {
      const iso3 = o.countryiso3code;
      if (!iso3 || !realCountries.has(iso3) || o.value == null) continue;
      rows.push({
        metric: ind.metric,
        iso3,
        name: o.country?.value ?? iso3,
        value: Number(o.value),
        unit: ind.unit,
        year: String(o.date),
        source_id: WB.id,
        source_name: WB.name,
        source_url: `https://data.worldbank.org/indicator/${ind.code}`,
        note: null,
      });
      kept++;
    }
    console.log(`WB ${ind.metric}: ${kept} countries`);
  }

  // --- OWID/grapher series (FAO crops + SDG 15.3.1 degradation) ---
  // Clean ISO3-coded CSV; we keep each country's most-recent non-empty year.
  for (const [metric, slug, , unit, sourceName] of OWID_SERIES) {
    let csv: string;
    try {
      csv = await fetchText(
        `https://ourworldindata.org/grapher/${slug}.csv?csvType=full&useColumnShortNames=true`
      );
    } catch (e) {
      console.warn(`OWID ${metric}: ${(e as Error).message}`);
      continue;
    }
    const lines = csv.trim().split("\n");
    const latest = new Map<
      string,
      { name: string; year: string; value: number }
    >();
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length < 4) continue;
      // Parse from the end so country names containing commas stay intact.
      const value = Number(parts[parts.length - 1]);
      const year = parts[parts.length - 2];
      const code = parts[parts.length - 3];
      const name = parts.slice(0, parts.length - 3).join(",");
      if (!code || !realCountries.has(code)) continue; // drop aggregates
      if (!Number.isFinite(value) || value <= 0) continue;
      const prev = latest.get(code);
      if (!prev || year > prev.year) latest.set(code, { name, year, value });
    }
    let kept = 0;
    for (const [iso3, r] of latest) {
      rows.push({
        metric,
        iso3,
        name: r.name,
        value: r.value,
        unit,
        year: r.year,
        source_id: OWID.id,
        source_name: sourceName,
        source_url: `https://ourworldindata.org/grapher/${slug}`,
        note: null,
      });
      kept++;
    }
    const latestYear =
      [...latest.values()].map((v) => v.year).sort().pop() ?? "-";
    console.log(`OWID ${metric}: ${kept} countries (latest ${latestYear})`);
  }

  return rows;
}

async function main() {
  const rows = await collectRows();
  console.log(`Total metric rows: ${rows.length}`);

  const tmp = join(DATA, "_metrics.json");
  writeFileSync(tmp, JSON.stringify(rows));

  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  const inst = await DuckDBInstance.create(DB_PATH);
  const conn = await inst.connect();

  await conn.run(`CREATE TABLE metric_by_country(
    metric VARCHAR, iso3 VARCHAR, name VARCHAR, value DOUBLE, unit VARCHAR, year VARCHAR,
    source_id VARCHAR, source_name VARCHAR, source_url VARCHAR, note VARCHAR
  )`);
  await conn.run(`INSERT INTO metric_by_country
    SELECT metric, iso3, name, CAST(value AS DOUBLE), unit, year,
           source_id, source_name, source_url, note
    FROM read_json_auto('${sq(tmp)}')`);

  await conn.run(`CREATE TABLE layer(
    id VARCHAR, label VARCHAR, unit VARCHAR, display VARCHAR,
    higher_is_worse BOOLEAN, source_name VARCHAR, source_url VARCHAR
  )`);
  for (const L of LAYERS) {
    await conn.run(
      `INSERT INTO layer VALUES ('${sq(L[0])}','${sq(L[1])}','${sq(
        L[2]
      )}','${sq(L[3])}',${L[4]},'${sq(L[5])}','${sq(L[6])}')`
    );
  }

  const summary = await conn.runAndReadAll(
    "SELECT metric, count(*) AS c FROM metric_by_country GROUP BY metric ORDER BY 1"
  );
  console.table(summary.getRows());

  rmSync(tmp);
  console.log("DB built at", DB_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
