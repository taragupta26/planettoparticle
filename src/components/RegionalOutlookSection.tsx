"use client";

import { useEffect, useState } from "react";

// Mirror of the server payload in src/lib/outlook.ts. Every number shown here is
// computed from real model output (Open-Meteo downscaled CMIP6) or read from a
// real hazard classification (GFDRR ThinkHazard!). Missing pieces render as an
// explicit gap — never invented.
interface DecadeStats {
  decade: string;
  meanTmax: number;
  hotDays35: number;
  heavyRain20: number;
  wettestDay: number;
  annualPrecip: number;
}
interface ClimateOutlook {
  available: true;
  source: string;
  sourceUrl: string;
  scenario: string;
  models: string[];
  baseline: DecadeStats;
  periods: DecadeStats[];
}
interface HazardItem {
  type: string;
  mnemonic: string;
  level: string;
  levelCode: string;
}
interface HazardOutlook {
  available: true;
  source: string;
  sourceUrl: string;
  admin: string;
  items: HazardItem[];
}
interface Outlook {
  iso: string;
  name: string;
  climate: ClimateOutlook | { available: false; reason: string };
  hazards: HazardOutlook | { available: false; reason: string };
  generatedAt: string;
}

const HAZARD_COLOR: Record<string, { bg: string; fg: string }> = {
  HIG: { bg: "#fee2e2", fg: "#b91c1c" },
  MED: { bg: "#ffedd5", fg: "#c2410c" },
  LOW: { bg: "#fef9c3", fg: "#a16207" },
  VLO: { bg: "#dcfce7", fg: "#15803d" },
  "no-data": { bg: "#f1f5f9", fg: "#94a3b8" },
};

const signed = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

// A single "what changes" row: label, the future value, and the signed delta
// versus the 2010s baseline. The delta is what makes the trend legible.
function ChangeRow({
  label,
  unit,
  base,
  future,
  futureDecade,
  digits = 1,
  worseWhenUp = true,
}: {
  label: string;
  unit: string;
  base: number;
  future: number;
  futureDecade: string;
  digits?: number;
  worseWhenUp?: boolean;
}) {
  const delta = future - base;
  const meaningful = Math.abs(delta) >= (digits === 0 ? 0.5 : 0.05);
  const worse = worseWhenUp ? delta > 0 : delta < 0;
  const color = !meaningful ? "#64748b" : worse ? "#b91c1c" : "#15803d";
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-earth-600">{label}</span>
      <span className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-earth-400">
          {base.toFixed(digits)}
          {unit} →
        </span>
        <span className="font-semibold text-earth-800">
          {future.toFixed(digits)}
          {unit}
        </span>
        <span
          className="rounded px-1 text-[10px] font-semibold"
          style={{ color }}
          title={`change by the ${futureDecade} vs 2010s`}
        >
          {meaningful ? `${signed(delta, digits)}${unit}` : "≈ flat"}
        </span>
      </span>
    </div>
  );
}

export default function RegionalOutlookSection({ iso }: { iso: string }) {
  const [data, setData] = useState<Outlook | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setData(null);
    setErr(false);
    fetch(`/api/outlook?iso=${encodeURIComponent(iso)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr(true));
  }, [iso]);

  const clim = data?.climate;
  const haz = data?.hazards;
  // Use the furthest available future decade (≈20 years) as the headline.
  const far =
    clim?.available && clim.periods.length
      ? clim.periods[clim.periods.length - 1]
      : null;

  return (
    <section className="mb-3 rounded-lg border border-sky-100 bg-sky-50/40 px-3 py-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-sky-600" />
        The next 10–20 years
        <span className="ml-auto text-sky-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2.5">
          {!data && !err && (
            <p className="text-[11px] text-earth-500">Loading projection…</p>
          )}
          {err && (
            <p className="text-[11px] text-earth-500">Outlook unavailable.</p>
          )}

          {/* ── forward climate ─────────────────────────────── */}
          {clim &&
            (clim.available && far ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-earth-400">
                  Climate · by the {far.decade}
                </div>
                <div className="space-y-1">
                  <ChangeRow
                    label="Avg. daily-high temp"
                    unit="°C"
                    base={clim.baseline.meanTmax}
                    future={far.meanTmax}
                    futureDecade={far.decade}
                  />
                  <ChangeRow
                    label="Extreme-heat days (≥35°C)"
                    unit=""
                    base={clim.baseline.hotDays35}
                    future={far.hotDays35}
                    futureDecade={far.decade}
                    digits={0}
                  />
                  <ChangeRow
                    label="Heavy-rain days (≥20mm)"
                    unit=""
                    base={clim.baseline.heavyRain20}
                    future={far.heavyRain20}
                    futureDecade={far.decade}
                    digits={0}
                  />
                  <ChangeRow
                    label="Wettest-day rainfall"
                    unit="mm"
                    base={clim.baseline.wettestDay}
                    future={far.wettestDay}
                    futureDecade={far.decade}
                    digits={0}
                  />
                </div>
                <p className="mt-1 text-[9px] leading-snug text-earth-400">
                  {clim.scenario}. Multi-model mean (
                  {clim.models.length} CMIP6 models), vs a 2010s baseline.{" "}
                  <a
                    href={clim.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted hover:text-earth-600"
                  >
                    Open-Meteo CMIP6
                  </a>
                </p>
              </div>
            ) : (
              <p className="text-[10px] leading-snug text-earth-500">
                Climate projection gap:{" "}
                {(clim as { reason: string }).reason}
              </p>
            ))}

          {/* ── present-day hazard baseline ─────────────────── */}
          {haz &&
            (haz.available ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-earth-400">
                  Natural-hazard baseline (today)
                </div>
                <div className="flex flex-wrap gap-1">
                  {haz.items.map((h) => {
                    const c = HAZARD_COLOR[h.levelCode] ?? HAZARD_COLOR["no-data"];
                    return (
                      <span
                        key={h.mnemonic}
                        className="rounded px-1.5 py-0.5 text-[9.5px] font-medium"
                        style={{ background: c.bg, color: c.fg }}
                        title={`${h.type}: ${h.level} hazard`}
                      >
                        {h.type} · {h.level}
                      </span>
                    );
                  })}
                </div>
                <p className="mt-1 text-[9px] leading-snug text-earth-400">
                  Current baseline risk (not a projection).{" "}
                  <a
                    href={haz.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted hover:text-earth-600"
                  >
                    GFDRR ThinkHazard!
                  </a>
                </p>
              </div>
            ) : (
              <p className="text-[10px] leading-snug text-earth-500">
                Hazard baseline gap: {(haz as { reason: string }).reason}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
