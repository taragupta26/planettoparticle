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
  gini: { label: "Income inequality", meaning: "0 = equal, 100 = most unequal", bucket: 0 },
  // 1 — the environment people live in
  water_stress: { label: "Water stress", meaning: "freshwater withdrawn vs. what's available", bucket: 1 },
  co2_per_capita: { label: "CO₂ per person", meaning: "emissions each resident is tied to", bucket: 1 },
  plastic_waste_pc: { label: "Plastic waste per person", meaning: "plastic thrown away per person daily", bucket: 1 },
  plastic_to_ocean_share: { label: "Plastic reaching the ocean", meaning: "this country's share of ocean plastic — it re-enters food via fish", bucket: 1 },
  forest_area: { label: "Forest cover", meaning: "share of land that is forest", bucket: 1 },
  land_degradation: { label: "Degraded land", meaning: "share of land losing productivity", bucket: 1 },
  terrestrial_protected: { label: "Protected land", meaning: "share of land safeguarded for nature", bucket: 1 },
  marine_protected: { label: "Protected seas", meaning: "share of waters safeguarded for nature", bucket: 1 },
  threatened_birds: { label: "Threatened bird species", meaning: "birds at risk of disappearing here", bucket: 1 },
  threatened_plants: { label: "Threatened plant species", meaning: "plants at risk of disappearing here", bucket: 1 },
  renewable_energy: { label: "Renewable energy", meaning: "share of energy from renewables", bucket: 1 },
  // 2 — what the land & resources generate (and who captures it)
  resource_rents_total: { label: "Resource rents", meaning: "value of all natural resources as % of GDP", bucket: 2 },
  mineral_rents: { label: "Mineral rents", meaning: "mining value as % of GDP", bucket: 2 },
  oil_rents: { label: "Oil rents", meaning: "oil value as % of GDP", bucket: 2 },
  gas_rents: { label: "Gas rents", meaning: "gas value as % of GDP", bucket: 2 },
  forest_rents: { label: "Forest rents", meaning: "forestry value as % of GDP", bucket: 2 },
  exports_value: { label: "Exports", meaning: "goods & services sold abroad", bucket: 2 },
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
}: {
  iso: string;
  onClose: () => void;
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
        <button
          onClick={onClose}
          className="-mr-1 shrink-0 rounded-md px-1.5 py-0.5 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
          aria-label="Close"
        >
          ✕
        </button>
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
