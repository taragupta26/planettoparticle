// Fields of The World (FTW) — global agricultural field boundaries derived from
// Sentinel-2 imagery (Taylor Geospatial Institute / Kerner Lab). Distributed as
// a single global PMTiles vector archive on Source Cooperative, range-served
// from S3 with open CORS, so the browser pulls only the few vector tiles that
// cover the current view — no API key, no bulk download.
//
// These are MODEL-PREDICTED field extents (2024/2025 composites), not cadastral
// parcels: there is no owner, crop, or ID attribute. We surface them as such so
// nothing is implied that the source does not actually contain.
"use client";

import { PMTiles } from "pmtiles";
// @mapbox/vector-tile + pbf decode the Mapbox Vector Tile (MVT) payload.
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const PMTILES_URL =
  "https://data.source.coop/ftw/global-data/predictions/vectors/alpha/global.pmtiles";

export const FTW_SOURCE = {
  name: "Fields of The World (Sentinel-2, Taylor Geospatial)",
  url: "https://source.coop/ftw/global-data",
  license: "CC-BY-4.0",
};

// The archive exposes per-year polygon layers ("field-…") and boundary
// linework ("field_boundaries-…"). We render the filled polygon layer, newest
// year first.
const POLY_LAYERS = ["field-2025-01-01 00:00:00", "field-2024-01-01 00:00:00"];
const MIN_Z = 4;
const MAX_Z = 11; // higher zooms exist (≤15) but cover too little area per tile

let archive: PMTiles | null = null;
function pm(): PMTiles {
  if (!archive) archive = new PMTiles(PMTILES_URL);
  return archive;
}

export interface FtwFeature {
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any };
}

// Decoded field polygons cached per slippy tile so panning reuses neighbours.
const tileCache = new Map<string, FtwFeature[]>();
const CACHE_MAX = 600;

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2tile(lat: number, z: number): number {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
  );
}

async function getTile(z: number, x: number, y: number): Promise<FtwFeature[]> {
  const key = `${z}/${x}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  let feats: FtwFeature[] = [];
  try {
    const t = await pm().getZxy(z, x, y);
    if (t) {
      const vt = new VectorTile(new PbfReader(new Uint8Array(t.data)));
      let layer: any = null;
      for (const name of POLY_LAYERS) {
        if (vt.layers[name]) {
          layer = vt.layers[name];
          break;
        }
      }
      if (layer) {
        for (let i = 0; i < layer.length; i++) {
          // toGeoJSON reprojects MVT tile coords to WGS84 lng/lat.
          const gj = layer.feature(i).toGeoJSON(x, y, z);
          if (gj?.geometry) feats.push(gj as FtwFeature);
        }
      }
    }
  } catch {
    feats = [];
  }
  tileCache.set(key, feats);
  if (tileCache.size > CACHE_MAX) {
    const oldest = tileCache.keys().next().value;
    if (oldest) tileCache.delete(oldest);
  }
  return feats;
}

// Choose the slippy zoom whose 256px tiles render ~1:1 against the current
// on-screen world width (mercator) or globe circumference.
export function ftwFetchZoom(worldWidthPx: number): number {
  const z = Math.round(Math.log2(Math.max(1, worldWidthPx) / 256));
  return Math.max(MIN_Z, Math.min(MAX_Z, z));
}

// Load field polygons covering a viewport centred on (lng,lat) at the given
// fetch zoom. Fetches a (2r+1)² block of tiles (capped) — enough to fill a
// typical screen with margin. Returns real polygons only; empty = honest gap.
export async function loadFtwFields(
  lng: number,
  lat: number,
  fetchZoom: number,
  radiusTiles = 2,
  maxTiles = 25
): Promise<{ features: FtwFeature[]; z: number; tiles: number }> {
  const z = Math.max(MIN_Z, Math.min(MAX_Z, Math.round(fetchZoom)));
  const n = 2 ** z;
  const cx = lon2tile(lng, z);
  const cy = lat2tile(lat, z);
  const coords: [number, number][] = [];
  for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
    for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
      coords.push([cx + dx, cy + dy]);
    }
  }
  const sel = coords.slice(0, maxTiles);
  const results = await Promise.all(
    sel.map(([x, y]) => {
      if (y < 0 || y >= n) return Promise.resolve<FtwFeature[]>([]);
      const xx = ((x % n) + n) % n; // wrap longitude
      return getTile(z, xx, y);
    })
  );
  return { features: results.flat(), z, tiles: sel.length };
}
