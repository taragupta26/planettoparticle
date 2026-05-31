"use client";

import type { Evidence } from "@/lib/types";

const confColor: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800 border-emerald-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-rose-100 text-rose-800 border-rose-300",
};

export default function EvidencePanel({
  evidence,
  highlightIds,
}: {
  evidence: Evidence[];
  highlightIds?: string[];
}) {
  const hi = new Set(highlightIds ?? []);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-earth-800">
        Evidence registry ({evidence.length})
      </h3>
      <p className="text-xs text-earth-600">
        Every claim above is backed by one of these records. Confidence and
        retrieval time are shown per source.
      </p>
      <ul className="space-y-2">
        {evidence.map((e) => (
          <li
            key={e.id}
            className={`rounded-md border p-2 text-xs ${
              hi.has(e.id)
                ? "border-earth-500 bg-earth-50 ring-1 ring-earth-400"
                : "border-earth-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-earth-900">{e.statement}</span>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                  confColor[e.confidence]
                }`}
              >
                {e.confidence}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-earth-600">
              <a
                href={e.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-earth-700 underline decoration-dotted hover:text-earth-900"
              >
                {e.sourceName}
              </a>
              {e.asOf && <span>· as of {e.asOf}</span>}
              {e.retrievedAt && (
                <span>· retrieved {e.retrievedAt.slice(0, 10)}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
