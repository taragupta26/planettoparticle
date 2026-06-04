import { NextResponse } from "next/server";
import { getLayer } from "@/lib/db";

export const runtime = "nodejs";
// Reads the DuckDB store per-request; never prerender at build time (the store
// is populated by `npm run build-db`, which runs as part of the build).
export const dynamic = "force-dynamic";

// Per-country values for one data layer, keyed by ISO3 for choropleth shading.
// Every value comes from the preloaded DuckDB store and carries its source.
// `?layer=` selects the metric (defaults to cobalt production).
export async function GET(req: Request) {
  const layerId =
    new URL(req.url).searchParams.get("layer") || "cobalt_production";
  const { meta, values } = await getLayer(layerId);
  if (!meta)
    return NextResponse.json({ error: `Unknown layer ${layerId}` }, { status: 404 });

  const byIso: Record<
    string,
    {
      country: string;
      value: number;
      unit: string;
      year: string | null;
      note: string | null;
      sourceName: string;
      sourceUrl: string;
    }
  > = {};
  let worldTotal = 0;
  for (const v of values) {
    byIso[v.iso3] = {
      country: v.name,
      value: v.value,
      unit: v.unit,
      year: v.year,
      note: v.note,
      sourceName: v.source_name,
      sourceUrl: v.source_url,
    };
    if (v.value > 0) worldTotal += v.value;
  }

  return NextResponse.json({ layer: meta, worldTotal, byIso });
}
