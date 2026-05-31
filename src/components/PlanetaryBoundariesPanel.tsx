"use client";

import { useEffect, useState } from "react";

interface Boundary {
  name: string;
  controlVariable: string;
  boundary: string;
  current: string;
  status: "transgressed" | "within" | string;
  unit: string;
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

const STATUS_COLOR: Record<string, string> = {
  transgressed: "#dc2626",
  within: "#16a34a",
};

export default function PlanetaryBoundariesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/planetary_boundaries.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  if (err)
    return (
      <p className="text-[11px] text-earth-400">
        Planetary boundaries data unavailable.
      </p>
    );
  if (!data)
    return <p className="text-[11px] text-earth-400">Loading boundaries…</p>;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[11px]">
        <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
          {data.summary.transgressed} transgressed
        </span>
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">
          {data.summary.within} within
        </span>
        <span className="text-earth-500">of {data.summary.total} ({data.asOf})</span>
      </div>
      <ul className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
        {data.boundaries.map((b, i) => (
          <li
            key={b.name + i}
            className="rounded-md border border-earth-100 bg-white/70 px-2 py-1.5"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white"
                style={{ background: STATUS_COLOR[b.status] ?? "#94a3b8" }}
              />
              <span className="text-[12px] font-medium text-earth-800">
                {b.name}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-earth-600">
              {b.controlVariable}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-earth-500">
              <span>
                Boundary: <b className="text-earth-700">{b.boundary}</b>
              </span>
              <span>
                Now: <b className="text-earth-700">{b.current}</b>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-snug text-earth-500">
        Global framework (not per-country). Source:{" "}
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:text-earth-700"
        >
          {data.sourceName}
        </a>
        . {data.citation}
      </p>
    </div>
  );
}
