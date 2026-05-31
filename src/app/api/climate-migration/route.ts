import { NextResponse } from "next/server";
import data from "@/data/climate-migration-us.json";

export const runtime = "nodejs";

// /api/climate-migration — US county climate-habitability projections.
// Source: Rhodium Group / Climate Impact Lab, published by ProPublica & NYT
// Magazine ("climate-migration" interactive). Values are the source's ordinal
// severity bins; each maps to a documented physical range via the legend.
// Counties absent from the dataset are data gaps, never zero.
export async function GET() {
  return NextResponse.json(data, {
    headers: { "cache-control": "public, max-age=86400" },
  });
}
