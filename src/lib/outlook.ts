/**
 * outlook.ts — "How will this region change over the next 10–20 years?"
 *
 * Two REAL, free, source-grounded inputs, no synthesis:
 *
 *  1. Forward climate — Open-Meteo Climate API (downscaled CMIP6, high-emissions
 *     ≈RCP8.5, 1950–2050). We sample a multi-model ensemble at the country's
 *     label-point centroid and report DECADAL statistics (mean daily-max temp,
 *     hot days ≥35 °C, heavy-rain days ≥20 mm, wettest-day & annual precip) for
 *     a recent baseline (2010s) and the 2030s / 2040s. Every number is computed
 *     directly from the model output; the change shown is model-mean − baseline.
 *
 *  2. Present-day hazard baseline — GFDRR ThinkHazard! (river/urban/coastal
 *     flood, cyclone, earthquake, landslide, drought, water scarcity, etc.),
 *     keyed by FAO GAUL admin code via our verified ISO3→GAUL crosswalk.
 *
 * Honesty rules: a country with no centroid or no GAUL match returns an explicit
 * gap, never a guess. Climate values are a single grid point under one emissions
 * pathway — surfaced as such. Hazard classes are CURRENT baseline risk, not a
 * projection, and we label them that way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── reference data (read once, cached) ─────────────────────────────────────
interface Centroid {
  name: string;
  lat: number;
  lon: number;
}
let GEO: Map<string, Centroid> | null = null;
let GAUL: Record<string, { code: number; name: string }> | null = null;
// name (lowercased) → ISO3, for resolving a country mentioned in free text.
let NAME_INDEX: { name: string; iso: string }[] | null = null;

function build() {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "public", "countries.geo.json"), "utf8")
  );
  const m = new Map<string, Centroid>();
  const idx: { name: string; iso: string }[] = [];
  for (const f of raw.features) {
    const p = f.properties ?? {};
    // Natural Earth stores "-99" in ISO_A3 for some states (France, Norway…);
    // the real code is in ISO_A3_EH. Prefer it, matching the globe's hit-test.
    const iso =
      p.ISO_A3_EH && p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : p.ISO_A3;
    const lon = Number(p.LABEL_X);
    const lat = Number(p.LABEL_Y);
    if (!iso || iso === "-99" || !Number.isFinite(lat) || !Number.isFinite(lon))
      continue;
    m.set(iso, { name: p.NAME || p.ADMIN || iso, lat, lon });
    for (const key of ["NAME", "ADMIN", "NAME_LONG", "FORMAL_EN", "BRK_NAME"]) {
      const nm = p[key];
      if (typeof nm === "string" && nm.length > 2)
        idx.push({ name: nm.toLowerCase(), iso });
    }
  }
  // Longest names first, so "democratic republic of the congo" beats "congo".
  idx.sort((a, b) => b.name.length - a.name.length);
  GEO = m;
  NAME_INDEX = idx;
}

function geo(): Map<string, Centroid> {
  if (!GEO) build();
  return GEO!;
}

// Natural Earth label-point centroid for an ISO3 (used to anchor trade-flow
// arcs). Returns null for unknown codes — an honest gap, never a guess.
export function getCentroid(
  isoRaw: string
): { iso: string; name: string; lat: number; lon: number } | null {
  const iso = (isoRaw || "").trim().toUpperCase();
  if (!iso) return null;
  const c = geo().get(iso);
  return c ? { iso, name: c.name, lat: c.lat, lon: c.lon } : null;
}

// Resolve a country named in free text → {iso, name}. Matches on a word
// boundary so "iran" doesn't fire inside "iranian-made"; longest name wins.
export function detectCountry(text: string): { iso: string; name: string } | null {
  if (!NAME_INDEX) build();
  const t = ` ${text.toLowerCase()} `;
  for (const { name, iso } of NAME_INDEX!) {
    const re = new RegExp(`[^a-z]${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z]`);
    if (re.test(t)) return { iso, name: geo().get(iso)?.name ?? name };
  }
  return null;
}

function gaul(): Record<string, { code: number; name: string }> {
  if (GAUL) return GAUL;
  GAUL = JSON.parse(
    readFileSync(join(process.cwd(), "public", "thinkhazard_gaul.json"), "utf8")
  );
  return GAUL!;
}

// ── types ───────────────────────────────────────────────────────────────────
export interface DecadeStats {
  decade: string; // "2030s"
  meanTmax: number; // °C, mean of daily maxima
  hotDays35: number; // days/yr with Tmax ≥ 35 °C
  heavyRain20: number; // days/yr with precip ≥ 20 mm
  wettestDay: number; // mm, mean annual wettest-day total
  annualPrecip: number; // mm/yr
}
export interface ClimateOutlook {
  available: true;
  source: string;
  sourceUrl: string;
  scenario: string;
  models: string[];
  lat: number;
  lon: number;
  baseline: DecadeStats;
  periods: DecadeStats[]; // future decades (2030s, 2040s)
}
export interface HazardItem {
  type: string; // "River flood"
  mnemonic: string; // "FL"
  level: string; // "High" | "Medium" | "Low" | "Very low" | "No data"
  levelCode: string; // "HIG" | "MED" | "LOW" | "VLO" | "no-data"
}
export interface HazardOutlook {
  available: true;
  source: string;
  sourceUrl: string;
  admin: string; // ThinkHazard's own admin0 name (for transparency)
  items: HazardItem[];
}
export interface RegionalOutlook {
  iso: string;
  name: string;
  climate: ClimateOutlook | { available: false; reason: string };
  hazards: HazardOutlook | { available: false; reason: string };
  generatedAt: string;
}

// Ensemble of high-resolution downscaled CMIP6 models offered by Open-Meteo.
// We average whatever each day reports; days where every model is null are
// skipped for that metric (never zero-filled).
const MODELS = [
  "MRI_AGCM3_2_S",
  "EC_Earth3P_HR",
  "MPI_ESM1_2_XR",
  "CMCC_CM2_VHR4",
];

const HOT_C = 35; // heat-stress threshold (°C)
const HEAVY_MM = 20; // heavy-rain / flood-proxy threshold (mm/day)

// ── decadal climate from Open-Meteo ──────────────────────────────────────────
async function climate(
  lat: number,
  lon: number
): Promise<ClimateOutlook | { available: false; reason: string }> {
  const url =
    `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}` +
    `&longitude=${lon}&start_date=2010-01-01&end_date=2049-12-31` +
    `&models=${MODELS.join(",")}` +
    `&daily=temperature_2m_max,precipitation_sum&temperature_unit=celsius`;

  let json: any;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) return { available: false, reason: `Open-Meteo HTTP ${r.status}` };
    json = await r.json();
  } catch (e: any) {
    return { available: false, reason: `Open-Meteo unreachable (${e?.name ?? "error"})` };
  }

  const d = json?.daily;
  const time: string[] = d?.time ?? [];
  if (!time.length) return { available: false, reason: "No climate data returned" };

  // Per-day ensemble means (skip nulls). One pass; bucket into decades.
  const ensemble = (prefix: string, i: number): number | null => {
    let sum = 0,
      n = 0;
    for (const m of MODELS) {
      const v = d[`${prefix}_${m}`]?.[i];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        n++;
      }
    }
    return n ? sum / n : null;
  };

  type Acc = {
    years: Set<number>;
    tmaxSum: number;
    tmaxN: number;
    hot: number;
    heavy: number;
    precipByYear: Map<number, number>;
    wettestByYear: Map<number, number>;
  };
  const mkAcc = (): Acc => ({
    years: new Set(),
    tmaxSum: 0,
    tmaxN: 0,
    hot: 0,
    heavy: 0,
    precipByYear: new Map(),
    wettestByYear: new Map(),
  });
  const buckets: Record<string, Acc> = {
    "2010s": mkAcc(),
    "2030s": mkAcc(),
    "2040s": mkAcc(),
  };
  const bucketOf = (y: number) =>
    y >= 2010 && y <= 2019
      ? "2010s"
      : y >= 2030 && y <= 2039
      ? "2030s"
      : y >= 2040 && y <= 2049
      ? "2040s"
      : null;

  for (let i = 0; i < time.length; i++) {
    const y = Number(time[i].slice(0, 4));
    const bk = bucketOf(y);
    if (!bk) continue;
    const a = buckets[bk];
    a.years.add(y);
    const t = ensemble("temperature_2m_max", i);
    if (t != null) {
      a.tmaxSum += t;
      a.tmaxN++;
      if (t >= HOT_C) a.hot++;
    }
    const p = ensemble("precipitation_sum", i);
    if (p != null) {
      if (p >= HEAVY_MM) a.heavy++;
      a.precipByYear.set(y, (a.precipByYear.get(y) ?? 0) + p);
      a.wettestByYear.set(y, Math.max(a.wettestByYear.get(y) ?? 0, p));
    }
  }

  const stats = (decade: string, a: Acc): DecadeStats | null => {
    const ny = a.years.size;
    if (!ny || !a.tmaxN) return null;
    const mean = (m: Map<number, number>) =>
      m.size ? [...m.values()].reduce((s, v) => s + v, 0) / m.size : 0;
    return {
      decade,
      meanTmax: a.tmaxSum / a.tmaxN,
      hotDays35: a.hot / ny,
      heavyRain20: a.heavy / ny,
      wettestDay: mean(a.wettestByYear),
      annualPrecip: mean(a.precipByYear),
    };
  };

  const baseline = stats("2010s", buckets["2010s"]);
  const periods = [stats("2030s", buckets["2030s"]), stats("2040s", buckets["2040s"])].filter(
    (s): s is DecadeStats => s != null
  );
  if (!baseline || !periods.length)
    return { available: false, reason: "Climate model returned no usable values for this point" };

  return {
    available: true,
    source: "Open-Meteo Climate API — downscaled CMIP6 multi-model ensemble",
    sourceUrl: "https://open-meteo.com/en/docs/climate-api",
    scenario: "High-emissions pathway (~RCP8.5), single grid point at country centroid",
    models: MODELS,
    lat,
    lon,
    baseline,
    periods,
  };
}

// ── present-day hazard baseline from ThinkHazard! ────────────────────────────
async function hazards(
  iso: string
): Promise<HazardOutlook | { available: false; reason: string }> {
  const entry = gaul()[iso];
  if (!entry)
    return {
      available: false,
      reason: "No ThinkHazard administrative match for this country (hazard baseline gap).",
    };
  try {
    const r = await fetch(
      `https://www.thinkhazard.org/en/report/${entry.code}.json`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!r.ok) return { available: false, reason: `ThinkHazard HTTP ${r.status}` };
    const arr = (await r.json()) as any[];
    const items: HazardItem[] = arr
      .map((h) => ({
        type: h?.hazardtype?.hazardtype ?? "",
        mnemonic: h?.hazardtype?.mnemonic ?? "",
        level: h?.hazardlevel?.title ?? "No data",
        levelCode: h?.hazardlevel?.mnemonic ?? "no-data",
      }))
      .filter((h) => h.type);
    if (!items.length) return { available: false, reason: "ThinkHazard returned no hazards" };
    return {
      available: true,
      source: "GFDRR ThinkHazard! — current hazard classification",
      sourceUrl: `https://www.thinkhazard.org/en/report/${entry.code}`,
      admin: entry.name,
      items,
    };
  } catch (e: any) {
    return { available: false, reason: `ThinkHazard unreachable (${e?.name ?? "error"})` };
  }
}

// ── current conditions (Open-Meteo live forecast, no key) ────────────────────
// Real-time weather at the country's Natural Earth label point — a single
// representative location, NOT a country-wide value. We surface it as such.
export interface CurrentWeather {
  available: true;
  source: string;
  sourceUrl: string;
  lat: number;
  lon: number;
  time: string;
  tempC: number;
  humidity: number | null;
  precipMm: number;
  windKmh: number;
  code: number;
  desc: string;
}

// WMO weather-interpretation codes (Open-Meteo) → plain language.
const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail",
};

const wxG = globalThis as unknown as {
  __wxCache?: Map<string, { at: number; data: CurrentWeather | { available: false; reason: string } }>;
};
const WX_TTL_MS = 10 * 60 * 1000; // 10 min — conditions change

export async function getCurrentWeather(
  isoRaw: string
): Promise<CurrentWeather | { available: false; reason: string } | null> {
  const iso = (isoRaw || "").trim().toUpperCase();
  if (!iso) return null;
  const c = geo().get(iso);
  if (!c) return null; // unknown country → caller renders a gap

  if (!wxG.__wxCache) wxG.__wxCache = new Map();
  const hit = wxG.__wxCache.get(iso);
  if (hit && Date.now() - hit.at < WX_TTL_MS) return hit.data;

  let data: CurrentWeather | { available: false; reason: string };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code` +
      `&timezone=auto`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) {
      data = { available: false, reason: `Open-Meteo HTTP ${r.status}` };
    } else {
      const j = await r.json();
      const cur = j?.current;
      if (!cur || typeof cur.temperature_2m !== "number") {
        data = { available: false, reason: "No current weather returned" };
      } else {
        data = {
          available: true,
          source: "Open-Meteo — current conditions",
          sourceUrl: "https://open-meteo.com/",
          lat: c.lat,
          lon: c.lon,
          time: cur.time,
          tempC: cur.temperature_2m,
          humidity: typeof cur.relative_humidity_2m === "number" ? cur.relative_humidity_2m : null,
          precipMm: typeof cur.precipitation === "number" ? cur.precipitation : 0,
          windKmh: cur.wind_speed_10m,
          code: cur.weather_code,
          desc: WMO[cur.weather_code] ?? "—",
        };
      }
    }
  } catch (e: any) {
    data = { available: false, reason: `Open-Meteo unreachable (${e?.name ?? "error"})` };
  }
  wxG.__wxCache.set(iso, { at: Date.now(), data });
  return data;
}

// ── in-memory cache (slow upstream fetches; values are stable) ───────────────
const g = globalThis as unknown as {
  __outlookCache?: Map<string, { at: number; data: RegionalOutlook }>;
};
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

export async function getOutlook(isoRaw: string): Promise<RegionalOutlook | null> {
  const iso = (isoRaw || "").trim().toUpperCase();
  if (!iso) return null;
  const c = geo().get(iso);
  if (!c) return null; // unknown country → caller renders a gap

  if (!g.__outlookCache) g.__outlookCache = new Map();
  const hit = g.__outlookCache.get(iso);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const [clim, haz] = await Promise.all([climate(c.lat, c.lon), hazards(iso)]);
  const data: RegionalOutlook = {
    iso,
    name: c.name,
    climate: clim,
    hazards: haz,
    generatedAt: new Date().toISOString(),
  };
  g.__outlookCache.set(iso, { at: Date.now(), data });
  return data;
}
