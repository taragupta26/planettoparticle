import { NextResponse } from "next/server";
import data from "@/data/collab-plans.json";

export const runtime = "nodejs";

// Collaborative transition plans (source-grounded). Served from a static,
// fully-cited dataset: real OpenStreetMap/Wikidata tea-garden coordinates,
// cited sector figures, and peer-reviewed vermicompost evidence. No values are
// invented — unavailable ownership/economics are carried as explicit gaps.
export async function GET() {
  return NextResponse.json(data, {
    headers: { "cache-control": "public, max-age=86400" },
  });
}
