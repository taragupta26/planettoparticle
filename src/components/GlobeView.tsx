"use client";

import { useEffect, useRef, useState } from "react";
import { loadFtwFields, ftwFetchZoom, FTW_SOURCE } from "@/lib/ftw";
import {
  loadClimateMigration,
  metricsOf,
  binColor,
  binRange,
  CM_SOURCE,
  type ClimateData,
  type ClimateMetric,
} from "@/lib/climateMigration";
import {
  loadTradeFlows,
  fmtUsdThousand,
  TRADE_SOURCE,
  type TradePayload,
  type TradeFlow,
} from "@/lib/trade";

/* ------------------------------------------------------------------ */
/* Data shapes (mirror /api/map)                                       */
/* ------------------------------------------------------------------ */
interface LayerMeta {
  id: string;
  label: string;
  unit: string;
  display: string; // "world_share" | "percent"
  higher_is_worse: boolean;
  source_name: string;
  source_url: string;
}
interface LayerVal {
  value: number;
  unit: string;
  year: string | null;
  note: string | null;
  sourceName: string;
  sourceUrl: string;
  severity: number;
}
interface IsoEntry {
  name: string;
  composite: number; // mean severity over active layers present here (0..1)
  count: number;
  layers: Record<string, LayerVal>;
}
interface CompositePayload {
  layers: LayerMeta[]; // active filters, in order
  worldTotals: Record<string, number>;
  byIso: Record<string, IsoEntry>;
}

function isoOf(p: any): string | undefined {
  const a = p?.ISO_A3_EH && p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : undefined;
  const b = p?.ISO_A3 && p.ISO_A3 !== "-99" ? p.ISO_A3 : undefined;
  return a || b;
}
function nameOf(p: any): string {
  return p?.ADMIN ?? p?.NAME ?? "";
}

// Perceptually-ordered multi-hue ramp (viridis): low = deep indigo, high = yellow.
const RAMP: [number, number, number][] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [110, 206, 88],
  [181, 222, 43],
  [253, 231, 37],
];
function rampColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[Math.min(i + 1, RAMP.length - 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}
// Color comes straight from the precomputed composite severity (0..1) that the
// /api/composite endpoint returns — the mean of each active filter's
// direction-aware normalized value (1 = worst/most). A country present in the
// active filters always colors (even at severity 0); absent = data gap.
function entryColor(entry: IsoEntry | undefined): [number, number, number] | null {
  if (!entry || entry.count === 0) return null;
  return rampColor(entry.composite);
}

// One real mine/deposit/district from USGS Professional Paper 1802.
interface MinePoint {
  name: string;
  commodity: string;
  depositType: string;
  lat: number;
  lon: number;
  country: string;
  region: string;
}
interface MinePayload {
  dataset: string;
  sourceUrl: string;
  points: MinePoint[];
}
// Primary commodity = first listed (compound entries read "Barite; Gallium").
function primaryCommodity(c: string): string {
  return (c.split(";")[0] || c).trim();
}
// Deterministic, well-separated hue per commodity for the mine markers, so the
// same mineral always reads the same color without a hand-kept palette.
function commodityColor(c: string): string {
  const s = primaryCommodity(c);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 80% 52%)`;
}

// A generic live point overlay (natural disasters, vessels). Each point carries
// its own color, label rows, and provenance so one draw / hit-test / tooltip
// path can serve every live source. All values come straight from the upstream
// feed — nothing is synthesized.
interface OverlayPoint {
  kind: "disaster" | "vessel" | "camera";
  lat: number;
  lon: number;
  color: string;
  r: number;
  title: string;
  lines: [string, string][];
  source: string;
  sourceUrl: string;
  imageUrl?: string; // live snapshot (public webcams) — shown in the tooltip
}
// NASA EONET event category → stable marker color.
const DISASTER_COLORS: Record<string, string> = {
  wildfires: "#ef4444",
  severeStorms: "#a855f7",
  volcanoes: "#f97316",
  floods: "#3b82f6",
  drought: "#ca8a04",
  seaLakeIce: "#38bdf8",
  snow: "#cbd5e1",
  landslides: "#92400e",
  dustHaze: "#d6a25b",
  manmade: "#64748b",
  waterColor: "#14b8a6",
  tempExtremes: "#fb7185",
};
function disasterColor(cat: string): string {
  return DISASTER_COLORS[cat] ?? "#dc2626";
}

const RAD = Math.PI / 180;

/* point-in-polygon (ray casting) on a single ring of [lng,lat] pairs */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// rough centroid (mean of the largest ring's vertices) for orienting the globe
function featureCentroid(feature: any): { lat: number; lng: number } | null {
  const g = feature.geometry;
  if (!g) return null;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let ring: number[][] | null = null;
  let best = 0;
  for (const rings of polys) {
    const r0 = rings[0];
    if (r0 && r0.length > best) {
      best = r0.length;
      ring = r0;
    }
  }
  if (!ring) return null;
  let sx = 0,
    sy = 0;
  for (const p of ring) {
    sx += p[0];
    sy += p[1];
  }
  return { lng: sx / ring.length, lat: sy / ring.length };
}

// Sample points along the great-circle arc between two lat/lng points (slerp on
// the unit sphere). Used to draw geographically faithful trade-flow arcs.
function greatCircle(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  steps = 48
): { lat: number; lng: number }[] {
  const toR = Math.PI / 180;
  const toV = (lat: number, lng: number) => {
    const la = lat * toR,
      lo = lng * toR;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };
  const a = toV(lat1, lng1);
  const b = toV(lat2, lng2);
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(dot);
  const out: { lat: number; lng: number }[] = [];
  if (omega < 1e-6) return [{ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }];
  const sinO = Math.sin(omega);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s1 = Math.sin((1 - t) * omega) / sinO;
    const s2 = Math.sin(t * omega) / sinO;
    const x = s1 * a[0] + s2 * b[0];
    const y = s1 * a[1] + s2 * b[1];
    const z = s1 * a[2] + s2 * b[2];
    out.push({
      lat: Math.atan2(z, Math.hypot(x, y)) / toR,
      lng: Math.atan2(y, x) / toR,
    });
  }
  return out;
}

function featureContains(feature: any, lng: number, lat: number): boolean {
  const g = feature.geometry;
  if (!g) return false;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const rings of polys) {
    if (!rings.length) continue;
    if (pointInRing(lng, lat, rings[0])) {
      // subtract holes
      let inHole = false;
      for (let h = 1; h < rings.length; h++) {
        if (pointInRing(lng, lat, rings[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

export default function GlobeMap({
  mode,
  onSelectIso,
  highlightIso,
  layers = ["cobalt_production"],
  showMines = false,
  showDisasters = false,
  showVessels = false,
  showFarms = false,
  showCams = false,
  showClimate = false,
  showTrade = false,
  tradeIso,
}: {
  mode: "globe" | "mercator" | "satellite";
  onSelectIso?: (iso: string | undefined) => void;
  highlightIso?: string[]; // ISO3s referenced by the current answer
  layers?: string[]; // active data filters (one OR many, combined)
  showMines?: boolean; // overlay real mine/deposit points (USGS PP1802)
  showDisasters?: boolean; // live NASA EONET events + USGS earthquakes
  showVessels?: boolean; // live AIS vessel positions (Digitraffic)
  showFarms?: boolean; // global field boundaries (FTW · Sentinel-2 · PMTiles)
  showCams?: boolean; // live public traffic webcams (TfL JamCams, London)
  showClimate?: boolean; // US county climate-habitability (Rhodium/ProPublica)
  showTrade?: boolean; // bilateral trade-flow arcs (World Bank WITS)
  tradeIso?: string; // reporter country for trade flows (= selected country)
}) {
  const layerKey = layers.join(",");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    name: string;
    entry: IsoEntry | null; // null = named land with no value for active filters
  } | null>(null);
  const [mineTip, setMineTip] = useState<{ x: number; y: number; p: MinePoint } | null>(
    null
  );

  // mutable render state held in refs so the rAF loop is set up once
  const geoRef = useRef<any | null>(null);
  const dataRef = useRef<CompositePayload | null>(null);
  const minesRef = useRef<MinePoint[]>([]); // USGS PP1802 mine/deposit points
  const mineSrcRef = useRef<string>("");
  const showMinesRef = useRef(showMines);
  // Live overlays (fetched client-side from CORS-enabled public feeds).
  const disastersRef = useRef<OverlayPoint[]>([]); // NASA EONET + USGS quakes
  const vesselsRef = useRef<OverlayPoint[]>([]); // Digitraffic AIS positions
  const camerasRef = useRef<OverlayPoint[]>([]); // TfL JamCams public webcams
  const farmsRef = useRef<{ features: any[]; loadedAt: number }>({
    features: [],
    loadedAt: 0,
  }); // FTW global field boundaries (Sentinel-2, PMTiles)
  const showDisastersRef = useRef(showDisasters);
  const showVesselsRef = useRef(showVessels);
  const showFarmsRef = useRef(showFarms);
  const showCamsRef = useRef(showCams);
  // US county climate-habitability choropleth (Rhodium Group via ProPublica/NYT).
  // Counties carry the source's ordinal severity bins; we paint each county with
  // the source's own legend color for the active hazard. Missing counties = gaps.
  const countiesRef = useRef<any[]>([]); // joined county features (+ .cm record)
  const climateDataRef = useRef<ClimateData | null>(null); // legends + metadata
  const showClimateRef = useRef(showClimate);
  const climateMetricRef = useRef<string>("damages_gdp_2040_85"); // active hazard column
  const [climateData, setClimateData] = useState<ClimateData | null>(null);
  const [climateMetric, setClimateMetric] = useState<string>("damages_gdp_2040_85");
  const [countyTip, setCountyTip] = useState<{ x: number; y: number; f: any } | null>(
    null
  );
  // Bilateral trade-flow arcs (World Bank WITS). Reporter = the selected country;
  // arcs go reporter→partner, sized by real US$ value. Honest gap when absent.
  const tradeRef = useRef<TradePayload | null>(null);
  const showTradeRef = useRef(showTrade);
  const tradeFlowRef = useRef<"X" | "M">("X");
  const [tradeFlow, setTradeFlow] = useState<"X" | "M">("X");
  const [tradeYear, setTradeYear] = useState<string>("2021");
  const [tradeData, setTradeData] = useState<TradePayload | null>(null);
  const [tradeTip, setTradeTip] = useState<{
    x: number;
    y: number;
    f: TradeFlow;
  } | null>(null);
  const [ptTip, setPtTip] = useState<{ x: number; y: number; p: OverlayPoint } | null>(
    null
  );
  const [farmTip, setFarmTip] = useState<{ x: number; y: number; f: any } | null>(
    null
  );
  const [overlayNote, setOverlayNote] = useState<string | null>(null);
  // when exactly one world_share filter is active we can draw "% of world"
  // labels; otherwise the composite has no single share to show.
  const shareRef = useRef<{ id: string; total: number } | null>(null);
  const modeRef = useRef(mode);
  const zoomRef = useRef(1); // shared map zoom (globe radius + mercator scale)
  const baseRRef = useRef(0); // unzoomed globe radius, set by fit()
  const tileCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [zoomTick, setZoomTick] = useState(0); // re-render zoom readout
  const rotYRef = useRef(-18); // longitude spin
  const rotXRef = useRef(16); // equator tilt
  const panXRef = useRef(0); // mercator horizontal pan (degrees)
  const hoverIsoRef = useRef<string | undefined>(undefined);
  const highlightRef = useRef<Set<string>>(new Set()); // answer's countries
  const frozenRef = useRef(false); // click to stop/resume auto-rotation
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const lastPtrRef = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ w: 0, h: 0, cx: 0, cy: 0, R: 0 });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    showMinesRef.current = showMines;
  }, [showMines]);

  useEffect(() => {
    showDisastersRef.current = showDisasters;
  }, [showDisasters]);
  useEffect(() => {
    showVesselsRef.current = showVessels;
  }, [showVessels]);
  useEffect(() => {
    showFarmsRef.current = showFarms;
  }, [showFarms]);
  useEffect(() => {
    showCamsRef.current = showCams;
  }, [showCams]);
  useEffect(() => {
    showClimateRef.current = showClimate;
  }, [showClimate]);
  useEffect(() => {
    climateMetricRef.current = climateMetric;
  }, [climateMetric]);
  useEffect(() => {
    showTradeRef.current = showTrade;
  }, [showTrade]);
  useEffect(() => {
    tradeFlowRef.current = tradeFlow;
  }, [tradeFlow]);

  // Load bilateral trade flows for the selected reporter whenever the overlay is
  // on and the country / direction / year changes. Real WITS data; gap-aware.
  useEffect(() => {
    if (!showTrade) {
      tradeRef.current = null;
      setTradeData(null);
      return;
    }
    if (!tradeIso) {
      tradeRef.current = null;
      setTradeData(null);
      setOverlayNote("Trade flows: select a country to see who it trades with.");
      return;
    }
    let cancelled = false;
    setOverlayNote(
      `Trade flows: loading ${tradeFlow === "M" ? "imports" : "exports"} for ${tradeIso} (${tradeYear})…`
    );
    loadTradeFlows(tradeIso, tradeFlow, tradeYear)
      .then((data) => {
        if (cancelled) return;
        tradeRef.current = data.available ? data : null;
        setTradeData(data);
        if (data.available && data.flows) {
          setOverlayNote(
            `Trade flows: ${data.reporter?.name} ${tradeFlow === "M" ? "imports from" : "exports to"} ${data.flows.length} partners · World Bank WITS ${tradeYear}`
          );
        } else {
          setOverlayNote(`Trade flows: ${data.reason ?? "no data"} (data gap)`);
        }
      })
      .catch(() => {
        if (!cancelled) setOverlayNote("Trade flows: load failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [showTrade, tradeIso, tradeFlow, tradeYear]);

  // Load the US county climate dataset + geometry once, when first enabled.
  useEffect(() => {
    if (!showClimate || countiesRef.current.length) return;
    let cancelled = false;
    setOverlayNote("Climate-migration: loading US county projections…");
    loadClimateMigration()
      .then(({ data, features }) => {
        if (cancelled) return;
        countiesRef.current = features;
        climateDataRef.current = data;
        setClimateData(data);
        const withData = features.filter((f) => f.cm).length;
        setOverlayNote(
          `Climate-migration: ${withData.toLocaleString()} US counties · Rhodium via ProPublica/NYT`
        );
      })
      .catch(() => {
        if (!cancelled) setOverlayNote("Climate-migration: load failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [showClimate]);

  // --- Live natural disasters: NASA EONET open events + USGS earthquakes.
  // Loaded once on first enable; both feeds are free and CORS-enabled.
  useEffect(() => {
    if (!showDisasters || disastersRef.current.length) return;
    Promise.all([
      fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=300")
        .then((r) => r.json())
        .catch(() => null),
      fetch(
        "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson"
      )
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([eonet, quakes]) => {
      const pts: OverlayPoint[] = [];
      for (const ev of eonet?.events ?? []) {
        const cat = ev.categories?.[0];
        const geom = ev.geometry?.[ev.geometry.length - 1];
        if (!geom || geom.type !== "Point") continue;
        const [lon, lat] = geom.coordinates ?? [];
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        pts.push({
          kind: "disaster",
          lat,
          lon,
          color: disasterColor(cat?.id ?? ""),
          r: 3.4,
          title: ev.title ?? "Event",
          lines: [
            ["Category", cat?.title ?? "—"],
            ["Date", String(geom.date ?? "").slice(0, 10) || "—"],
          ],
          source: "NASA EONET",
          sourceUrl: ev.link ?? "https://eonet.gsfc.nasa.gov/",
        });
      }
      for (const f of quakes?.features ?? []) {
        const c = f.geometry?.coordinates;
        if (!c) continue;
        const [lon, lat, depth] = c;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const pr = f.properties ?? {};
        pts.push({
          kind: "disaster",
          lat,
          lon,
          color: "#b45309",
          r: 2.4 + Math.max(0, Math.min(4, (pr.mag ?? 4.5) - 4)),
          title: pr.place ?? "Earthquake",
          lines: [
            ["Magnitude", pr.mag != null ? `M ${pr.mag}` : "—"],
            ["Depth", depth != null ? `${depth} km` : "—"],
            [
              "Time",
              pr.time ? new Date(pr.time).toISOString().slice(0, 10) : "—",
            ],
          ],
          source: "USGS Earthquakes",
          sourceUrl: pr.url ?? "https://earthquake.usgs.gov/",
        });
      }
      disastersRef.current = pts;
    });
  }, [showDisasters]);

  // --- Live AIS vessel positions: global feed from AISStream.io, proxied by
  // our server (/api/vessels) so the API key stays server-side. Refreshed every
  // 30s while the layer is on; positions are real broadcasts. If no key is set
  // the API reports configured:false and we surface an honest data gap.
  useEffect(() => {
    if (!showVessels) return;
    let stop = false;
    const load = () =>
      fetch("/api/vessels")
        .then((r) => r.json())
        .then((d: any) => {
          if (stop) return;
          if (d?.configured === false) {
            vesselsRef.current = [];
            setOverlayNote(
              "Vessels: set a free AISSTREAM_API_KEY for global live AIS (aisstream.io)."
            );
            return;
          }
          const pts: OverlayPoint[] = [];
          for (const v of d?.vessels ?? []) {
            if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue;
            pts.push({
              kind: "vessel",
              lat: v.lat,
              lon: v.lon,
              color: "#0284c7",
              r: 1.8,
              title: v.name ? `${v.name}` : `Vessel · MMSI ${v.mmsi}`,
              lines: [
                ["MMSI", String(v.mmsi)],
                ["Speed", v.sog != null ? `${v.sog} kn` : "—"],
                ["Course", v.cog != null ? `${v.cog}°` : "—"],
              ],
              source: "AISStream.io (global AIS)",
              sourceUrl: "https://aisstream.io",
            });
          }
          vesselsRef.current = pts;
          if (pts.length === 0) {
            setOverlayNote("Vessels: connecting to global AIS feed…");
          } else {
            setOverlayNote(null);
          }
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [showVessels]);

  // --- Live public traffic webcams: Transport for London "JamCams" — official,
  // free, no key. Each is a public road camera with a live JPEG snapshot and
  // real coordinates. Coverage is London only (a data gap elsewhere until more
  // open municipal feeds are verified — we never invent camera locations).
  // We aggregate only official public-infrastructure cameras, not private feeds.
  useEffect(() => {
    if (!showCams || camerasRef.current.length) return;
    fetch("https://api.tfl.gov.uk/Place/Type/JamCam")
      .then((r) => r.json())
      .then((arr: any[]) => {
        const pts: OverlayPoint[] = [];
        for (const pl of arr ?? []) {
          const lat = pl.lat;
          const lon = pl.lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const props: any[] = pl.additionalProperties ?? [];
          const img = props.find((p) => p.key === "imageUrl")?.value;
          const avail = props.find((p) => p.key === "available")?.value;
          pts.push({
            kind: "camera",
            lat,
            lon,
            color: "#7c3aed",
            r: 2.2,
            title: pl.commonName ?? "Traffic camera",
            lines: [
              ["Status", avail === "true" ? "available" : "offline"],
              ["Operator", "Transport for London"],
            ],
            source: "TfL JamCams (public)",
            sourceUrl: "https://api.tfl.gov.uk/Place/Type/JamCam",
            imageUrl: typeof img === "string" ? img : undefined,
          });
        }
        camerasRef.current = pts;
      })
      .catch(() => {});
  }, [showCams]);

  // --- Live field boundaries: Fields of The World (FTW) — global, Sentinel-2
  // derived agricultural parcels served as a single PMTiles vector archive on
  // Source Cooperative (range-requested from S3, open CORS, no key). The browser
  // pulls only the vector tiles covering the current view, decoded to lng/lat
  // polygons; we refetch as the view pans/zooms. These are MODEL-PREDICTED field
  // extents (2024/25 composites), not cadastral parcels — there is no owner or
  // crop attribute, and cropland-free areas are shown as honest data gaps.
  useEffect(() => {
    if (!showFarms) {
      setOverlayNote(null);
      farmsRef.current = { features: [], loadedAt: 0 };
      return;
    }
    let cancelled = false;
    let busy = false;
    let lastKey = "";

    const tick = async () => {
      if (cancelled || busy) return;
      const { cx, cy, w, R } = sizeRef.current;
      const ll = unproject(cx, cy);
      if (!ll) {
        setOverlayNote("Field boundaries: rotate to land to load (FTW · Sentinel-2).");
        return;
      }
      const merc = modeRef.current !== "globe";
      const worldW = merc ? w * zoomRef.current : 2 * Math.PI * R;
      const z = ftwFetchZoom(worldW);
      // Quantize the view centre to a tile so we only refetch on real movement.
      const n = 2 ** z;
      const nx = Math.floor(((ll.lng + 180) / 360) * n);
      const rr = (Math.max(-85, Math.min(85, ll.lat)) * Math.PI) / 180;
      const ny = Math.floor(
        ((1 - Math.log(Math.tan(rr) + 1 / Math.cos(rr)) / Math.PI) / 2) * n
      );
      const key = `${z}/${nx}/${ny}`;
      if (key === lastKey) return;
      lastKey = key;
      busy = true;
      setOverlayNote(`Field boundaries: loading FTW tiles (z${z})…`);
      try {
        const { features } = await loadFtwFields(ll.lng, ll.lat, z);
        if (cancelled) return;
        farmsRef.current = { features, loadedAt: Date.now() };
        setOverlayNote(
          features.length
            ? `Field boundaries: ${features.length.toLocaleString()} FTW parcels in view · Sentinel-2 · z${z}`
            : "Field boundaries: none mapped here — FTW maps cropland only (data gap)."
        );
      } catch {
        if (!cancelled) setOverlayNote("Field boundaries: load failed.");
      } finally {
        busy = false;
      }
    };

    tick();
    const iv = setInterval(tick, 700);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [showFarms]);

  // Load the real mine/deposit points once (static provenance-tagged asset).
  useEffect(() => {
    if (minesRef.current.length) return;
    fetch("/critmin_points.json")
      .then((r) => r.json())
      .then((d: MinePayload) => {
        minesRef.current = Array.isArray(d?.points) ? d.points : [];
        mineSrcRef.current = d?.dataset ?? "USGS Professional Paper 1802";
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const set = new Set((highlightIso ?? []).filter(Boolean));
    highlightRef.current = set;
    if (set.size === 0) return;
    // orient the globe to the answer's top-production country and hold
    const geo = geoRef.current;
    const data = dataRef.current;
    if (!geo) return;
    let bestIso: string | null = null;
    let bestProd = -1;
    for (const iso of set) {
      const prod = data?.byIso[iso]?.composite ?? 0;
      if (prod > bestProd) {
        bestProd = prod;
        bestIso = iso;
      }
    }
    const feat = bestIso
      ? geo.features.find((f: any) => isoOf(f.properties) === bestIso)
      : null;
    const c = feat ? featureCentroid(feat) : null;
    if (c) {
      rotYRef.current = -c.lng;
      rotXRef.current = Math.max(-55, Math.min(55, c.lat));
      frozenRef.current = true; // hold so the answer's region stays in view
    }
  }, [highlightIso]);

  /* ---- load geometry once, data per selected layer ---- */
  useEffect(() => {
    fetch("/countries.geo.json")
      .then((r) => r.json())
      .then((g) => {
        geoRef.current = g;
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (layers.length === 0) {
      dataRef.current = { layers: [], worldTotals: {}, byIso: {} };
      shareRef.current = null;
      setReady(true);
      return;
    }
    const qs = layers
      .map((l) => `layer=${encodeURIComponent(l)}`)
      .join("&");
    fetch(`/api/composite?${qs}`)
      .then((r) => r.json())
      .then((d: CompositePayload) => {
        if (d == null || !d.byIso) throw new Error("no data for filters");
        dataRef.current = d;
        // "% of world" labels only make sense for a single world_share filter.
        shareRef.current =
          d.layers.length === 1 && d.layers[0].display === "world_share"
            ? { id: d.layers[0].id, total: d.worldTotals[d.layers[0].id] ?? 0 }
            : null;
        setReady(true);
      })
      .catch((e) => setErr(String(e)));
  }, [layerKey]);

  /* ---- projection ---- */
  // returns screen point + z (depth, >0 front) + whether on visible hemisphere
  function project(lat: number, lng: number) {
    const { cx, cy, R } = sizeRef.current;
    if (modeRef.current !== "globe") {
      const { w } = sizeRef.current;
      const scale = (w / (2 * Math.PI)) * zoomRef.current; // world width = w·zoom
      let lon = lng + panXRef.current;
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const x = cx + lon * RAD * scale;
      const clat = Math.max(-82, Math.min(82, lat));
      const merc = Math.log(Math.tan(Math.PI / 4 + (clat * RAD) / 2));
      const y = cy - scale * merc;
      return { x, y, z: 1, vis: true };
    }
    const phi = lat * RAD;
    const lam = (lng + rotYRef.current) * RAD;
    const rx = rotXRef.current * RAD;
    const x0 = Math.cos(phi) * Math.sin(lam);
    const y0 = Math.sin(phi);
    const z0 = Math.cos(phi) * Math.cos(lam);
    const y2 = y0 * Math.cos(rx) - z0 * Math.sin(rx);
    const z2 = y0 * Math.sin(rx) + z0 * Math.cos(rx);
    return { x: cx + x0 * R, y: cy - y2 * R, z: z2, vis: z2 > 0 };
  }

  // invert a screen point back to lat/lng (front hemisphere only for globe)
  function unproject(mx: number, my: number): { lat: number; lng: number } | null {
    const { cx, cy, R } = sizeRef.current;
    if (modeRef.current !== "globe") {
      const { w } = sizeRef.current;
      const scale = (w / (2 * Math.PI)) * zoomRef.current;
      const lonDeg = (mx - cx) / scale / RAD;
      const merc = (cy - my) / scale;
      const lat = (2 * Math.atan(Math.exp(merc)) - Math.PI / 2) / RAD;
      let lng = lonDeg - panXRef.current;
      lng = ((((lng + 180) % 360) + 360) % 360) - 180;
      if (lat < -85 || lat > 85) return null;
      return { lat, lng };
    }
    const dx = (mx - cx) / R;
    const dy = -(my - cy) / R;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return null;
    const z = Math.sqrt(1 - d2);
    const rx = rotXRef.current * RAD;
    // undo tilt: screen gives (x0, y2, z2)=(dx, dy, z); recover (y0,z0)
    const y0 = dy * Math.cos(rx) + z * Math.sin(rx);
    const z0 = -dy * Math.sin(rx) + z * Math.cos(rx);
    const x0 = dx;
    const lat = Math.asin(Math.max(-1, Math.min(1, y0))) / RAD;
    let lng = Math.atan2(x0, z0) / RAD - rotYRef.current;
    lng = ((((lng + 180) % 360) + 360) % 360) - 180;
    return { lat, lng };
  }

  /* ---- draw loop ---- */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function fit() {
      const r = cvs!.getBoundingClientRect();
      cvs!.width = Math.round(r.width * dpr);
      cvs!.height = Math.round(r.height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = r.width,
        h = r.height;
      const baseR = Math.min(w * 0.46, h * 0.62);
      baseRRef.current = baseR;
      sizeRef.current = {
        w,
        h,
        cx: w * 0.5,
        cy: h * 0.5,
        R: baseR * zoomRef.current,
      };
    }
    fit();
    window.addEventListener("resize", fit);

    function drawGraticule() {
      ctx!.lineWidth = 0.5;
      for (let lng = 0; lng < 360; lng += 30) {
        ctx!.beginPath();
        let first = true;
        for (let lat = -90; lat <= 90; lat += 4) {
          const p = project(lat, lng);
          if (!p.vis) {
            first = true;
            continue;
          }
          const f = Math.max(0, p.z + 0.15);
          ctx!.strokeStyle = `rgba(60,90,120,${0.03 + 0.1 * f})`;
          if (first) {
            ctx!.moveTo(p.x, p.y);
            first = false;
          } else ctx!.lineTo(p.x, p.y);
        }
        ctx!.stroke();
      }
      for (let lat = -60; lat <= 60; lat += 20) {
        ctx!.beginPath();
        let first = true;
        for (let lng = 0; lng <= 360; lng += 4) {
          const p = project(lat, lng);
          if (!p.vis) {
            first = true;
            continue;
          }
          const f = Math.max(0, p.z + 0.15);
          ctx!.strokeStyle = `rgba(60,90,120,${0.03 + 0.1 * f})`;
          if (first) {
            ctx!.moveTo(p.x, p.y);
            first = false;
          } else ctx!.lineTo(p.x, p.y);
        }
        ctx!.stroke();
      }
    }

    // build a fill path for one ring; clamp back-facing points to the rim
    // (globe). In mercator/flat the longitude wrap maps +180°→-180°, which
    // would fling an edge vertex (e.g. Russia's eastern tip) to the opposite
    // side and slash a chord across the country. Fix: unwrap each vertex in
    // screen space so the ring stays continuous (shifting by whole world-
    // widths as needed) — no seam break, no streak.
    function ringPath(ring: number[][]) {
      const { cx, cy, R, w } = sizeRef.current;
      const merc = modeRef.current !== "globe";
      const worldW = w * zoomRef.current; // pixel width of a full 360° span
      ctx!.beginPath();
      let started = false;
      let prevX = 0;
      for (let i = 0; i < ring.length; i++) {
        const p = project(ring[i][1], ring[i][0]);
        let px = p.x,
          py = p.y;
        if (!p.vis && !merc) {
          const ddx = p.x - cx,
            ddy = p.y - cy;
          const len = Math.hypot(ddx, ddy) || 1;
          px = cx + (ddx / len) * R;
          py = cy + (ddy / len) * R;
        }
        if (merc && started && worldW > 0) {
          // keep this vertex within half a world of the previous one
          while (px - prevX > worldW / 2) px -= worldW;
          while (prevX - px > worldW / 2) px += worldW;
        }
        if (!started) {
          ctx!.moveTo(px, py);
          started = true;
        } else ctx!.lineTo(px, py);
        prevX = px;
      }
      ctx!.closePath();
    }

    function frontFacing(feature: any): boolean {
      if (modeRef.current !== "globe") return true;
      // sample first coordinate of outer ring
      const g = feature.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const rings of polys) {
        const r0 = rings[0];
        if (!r0 || !r0.length) continue;
        // average a few points for a rough centroid depth
        let zc = 0,
          n = 0;
        for (let i = 0; i < r0.length; i += Math.max(1, (r0.length / 6) | 0)) {
          const p = project(r0[i][1], r0[i][0]);
          zc += p.z;
          n++;
        }
        if (n && zc / n > -0.15) return true;
      }
      return false;
    }

    function drawCountries() {
      const geo = geoRef.current;
      const data = dataRef.current;
      if (!geo || !data) return;
      const { cx, cy, R } = sizeRef.current;

      // clip to the globe disk so back-hemisphere fills never spill out
      if (modeRef.current === "globe") {
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(cx, cy, R, 0, Math.PI * 2);
        ctx!.clip();
      }

      const hasHi = highlightRef.current.size > 0;
      ctx!.lineWidth = 0.6;
      for (const feat of geo.features) {
        if (!frontFacing(feat)) continue;
        const iso = isoOf(feat.properties);
        const entry = iso ? data.byIso[iso] : undefined;
        const rgb = entryColor(entry);
        const hovered = iso && iso === hoverIsoRef.current;
        const isHi = !!(iso && highlightRef.current.has(iso));
        // dim everything that isn't in the current answer (when one exists)
        const dim = hasHi && !isHi ? 0.4 : 1;

        const g = feat.geometry;
        const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
        for (const rings of polys) {
          for (let ri = 0; ri < rings.length; ri++) {
            ringPath(rings[ri]);
            if (ri === 0) {
              const sat = modeRef.current === "satellite";
              if (rgb) {
                const a = (sat ? (hovered ? 0.82 : 0.62) : hovered ? 0.92 : 0.82) * dim;
                ctx!.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
                ctx!.fill();
              } else if (sat) {
                // over imagery, leave data-gap countries transparent (show
                // the satellite basemap) — only a faint tint on hover.
                if (hovered) {
                  ctx!.fillStyle = `rgba(226,232,240,${0.3 * dim})`;
                  ctx!.fill();
                }
              } else {
                ctx!.fillStyle = hovered
                  ? `rgba(203,213,225,${0.85 * dim})`
                  : `rgba(226,232,240,${0.55 * dim})`;
                ctx!.fill();
              }
            }
            ctx!.strokeStyle = hovered
              ? "rgba(15,40,70,0.9)"
              : `rgba(50,80,110,${0.45 * dim})`;
            ctx!.lineWidth = hovered ? 1.1 : 0.6;
            ctx!.stroke();
          }
        }
      }

      // emphasis pass: outline answer countries on top in a warm accent
      if (hasHi) {
        for (const feat of geo.features) {
          if (!frontFacing(feat)) continue;
          const iso = isoOf(feat.properties);
          if (!iso || !highlightRef.current.has(iso)) continue;
          const g = feat.geometry;
          const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
          for (const rings of polys) {
            ringPath(rings[0]);
            ctx!.strokeStyle = "rgba(217,119,6,0.95)"; // amber-600
            ctx!.lineWidth = 1.8;
            ctx!.stroke();
          }
        }
      }

      if (modeRef.current === "globe") ctx!.restore();
    }

    // draw "% of world" labels on producer countries (decluttered by threshold).
    // Only meaningful for share-of-world layers (a few big producers); percent
    // layers cover ~200 countries and would clutter, so they rely on color+tooltip.
    function drawLabels() {
      const geo = geoRef.current;
      const data = dataRef.current;
      const share = shareRef.current;
      if (!geo || !data || !share || share.total <= 0) return;
      ctx!.save();
      ctx!.font = "600 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      for (const feat of geo.features) {
        const iso = isoOf(feat.properties);
        if (!iso) continue;
        const prod = data.byIso[iso]?.layers[share.id]?.value;
        if (!prod || prod <= 0) continue;
        const pct = (prod / share.total) * 100;
        if (pct < 0.3) continue; // hide tiny slivers to avoid clutter
        if (!(feat as any).__centroid)
          (feat as any).__centroid = featureCentroid(feat);
        const c = (feat as any).__centroid;
        if (!c) continue;
        const p = project(c.lat, c.lng);
        if (modeRef.current === "globe" && !p.vis) continue;
        const label = pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
        ctx!.lineWidth = 3;
        ctx!.strokeStyle = "rgba(255,255,255,0.92)";
        ctx!.strokeText(label, p.x, p.y);
        ctx!.fillStyle = "rgba(17,38,58,0.95)";
        ctx!.fillText(label, p.x, p.y);
      }
      ctx!.restore();
    }

    // Real mine/deposit/district points (USGS PP1802), colored by primary
    // commodity. Back-hemisphere points are skipped on the globe via vis.
    function drawMines() {
      if (!showMinesRef.current) return;
      const pts = minesRef.current;
      if (!pts.length) return;
      const globe = modeRef.current === "globe";
      const sat = modeRef.current === "satellite";
      ctx!.save();
      ctx!.lineWidth = 0.7;
      for (const mp of pts) {
        const p = project(mp.lat, mp.lon);
        if (globe && !p.vis) continue;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx!.fillStyle = commodityColor(mp.commodity);
        ctx!.globalAlpha = sat ? 0.95 : 0.85;
        ctx!.fill();
        ctx!.globalAlpha = 1;
        ctx!.strokeStyle = "rgba(255,255,255,0.92)";
        ctx!.stroke();
      }
      ctx!.restore();
    }

    // Bilateral trade-flow arcs (World Bank WITS). Great-circle lines from the
    // reporter to each partner, width ∝ real US$ value; a dot at each partner.
    // Top flows only, to keep the picture legible. Export = warm, import = cool.
    function drawTradeFlows() {
      if (!showTradeRef.current) return;
      const data = tradeRef.current;
      if (!data || !data.available || !data.flows || !data.reporter) return;
      const globe = modeRef.current === "globe";
      const rep = data.reporter;
      const flows = data.flows.slice(0, 60);
      const max = flows[0]?.value || 1;
      const isExport = (data.flow ?? "X") === "X";
      const stroke = isExport ? "rgba(217,119,6,0.55)" : "rgba(2,132,199,0.55)";
      const dotFill = isExport ? "#d97706" : "#0284c7";
      ctx!.save();
      ctx!.lineCap = "round";
      for (const f of flows) {
        const pts = greatCircle(rep.lat, rep.lon, f.lat, f.lon, 48);
        ctx!.beginPath();
        ctx!.lineWidth = 0.6 + 3.4 * Math.sqrt(f.value / max);
        ctx!.strokeStyle = stroke;
        let started = false;
        for (const p of pts) {
          const pr = project(p.lat, p.lng);
          if (globe && !pr.vis) {
            started = false; // break the line across the horizon
            continue;
          }
          if (!started) {
            ctx!.moveTo(pr.x, pr.y);
            started = true;
          } else ctx!.lineTo(pr.x, pr.y);
        }
        ctx!.stroke();
      }
      // partner end-dots, sized by value
      for (const f of flows) {
        const pr = project(f.lat, f.lon);
        if (globe && !pr.vis) continue;
        ctx!.beginPath();
        ctx!.arc(pr.x, pr.y, 1.5 + 3 * Math.sqrt(f.value / max), 0, Math.PI * 2);
        ctx!.fillStyle = dotFill;
        ctx!.globalAlpha = 0.85;
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }
      // reporter hub
      const rp = project(rep.lat, rep.lon);
      if (!globe || rp.vis) {
        ctx!.beginPath();
        ctx!.arc(rp.x, rp.y, 5, 0, Math.PI * 2);
        ctx!.fillStyle = "#111827";
        ctx!.fill();
        ctx!.lineWidth = 2;
        ctx!.strokeStyle = "#fff";
        ctx!.stroke();
      }
      ctx!.restore();
    }

    // US county climate-habitability choropleth. Each county is painted with the
    // SOURCE'S OWN legend color for the active hazard's published severity bin
    // (Rhodium Group via ProPublica/NYT). Counties absent from the dataset are
    // left unpainted — an honest data gap, never a zero.
    function drawCounties() {
      if (!showClimateRef.current) return;
      const feats = countiesRef.current;
      const data = climateDataRef.current;
      if (!feats.length || !data) return;
      const col = climateMetricRef.current;
      const legend = Object.values(data.variables).find((v) =>
        v.cols.includes(col)
      )?.legend;
      if (!legend) return;
      const globe = modeRef.current === "globe";
      ctx!.save();
      ctx!.lineWidth = 0.25;
      ctx!.strokeStyle = "rgba(40,40,40,0.35)";
      for (const f of feats) {
        const rec = f.cm;
        if (!rec) continue; // data gap — leave the base map showing through
        const bin = rec.bins[col];
        const color = binColor(data, legend, bin);
        if (!color) continue;
        const g = f.geometry;
        if (!g) continue;
        const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
        ctx!.fillStyle = color;
        ctx!.globalAlpha = 0.78;
        for (const rings of polys) {
          const ring = rings?.[0];
          if (!ring || ring.length < 3) continue;
          ctx!.beginPath();
          let started = false;
          let anyVis = false;
          for (const pt of ring) {
            const pr = project(pt[1], pt[0]);
            if (globe && !pr.vis) continue;
            anyVis = true;
            if (!started) {
              ctx!.moveTo(pr.x, pr.y);
              started = true;
            } else ctx!.lineTo(pr.x, pr.y);
          }
          if (anyVis) {
            ctx!.closePath();
            ctx!.fill();
            ctx!.stroke();
          }
        }
      }
      ctx!.restore();
    }

    // Global field boundaries (FTW · Sentinel-2) — real predicted field polygons,
    // drawn as a translucent green fill with outline. Only front-hemisphere
    // vertices count on the globe.
    function drawFarms() {
      if (!showFarmsRef.current) return;
      const feats = farmsRef.current.features;
      if (!feats.length) return;
      const globe = modeRef.current === "globe";
      ctx!.save();
      ctx!.lineWidth = 0.7;
      ctx!.strokeStyle = "rgba(21,94,46,0.9)";
      ctx!.fillStyle = "rgba(34,197,94,0.35)";
      for (const f of feats) {
        const g = f.geometry;
        if (!g) continue;
        const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
        for (const rings of polys) {
          const ring = rings?.[0];
          if (!ring || ring.length < 3) continue;
          ctx!.beginPath();
          let started = false;
          let anyVis = false;
          for (const pt of ring) {
            const pr = project(pt[1], pt[0]);
            if (globe && !pr.vis) continue;
            anyVis = true;
            if (!started) {
              ctx!.moveTo(pr.x, pr.y);
              started = true;
            } else ctx!.lineTo(pr.x, pr.y);
          }
          if (anyVis) {
            ctx!.closePath();
            ctx!.fill();
            ctx!.stroke();
          }
        }
      }
      ctx!.restore();
    }

    // Live point overlays (natural disasters, AIS vessels). Back-hemisphere
    // points are culled on the globe via vis.
    function drawOverlayPoints() {
      const globe = modeRef.current === "globe";
      const sat = modeRef.current === "satellite";
      const groups: OverlayPoint[][] = [];
      if (showDisastersRef.current) groups.push(disastersRef.current);
      if (showVesselsRef.current) groups.push(vesselsRef.current);
      if (showCamsRef.current) groups.push(camerasRef.current);
      if (!groups.length) return;
      ctx!.save();
      ctx!.lineWidth = 0.6;
      for (const arr of groups)
        for (const p of arr) {
          const pr = project(p.lat, p.lon);
          if (globe && !pr.vis) continue;
          ctx!.beginPath();
          ctx!.arc(pr.x, pr.y, p.r, 0, Math.PI * 2);
          ctx!.fillStyle = p.color;
          ctx!.globalAlpha = sat ? 0.95 : 0.85;
          ctx!.fill();
          ctx!.globalAlpha = 1;
          ctx!.strokeStyle = "rgba(255,255,255,0.9)";
          ctx!.stroke();
        }
      ctx!.restore();
    }

    // Real satellite imagery (Esri World Imagery XYZ tiles) drawn as a Web-
    // Mercator basemap under the data layer. 1:1 tile-to-screen mapping by
    // picking the tile zoom whose world width matches the current map width.
    function drawSatellite() {
      const { w, h, cx, cy } = sizeRef.current;
      const W = w * zoomRef.current; // world pixel width at current map zoom
      const zt = Math.max(0, Math.min(19, Math.round(Math.log2(W / 256))));
      const worldSize = 256 * Math.pow(2, zt);
      const n = Math.pow(2, zt);
      const k = W / worldSize; // screen px per tile px (~1)
      const tilePx = 256 * k;
      let centerLon = -panXRef.current; // geographic lon at screen center
      centerLon = ((((centerLon + 180) % 360) + 360) % 360) - 180;
      const cwx = ((centerLon + 180) / 360) * worldSize;
      const cwy = 0.5 * worldSize; // equator (mercator y center)
      const txLeft = Math.floor((cwx - cx / k) / 256);
      const txRight = Math.ceil((cwx + (w - cx) / k) / 256);
      const tyTop = Math.max(0, Math.floor((cwy - cy / k) / 256));
      const tyBot = Math.min(n - 1, Math.ceil((cwy + (h - cy) / k) / 256));
      for (let ty = tyTop; ty <= tyBot; ty++) {
        for (let tx = txLeft; tx <= txRight; tx++) {
          const sx = cx + (tx * 256 - cwx) * k;
          const sy = cy + (ty * 256 - cwy) * k;
          const wrap = ((tx % n) + n) % n; // wrap longitude for the fetch
          const key = `${zt}/${wrap}/${ty}`;
          let img = tileCache.current.get(key);
          if (!img) {
            img = new Image();
            img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zt}/${ty}/${wrap}`;
            tileCache.current.set(key, img);
          }
          if (img.complete && img.naturalWidth > 0)
            ctx!.drawImage(img, sx, sy, tilePx + 1, tilePx + 1);
        }
      }
    }

    function draw() {
      const { w, h, cx, cy, R } = sizeRef.current;
      ctx!.clearRect(0, 0, w, h);

      if (modeRef.current === "globe") {
        // glow halo
        const halo = ctx!.createRadialGradient(
          cx,
          cy,
          R * 0.7,
          cx,
          cy,
          R * 1.35
        );
        halo.addColorStop(0, "rgba(180,210,235,0.10)");
        halo.addColorStop(0.55, "rgba(180,210,235,0.04)");
        halo.addColorStop(1, "rgba(180,210,235,0)");
        ctx!.fillStyle = halo;
        ctx!.beginPath();
        ctx!.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
        ctx!.fill();

        // translucent sphere
        const sphere = ctx!.createRadialGradient(
          cx - R * 0.35,
          cy - R * 0.35,
          R * 0.05,
          cx,
          cy,
          R
        );
        sphere.addColorStop(0, "rgba(222,233,245,0.6)");
        sphere.addColorStop(0.55, "rgba(212,226,239,0.34)");
        sphere.addColorStop(1, "rgba(192,212,229,0.1)");
        ctx!.fillStyle = sphere;
        ctx!.beginPath();
        ctx!.arc(cx, cy, R, 0, Math.PI * 2);
        ctx!.fill();

        drawGraticule();
        drawCountries();

        // rim
        ctx!.lineWidth = 1;
        ctx!.strokeStyle = "rgba(60,80,110,0.3)";
        ctx!.beginPath();
        ctx!.arc(cx, cy, R, 0, Math.PI * 2);
        ctx!.stroke();
      } else {
        if (modeRef.current === "satellite") drawSatellite();
        drawCountries();
      }

      drawCounties();
      drawTradeFlows();
      drawFarms();
      drawLabels();
      drawMines();
      drawOverlayPoints();

      // auto-rotate unless interacting
      if (
        modeRef.current === "globe" &&
        !frozenRef.current &&
        !draggingRef.current &&
        !hoverIsoRef.current
      ) {
        rotYRef.current += 0.12;
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  /* ---- pointer interaction ---- */
  // nearest mine point within a few px of the cursor (visible hemisphere only)
  function hitMine(mx: number, my: number): MinePoint | null {
    if (!showMinesRef.current) return null;
    const pts = minesRef.current;
    if (!pts.length) return null;
    const globe = modeRef.current === "globe";
    let best: MinePoint | null = null;
    let bestD = 8 * 8; // px² threshold
    for (const mp of pts) {
      const p = project(mp.lat, mp.lon);
      if (globe && !p.vis) continue;
      const dx = p.x - mx,
        dy = p.y - my;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = mp;
      }
    }
    return best;
  }

  // nearest live overlay point (disaster/vessel) within a few px of the cursor
  function hitOverlayPoint(mx: number, my: number): OverlayPoint | null {
    const globe = modeRef.current === "globe";
    const groups: OverlayPoint[][] = [];
    if (showDisastersRef.current) groups.push(disastersRef.current);
    if (showVesselsRef.current) groups.push(vesselsRef.current);
    if (showCamsRef.current) groups.push(camerasRef.current);
    let best: OverlayPoint | null = null;
    let bestD = 8 * 8;
    for (const arr of groups)
      for (const p of arr) {
        const pr = project(p.lat, p.lon);
        if (globe && !pr.vis) continue;
        const dx = pr.x - mx,
          dy = pr.y - my;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    return best;
  }

  // farm parcel under the cursor (point-in-polygon on RPG geometry)
  function hitFarm(mx: number, my: number): any | null {
    if (!showFarmsRef.current) return null;
    const feats = farmsRef.current.features;
    if (!feats.length) return null;
    const ll = unproject(mx, my);
    if (!ll) return null;
    for (const f of feats)
      if (featureContains(f, ll.lng, ll.lat)) return f;
    return null;
  }

  // Trade-partner node under the cursor (nearest projected dot within radius).
  function hitTradeNode(mx: number, my: number): TradeFlow | null {
    if (!showTradeRef.current) return null;
    const data = tradeRef.current;
    if (!data || !data.available || !data.flows) return null;
    const globe = modeRef.current === "globe";
    let best: TradeFlow | null = null;
    let bestD = 144; // 12px pick radius²
    for (const f of data.flows.slice(0, 60)) {
      const pr = project(f.lat, f.lon);
      if (globe && !pr.vis) continue;
      const dx = pr.x - mx,
        dy = pr.y - my;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  // US county under the cursor (point-in-polygon on county geometry)
  function hitCounty(mx: number, my: number): any | null {
    if (!showClimateRef.current) return null;
    const feats = countiesRef.current;
    if (!feats.length) return null;
    const ll = unproject(mx, my);
    if (!ll) return null;
    // US bbox quick-reject (incl. Alaska/Hawaii) to keep this cheap.
    if (ll.lng > -66 || ll.lng < -180 || ll.lat < 17 || ll.lat > 72) return null;
    for (const f of feats)
      if (f.cm && featureContains(f, ll.lng, ll.lat)) return f;
    return null;
  }

  function hitTest(mx: number, my: number): string | undefined {
    const geo = geoRef.current;
    if (!geo) return undefined;
    const ll = unproject(mx, my);
    if (!ll) return undefined;
    for (const feat of geo.features) {
      if (featureContains(feat, ll.lng, ll.lat)) {
        return isoOf(feat.properties);
      }
    }
    return undefined;
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (draggingRef.current) {
      const dx = mx - lastPtrRef.current.x;
      const dy = my - lastPtrRef.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMovedRef.current = true;
      lastPtrRef.current = { x: mx, y: my };
      if (modeRef.current === "globe") {
        rotYRef.current += dx * 0.3;
        rotXRef.current = Math.max(-78, Math.min(78, rotXRef.current - dy * 0.3));
      } else {
        panXRef.current += dx * 0.25;
      }
      return;
    }

    // Mine points sit on top — check them first so a marker is hoverable even
    // over a colored country.
    const mp = hitMine(mx, my);
    if (mp) {
      setMineTip({ x: mx, y: my, p: mp });
      setTooltip(null);
      setPtTip(null);
      setFarmTip(null);
      hoverIsoRef.current = undefined;
      return;
    }
    setMineTip(null);

    // Live disaster/vessel markers sit above countries too.
    const op = hitOverlayPoint(mx, my);
    if (op) {
      setPtTip({ x: mx, y: my, p: op });
      setTooltip(null);
      setFarmTip(null);
      hoverIsoRef.current = undefined;
      return;
    }
    setPtTip(null);

    // Farm parcels (polygons) — hit before country fills.
    const fm = hitFarm(mx, my);
    if (fm) {
      setFarmTip({ x: mx, y: my, f: fm });
      setTooltip(null);
      hoverIsoRef.current = undefined;
      return;
    }
    setFarmTip(null);

    // Trade-partner nodes sit above country fills — check before them.
    const tn = hitTradeNode(mx, my);
    if (tn) {
      setTradeTip({ x: mx, y: my, f: tn });
      setTooltip(null);
      hoverIsoRef.current = undefined;
      return;
    }
    setTradeTip(null);

    // US county climate choropleth — hit before the country fill underneath.
    const cf = hitCounty(mx, my);
    if (cf) {
      setCountyTip({ x: mx, y: my, f: cf });
      setTooltip(null);
      hoverIsoRef.current = undefined;
      return;
    }
    setCountyTip(null);

    const iso = hitTest(mx, my);
    hoverIsoRef.current = iso;
    const data = dataRef.current;
    if (!iso) {
      setTooltip(null);
      return;
    }
    const feat = geoRef.current?.features.find(
      (f: any) => isoOf(f.properties) === iso
    );
    const nm = feat ? nameOf(feat.properties) : iso;
    setTooltip({ x: mx, y: my, name: nm, entry: data?.byIso[iso] ?? null });
  }

  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    draggingRef.current = true;
    dragMovedRef.current = false;
    lastPtrRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onUp(e: React.MouseEvent<HTMLCanvasElement>) {
    draggingRef.current = false;
    if (dragMovedRef.current) return; // was a drag, not a click
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Click a mine marker → open high-resolution satellite imagery of the
    // actual operation (pit, tailings) at its real coordinates. ESRI World
    // Imagery is free to view; the coordinates come straight from USGS PP1802.
    const mp = hitMine(cx, cy);
    if (mp) {
      const url = `https://www.arcgis.com/apps/mapviewer/index.html?center=${mp.lon},${mp.lat}&level=15&basemap=satellite`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    // a click on the map stops the auto-rotation (click again to resume)
    frozenRef.current = !frozenRef.current;
    const iso = hitTest(cx, cy);
    onSelectIso?.(iso);
  }
  function onLeave() {
    draggingRef.current = false;
    hoverIsoRef.current = undefined;
    setTooltip(null);
    setMineTip(null);
    setPtTip(null);
    setFarmTip(null);
    setCountyTip(null);
    setTradeTip(null);
  }

  function zoomBy(factor: number) {
    zoomRef.current = Math.max(0.6, Math.min(64, zoomRef.current * factor));
    const s = sizeRef.current;
    sizeRef.current = { ...s, R: baseRRef.current * zoomRef.current };
    setZoomTick((t) => t + 1);
  }
  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (e.cancelable) e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }
  function resetView() {
    zoomRef.current = 1;
    panXRef.current = 0;
    rotYRef.current = -18;
    rotXRef.current = 16;
    frozenRef.current = false;
    const s = sizeRef.current;
    sizeRef.current = { ...s, R: baseRRef.current };
    setZoomTick((t) => t + 1);
  }

  if (err)
    return (
      <div className="p-4 text-sm text-red-700">Globe error: {err}</div>
    );

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: "block", cursor: draggingRef.current ? "grabbing" : "grab" }}
        onMouseMove={onMove}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
        onWheel={onWheel}
      />
      {/* zoom controls — scroll to zoom, or use these */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-earth-200 bg-white/90 px-1.5 py-1 shadow-md backdrop-blur">
        <button
          onClick={() => zoomBy(1 / 1.3)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-earth-700 hover:bg-earth-100"
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <span className="min-w-[3.2rem] text-center text-[11px] tabular-nums text-earth-500">
          {zoomRef.current.toFixed(1)}×
          <span className="hidden" aria-hidden>
            {zoomTick}
          </span>
        </span>
        <button
          onClick={() => zoomBy(1.3)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-earth-700 hover:bg-earth-100"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={resetView}
          className="ml-1 rounded-full px-2 py-1 text-[11px] text-earth-600 hover:bg-earth-100"
          title="Reset view"
        >
          Reset
        </button>
      </div>
      {mode === "satellite" && (
        <div className="pointer-events-none absolute bottom-1 right-2 z-20 rounded bg-black/45 px-1.5 py-0.5 text-[9px] text-white/90">
          Imagery © Esri, Maxar, Earthstar Geographics
        </div>
      )}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-earth-500">
          Loading boundaries (Natural Earth) &amp; layer values…
        </div>
      )}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[260px] rounded-md border px-2 py-1.5 text-xs shadow-md backdrop-blur-sm"
          style={{
            left: Math.min(tooltip.x + 14, (sizeRef.current.w || 9999) - 270),
            top: tooltip.y + 14,
            background: "rgba(255,255,255,0.92)",
            borderColor: tooltip.entry ? "#c3dbef" : "#e2e8f0",
            color: tooltip.entry ? "#1f3c5a" : "#475569",
          }}
        >
          <div className="font-semibold">{tooltip.name}</div>
          {tooltip.entry ? (
            <>
              {(dataRef.current?.layers.length ?? 0) > 1 && (
                <div className="mb-0.5 text-[10px] font-medium text-earth-600">
                  Combined severity:{" "}
                  {Math.round(tooltip.entry.composite * 100)}% (mean of{" "}
                  {tooltip.entry.count} filter
                  {tooltip.entry.count > 1 ? "s" : ""})
                </div>
              )}
              <div className="space-y-0.5">
                {(dataRef.current?.layers ?? []).map((m) => {
                  const lv = tooltip.entry!.layers[m.id];
                  return (
                    <div key={m.id} className="text-[11px]">
                      <span className="opacity-70">{m.label}: </span>
                      {lv ? (
                        <>
                          <b>
                            {lv.value.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}
                            {lv.unit === "%" ? "%" : ` ${lv.unit}`}
                          </b>
                          {lv.year ? (
                            <span className="opacity-70"> ({lv.year})</span>
                          ) : null}
                          {shareRef.current?.id === m.id &&
                            shareRef.current.total > 0 && (
                              <span className="opacity-80">
                                {" "}
                                ·{" "}
                                {(
                                  (lv.value / shareRef.current.total) *
                                  100
                                ).toFixed(1)}
                                % of world
                              </span>
                            )}
                          <span className="ml-1 text-[9px] opacity-60">
                            {lv.sourceName}
                          </span>
                        </>
                      ) : (
                        <span className="opacity-50">data gap</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="opacity-70">
              No value for the active filters (data gap).
            </div>
          )}
        </div>
      )}
      {mineTip && (
        <div
          className="pointer-events-none absolute z-30 max-w-[260px] rounded-md border border-earth-200 bg-white/90 px-2 py-1.5 text-xs shadow-md backdrop-blur-sm"
          style={{
            left: Math.min(mineTip.x + 14, (sizeRef.current.w || 9999) - 270),
            top: mineTip.y + 14,
            color: "#1f3c5a",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white"
              style={{ background: commodityColor(mineTip.p.commodity) }}
            />
            <span className="font-semibold">{mineTip.p.name}</span>
          </div>
          <div className="mt-0.5 text-[11px]">
            <span className="opacity-70">Critical mineral: </span>
            <b>{mineTip.p.commodity}</b>
          </div>
          {mineTip.p.depositType && (
            <div className="text-[11px]">
              <span className="opacity-70">Deposit type: </span>
              {mineTip.p.depositType}
            </div>
          )}
          <div className="text-[11px]">
            <span className="opacity-70">Location: </span>
            {[mineTip.p.region, mineTip.p.country].filter(Boolean).join(", ")}
          </div>
          <div className="mt-0.5 text-[9px] opacity-60">
            USGS Professional Paper 1802 · {mineTip.p.lat.toFixed(2)},{" "}
            {mineTip.p.lon.toFixed(2)}
          </div>
          <div className="mt-1 text-[10px] font-medium text-amber-700">
            Click marker → open satellite imagery ↗
          </div>
        </div>
      )}
      {ptTip && (
        <div
          className="pointer-events-none absolute z-30 max-w-[260px] rounded-md border border-earth-200 bg-white/90 px-2 py-1.5 text-xs shadow-md backdrop-blur-sm"
          style={{
            left: Math.min(ptTip.x + 14, (sizeRef.current.w || 9999) - 270),
            top: ptTip.y + 14,
            color: "#1f3c5a",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white"
              style={{ background: ptTip.p.color }}
            />
            <span className="font-semibold">{ptTip.p.title}</span>
          </div>
          {ptTip.p.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={ptTip.p.imageUrl}
              alt="Live camera snapshot"
              className="my-1 h-[120px] w-full rounded border border-earth-200 object-cover"
            />
          )}
          {ptTip.p.lines.map(([k, v]) => (
            <div key={k} className="text-[11px]">
              <span className="opacity-70">{k}: </span>
              <b>{v}</b>
            </div>
          ))}
          <div className="mt-0.5 text-[9px] opacity-60">
            {ptTip.p.source} · live · {ptTip.p.lat.toFixed(2)},{" "}
            {ptTip.p.lon.toFixed(2)}
          </div>
        </div>
      )}
      {farmTip && (
        <div
          className="pointer-events-none absolute z-30 max-w-[260px] rounded-md border border-earth-200 bg-white/90 px-2 py-1.5 text-xs shadow-md backdrop-blur-sm"
          style={{
            left: Math.min(farmTip.x + 14, (sizeRef.current.w || 9999) - 270),
            top: farmTip.y + 14,
            color: "#14532d",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500 ring-1 ring-white" />
            <span className="font-semibold">Field (predicted boundary)</span>
          </div>
          <div className="text-[11px]">
            <span className="opacity-70">Composite year: </span>
            <b>{String(farmTip.f.properties?.time ?? "").slice(0, 4) || "—"}</b>
          </div>
          <div className="text-[10px] leading-snug opacity-70">
            ML-detected field extent from Sentinel-2 — no cadastral owner or crop
            attribute exists in the source.
          </div>
          <div className="mt-0.5 text-[9px] opacity-60">
            {FTW_SOURCE.name} · {FTW_SOURCE.license}
          </div>
        </div>
      )}
      {countyTip && climateData && (
        <div
          className="pointer-events-none absolute z-30 max-w-[280px] rounded-md border border-earth-200 bg-white/95 px-2.5 py-2 text-xs shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(countyTip.x + 14, (sizeRef.current.w || 9999) - 290),
            top: countyTip.y + 14,
            color: "#3b2a1a",
          }}
        >
          <div className="font-semibold text-earth-900">{countyTip.f.cm.name}</div>
          <div className="mb-1 text-[10px] text-earth-500">
            Projected change vs. today · {climateData.provenance.horizon}
          </div>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="text-earth-400">
                <th className="text-left font-medium">Hazard</th>
                <th className="text-right font-medium">RCP4.5</th>
                <th className="text-right font-medium">RCP8.5</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(climateData.variables).map((v) => {
                const c45 = v.cols.find((c) => c.endsWith("_45"));
                const c85 = v.cols.find((c) => !c.endsWith("_45"));
                return (
                  <tr key={v.legend} className="align-top">
                    <td className="pr-1.5 text-earth-700">
                      {v.label}
                      <span className="text-earth-400"> ({v.unit})</span>
                    </td>
                    <td className="text-right tabular-nums text-earth-800">
                      {c45 ? binRange(climateData, v.legend, countyTip.f.cm.bins[c45]) : "—"}
                    </td>
                    <td className="text-right tabular-nums font-medium text-earth-900">
                      {c85 ? binRange(climateData, v.legend, countyTip.f.cm.bins[c85]) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-1 text-[10px] text-earth-600">
            Composite RCP8.5 score:{" "}
            <b className="tabular-nums">{countyTip.f.cm.score}</b>
          </div>
          <div className="mt-0.5 text-[9px] leading-snug text-earth-400">
            Published severity bins (color buckets), not raw magnitudes ·{" "}
            {CM_SOURCE.name}
          </div>
        </div>
      )}
      {showClimate && climateData && (
        <div className="absolute bottom-2 left-2 z-20 max-w-[300px] rounded-lg border border-earth-200 bg-white/90 px-2.5 py-2 text-[10px] shadow-md backdrop-blur-sm">
          <div className="mb-1 font-semibold text-earth-800">
            US climate-habitability · color by hazard
          </div>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {metricsOf(climateData).map((m: ClimateMetric) => {
              const active = m.key === climateMetric;
              return (
                <button
                  key={m.key}
                  onClick={() => setClimateMetric(m.key)}
                  className={`rounded px-1.5 py-0.5 text-[9px] leading-tight ${
                    active
                      ? "bg-earth-800 text-white"
                      : "bg-earth-100 text-earth-600 hover:bg-earth-200"
                  }`}
                  title={`${m.label} (${m.unit}) — RCP${m.scenario}`}
                >
                  {m.label.replace(/^(Extra|Change in|Very-large-) ?/, "")} ·{" "}
                  {m.scenario === "45" ? "4.5" : "8.5"}
                </button>
              );
            })}
          </div>
          {(() => {
            const m = metricsOf(climateData).find((x) => x.key === climateMetric);
            if (!m) return null;
            const bins = climateData.legends[m.legend] || [];
            return (
              <div>
                <div className="mb-0.5 text-[9px] text-earth-500">
                  {m.label} ({m.unit}) · RCP{m.scenario === "45" ? "4.5" : "8.5"}
                </div>
                <div className="flex flex-wrap items-stretch gap-y-0.5">
                  {bins.map((b, i) => {
                    const [lo, hi] = b[0] as [any, any];
                    const lbl =
                      lo === "N/A" ? "n/a" : lo === hi ? `${lo}` : `${lo}–${hi}`;
                    return (
                      <div key={i} className="flex flex-col items-center">
                        <span
                          className="h-3 w-6 border border-black/10"
                          style={{ background: b[1] as string }}
                        />
                        <span className="text-[7px] text-earth-500">{lbl}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <a
            href={CM_SOURCE.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[9px] text-earth-400 underline decoration-dotted hover:text-earth-600"
          >
            {CM_SOURCE.name}
          </a>
        </div>
      )}
      {tradeTip && tradeData?.available && (
        <div
          className="pointer-events-none absolute z-30 max-w-[240px] rounded-md border border-earth-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(tradeTip.x + 14, (sizeRef.current.w || 9999) - 250),
            top: tradeTip.y + 14,
            color: "#3b2a1a",
          }}
        >
          <div className="font-semibold text-earth-900">
            {tradeData.reporter?.name}{" "}
            <span className="text-earth-400">
              {tradeData.flow === "M" ? "←" : "→"}
            </span>{" "}
            {tradeTip.f.name}
          </div>
          <div className="text-[11px] text-earth-700">
            {tradeData.flow === "M" ? "Imports" : "Exports"}:{" "}
            <b className="tabular-nums">{fmtUsdThousand(tradeTip.f.value)}</b>{" "}
            <span className="text-earth-400">
              ({((tradeTip.f.value / (tradeData.total || 1)) * 100).toFixed(1)}% of
              total)
            </span>
          </div>
          <div className="mt-0.5 text-[9px] text-earth-400">
            {TRADE_SOURCE.name} · {tradeData.year}
          </div>
        </div>
      )}
      {showTrade && (
        <div className="absolute bottom-2 left-2 z-20 max-w-[300px] rounded-lg border border-earth-200 bg-white/90 px-2.5 py-2 text-[10px] shadow-md backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-semibold text-earth-800">Bilateral trade</span>
            <span className="inline-flex overflow-hidden rounded border border-earth-200">
              {(["X", "M"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setTradeFlow(d)}
                  className={`px-1.5 py-0.5 text-[9px] ${
                    tradeFlow === d
                      ? "bg-earth-800 text-white"
                      : "bg-white text-earth-600 hover:bg-earth-100"
                  }`}
                >
                  {d === "X" ? "Exports" : "Imports"}
                </button>
              ))}
            </span>
          </div>
          {!tradeIso && (
            <div className="text-earth-500">
              Click a country to see who it {tradeFlow === "M" ? "buys from" : "sells to"}.
            </div>
          )}
          {tradeIso && tradeData && !tradeData.available && (
            <div className="text-earth-500">
              {tradeData.reason ?? "No WITS data"} — shown as a data gap.
            </div>
          )}
          {tradeData?.available && tradeData.flows && (
            <div>
              <div className="mb-1 text-earth-600">
                <b>{tradeData.reporter?.name}</b> ·{" "}
                {tradeFlow === "M" ? "top sources" : "top destinations"} ·{" "}
                {tradeData.year}
              </div>
              <ol className="space-y-0.5">
                {tradeData.flows.slice(0, 6).map((f, i) => (
                  <li key={f.iso} className="flex items-baseline justify-between gap-2">
                    <span className="text-earth-700">
                      {i + 1}. {f.name}
                    </span>
                    <span className="tabular-nums font-medium text-earth-900">
                      {fmtUsdThousand(f.value)}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-1 text-earth-500">
                Total {tradeFlow === "M" ? "imports" : "exports"}:{" "}
                <b className="tabular-nums">{fmtUsdThousand(tradeData.total || 0)}</b>
              </div>
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {["2019", "2020", "2021"].map((y) => (
              <button
                key={y}
                onClick={() => setTradeYear(y)}
                className={`rounded px-1 py-0.5 text-[9px] ${
                  tradeYear === y
                    ? "bg-earth-700 text-white"
                    : "bg-earth-100 text-earth-600 hover:bg-earth-200"
                }`}
              >
                {y}
              </button>
            ))}
            <a
              href={TRADE_SOURCE.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-[9px] text-earth-400 underline decoration-dotted hover:text-earth-600"
            >
              {TRADE_SOURCE.name}
            </a>
          </div>
        </div>
      )}
      {overlayNote && (
        <div className="pointer-events-none absolute left-2 top-2 z-20 max-w-[280px] rounded bg-black/55 px-2 py-1 text-[10px] text-white/90">
          {overlayNote}
        </div>
      )}
    </div>
  );
}
