import { NextResponse } from "next/server";
import { listLayers } from "@/lib/db";

export const runtime = "nodejs";
// Reads the DuckDB store per-request; never prerender at build time (the store
// is populated by `npm run build-db`, which runs as part of the build).
export const dynamic = "force-dynamic";

// Lists the data layers available in the DuckDB store, for the UI switcher.
// Each layer is real and source-attributed; nothing is synthesized here.
export async function GET() {
  const layers = await listLayers();
  return NextResponse.json({ layers });
}
