import type { Source } from "@/lib/types";

// SourceRegistry: the canonical list of real, citable sources.
// Nothing renders without a Source entry behind it.
export const SOURCES: Record<string, Source> = {
  usgs_mcs_cobalt_2024: {
    id: "usgs_mcs_cobalt_2024",
    name: "Mineral Commodity Summaries 2024 — Cobalt Data Release",
    publisher: "U.S. Geological Survey (USGS)",
    url: "https://www.sciencebase.gov/catalog/item/65b7d778d34e36a39045b4af",
    license: "Public Domain (U.S. Government Work)",
    publishedAt: "2024-01-01",
    kind: "dataset",
    notes:
      "Mine production (2022, 2023 est.) and reserves of contained cobalt by country, in metric tons.",
  },
  worldbank_wdi: {
    id: "worldbank_wdi",
    name: "World Development Indicators",
    publisher: "World Bank Open Data",
    url: "https://data.worldbank.org",
    license: "CC BY 4.0",
    kind: "api",
    notes:
      "Country-level indicators (GDP, population) fetched live from api.worldbank.org.",
  },
  natural_earth: {
    id: "natural_earth",
    name: "Natural Earth — Admin 0 Countries (1:110m)",
    publisher: "Natural Earth",
    url: "https://www.naturalearthdata.com",
    license: "Public Domain",
    kind: "geodata",
    notes: "Country boundary polygons for map rendering.",
  },
  wikidata: {
    id: "wikidata",
    name: "Wikidata Query Service (SPARQL)",
    publisher: "Wikimedia Foundation",
    url: "https://query.wikidata.org",
    license: "CC0 1.0",
    kind: "api",
    notes:
      "Structured entities and relationships fetched live via SPARQL. Community-edited; treat as medium confidence.",
  },
  un_comtrade: {
    id: "un_comtrade",
    name: "UN Comtrade Database",
    publisher: "United Nations Statistics Division",
    url: "https://comtradeplus.un.org",
    license: "Custom (UN)",
    kind: "api",
    notes:
      "Bilateral trade flows. Public API now requires a subscription key; not available in this MVP.",
  },
};

export function getSource(id: string): Source {
  const s = SOURCES[id];
  if (!s) throw new Error(`Unknown source: ${id}`);
  return s;
}
