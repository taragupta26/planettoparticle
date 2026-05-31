"use client";

import { useEffect, useMemo, useState } from "react";

interface Boundary {
  name: string;
  controlVariable: string;
  boundary: string;
  uncertainty?: string;
  current: string;
  status: "transgressed" | "within" | string;
  unit: string;
  note?: string;
  source?: string;
  sourceUrl?: string;
}
interface Payload {
  sourceName: string;
  sourceUrl: string;
  citation: string;
  note: string;
  asOf: string;
  summary: { transgressed: number; within: number; total: number };
  boundaries: Boundary[];
}

const COLOR = {
  transgressed: "#dc2626",
  within: "#16a34a",
  other: "#94a3b8",
} as const;

// Each GLOBAL boundary, linked to a REAL per-country layer that proxies the
// human PRESSURE driving it (not the boundary's local status — boundaries are
// planetary, not national). Boundaries with no loaded spatial proxy carry an
// explicit gap note instead. Layer ids match /api/layers.
const PROXY: Record<string, { layer: string; label: string } | { gap: string }> = {
  "Climate change": { layer: "co2_per_capita", label: "CO₂ emissions per person" },
  "Climate change (energy imbalance)": {
    layer: "co2_total",
    label: "Total CO₂ emissions",
  },
  "Biosphere integrity (genetic)": {
    layer: "threatened_birds",
    label: "Threatened bird species",
  },
  "Biosphere integrity (functional)": {
    layer: "land_degradation",
    label: "Degraded land",
  },
  "Land-system change": { layer: "forest_area", label: "Forest cover" },
  "Freshwater change (green water)": {
    layer: "water_stress",
    label: "Water stress",
  },
  "Freshwater change (blue water)": {
    layer: "water_stress",
    label: "Water stress",
  },
  "Biogeochemical flows (nitrogen)": {
    layer: "fertilizer_use",
    label: "Fertilizer use intensity",
  },
  "Biogeochemical flows (phosphorus)": {
    layer: "fertilizer_use",
    label: "Fertilizer use intensity",
  },
  "Novel entities": {
    layer: "plastic_waste_pc",
    label: "Plastic waste per person (partial proxy)",
  },
  "Ocean acidification": {
    gap: "No per-country gridded aragonite (Ω) data loaded — a global/ocean-basin measure, shown only at planetary scale here.",
  },
  "Atmospheric aerosol loading": {
    gap: "Control variable is an interhemispheric aerosol-optical-depth difference — inherently global, no national proxy.",
  },
  "Stratospheric ozone depletion": {
    gap: "Global-mean stratospheric ozone — no meaningful per-country breakdown.",
  },
};

function statusColor(s: string) {
  return s === "transgressed"
    ? COLOR.transgressed
    : s === "within"
    ? COLOR.within
    : COLOR.other;
}

// Annular sector path (donut wedge) from angle a0→a1, radius rIn→rOut.
function sector(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  a0: number,
  a1: number
) {
  const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(rOut, a0);
  const [x1, y1] = p(rOut, a1);
  const [x2, y2] = p(rIn, a1);
  const [x3, y3] = p(rIn, a0);
  return `M${x0},${y0} A${rOut},${rOut} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 ${large} 0 ${x3},${y3} Z`;
}

export default function PlanetaryBoundariesHUD({
  onClose,
  onShowProxy,
}: {
  onClose?: () => void;
  onShowProxy?: (layerId: string) => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<number | null>(null); // hovered
  const [pinned, setPinned] = useState<number | null>(null); // clicked

  useEffect(() => {
    fetch("/planetary_boundaries.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  // Geometry for the wedge ring — one wedge per real control variable.
  const wedges = useMemo(() => {
    if (!data) return [];
    const C = 120;
    const R_IN = 34;
    const R_SAFE = 64; // dashed "safe operating space" boundary
    const R_OVER = 98; // how far transgressed wedges extend past the ring
    const n = data.boundaries.length;
    const step = (2 * Math.PI) / n;
    const gap = 0.035;
    return data.boundaries.map((b, i) => {
      const a0 = -Math.PI / 2 + i * step + gap / 2;
      const a1 = -Math.PI / 2 + (i + 1) * step - gap / 2;
      const transgressed = b.status === "transgressed";
      const rOut = transgressed ? R_OVER : R_SAFE - 4;
      const mid = (a0 + a1) / 2;
      return {
        i,
        b,
        d: sector(C, C, R_IN, rOut, a0, a1),
        color: statusColor(b.status),
        // label anchor just outside the wedge
        lx: C + (rOut + 9) * Math.cos(mid),
        ly: C + (rOut + 9) * Math.sin(mid),
        ringR: R_SAFE,
        cx: C,
      };
    });
  }, [data]);

  if (err)
    return (
      <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[260px] rounded-2xl border border-earth-200 bg-white/90 p-3 text-[11px] text-earth-500 shadow-xl backdrop-blur-md">
        Planetary boundaries data unavailable.
      </div>
    );
  if (!data)
    return (
      <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[260px] rounded-2xl border border-earth-200 bg-white/90 p-3 text-[11px] text-earth-500 shadow-xl backdrop-blur-md">
        Loading planetary boundaries…
      </div>
    );

  const activeIdx = sel ?? pinned;
  const active = activeIdx != null ? data.boundaries[activeIdx] : null;
  const proxy = active ? PROXY[active.name] : undefined;

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[300px] rounded-2xl border border-earth-200 bg-white/90 p-3 shadow-xl backdrop-blur-md">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-bold text-earth-900">
            Planetary boundaries
          </div>
          <div className="text-[10px] text-earth-500">
            Global framework · not per-country · {data.asOf}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="-mr-1 -mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
            aria-label="Hide planetary boundaries"
            title="Hide"
          >
            ×
          </button>
        )}
      </div>

      <svg
        viewBox="0 0 240 240"
        className="mx-auto block h-[210px] w-[210px]"
        role="img"
        aria-label="Planetary boundaries wedge diagram"
      >
        {/* zone of uncertainty — amber band between the safe limit (r=64)
            and the high-risk end (r=80); the published increasing-risk range */}
        <path
          d="M 40,120 a 80,80 0 1,0 160,0 a 80,80 0 1,0 -160,0 M 56,120 a 64,64 0 1,1 128,0 a 64,64 0 1,1 -128,0"
          fillRule="evenodd"
          fill="#f59e0b"
          fillOpacity={0.16}
        />
        {/* high-risk edge of the uncertainty zone */}
        <circle
          cx={120}
          cy={120}
          r={80}
          fill="none"
          stroke="#d97706"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.6}
        />
        {/* safe-operating-space ring */}
        <circle
          cx={120}
          cy={120}
          r={64}
          fill="none"
          stroke="#0f766e"
          strokeWidth={1.25}
          strokeDasharray="3 3"
          opacity={0.8}
        />
        {/* inner hub */}
        <circle cx={120} cy={120} r={34} fill="#f0fdf4" stroke="#bbf7d0" />
        {wedges.map((w) => (
          <path
            key={w.i}
            d={w.d}
            fill={w.color}
            fillOpacity={activeIdx == null || activeIdx === w.i ? 0.85 : 0.32}
            stroke={pinned === w.i ? "#1e293b" : "#fff"}
            strokeWidth={pinned === w.i ? 1.6 : 0.8}
            className="cursor-pointer transition-[fill-opacity]"
            onMouseEnter={() => setSel(w.i)}
            onMouseLeave={() => setSel(null)}
            onClick={() => setPinned((p) => (p === w.i ? null : w.i))}
          >
            <title>
              {w.b.name} — {w.b.status}
            </title>
          </path>
        ))}
        {/* center summary */}
        <text
          x={120}
          y={114}
          textAnchor="middle"
          className="fill-earth-900"
          style={{ fontSize: 22, fontWeight: 700 }}
        >
          {data.summary.transgressed}/{data.summary.total}
        </text>
        <text
          x={120}
          y={130}
          textAnchor="middle"
          className="fill-earth-500"
          style={{ fontSize: 8.5 }}
        >
          transgressed
        </text>
      </svg>

      {/* detail / legend line */}
      <div className="mt-1 min-h-[52px] rounded-lg border border-earth-100 bg-earth-50/60 px-2.5 py-1.5">
        {active ? (
          <>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white"
                style={{ background: statusColor(active.status) }}
              />
              <span className="text-[12px] font-semibold text-earth-800">
                {active.name}
              </span>
              <span
                className="ml-auto rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
                style={{
                  background:
                    active.status === "transgressed" ? "#fee2e2" : "#dcfce7",
                  color:
                    active.status === "transgressed" ? "#b91c1c" : "#15803d",
                }}
              >
                {active.status}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-earth-600">
              {active.controlVariable}
            </div>
            <div className="mt-1 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 text-[10px]">
              <span className="text-emerald-700">Should be (safe):</span>
              <b className="text-earth-800">{active.boundary}</b>
              {active.uncertainty && (
                <>
                  <span className="text-amber-700">Uncertainty zone:</span>
                  <b className="text-earth-800">{active.uncertainty}</b>
                </>
              )}
              <span className="text-rose-700">Now:</span>
              <b className="text-earth-800">{active.current}</b>
            </div>
            {active.note && (
              <div className="mt-1 text-[9.5px] leading-snug text-earth-500">
                {active.note}
              </div>
            )}
            {/* Spatialize: link the global boundary to its per-country pressure
                proxy on the map, or state the spatial data gap. */}
            <div className="mt-1.5 border-t border-earth-100 pt-1.5">
              {proxy && "layer" in proxy ? (
                <button
                  onClick={() => onShowProxy?.(proxy.layer)}
                  disabled={!onShowProxy}
                  className="flex w-full items-center gap-1 rounded-md bg-earth-900/90 px-2 py-1 text-[10px] font-semibold text-white hover:bg-earth-900 disabled:opacity-50"
                  title={`Show ${proxy.label} on the map`}
                >
                  <span aria-hidden>🗺</span> Map the pressure proxy:{" "}
                  {proxy.label}
                </button>
              ) : (
                <div className="text-[9px] leading-snug text-earth-400">
                  <span className="font-semibold text-earth-500">
                    No per-country map:
                  </span>{" "}
                  {proxy && "gap" in proxy
                    ? proxy.gap
                    : "No spatial proxy loaded for this boundary."}
                </div>
              )}
              <div className="mt-0.5 text-[8.5px] leading-snug text-earth-400">
                A national pressure proxy, not this boundary&apos;s local status —
                the boundary itself is planetary.
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center text-[11px] leading-snug text-earth-500">
            <span>
              <span className="font-semibold text-rose-700">
                {data.summary.transgressed} of {data.summary.total}
              </span>{" "}
              boundaries transgressed. Hover a wedge — past the dashed ring =
              beyond the safe limit; click to pin it and map its per-country
              pressure proxy. ({data.boundaries.length} control variables.)
            </span>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[9.5px] text-earth-500">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#dc2626]" />
            transgressed
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#16a34a]" />
            within
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#f59e0b]/40 ring-1 ring-[#d97706]" />
            uncertainty
          </span>
        </span>
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:text-earth-700"
          title={data.citation}
        >
          {data.sourceName.split(";")[0]}
        </a>
      </div>
    </div>
  );
}
