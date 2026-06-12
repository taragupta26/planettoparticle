"use client";

import { useEffect, useState } from "react";
import RegionalOutlookSection from "./RegionalOutlookSection";

interface CountryMetric {
  metric: string;
  value: number;
  unit: string;
  year: string | null;
  source_name: string;
  source_url: string;
  label: string | null;
}
interface Payload {
  name: string | null;
  metrics: CountryMetric[];
}

// Place/community framing: each metric gets a plain-language meaning for the
// people who live there. Wording is neutral and the NUMBER is always the real
// value — nothing here is invented. Grouped into what daily life is like, the
// environment people live in, and what the land/resources generate (and who
// captures that value).
const MEANING: Record<string, { label: string; meaning: string; bucket: 0 | 1 | 2 }> = {
  // 0 — daily life
  poverty_headcount: { label: "Living in extreme poverty", meaning: "share of people under $2.15/day", bucket: 0 },
  undernourishment: { label: "Going hungry", meaning: "share who don't get enough food", bucket: 0 },
  water_access_basic: { label: "Basic drinking water", meaning: "share with at least basic water access", bucket: 0 },
  electricity_access: { label: "Electricity at home", meaning: "share of people with power", bucket: 0 },
  clean_cooking: { label: "Clean cooking fuel", meaning: "share not breathing cooking smoke", bucket: 0 },
  basic_sanitation: { label: "Basic sanitation", meaning: "share with at least basic toilet/latrine", bucket: 0 },
  life_expectancy: { label: "Life expectancy", meaning: "years a newborn is expected to live", bucket: 0 },
  child_mortality: { label: "Child mortality (under-5)", meaning: "deaths per 1,000 live births", bucket: 0 },
  maternal_mortality: { label: "Maternal mortality", meaning: "deaths per 100,000 live births", bucket: 0 },
  school_enrollment: { label: "Primary school enrollment", meaning: "gross ratio (can exceed 100% if older students enroll)", bucket: 0 },
  obesity_adults: { label: "Adult obesity", meaning: "share of adults with BMI ≥ 30", bucket: 0 },
  internet_access: { label: "Internet access", meaning: "share of people using the internet", bucket: 0 },
  access_to_finance: { label: "Access to finance", meaning: "share of adults with a bank/mobile account", bucket: 0 },
  gini: { label: "Income inequality", meaning: "0 = equal, 100 = most unequal", bucket: 0 },
  hdi: { label: "Human Development Index", meaning: "composite of income, education, and life expectancy (0 = lowest, 1 = highest)", bucket: 0 },
  urban_population: { label: "Urban population", meaning: "share of people living in urban areas", bucket: 0 },
  tuberculosis: { label: "Tuberculosis incidence", meaning: "new and relapse TB cases per 100,000 people", bucket: 0 },
  physicians: { label: "Physicians per 1,000 people", meaning: "number of doctors available per 1,000 people", bucket: 0 },
  female_labor: { label: "Female labor participation", meaning: "share of women aged 15+ in the labor force", bucket: 0 },
  secondary_enrollment: { label: "Secondary school enrollment", meaning: "gross enrollment ratio — can exceed 100% if older students enroll", bucket: 0 },
  caloric_supply: { label: "Dietary energy supply", meaning: "average daily food availability per person (kcal/day)", bucket: 0 },
  women_in_parliament: { label: "Women in parliament", meaning: "share of national parliament seats held by women", bucket: 0 },
  neonatal_mortality: { label: "Neonatal mortality", meaning: "deaths in first 28 days of life, per 1,000 live births", bucket: 0 },
  hiv_incidence: { label: "HIV incidence", meaning: "new HIV infections per 1,000 uninfected people per year", bucket: 0 },
  diabetes_prevalence: { label: "Diabetes prevalence", meaning: "share of adults aged 20-79 living with diabetes", bucket: 0 },
  hospital_beds: { label: "Hospital beds per 1,000", meaning: "inpatient beds available per 1,000 people", bucket: 0 },
  road_deaths: { label: "Road traffic deaths", meaning: "deaths from road accidents per 100,000 people", bucket: 0 },
  safe_sanitation: { label: "Safely managed sanitation", meaning: "share with a toilet that hygienically separates waste — higher standard than basic sanitation", bucket: 0 },
  food_insecurity_severe: { label: "Severe food insecurity", meaning: "share who ran out of food, went a day without eating, or worse in the past year", bucket: 0 },
  stunting: { label: "Child stunting (under 5)", meaning: "share of children whose height is too low for their age — sign of chronic undernutrition", bucket: 0 },
  suicide_rate: { label: "Suicide mortality rate", meaning: "deaths by suicide per 100,000 people — reflects mental health and social conditions", bucket: 0 },
  adult_literacy: { label: "Adult literacy rate", meaning: "share of adults aged 15+ who can read and write", bucket: 0 },
  mobile_subscriptions: { label: "Mobile phone subscriptions", meaning: "subscriptions per 100 people — can exceed 100 where people hold multiple SIMs", bucket: 0 },
  alcohol_consumption: { label: "Alcohol consumption per capita", meaning: "litres of pure alcohol per person per year", bucket: 0 },
  uhc_coverage: { label: "Universal health coverage (UHC)", meaning: "index 0–100 tracking access to essential health services — higher = better coverage", bucket: 0 },
  homicide_rate: { label: "Homicide rate", meaning: "intentional homicides per 100,000 people — a proxy for personal safety and state capacity", bucket: 0 },
  alcohol_deaths: { label: "Deaths from alcohol disorders", meaning: "age-standardized death rate from alcohol use disorders (per 100,000)", bucket: 0 },
  drug_deaths: { label: "Deaths from drug use disorders", meaning: "age-standardized death rate from drug use disorders (per 100,000) — opioids, stimulants, and other substances", bucket: 0 },
  employment_ratio: { label: "Employment-to-population ratio", meaning: "share of working-age adults (15+) who are employed — higher = more people contributing to the economy", bucket: 0 },
  broadband: { label: "Fixed broadband access", meaning: "fixed broadband subscriptions per 100 people — indicator of digital infrastructure depth beyond mobile-only connectivity", bucket: 0 },
  fertility_rate: { label: "Fertility rate", meaning: "average number of births per woman — reflects education, health access, and women's autonomy", bucket: 0 },
  pop_over_65: { label: "Population over 65 (%)", meaning: "share of people at or above retirement age — indicator of demographic aging", bucket: 0 },
  pop_under_14: { label: "Population under 14 (%)", meaning: "share of children — shows youth bulge and pressure on schools and services", bucket: 0 },
  population_density: { label: "Population density", meaning: "people per square kilometre — shapes infrastructure needs and resource pressure", bucket: 0 },
  // 1 — the environment people live in
  water_stress: { label: "Water stress", meaning: "freshwater withdrawn vs. what's available", bucket: 1 },
  agri_land: { label: "Agricultural land", meaning: "share of land used for farming", bucket: 1 },
  arable_land: { label: "Arable land", meaning: "share of land suitable for crops", bucket: 1 },
  energy_per_capita: { label: "Energy use per person", meaning: "kilograms of oil equivalent per person", bucket: 1 },
  pm25_exposure: { label: "Air pollution (PM2.5)", meaning: "annual mean fine-particle exposure (WHO safe limit: 5 µg/m³)", bucket: 1 },
  air_pollution_deaths: { label: "Deaths from air pollution", meaning: "age-standardized death rate from outdoor and household air pollution (per 100,000)", bucket: 1 },
  n2o_total: { label: "Nitrous oxide (N₂O)", meaning: "total national N₂O emissions (agriculture + industry)", bucket: 1 },
  electricity_per_capita: { label: "Electricity use per person", meaning: "kilowatt-hours of electricity consumed per person per year", bucket: 1 },
  electricity_losses: { label: "Electricity grid losses", meaning: "share of power lost in transmission and distribution — reflects grid quality and investment", bucket: 1 },
  energy_intensity: { label: "Energy intensity", meaning: "megajoules of primary energy per dollar of PPP GDP — higher = less efficient; improvement signals decoupling of growth from energy", bucket: 1 },
  hydro_electricity: { label: "Hydropower share", meaning: "share of electricity generated from hydropower — connects energy to water availability", bucket: 1 },
  renewable_electricity_xhydro: { label: "Solar/wind electricity share", meaning: "share from renewables excluding hydro — shows the pace of the clean energy transition", bucket: 1 },
  coal_electricity: { label: "Coal-fired electricity share", meaning: "share of electricity generated from coal — major driver of local air pollution and CO₂", bucket: 1 },
  gas_electricity: { label: "Gas-fired electricity share", meaning: "share of electricity from natural gas — cleaner than coal but still fossil", bucket: 1 },
  oil_electricity: { label: "Oil-fired electricity share", meaning: "share of electricity from oil — usually costly, often on island or isolated grids", bucket: 1 },
  co2_per_capita: { label: "CO₂ per person", meaning: "emissions each resident is tied to", bucket: 1 },
  plastic_waste_pc: { label: "Plastic waste per person", meaning: "plastic thrown away per person daily", bucket: 1 },
  plastic_to_ocean_share: { label: "Plastic reaching the ocean", meaning: "this country's share of ocean plastic — it re-enters food via fish", bucket: 1 },
  forest_area: { label: "Forest cover", meaning: "share of land that is forest", bucket: 1 },
  land_degradation: { label: "Degraded land", meaning: "share of land losing productivity", bucket: 1 },
  terrestrial_protected: { label: "Protected land", meaning: "share of land safeguarded for nature", bucket: 1 },
  marine_protected: { label: "Protected seas", meaning: "share of waters safeguarded for nature", bucket: 1 },
  threatened_birds: { label: "Threatened bird species", meaning: "birds at risk of disappearing here", bucket: 1 },
  threatened_plants: { label: "Threatened plant species", meaning: "plants at risk of disappearing here", bucket: 1 },
  threatened_mammals: { label: "Threatened mammal species", meaning: "mammals at risk of disappearing here", bucket: 1 },
  threatened_fish: { label: "Threatened fish species", meaning: "fish at risk of extinction in this country's waters and rivers", bucket: 1 },
  tobacco_deaths: { label: "Deaths from smoking", meaning: "age-standardized death rate from tobacco use (per 100,000)", bucket: 1 },
  cardiovascular_deaths: { label: "Cardiovascular deaths", meaning: "age-standardized death rate from heart disease and stroke (per 100,000) — the world's leading cause of death", bucket: 1 },
  renewable_energy: { label: "Renewable energy", meaning: "share of energy from renewables", bucket: 1 },
  // 2 — what the land & resources generate (and who captures it)
  fish_catch: { label: "Fish & seafood catch", meaning: "wild-caught fish and seafood (tonnes/year)", bucket: 2 },
  aquaculture: { label: "Aquaculture production", meaning: "farmed fish and seafood (tonnes/year)", bucket: 2 },
  gdp_per_capita: { label: "GDP per capita", meaning: "output per person — what the economy generates for each resident", bucket: 2 },
  gni_per_capita_ppp: { label: "GNI per capita (PPP)", meaning: "purchasing-power-adjusted income per person — better than nominal GDP for comparing living standards", bucket: 2 },
  health_expenditure: { label: "Health expenditure (% GDP)", meaning: "share of national output spent on healthcare (public + private)", bucket: 2 },
  trade_openness: { label: "Trade openness (% GDP)", meaning: "exports + imports as a share of GDP — how exposed the economy is to global trade", bucket: 2 },
  remittances: { label: "Remittances received (% GDP)", meaning: "money sent home by citizens working abroad, as a share of GDP", bucket: 2 },
  education_expenditure: { label: "Education expenditure (% GDP)", meaning: "government spending on education as a share of GDP", bucket: 2 },
  manuf_value_added: { label: "Manufacturing value added", meaning: "manufacturing sector's contribution to GDP — factory economy vs. resource exporter", bucket: 2 },
  agri_value_added: { label: "Agriculture value added", meaning: "farming sector's contribution to GDP — how much the economy depends on land", bucket: 2 },
  inflation: { label: "Inflation rate", meaning: "annual price increase — high inflation erodes wages and food purchasing power", bucket: 2 },
  poverty_gap: { label: "Poverty gap ($2.15/day)", meaning: "how far the poorest fall below the poverty line — depth, not just count", bucket: 2 },
  unemployment: { label: "Unemployment rate", meaning: "share of the labor force without a job but actively seeking one", bucket: 2 },
  control_of_corruption: { label: "Control of corruption (WGI)", meaning: "World Bank governance score: −2.5 = no control, +2.5 = strong control — captures resource rent capture", bucket: 2 },
  tech_exports: { label: "High-technology exports", meaning: "share of manufactured exports that are high-tech — shows economic complexity", bucket: 2 },
  gross_savings: { label: "Gross savings (% GNI)", meaning: "share of national income saved rather than consumed — determines investment capacity", bucket: 2 },
  current_account: { label: "Current account balance", meaning: "% of GDP — positive = surplus (net lender), negative = deficit (net borrower)", bucket: 2 },
  out_of_pocket_health: { label: "Out-of-pocket health spending", meaning: "share of all health spending paid directly by patients — high = financially catastrophic illness risk", bucket: 2 },
  tax_revenue: { label: "Tax revenue (% GDP)", meaning: "share of GDP collected as taxes — fiscal capacity to fund public services", bucket: 2 },
  food_production_index: { label: "Food production index", meaning: "food output relative to 2014–16 baseline (100 = same as baseline) — tracks whether a country is producing more or less food", bucket: 2 },
  resource_rents_total: { label: "Resource rents", meaning: "value of all natural resources as % of GDP", bucket: 2 },
  mineral_rents: { label: "Mineral rents", meaning: "mining value as % of GDP", bucket: 2 },
  oil_rents: { label: "Oil rents", meaning: "oil value as % of GDP", bucket: 2 },
  gas_rents: { label: "Gas rents", meaning: "gas value as % of GDP", bucket: 2 },
  forest_rents: { label: "Forest rents", meaning: "forestry value as % of GDP", bucket: 2 },
  exports_value: { label: "Exports", meaning: "goods & services sold abroad", bucket: 2 },
  military_expenditure: { label: "Military expenditure", meaning: "defence spending as % of GDP — shapes fiscal trade-offs between security and social services", bucket: 2 },
  business_days: { label: "Time to register a business", meaning: "days needed to complete all formalities to legally start a company — proxy for bureaucratic friction", bucket: 2 },
};

const BUCKETS = [
  { title: "What daily life is like", color: "#b45309" },
  { title: "The environment people live in", color: "#15803d" },
  { title: "What the land & resources generate", color: "#1d4ed8" },
];

function fmt(m: CountryMetric): string {
  if (m.unit === "%") return `${m.value.toFixed(1)}%`;
  if (m.unit === "US$")
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(m.value);
  if (m.unit === "species") return `${Math.round(m.value)} species`;
  if (m.unit === "years") return `${m.value.toFixed(1)} yrs`;
  if (m.unit === "per 1000") return `${m.value.toFixed(1)} per 1,000`;
  if (m.unit === "per 100k") return `${Math.round(m.value).toLocaleString()} per 100k`;
  if (m.unit === "µg/m³") return `${m.value.toFixed(1)} µg/m³`;
  if (m.unit === "kg oil eq") return `${Math.round(m.value).toLocaleString()} kg`;
  if (m.unit === "index") return m.value < 2 ? m.value.toFixed(3) : m.value.toFixed(1);
  if (m.unit === "kcal/day") return `${Math.round(m.value).toLocaleString()} kcal/day`;
  if (m.unit === "kWh") return `${Math.round(m.value).toLocaleString()} kWh`;
  if (m.unit === "per 100") return `${m.value.toFixed(0)} per 100 people`;
  if (m.unit === "L/capita") return `${m.value.toFixed(1)} L/yr`;
  if (m.unit === "births/woman") return `${m.value.toFixed(2)} births/woman`;
  if (m.unit === "per km²") return `${m.value.toFixed(1)} /km²`;
  if (m.unit === "PPP$")
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(m.value) + " (PPP)";
  if (m.unit === "score") return m.value.toFixed(2);
  if (m.unit === "MJ/PPP$") return `${m.value.toFixed(1)} MJ/PPP$`;
  if (m.unit === "days") return `${m.value.toFixed(0)} days`;
  if (m.unit === "t" || m.unit === "t/year") {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(m.value) + " t";
  }
  return `${m.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.unit}`;
}

interface WeatherPayload {
  available?: boolean;
  reason?: string;
  source?: string;
  sourceUrl?: string;
  time?: string;
  tempC?: number;
  humidity?: number | null;
  precipMm?: number;
  windKmh?: number;
  desc?: string;
}

// Live current conditions at the country's label point (Open-Meteo, no key).
// Explicitly a single representative location, not a country-wide value.
function CurrentWeatherStrip({ iso }: { iso: string }) {
  const [wx, setWx] = useState<WeatherPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setWx(null);
    setFailed(false);
    fetch(`/api/weather?iso=${encodeURIComponent(iso)}`)
      .then((r) => r.json())
      .then(setWx)
      .catch(() => setFailed(true));
  }, [iso]);

  if (failed) return null;
  if (!wx)
    return (
      <p className="mb-3 text-[11px] text-earth-400">Loading current conditions…</p>
    );
  if (!wx.available)
    return (
      <p className="mb-3 rounded-lg border border-dashed border-earth-200 px-3 py-2 text-[11px] text-earth-500">
        Current conditions unavailable — {wx.reason ?? "data gap"}.
      </p>
    );

  const t = wx.time ? wx.time.replace("T", " ") : "";
  return (
    <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
          Right now · representative point
        </span>
        <span className="text-[9px] text-earth-400">{t} local</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px] text-earth-800">
        <span className="text-base font-bold text-earth-900">
          {Math.round(wx.tempC ?? 0)}°C
        </span>
        <span className="text-earth-600">{wx.desc}</span>
        {wx.humidity != null && (
          <span className="tabular-nums">{wx.humidity}% humidity</span>
        )}
        <span className="tabular-nums">
          {(wx.precipMm ?? 0).toFixed(1)} mm precip
        </span>
        <span className="tabular-nums">{Math.round(wx.windKmh ?? 0)} km/h wind</span>
      </div>
      <a
        href={wx.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-0.5 inline-block text-[9px] text-earth-400 underline decoration-dotted hover:text-earth-600"
      >
        {wx.source}
      </a>
    </div>
  );
}

export default function CountryImpactPanel({
  iso,
  onClose,
  onMinimize,
}: {
  iso: string;
  onClose: () => void;
  onMinimize?: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setData(null);
    setErr(false);
    fetch(`/api/country?iso=${encodeURIComponent(iso)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr(true));
  }, [iso]);

  const known = (data?.metrics ?? []).filter((m) => MEANING[m.metric]);
  const byBucket = (b: number) =>
    known
      .filter((m) => MEANING[m.metric].bucket === b)
      .sort((a, z) => MEANING[a.metric].label.localeCompare(MEANING[z.metric].label));

  // Data-derived headline (juxtaposition only — no causal claim, no invented
  // numbers): resources generated vs. poverty experienced.
  const rents = known.find((m) => m.metric === "resource_rents_total");
  const pov = known.find((m) => m.metric === "poverty_headcount");

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-30 max-h-[calc(100vh-2rem)] w-[360px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-earth-200 bg-white/95 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-2 border-b border-earth-100 px-4 py-3">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={!collapsed}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <div className="flex items-center gap-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-earth-400">
              What this place means for the people in it
            </div>
            <span className="text-[10px] text-earth-400 transition-transform" style={{ display:"inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
              ▾
            </span>
          </div>
          <h2 className="text-base font-bold text-earth-900">
            {data?.name ?? iso}
          </h2>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="rounded-md px-1.5 py-0.5 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
              aria-label="Minimize — keep trade flows visible"
              title="Minimize — trade flows stay on map"
            >
              ⊟
            </button>
          )}
          <button
            onClick={onClose}
            className="-mr-1 rounded-md px-1.5 py-0.5 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
            aria-label="Close"
            title="Close and clear"
          >
            ✕
          </button>
        </div>
      </div>

      {!collapsed && <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-4 py-3">
        {err && (
          <p className="text-[12px] text-earth-500">Country data unavailable.</p>
        )}
        {!err && !data && (
          <p className="text-[12px] text-earth-500">Loading…</p>
        )}
        {data && known.length === 0 && (
          <p className="text-[12px] text-earth-500">
            No per-country indicators on record yet for {data.name ?? iso} — a
            data gap, not a zero.
          </p>
        )}

        {data && <CurrentWeatherStrip iso={iso} />}

        {rents && pov && (
          <p className="mb-3 rounded-lg border-l-2 border-earth-600 bg-earth-50/70 px-3 py-2 text-[12px] leading-snug text-earth-800">
            Natural resources generate{" "}
            <b>{rents.value.toFixed(1)}% of GDP</b> in rents here, while{" "}
            <b>{pov.value.toFixed(1)}% of people</b> live on under $2.15/day.
          </p>
        )}

        {BUCKETS.map((bk, bi) => {
          const rows = byBucket(bi);
          if (!rows.length) return null;
          return (
            <section key={bk.title} className="mb-3">
              <h3
                className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: bk.color }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: bk.color }}
                />
                {bk.title}
              </h3>
              <ul className="space-y-1.5">
                {rows.map((m) => {
                  const meta = MEANING[m.metric];
                  return (
                    <li
                      key={m.metric}
                      className="rounded-md border border-earth-100 bg-white/70 px-2.5 py-1.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium text-earth-800">
                          {meta.label}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-earth-900">
                          {fmt(m)}
                          {m.year && (
                            <span className="ml-1 text-[9px] font-normal text-earth-400">
                              {m.year}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="text-[10px] leading-snug text-earth-500">
                        {meta.meaning}
                      </div>
                      <a
                        href={m.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9px] text-earth-400 underline decoration-dotted hover:text-earth-600"
                      >
                        {m.source_name}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <RegionalOutlookSection iso={iso} />

        <p className="mt-1 text-[10px] leading-snug text-earth-400">
          Every figure is a real, source-attributed value. Missing indicators
          are data gaps, never filled in.
        </p>
      </div>}
    </div>
  );
}
