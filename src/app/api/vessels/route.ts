import { NextResponse } from "next/server";
import { aisBridge } from "@/lib/aisStream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/vessels — latest real-time vessel positions from AISStream.io's free
 * global feed, proxied so the API key stays server-side. Each position is a
 * real AIS broadcast. With no AISSTREAM_API_KEY configured the feed is dormant
 * and we return `configured: false` (a data gap the UI states plainly) — we
 * never invent vessel positions.
 */
export async function GET() {
  const bridge = aisBridge();
  if (!bridge.configured) {
    return NextResponse.json({
      configured: false,
      source: "AISStream.io",
      vessels: [],
      note:
        "Global live AIS needs a free AISSTREAM_API_KEY (register at aisstream.io).",
    });
  }
  const vessels = bridge.snapshot(4000);
  return NextResponse.json({
    configured: true,
    source: "AISStream.io (global AIS)",
    sourceUrl: "https://aisstream.io",
    count: vessels.length,
    vessels,
  });
}
