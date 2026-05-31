import { NextResponse } from "next/server";
import { listLayers } from "@/lib/db";

export const runtime = "nodejs";

// Lists the data layers available in the DuckDB store, for the UI switcher.
// Each layer is real and source-attributed; nothing is synthesized here.
export async function GET() {
  const layers = await listLayers();
  return NextResponse.json({ layers });
}
