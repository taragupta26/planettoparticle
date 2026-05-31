"use client";

import { useEffect, useMemo, useState } from "react";

interface Solution {
  solution: string | null;
  action: string | null;
  classification: string | null;
  mode: string | null;
  sector: string | null;
  cluster: string | null;
  ghgImpactGt: string | null;
  costPerTon: string | null;
  speed: string | null;
  wellbeingBenefits: string | null;
}
interface Payload {
  dataset: string;
  sourceUrl: string;
  note: string;
  retrievedAt: string;
  count: number;
  solutions: Solution[];
}

// Parse the high end of a "0.05 to 0.12" Gt CO₂-eq range so we can rank
// solutions by upper-bound modeled impact. Falls back to a single number.
function impactHigh(s: string | null): number {
  if (!s) return -1;
  const nums = s.match(/[\d.]+/g);
  if (!nums || !nums.length) return -1;
  return Math.max(...nums.map(Number).filter((n) => Number.isFinite(n)));
}

export default function DrawdownPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  const [sector, setSector] = useState<string>("All sectors");

  useEffect(() => {
    fetch("/drawdown_solutions.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  const sectors = useMemo(() => {
    if (!data) return [];
    return [
      "All sectors",
      ...Array.from(
        new Set(data.solutions.map((s) => s.sector).filter(Boolean) as string[])
      ).sort(),
    ];
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.solutions
      .filter((s) => s.solution)
      .filter((s) => sector === "All sectors" || s.sector === sector)
      .sort((a, b) => impactHigh(b.ghgImpactGt) - impactHigh(a.ghgImpactGt));
  }, [data, sector]);

  if (err)
    return (
      <p className="text-[11px] text-earth-400">
        Drawdown solutions unavailable (run <code>npm run ingest</code>).
      </p>
    );
  if (!data)
    return <p className="text-[11px] text-earth-400">Loading solutions…</p>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-earth-600">
          {data.count} solutions
        </span>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="max-w-[170px] rounded border border-earth-200 bg-white px-1.5 py-0.5 text-[10px] text-earth-700"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <ol className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
        {rows.map((s, i) => (
          <li
            key={(s.solution ?? "") + i}
            className="rounded-md border border-earth-100 bg-white/70 px-2 py-1.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] font-medium text-earth-800">
                {s.solution}
              </span>
              {s.ghgImpactGt && (
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-emerald-700">
                  {s.ghgImpactGt} Gt
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-earth-500">
              {s.sector && <span>{s.sector}</span>}
              {s.mode && <span>· {s.mode}</span>}
              {s.costPerTon && <span>· ${s.costPerTon}/t</span>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[10px] leading-snug text-earth-500">
        GHG impact = modeled Gt CO₂-eq/yr range across adoption scenarios.
        Source:{" "}
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:text-earth-700"
        >
          Project Drawdown
        </a>{" "}
        — values as published, none invented.
      </p>
    </div>
  );
}
