import { NextResponse } from "next/server";
import { getCountry } from "@/lib/db";

export const runtime = "nodejs";
// Reads the DuckDB store per-request; never prerender at build time (the store
// is populated by `npm run build-db`, which runs as part of the build).
export const dynamic = "force-dynamic";

// /api/country?iso=COD — every real metric on record for one country, with its
// source. Powers the per-country "what people here live with" view. No values
// are synthesized; missing indicators simply don't appear (a data gap).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const iso = (url.searchParams.get("iso") || "").trim().toUpperCase();
  if (!iso) return NextResponse.json({ name: null, metrics: [] });
  const data = await getCountry(iso);
  return NextResponse.json(data);
}
