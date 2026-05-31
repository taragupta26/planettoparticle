import { NextResponse } from "next/server";
import { getCurrentWeather } from "@/lib/outlook";

export const runtime = "nodejs";

// /api/weather?iso=FRA — live current conditions (Open-Meteo, no key) at the
// country's Natural Earth label point. A single representative location, not a
// country-wide value; unknown countries come back as an explicit gap.
export async function GET(req: Request) {
  const iso = (new URL(req.url).searchParams.get("iso") || "").trim().toUpperCase();
  if (!iso) return NextResponse.json({ error: "iso required" }, { status: 400 });
  const wx = await getCurrentWeather(iso);
  if (!wx)
    return NextResponse.json({
      available: false,
      reason: "No centroid on record for this country (cannot locate a weather point).",
    });
  return NextResponse.json(wx);
}
