"use client";

import type { Conflict, DataGap } from "@/lib/types";

export default function DataGapPanel({
  gaps,
  conflicts,
}: {
  gaps: DataGap[];
  conflicts: Conflict[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-earth-800">
          Data gaps ({gaps.length})
        </h3>
        <p className="text-xs text-earth-600">
          What we deliberately do <em>not</em> show, instead of inventing it.
        </p>
        <ul className="mt-2 space-y-2">
          {gaps.map((g) => (
            <li
              key={g.id}
              className="rounded-md border border-dashed border-amber-400 bg-amber-50 p-2 text-xs"
            >
              <div className="font-semibold text-amber-900">{g.topic}</div>
              <div className="text-amber-800">{g.description}</div>
              <div className="mt-1 text-[11px] text-amber-700">
                {g.attemptedSource && (
                  <span className="font-medium">
                    Attempted: {g.attemptedSource}.{" "}
                  </span>
                )}
                {g.reason}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {conflicts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-earth-800">
            Source conflicts ({conflicts.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {conflicts.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900"
              >
                <div className="font-semibold">{c.topic}</div>
                <div>{c.description}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
