import { NextResponse } from "next/server";
import { getCentroid } from "@/lib/outlook";

export const runtime = "nodejs";

// /api/trade-flows?iso=USA&flow=X&year=2021
// Real bilateral merchandise-trade flows from World Bank WITS (TradeStats),
// a free, no-key SDMX service. For one reporter we return its exports (X) or
// imports (M) to every partner, in current US$ thousand, anchored to each
// country's Natural Earth label point so the globe can draw flow arcs.
// No values are invented: a reporter with no WITS data comes back as a gap,
// and partners we can't geolocate are dropped (never placed at 0,0).

const SOURCE = {
  name: "World Bank WITS (TradeStats, sourced from UN Comtrade)",
  url: "https://wits.worldbank.org",
};

// Aggregate / non-country partner codes WITS may emit — never drawn as arcs.
const NON_COUNTRY = new Set([
  "WLD", "ALL", "EUN", "OAS", "SPE", "UNS", "ZZZ", "WND",
]);

function parseSdmx(xml: string, flow: string) {
  // StructureSpecificData: each <Series PARTNER="XXX" ...><Obs OBS_VALUE=".."/>.
  const out: { iso: string; value: number }[] = [];
  const seriesRe = /PARTNER="([^"]*)"[\s\S]*?OBS_VALUE="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = seriesRe.exec(xml))) {
    const iso = m[1].toUpperCase();
    const value = Number(m[2]);
    if (!iso || NON_COUNTRY.has(iso) || !Number.isFinite(value) || value <= 0)
      continue;
    out.push({ iso, value });
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const isoRaw = (url.searchParams.get("iso") || "").trim().toUpperCase();
  const flow = (url.searchParams.get("flow") || "X").toUpperCase() === "M" ? "M" : "X";
  const year = (url.searchParams.get("year") || "2021").replace(/[^0-9]/g, "") || "2021";

  if (!isoRaw)
    return NextResponse.json({ error: "iso required" }, { status: 400 });

  const reporter = getCentroid(isoRaw);
  if (!reporter)
    return NextResponse.json({
      available: false,
      reason: `No centroid on record for ${isoRaw} — cannot anchor trade arcs.`,
    });

  const indicator = flow === "M" ? "MPRT-TRD-VL" : "XPRT-TRD-VL";
  const witsUrl =
    `https://wits.worldbank.org/API/V1/SDMX/V21/datasource/tradestats-trade/` +
    `reporter/${isoRaw.toLowerCase()}/year/${year}/partner/all/product/Total/indicator/${indicator}`;

  let xml: string;
  try {
    const r = await fetch(witsUrl, { next: { revalidate: 86400 } });
    if (!r.ok)
      return NextResponse.json({
        available: false,
        reason: `WITS returned HTTP ${r.status} for ${reporter.name} (${year}).`,
        source: SOURCE.name,
      });
    xml = await r.text();
  } catch {
    return NextResponse.json({
      available: false,
      reason: "WITS request failed (network).",
      source: SOURCE.name,
    });
  }

  const raw = parseSdmx(xml, flow);
  // Attach partner centroids; drop partners we cannot geolocate (honest gap).
  const flows = raw
    .map((f) => {
      if (f.iso === reporter.iso) return null; // skip self / re-imports
      const c = getCentroid(f.iso);
      if (!c) return null;
      return { iso: c.iso, name: c.name, lat: c.lat, lon: c.lon, value: f.value };
    })
    .filter(Boolean)
    .sort((a, z) => (z as any).value - (a as any).value);

  if (!flows.length)
    return NextResponse.json({
      available: false,
      reason: `No ${flow === "M" ? "import" : "export"} flows reported by WITS for ${reporter.name} in ${year}.`,
      source: SOURCE.name,
    });

  return NextResponse.json({
    available: true,
    reporter,
    flow,
    year,
    unit: "US$ thousand",
    source: SOURCE,
    total: flows.reduce((s, f: any) => s + f.value, 0),
    flows,
  });
}
