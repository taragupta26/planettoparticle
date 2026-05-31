import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Entity, Evidence, Relation } from "@/lib/types";
import { getSource } from "@/lib/sources/registry";

interface CobaltRow {
  sourceTag: string;
  country: string;
  iso3: string | null;
  isAggregate: boolean;
  isWorld: boolean;
  production2022_t: number | null;
  production2023_t: number | null;
  productionNotes: string | null;
  reserves_t: number | null;
  reservesNotes: string | null;
}

interface CobaltFile {
  resource: string;
  sourceId: string;
  retrievedAt: string;
  unit: string;
  rows: CobaltRow[];
}

let cache: CobaltFile | null = null;
function load(): CobaltFile {
  if (cache) return cache;
  const p = join(process.cwd(), "data", "cobalt_usgs.json");
  cache = JSON.parse(readFileSync(p, "utf8")) as CobaltFile;
  return cache;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export interface CobaltDomain {
  resource: Entity;
  countries: Entity[];
  world: CobaltRow | null;
  relations: Relation[];
  evidence: Evidence[];
  producerRows: CobaltRow[]; // named producing countries (not aggregates)
  retrievedAt: string;
}

export function getCobaltDomain(): CobaltDomain {
  const data = load();
  const src = getSource("usgs_mcs_cobalt_2024");
  const retrievedAt = data.retrievedAt;
  const evidence: Evidence[] = [];
  const relations: Relation[] = [];
  const countries: Entity[] = [];

  const resource: Entity = {
    id: "resource:cobalt",
    type: "resource",
    label: "Cobalt",
    wikidata: "Q740",
    evidenceIds: [],
  };

  const world = data.rows.find((r) => r.isWorld) ?? null;
  const producerRows = data.rows.filter((r) => !r.isAggregate);

  for (const row of data.rows) {
    if (row.isWorld) continue;
    const iso = row.iso3 ?? `agg:${row.country.replace(/\s+/g, "_")}`;
    const entId = `country:${iso}`;
    const countryEv: string[] = [];

    // Production evidence (most recent year available).
    if (row.production2023_t !== null) {
      const ev: Evidence = {
        id: `usgs:prod2023:${iso}`,
        sourceId: src.id,
        statement: `${row.country} — cobalt mine production: ${fmt(
          row.production2023_t
        )} metric tons of contained cobalt (2023, estimated).`,
        value: row.production2023_t,
        unit: "t",
        asOf: "2023",
        confidence: "high",
        sourceUrl: src.url,
        sourceName: src.name,
        retrievedAt,
      };
      evidence.push(ev);
      countryEv.push(ev.id);
      if (!row.isAggregate) {
        relations.push({
          id: `rel:produces:${iso}`,
          from: entId,
          to: resource.id,
          kind: "produces",
          label: `produces ${fmt(row.production2023_t)} t/yr (2023)`,
          value: row.production2023_t,
          unit: "t",
          asOf: "2023",
          evidenceIds: [ev.id],
        });
      }
    }

    // Reserves evidence (or recorded gap when NA).
    if (row.reserves_t !== null) {
      const ev: Evidence = {
        id: `usgs:reserves:${iso}`,
        sourceId: src.id,
        statement: `${row.country} — cobalt reserves: ${fmt(
          row.reserves_t
        )} metric tons of contained cobalt.${
          row.reservesNotes ? " Note: " + row.reservesNotes : ""
        }`,
        value: row.reserves_t,
        unit: "t",
        confidence: "high",
        sourceUrl: src.url,
        sourceName: src.name,
        retrievedAt,
      };
      evidence.push(ev);
      countryEv.push(ev.id);
      if (!row.isAggregate) {
        relations.push({
          id: `rel:reserves:${iso}`,
          from: entId,
          to: resource.id,
          kind: "holds_reserves",
          label: `holds ${fmt(row.reserves_t)} t reserves`,
          value: row.reserves_t,
          unit: "t",
          evidenceIds: [ev.id],
        });
      }
    }

    if (!row.isAggregate) {
      countries.push({
        id: entId,
        type: "country",
        label: row.country,
        iso3: row.iso3 ?? undefined,
        evidenceIds: countryEv,
      });
    }
  }

  if (world) {
    if (world.production2023_t !== null) {
      evidence.push({
        id: "usgs:prod2023:WORLD",
        sourceId: src.id,
        statement: `World total cobalt mine production: ${fmt(
          world.production2023_t
        )} metric tons of contained cobalt (2023, estimated, rounded).`,
        value: world.production2023_t,
        unit: "t",
        asOf: "2023",
        confidence: "high",
        sourceUrl: src.url,
        sourceName: src.name,
        retrievedAt,
      });
    }
    if (world.reserves_t !== null) {
      evidence.push({
        id: "usgs:reserves:WORLD",
        sourceId: src.id,
        statement: `World total cobalt reserves: ${fmt(
          world.reserves_t
        )} metric tons of contained cobalt.`,
        value: world.reserves_t,
        unit: "t",
        confidence: "high",
        sourceUrl: src.url,
        sourceName: src.name,
        retrievedAt,
      });
    }
  }

  return {
    resource,
    countries,
    world,
    relations,
    evidence,
    producerRows,
    retrievedAt,
  };
}

// Rank named producing countries by 2023 production (desc).
export function topProducers(n: number): CobaltRow[] {
  const { producerRows } = getCobaltDomain();
  return [...producerRows]
    .filter((r) => r.production2023_t !== null)
    .sort((a, b) => (b.production2023_t! - a.production2023_t!))
    .slice(0, n);
}
