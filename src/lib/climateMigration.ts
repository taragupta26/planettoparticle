"use client";

// US county climate-habitability projections from ProPublica & NYT Magazine,
// modeled by the Rhodium Group / Climate Impact Lab. Ingested from the
// published "climate-migration" interactive. The per-county values are the
// SOURCE'S OWN ordinal severity bins (the color buckets the interactive uses),
// each of which maps to a documented physical range via the legend. We render
// counties with the source's exact legend colors — nothing is invented, and
// counties missing from the dataset are shown as honest data gaps, not zeros.

export interface ClimateLegendBin {
  0: [number | string, number | string]; // [lo, hi] physical range (or "N/A")
  1: string; // hex color
}
export interface ClimateVar {
  legend: string; // key into legends
  label: string;
  unit: string;
  cols: string[]; // column keys present for this hazard
}
export interface ClimateCounty {
  name: string;
  score: number; // composite RCP8.5 severity (sum of six hazard bins)
  bins: Record<string, number>; // column key -> ordinal bin index
}
export interface ClimateData {
  provenance: {
    title: string;
    publisher: string;
    model: string;
    project_url: string;
    license: string;
    horizon: string;
    scenarios: Record<string, string>;
    note: string;
  };
  score_def: string;
  variables: Record<string, ClimateVar>;
  legends: Record<string, ClimateLegendBin[]>;
  counties: Record<string, ClimateCounty>;
}

// A single selectable metric (hazard × scenario), flattened for the UI.
export interface ClimateMetric {
  key: string; // column key e.g. "damages_gdp_2040_85"
  varId: string; // e.g. "damages_gdp"
  label: string; // human label
  unit: string;
  scenario: "45" | "85";
  legend: string;
}

export const CM_SOURCE = {
  name: "Rhodium Group via ProPublica & NYT Magazine",
  url: "https://projects.propublica.org/climate-migration/",
};

let _data: ClimateData | null = null;
let _geo: any | null = null;

export async function loadClimateData(): Promise<ClimateData> {
  if (_data) return _data;
  const r = await fetch("/api/climate-migration");
  if (!r.ok) throw new Error("climate data fetch failed");
  _data = (await r.json()) as ClimateData;
  return _data;
}

export async function loadCountyGeo(): Promise<any> {
  if (_geo) return _geo;
  const r = await fetch("/us-counties.geo.json");
  if (!r.ok) throw new Error("county geometry fetch failed");
  _geo = await r.json();
  return _geo;
}

// Build the flat list of selectable metrics from the variable definitions.
export function metricsOf(data: ClimateData): ClimateMetric[] {
  const out: ClimateMetric[] = [];
  for (const [varId, v] of Object.entries(data.variables)) {
    for (const col of v.cols) {
      const scenario: "45" | "85" = col.endsWith("_45") ? "45" : "85";
      out.push({ key: col, varId, label: v.label, unit: v.unit, scenario, legend: v.legend });
    }
  }
  return out;
}

// Source legend color for a county's bin on a given hazard. null = data gap.
export function binColor(data: ClimateData, legend: string, bin: number | undefined): string | null {
  if (bin == null) return null;
  const bins = data.legends[legend];
  if (!bins || bin < 0 || bin >= bins.length) return null;
  return bins[bin][1] as string;
}

// Human-readable physical range for a bin, e.g. "13 to 44" or "no change".
export function binRange(data: ClimateData, legend: string, bin: number | undefined): string {
  if (bin == null) return "—";
  const bins = data.legends[legend];
  if (!bins || bin < 0 || bin >= bins.length) return "—";
  const [lo, hi] = bins[bin][0];
  if (lo === "N/A" || hi === "N/A") return "n/a";
  if (lo === hi) return `${lo}`;
  return `${lo} to ${hi}`;
}

// Join geometry with data once; each feature gets `.cm` = county record (or null).
export async function loadClimateMigration(): Promise<{
  data: ClimateData;
  features: any[];
}> {
  const [data, geo] = await Promise.all([loadClimateData(), loadCountyGeo()]);
  const features = geo.features.map((f: any) => ({
    ...f,
    cm: data.counties[f.id] ?? null,
  }));
  return { data, features };
}
