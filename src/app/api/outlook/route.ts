import { NextResponse } from "next/server";
import { getOutlook } from "@/lib/outlook";

export const runtime = "nodejs";
// Upstream model fetch is heavy; let the platform cache the response too.
export const revalidate = 21600; // 6h

// /api/outlook?iso=COD — "how will this region change over the next 10–20 years?"
// Forward decadal climate (Open-Meteo downscaled CMIP6) + present-day hazard
// baseline (GFDRR ThinkHazard!). Missing pieces come back as explicit gaps;
// nothing is synthesized.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const iso = (url.searchParams.get("iso") || "").trim().toUpperCase();
  if (!iso)
    return NextResponse.json({ error: "iso required" }, { status: 400 });
  const data = await getOutlook(iso);
  if (!data)
    return NextResponse.json(
      {
        iso,
        name: iso,
        climate: { available: false, reason: "No centroid on record for this country." },
        hazards: { available: false, reason: "No region match for this country." },
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  return NextResponse.json(data);
}
