import { NextResponse } from "next/server";
import { getLayer, type LayerMeta } from "@/lib/db";

export const runtime = "nodejs";

/**
 * /api/composite?layer=a&layer=b (or ?layers=a,b)
 *
 * Returns per-country values for one OR MANY active data layers ("filters").
 * Each raw value is real and carries its source. When several layers are
 * active we also return a `composite` severity per country: the mean of each
 * layer's normalized 0..1 "severity" (1 = worst / most), using the same
 * direction-aware rules the UI uses. The composite is a transparent,
 * reproducible combination of real values — no new data is invented.
 */
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// Normalize one raw value to 0..1 where 1 = worst/most (mirrors GlobeView).
function severity(value: number, meta: LayerMeta, max: number): number {
  let t: number;
  if (meta.display === "world_share") {
    t = Math.log10(value + 1) / Math.log10(max + 1);
  } else if (meta.display === "magnitude") {
    t = Math.log10(value + 1) / Math.log10(max + 1);
    if (!meta.higher_is_worse) t = 1 - t;
  } else {
    t = value / 100;
    if (!meta.higher_is_worse) t = 1 - t;
  }
  return clamp01(t);
}

interface LayerVal {
  value: number;
  unit: string;
  year: string | null;
  note: string | null;
  sourceName: string;
  sourceUrl: string;
  severity: number;
}
interface IsoEntry {
  name: string;
  composite: number;
  count: number;
  layers: Record<string, LayerVal>;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = Array.from(
    new Set(
      url.searchParams
        .getAll("layer")
        .concat(url.searchParams.get("layers")?.split(",") ?? [])
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0)
    return NextResponse.json({ layers: [], worldTotals: {}, byIso: {} });

  const results = await Promise.all(
    ids.map(async (id) => ({ id, ...(await getLayer(id)) }))
  );

  const layers: LayerMeta[] = [];
  const worldTotals: Record<string, number> = {};
  const byIso: Record<string, IsoEntry> = {};
  const sevSum: Record<string, number> = {};

  for (const r of results) {
    if (!r.meta) continue;
    layers.push(r.meta);
    let total = 0;
    const max = Math.max(
      1,
      ...r.values.filter((v) => v.value > 0).map((v) => v.value)
    );
    for (const v of r.values) {
      if (v.value > 0) total += v.value;
      const sev = severity(v.value, r.meta, max);
      if (!byIso[v.iso3])
        byIso[v.iso3] = { name: v.name, composite: 0, count: 0, layers: {} };
      byIso[v.iso3].layers[r.id] = {
        value: v.value,
        unit: v.unit,
        year: v.year,
        note: v.note,
        sourceName: v.source_name,
        sourceUrl: v.source_url,
        severity: sev,
      };
      byIso[v.iso3].count += 1;
      sevSum[v.iso3] = (sevSum[v.iso3] ?? 0) + sev;
    }
    worldTotals[r.id] = total;
  }

  for (const iso in byIso) {
    const e = byIso[iso];
    e.composite = e.count ? sevSum[iso] / e.count : 0;
  }

  return NextResponse.json({ layers, worldTotals, byIso });
}
