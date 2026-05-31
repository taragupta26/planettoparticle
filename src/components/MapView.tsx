"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type FeatureCollection = { type: string; features: any[] };
type Feature = any;

interface MapDatum {
  country: string;
  production2023_t: number | null;
  reserves_t: number | null;
  sourceName: string;
  sourceUrl: string;
}
interface MapPayload {
  unit: string;
  retrievedAt: string;
  byIso: Record<string, MapDatum>;
}

function isoOf(p: any): string | undefined {
  const a = p?.ISO_A3_EH && p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : undefined;
  const b = p?.ISO_A3 && p.ISO_A3 !== "-99" ? p.ISO_A3 : undefined;
  return a || b;
}

// Sequential blue scale on log of production (data-driven, no invented values).
function colorFor(v: number | null, max: number): string {
  if (v === null || v <= 0) return "#e5e7eb";
  const t = Math.log10(v + 1) / Math.log10(max + 1);
  if (t > 0.85) return "#1f3c5a";
  if (t > 0.65) return "#215181";
  if (t > 0.45) return "#27659f";
  if (t > 0.28) return "#3680bd";
  if (t > 0.14) return "#5b9dd1";
  return "#92bfe2";
}

export default function MapView() {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [data, setData] = useState<MapPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/countries.geo.json").then((r) => r.json()),
      fetch("/api/map").then((r) => r.json()),
    ])
      .then(([g, d]) => {
        setGeo(g);
        setData(d);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="p-4 text-sm text-red-700">Map error: {err}</div>;
  if (!geo || !data)
    return (
      <div className="flex h-full items-center justify-center text-sm text-earth-600">
        Loading boundaries (Natural Earth) &amp; USGS values…
      </div>
    );

  const values = Object.values(data.byIso)
    .map((d) => d.production2023_t ?? 0)
    .filter((v) => v > 0);
  const max = Math.max(1, ...values);

  const style = (feature?: Feature) => {
    const iso = isoOf(feature?.properties);
    const datum = iso ? data.byIso[iso] : undefined;
    return {
      fillColor: colorFor(datum?.production2023_t ?? null, max),
      weight: datum ? 1 : 0.4,
      color: datum ? "#0f2438" : "#b6c6d6",
      fillOpacity: datum ? 0.85 : 0.25,
    };
  };

  const onEach = (feature: Feature, layer: any) => {
    const iso = isoOf(feature.properties);
    const datum = iso ? data.byIso[iso] : undefined;
    const name = feature.properties?.ADMIN ?? feature.properties?.NAME ?? iso;
    if (datum) {
      const prod =
        datum.production2023_t !== null
          ? `${datum.production2023_t.toLocaleString()} t`
          : "data unavailable";
      const res =
        datum.reserves_t !== null
          ? `${datum.reserves_t.toLocaleString()} t`
          : "data unavailable";
      layer.bindPopup(
        `<strong>${datum.country}</strong><br/>` +
          `Cobalt production (2023): <b>${prod}</b><br/>` +
          `Reserves: <b>${res}</b><br/>` +
          `<span style="font-size:11px;color:#555">Source: <a href="${datum.sourceUrl}" target="_blank" rel="noreferrer">${datum.sourceName}</a></span>`
      );
    } else {
      layer.bindPopup(
        `<strong>${name}</strong><br/><span style="color:#777">No cobalt production recorded in USGS dataset.</span>`
      );
    }
  };

  return (
    <MapContainer
      center={[10, 15]}
      zoom={2}
      minZoom={1}
      worldCopyJump
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON data={geo as any} style={style as any} onEachFeature={onEach} />
    </MapContainer>
  );
}
