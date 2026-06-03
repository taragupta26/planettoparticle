"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadPlans,
  citationOf,
  ENTITY_COLOR,
  ENTITY_LABEL,
  type CollabPlan,
  type PlansPayload,
  type PlanEntityType,
} from "@/lib/plans";

// Collaborative Plans panel — renders source-grounded transition plans. The
// first plan maps Bangladesh's tea gardens + BTRI + a vermicompost trial site
// and lays out a phased switch to on-garden vermicompost. Every figure is
// cited; unpublished ownership/economics are shown as explicit data gaps.
export default function CollabPlansPanel({
  activePlanId,
  onOpen,
  onClose,
}: {
  activePlanId: string | null;
  onOpen: (plan: CollabPlan) => void;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<PlansPayload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    loadPlans()
      .then(setPayload)
      .catch(() => setErr(true));
  }, []);

  const active = useMemo(
    () => payload?.plans.find((p) => p.id === activePlanId) ?? null,
    [payload, activePlanId]
  );

  if (err)
    return (
      <p className="text-[11px] text-earth-400">
        Collaborative plans unavailable.
      </p>
    );
  if (!payload)
    return <p className="text-[11px] text-earth-400">Loading plans…</p>;

  // Citation chip — small superscript-style source link.
  const Cite = ({ id }: { id: string }) => {
    const c = citationOf(payload, id);
    if (!c) return null;
    return (
      <a
        href={c.url}
        target="_blank"
        rel="noreferrer"
        title={`${c.label} — ${c.publisher}`}
        className="ml-0.5 align-super text-[8px] text-emerald-700 underline decoration-dotted hover:text-emerald-900"
      >
        [{c.id}]
      </a>
    );
  };

  // ── List view (no plan open) ──────────────────────────────────────────
  if (!active) {
    return (
      <div>
        <p className="mb-2 text-[11px] leading-snug text-earth-600">
          Source-grounded transition plans. Open one to fly the map to its
          mapped sites.
        </p>
        <ul className="space-y-1.5">
          {payload.plans.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onOpen(p)}
                className="w-full rounded-md border border-earth-100 bg-white/70 px-2.5 py-2 text-left hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                <div className="text-[12px] font-semibold text-earth-800">
                  {p.title}
                </div>
                <div className="mt-0.5 text-[10px] text-earth-500">
                  {p.subtitle}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-earth-400">
                  <span className="rounded bg-earth-100 px-1 py-0.5">
                    {p.region}
                  </span>
                  <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-700">
                    {p.status}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-snug text-earth-500">
          {payload.provenance.note}
        </p>
      </div>
    );
  }

  // ── Detail view (a plan is open) ──────────────────────────────────────
  const usedTypes = Array.from(
    new Set(active.entities.map((e) => e.type))
  ) as PlanEntityType[];

  return (
    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
      <div>
        <button
          onClick={onClose}
          className="mb-1.5 text-[10px] text-earth-500 hover:text-earth-800"
        >
          ← All plans
        </button>
        <div className="text-[13px] font-semibold text-earth-900">
          {active.title}
        </div>
        <div className="text-[10px] text-earth-500">{active.region}</div>
        <div className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700">
          {active.status}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-earth-700">
        {active.summary}
      </p>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-1.5">
        {active.metrics.map((m, i) => (
          <div
            key={i}
            className="rounded-md border border-earth-100 bg-white/70 px-2 py-1.5"
          >
            <div className="text-[13px] font-semibold tabular-nums text-earth-800">
              {m.value}
              {m.year && (
                <span className="ml-1 text-[9px] font-normal text-earth-400">
                  {m.year}
                </span>
              )}
            </div>
            <div className="text-[9px] leading-tight text-earth-500">
              {m.label} ({m.unit})
              <Cite id={m.source} />
            </div>
          </div>
        ))}
      </div>

      {/* Map legend */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-earth-500">
          On the map
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {usedTypes.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 text-[10px] text-earth-600"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white"
                style={{ background: ENTITY_COLOR[t] }}
              />
              {ENTITY_LABEL[t]} (
              {active.entities.filter((e) => e.type === t).length})
            </span>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-earth-500">
          Transition steps
        </div>
        <ol className="space-y-1.5">
          {active.steps.map((s, i) => (
            <li
              key={i}
              className={`rounded-md border px-2 py-1.5 ${
                s.caveat
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-earth-100 bg-white/70"
              }`}
            >
              <div className="text-[11px] font-semibold text-earth-800">
                {s.title}
                {s.caveat && (
                  <span className="ml-1 rounded bg-amber-200 px-1 py-0.5 text-[8px] font-normal text-amber-800">
                    trade-off
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-earth-600">
                {s.body}
                {s.evidence.map((id) => (
                  <Cite key={id} id={id} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Companies */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-earth-500">
          Estate operators
        </div>
        <ul className="space-y-1">
          {active.companies.map((c, i) => (
            <li
              key={i}
              className="rounded-md border border-earth-100 bg-white/70 px-2 py-1.5"
            >
              <div className="text-[11px] font-medium text-earth-800">
                {c.name}
                <Cite id={c.source} />
              </div>
              <div className="text-[10px] leading-snug text-earth-500">
                {c.facts}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Data gaps */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
          Data gaps (not invented)
        </div>
        <ul className="list-disc space-y-1 pl-3.5">
          {active.dataGaps.map((g, i) => (
            <li key={i} className="text-[10px] leading-snug text-earth-500">
              {g}
            </li>
          ))}
        </ul>
      </div>

      {/* Citations */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-earth-500">
          Sources
        </div>
        <ul className="space-y-0.5">
          {payload.citations.map((c) => (
            <li key={c.id} className="text-[9px] leading-snug text-earth-500">
              <span className="text-emerald-700">[{c.id}]</span>{" "}
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted hover:text-earth-700"
              >
                {c.label}
              </a>{" "}
              — {c.publisher}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
