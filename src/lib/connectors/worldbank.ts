import type { Evidence } from "@/lib/types";
import { getSource } from "@/lib/sources/registry";

// Live connector to World Bank Open Data. No API key required.
// Returns the most recent non-null observation for each requested indicator.

const INDICATORS: { code: string; label: string; unit: string }[] = [
  { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)", unit: "USD" },
  { code: "SP.POP.TOTL", label: "Population, total", unit: "people" },
  {
    code: "NY.GDP.PCAP.CD",
    label: "GDP per capita (current US$)",
    unit: "USD",
  },
];

interface WBObs {
  date: string;
  value: number | null;
}

async function fetchIndicator(
  iso3: string,
  code: string
): Promise<WBObs | null> {
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${code}?format=json&per_page=60&mrnev=1`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = (await res.json()) as any[];
    const series = json?.[1];
    if (!Array.isArray(series) || series.length === 0) return null;
    const obs = series.find((o) => o.value !== null) ?? series[0];
    return { date: obs.date, value: obs.value };
  } catch {
    return null;
  }
}

export async function worldBankCountryEvidence(
  iso3: string,
  countryLabel: string
): Promise<Evidence[]> {
  const src = getSource("worldbank_wdi");
  const retrievedAt = new Date().toISOString();
  const results = await Promise.all(
    INDICATORS.map(async (ind) => {
      const obs = await fetchIndicator(iso3, ind.code);
      if (!obs || obs.value === null) return null;
      const ev: Evidence = {
        id: `wb:${iso3}:${ind.code}`,
        sourceId: src.id,
        statement: `${countryLabel} — ${ind.label}: ${formatValue(
          obs.value,
          ind.unit
        )} (${obs.date}).`,
        value: obs.value,
        unit: ind.unit,
        asOf: obs.date,
        confidence: "high",
        sourceUrl: `https://data.worldbank.org/indicator/${ind.code}?locations=${iso3}`,
        sourceName: src.name,
        retrievedAt,
      };
      return ev;
    })
  );
  return results.filter((e): e is Evidence => e !== null);
}

function formatValue(v: number, unit: string): string {
  if (unit === "USD") {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)} billion`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)} million`;
    return `$${Math.round(v).toLocaleString()}`;
  }
  if (unit === "people") return `${Math.round(v).toLocaleString()}`;
  return `${v}`;
}
