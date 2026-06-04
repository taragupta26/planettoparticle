"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { GroundedAnswer } from "@/lib/types";
import EvidencePanel from "@/components/EvidencePanel";
import DataGapPanel from "@/components/DataGapPanel";
import DrawdownPanel from "@/components/DrawdownPanel";
import PlanetaryBoundariesPanel from "@/components/PlanetaryBoundariesPanel";
import PlanetaryBoundariesHUD from "@/components/PlanetaryBoundariesHUD";
import CountryImpactPanel from "@/components/CountryImpactPanel";
import CollabPlansPanel from "@/components/CollabPlansPanel";
import type { CollabPlan, PlanEntity } from "@/lib/plans";

interface LayerMeta {
  id: string;
  label: string;
  unit: string;
  display: string;
  higher_is_worse: boolean;
  source_name: string;
  source_url: string;
}
interface LayerVal {
  value: number;
  unit: string;
  year: string | null;
  severity: number;
}
interface IsoEntry {
  name: string;
  composite: number;
  count: number;
  layers: Record<string, LayerVal>;
}
interface CompositePayload {
  layers: LayerMeta[];
  worldTotals: Record<string, number>;
  byIso: Record<string, IsoEntry>;
}

function fmt(v: number, unit: string) {
  const n = v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return unit === "%" ? `${n}%` : `${n} ${unit}`;
}

// Accurate heading for the highlights list, per layer (falls back to a
// direction-based generic for any layer not listed).
const HIGHLIGHT_HEADINGS: Record<string, string> = {
  cobalt_production: "Largest producers",
  cobalt_reserves: "Largest reserves",
  co2_per_capita: "Highest emitters",
  mineral_rents: "Most resource-dependent",
  forest_area: "Least forested",
  renewable_energy: "Lowest renewable share",
  electricity_access: "Lowest electricity access",
  water_access_basic: "Lowest water access",
  renew_water_pc: "Most water-scarce",
  poverty_headcount: "Most affected (poverty)",
  undernourishment: "Most affected (hunger)",
  wheat_production: "Largest producers",
  maize_production: "Largest producers",
  rice_production: "Largest producers",
  soybean_production: "Largest producers",
  coffee_production: "Largest producers",
  cocoa_production: "Largest producers",
  palm_oil_production: "Largest producers",
  sugarcane_production: "Largest producers",
  banana_production: "Largest producers",
  potato_production: "Largest producers",
  cassava_production: "Largest producers",
  meat_production: "Largest producers",
  milk_production: "Largest producers",
  lithium_production: "Largest producers",
  graphite_production: "Largest producers",
  copper_production: "Largest producers",
  nickel_production: "Largest producers",
  rare_earths_production: "Largest producers",
  tin_production: "Largest producers",
  tungsten_production: "Largest producers",
  tantalum_production: "Largest producers",
  manganese_production: "Largest producers",
  phosphate_production: "Largest producers",
  potash_production: "Largest producers",
  gold_production: "Largest producers",
  silver_production: "Largest producers",
  iron_ore_production: "Largest producers",
  zinc_production: "Largest producers",
  lead_production: "Largest producers",
  bauxite_production: "Largest producers",
  antimony_production: "Largest producers",
  molybdenum_production: "Largest producers",
  coal_production: "Largest producers",
  oil_production: "Largest producers",
  gas_production: "Largest producers",
  co2_total: "Highest emitters",
  methane_total: "Highest emitters",
  resource_rents_total: "Most resource-dependent",
  oil_rents: "Most oil-dependent",
  gas_rents: "Most gas-dependent",
  coal_rents: "Most coal-dependent",
  forest_rents: "Most forest-rent-dependent",
  clean_cooking: "Lowest clean-cooking access",
  gini: "Most unequal (Gini)",
  cereal_yield: "Lowest cereal yield",
  fertilizer_use: "Highest fertilizer intensity",
  water_stress: "Most water-stressed",
  land_degradation: "Most degraded land",
  exports_value: "Largest exporters",
  imports_value: "Largest importers",
  plastic_waste_pc: "Most plastic waste per person",
  plastic_to_ocean_share: "Largest share of ocean plastic",
  plastic_waste_total: "Most plastic waste generated",
  plastic_to_ocean_total: "Most plastic emitted to ocean",
  terrestrial_protected: "Most land protected",
  marine_protected: "Most ocean protected",
  threatened_birds: "Most threatened bird species",
  threatened_plants: "Most threatened plant species",
};

// Per-layer question suggestions for the chat (varied — not just cobalt).
// Picked by the active layer; falls back to a rotating general set.
const LAYER_SUGGESTIONS: Record<string, string[]> = {
  plastic_waste_total: [
    "Where does the world's plastic waste come from, and where does it leak to the ocean?",
    "How do oil and gas production connect to plastics and petrochemical feedstocks?",
  ],
  cobalt_production: [
    "Who controls cobalt, who benefits, and what communities are affected?",
    "Where are the world's cobalt reserves concentrated?",
  ],
  cobalt_reserves: [
    "Where are the world's cobalt reserves concentrated?",
    "Who controls cobalt and who bears the mining costs?",
  ],
  co2_per_capita: [
    "Which countries emit the most CO₂ per person?",
    "Who emits the most yet bears the least climate cost?",
  ],
  mineral_rents: [
    "Which economies depend most on mineral extraction?",
    "Who profits from mineral rents and who is left behind?",
  ],
  forest_area: [
    "Where is forest cover lowest, and what's driving the loss?",
    "How does deforestation connect to commodity supply chains?",
  ],
  renewable_energy: [
    "Which countries rely least on renewable energy?",
    "Where is the energy transition lagging?",
  ],
  electricity_access: [
    "Where do the most people still lack electricity?",
    "How does energy poverty map onto mineral wealth?",
  ],
  water_access_basic: [
    "Where is basic drinking-water access lowest?",
    "Which communities bear the cost of water scarcity?",
  ],
  renew_water_pc: [
    "Which countries have the least freshwater per person?",
    "Where is water scarcity most acute?",
  ],
  water_stress: [
    "Which countries withdraw the most water relative to supply?",
    "Where is water stress threatening food and people?",
  ],
  land_degradation: [
    "Where is the most land degraded, and who depends on it?",
    "How does soil degradation connect to hunger and poverty?",
  ],
  poverty_headcount: [
    "Where is extreme poverty most concentrated?",
    "How does poverty overlap with resource extraction?",
  ],
  undernourishment: [
    "Where is hunger most widespread?",
    "How does undernourishment relate to land and water stress?",
  ],
  wheat_production: [
    "Which countries produce the most wheat?",
    "How concentrated is the world's staple-grain supply?",
  ],
  maize_production: [
    "Which countries produce the most maize?",
    "Who controls the global corn supply?",
  ],
  rice_production: [
    "Which countries produce the most rice?",
    "How exposed is rice supply to water stress?",
  ],
  soybean_production: [
    "Which countries produce the most soy?",
    "How does soy expansion connect to deforestation?",
  ],
  lithium_production: [
    "Who mines the world's lithium, and who profits from it?",
    "How concentrated is the battery-metal supply chain?",
  ],
  graphite_production: [
    "Which countries dominate graphite mining?",
    "How exposed are batteries to graphite supply?",
  ],
  copper_production: [
    "Who mines the world's copper, and who profits from it?",
    "How concentrated is copper — the metal of electrification?",
  ],
  rare_earths_production: [
    "Who controls rare-earth mining, and why does it matter?",
    "How dependent is the world on one rare-earths producer?",
  ],
  gold_production: [
    "Which countries produce the most gold?",
    "Who bears the environmental cost of gold mining?",
  ],
  nickel_production: [
    "Who mines the world's nickel, and who benefits?",
    "How does nickel demand connect to batteries and forests?",
  ],
  coffee_production: [
    "Who grows the world's coffee, and who captures the value?",
    "How does coffee link smallholders to global markets?",
  ],
  cocoa_production: [
    "Which countries grow the most cocoa, and who profits?",
    "How does cocoa connect farmers to the chocolate trade?",
  ],
  palm_oil_production: [
    "Where is palm oil produced, and what's the forest cost?",
    "How does palm oil expansion drive deforestation?",
  ],
  coal_production: [
    "Which countries produce the most coal?",
    "Who profits from coal, and who bears the climate cost?",
  ],
  oil_production: [
    "Which countries produce the most oil?",
    "How concentrated is global oil production?",
  ],
  gas_production: [
    "Which countries produce the most natural gas?",
    "Who controls global gas supply?",
  ],
  co2_total: [
    "Which countries emit the most CO₂ in total?",
    "Who emits the most, and who bears the climate cost?",
  ],
  methane_total: [
    "Which countries emit the most methane?",
    "Where could methane cuts matter most?",
  ],
  resource_rents_total: [
    "Which economies depend most on natural-resource rents?",
    "Who is most exposed to the resource curse?",
  ],
  gini: [
    "Where is income inequality highest?",
    "How does inequality overlap with resource wealth?",
  ],
  fertilizer_use: [
    "Where is fertilizer use most intensive?",
    "How does fertilizer intensity link mining to farming?",
  ],
  cereal_yield: [
    "Where are cereal yields lowest?",
    "How does low yield connect to hunger and land stress?",
  ],
  clean_cooking: [
    "Where do the most people lack clean cooking fuel?",
    "How does clean-cooking access map onto energy poverty?",
  ],
  exports_value: [
    "Which countries dominate global exports?",
    "How concentrated is world trade among a few economies?",
  ],
  imports_value: [
    "Which countries import the most by value?",
    "How does import dependence map onto resource flows?",
  ],
};

const GENERAL_SUGGESTIONS = [
  "Who controls this resource, who benefits, and who bears the costs?",
  "What are communities doing in response?",
  "Where are the biggest data gaps?",
];

const GlobeMap = dynamic(() => import("@/components/GlobeView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-earth-500">
      Loading globe…
    </div>
  ),
});
const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-earth-500">
      Loading graph…
    </div>
  ),
});

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"globe" | "mercator" | "satellite">("globe");
  const [highlight, setHighlight] = useState<string[]>([]);
  const [showGraph, setShowGraph] = useState(false);
  const [showMines, setShowMines] = useState(false);
  const [showDisasters, setShowDisasters] = useState(false);
  const [showVessels, setShowVessels] = useState(false);
  const [showFarms, setShowFarms] = useState(false);
  const [showCams, setShowCams] = useState(false);
  const [showClimate, setShowClimate] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [showBoundariesMap, setShowBoundariesMap] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  // The open plan drives both the panel detail and the map overlay/fly-to.
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [planEntities, setPlanEntities] = useState<PlanEntity[]>([]);
  const [planFocus, setPlanFocus] = useState<
    { lat: number; lon: number; zoom: number } | null
  >(null);
  const [selectedIso, setSelectedIso] = useState<string | undefined>(undefined);
  const [layers, setLayers] = useState<LayerMeta[]>([]);
  // Layers are now FILTERS: any number can be active at once.
  const [activeLayers, setActiveLayers] = useState<string[]>([
    "cobalt_production",
  ]);
  const [composite, setComposite] = useState<CompositePayload | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const layerKey = activeLayers.join(",");

  function toggleLayer(id: string) {
    setActiveLayers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // Bring a layer to the front (make it the primary/displayed choropleth)
  // without dropping whatever else is on — used to "spatialize" a planetary
  // boundary onto its real per-country pressure proxy.
  function showLayer(id: string) {
    setActiveLayers((prev) => [...prev.filter((x) => x !== id), id]);
    setLeftOpen(true);
  }

  // Open a collaborative plan: load its mapped entities onto the globe and fly
  // the camera to the plan focus. Force globe mode so the fly-to frames cleanly.
  function openPlan(plan: CollabPlan) {
    setActivePlanId(plan.id);
    setPlanEntities(plan.entities);
    setMode("globe");
    // New object each open so GlobeView's focus effect re-fires.
    setPlanFocus({ ...plan.focus });
    setShowPlans(true);
    setLeftOpen(true);
  }
  function closePlan() {
    setActivePlanId(null);
    setPlanEntities([]);
    setPlanFocus(null);
  }

  // Suggestions follow the most recently added filter (then a general set).
  const suggestions = useMemo(() => {
    const primary = activeLayers[activeLayers.length - 1];
    const perLayer = (primary && LAYER_SUGGESTIONS[primary]) || [];
    return [...perLayer, ...GENERAL_SUGGESTIONS].slice(0, 3);
  }, [activeLayers]);

  useEffect(() => {
    fetch("/api/layers")
      .then((r) => r.json())
      .then((d) => setLayers(d.layers ?? []))
      .catch(() => setLayers([]));
  }, []);

  useEffect(() => {
    setComposite(null);
    if (activeLayers.length === 0) {
      setComposite({ layers: [], worldTotals: {}, byIso: {} });
      return;
    }
    const qs = activeLayers.map((l) => `layer=${encodeURIComponent(l)}`).join("&");
    fetch(`/api/composite?${qs}`)
      .then((r) => r.json())
      .then((d: CompositePayload) => setComposite(d?.byIso ? d : null))
      .catch(() => setComposite(null));
  }, [layerKey]);

  const activeMetas = useMemo(
    () => layers.filter((l) => activeLayers.includes(l.id)),
    [layers, activeLayers]
  );

  // Highlights:
  //  - one filter  → direction-aware ranking of that metric's real values.
  //  - many filters → countries ranked by COMBINED severity (the composite),
  //    each item labelled with its overall % (mean of normalized filters).
  const highlights = useMemo(() => {
    if (!composite) return null;
    const entries = Object.values(composite.byIso);
    const count = entries.length;
    if (activeMetas.length === 1) {
      const m = activeMetas[0];
      const lowestIsWorst = m.display !== "world_share" && !m.higher_is_worse;
      const rows = entries
        .map((e) => ({ name: e.name, lv: e.layers[m.id] }))
        .filter((r) => r.lv);
      rows.sort((a, b) =>
        lowestIsWorst ? a.lv!.value - b.lv!.value : b.lv!.value - a.lv!.value
      );
      const total = composite.worldTotals[m.id] ?? 0;
      const heading =
        HIGHLIGHT_HEADINGS[m.id] ??
        (m.display === "world_share"
          ? "Largest producers"
          : lowestIsWorst
          ? "Lowest coverage"
          : "Most affected");
      const top = rows.slice(0, 6).map((r) => ({
        country: r.name,
        label:
          m.display === "world_share" && total > 0
            ? `${((r.lv!.value / total) * 100).toFixed(1)}%`
            : fmt(r.lv!.value, r.lv!.unit),
      }));
      return { heading, top, count, multi: false };
    }
    // multiple filters → combined severity
    const rows = [...entries].sort((a, b) => b.composite - a.composite);
    const top = rows.slice(0, 6).map((e) => ({
      country: e.name,
      label: `${Math.round(e.composite * 100)}%`,
    }));
    return { heading: "Most affected overall", top, count, multi: true };
  }, [composite, activeMetas]);

  async function ask(q: string) {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    setHighlight([]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, activeLayers }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? res.statusText);
      setAnswer(await res.json());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const isoToEvidence = useMemo(() => {
    const m: Record<string, string[]> = {};
    answer?.countries.forEach((c) => {
      if (c.iso3) m[c.iso3] = c.evidenceIds;
    });
    return m;
  }, [answer]);

  const answerIso = useMemo(
    () =>
      (answer?.countries ?? [])
        .map((c) => c.iso3)
        .filter((x): x is string => Boolean(x)),
    [answer]
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-gradient-to-b from-white to-earth-50">
      {/* ===== FULL-PAGE GLOBE BACKDROP ===== */}
      <div className="absolute inset-0">
        <GlobeMap
          mode={mode}
          layers={activeLayers}
          showMines={showMines}
          showDisasters={showDisasters}
          showVessels={showVessels}
          showFarms={showFarms}
          showCams={showCams}
          showClimate={showClimate}
          showTrade={showTrade}
          tradeIso={selectedIso}
          planEntities={planEntities}
          planFocus={planFocus}
          highlightIso={answerIso}
          onSelectIso={(iso) => {
            setSelectedIso(iso || undefined);
            if (iso && isoToEvidence[iso]) setHighlight(isoToEvidence[iso]);
          }}
        />
        {selectedIso && (
          <CountryImpactPanel
            iso={selectedIso}
            onClose={() => setSelectedIso(undefined)}
          />
        )}
        {showBoundariesMap && (
          <PlanetaryBoundariesHUD
            onClose={() => setShowBoundariesMap(false)}
            onShowProxy={showLayer}
          />
        )}
      </div>

      {/* ===== LEFT INFO PANEL (collapsible) ===== */}
      {!leftOpen && (
        <button
          onClick={() => setLeftOpen(true)}
          className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-xl border border-earth-200 bg-white/90 px-3 py-2 text-xs font-medium text-earth-700 shadow-lg backdrop-blur hover:bg-earth-50"
          title="Show panel"
        >
          <span aria-hidden>☰</span> Layers
        </button>
      )}
      <aside
        className={`absolute left-4 top-4 bottom-4 z-10 flex w-[300px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-earth-200 bg-white/85 shadow-xl backdrop-blur-md transition-all duration-300 ${
          leftOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-[120%] opacity-0"
        }`}
      >
        <div className="border-b border-earth-100 p-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-bold text-earth-900">
              Planet to Particle
            </h1>
            <button
              onClick={() => setLeftOpen(false)}
              className="-mr-1 -mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
              title="Collapse panel"
              aria-label="Collapse panel"
            >
              ‹
            </button>
          </div>
          <p className="mt-0.5 text-[11px] leading-tight text-earth-600">
            Who controls resources, who benefits, who bears the costs — grounded
            only in real sources.
          </p>
          <div className="mt-3 rounded-lg border-l-2 border-earth-600 bg-earth-50/70 px-3 py-2 text-[12px] italic leading-snug text-earth-800">
            This was created to turn our “tragedy of the commons” into
            stewardship.
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-earth-100 p-4">
          <div className="mb-2 flex overflow-hidden rounded-lg border border-earth-200">
            {(
              [
                ["globe", "3D Globe"],
                ["mercator", "Flat"],
                ["satellite", "Satellite"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 px-2 py-1.5 text-xs font-medium transition ${
                  mode === m
                    ? "bg-earth-700 text-white"
                    : "bg-white text-earth-700 hover:bg-earth-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowMines((v) => !v)}
            aria-pressed={showMines}
            className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showMines
                ? "border-amber-500 bg-amber-50 text-amber-800"
                : "border-earth-200 bg-white text-earth-700 hover:bg-earth-50"
            }`}
            title="Overlay 2,121 real mines, deposits & districts of critical minerals (USGS Professional Paper 1802)"
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  showMines ? "bg-amber-500" : "bg-earth-300"
                }`}
              />
              Mines &amp; deposits
            </span>
            <span className="text-[10px] opacity-70">
              {showMines ? "2,121 pts on" : "off"}
            </span>
          </button>
          <button
            onClick={() => setShowBoundariesMap((v) => !v)}
            aria-pressed={showBoundariesMap}
            className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showBoundariesMap
                ? "border-teal-500 bg-teal-50 text-teal-800"
                : "border-earth-200 bg-white text-earth-700 hover:bg-earth-50"
            }`}
            title="Show the 9 planetary boundaries (6 transgressed) as a global wedge ring on the map — Richardson et al. 2023. Global framework, not per-country."
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  showBoundariesMap ? "bg-teal-500" : "bg-earth-300"
                }`}
              />
              Planetary boundaries ring
            </span>
            <span className="text-[10px] opacity-70">
              {showBoundariesMap ? "6/9 on map" : "off"}
            </span>
          </button>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            {(
              [
                ["Disasters", showDisasters, setShowDisasters, "#dc2626", "Live NASA EONET events + USGS earthquakes"],
                ["Vessels", showVessels, setShowVessels, "#0284c7", "Live global AIS vessel positions (AISStream.io — needs a free API key)"],
                ["Field boundaries", showFarms, setShowFarms, "#16a34a", "Global Sentinel-2 field boundaries (Fields of The World, CC-BY-4.0) — zoom into cropland to load"],
                ["Webcams", showCams, setShowCams, "#7c3aed", "Live public traffic cameras (TfL JamCams, London) — official feeds only"],
                ["US climate risk", showClimate, setShowClimate, "#b91c1c", "US county climate-habitability projections (Rhodium Group via ProPublica/NYT) — zoom to the US"],
                ["Trade flows", showTrade, setShowTrade, "#d97706", "Bilateral export/import flows for the selected country (World Bank WITS) — click a country"],
              ] as const
            ).map(([label, on, set, color, title]) => (
              <button
                key={label}
                onClick={() => set((v: boolean) => !v)}
                aria-pressed={on}
                title={title}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10.5px] font-medium transition ${
                  on
                    ? "border-earth-400 bg-earth-50 text-earth-900"
                    : "border-earth-200 bg-white text-earth-600 hover:bg-earth-50"
                }`}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: on ? color : "#cbd5e1" }}
                />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
          <p className="mb-2 -mt-0.5 text-[9.5px] leading-snug text-earth-400">
            Live overlays fetch real-time data client-side (EONET · USGS · AIS ·
            FTW Sentinel-2 fields · TfL webcams). Hover any marker or parcel for
            its source; click a mine for satellite imagery.
          </p>
          {layers.length > 0 && (
            <>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-earth-500">
                  Data filters{" "}
                  {activeLayers.length > 0 && `(${activeLayers.length} on)`}
                </label>
                {activeLayers.length > 0 && (
                  <button
                    onClick={() => setActiveLayers([])}
                    className="text-[10px] text-earth-500 underline decoration-dotted hover:text-earth-700"
                  >
                    clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {layers.map((l) => {
                  const on = activeLayers.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLayer(l.id)}
                      aria-pressed={on}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        on
                          ? "border-earth-700 bg-earth-700 text-white"
                          : "border-earth-200 bg-white text-earth-700 hover:border-earth-400"
                      }`}
                      title={`${l.source_name} · ${l.unit}`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
              {activeLayers.length > 1 && (
                <p className="mt-1.5 text-[10px] leading-snug text-earth-500">
                  Map shows a <span className="font-medium">combined severity</span>{" "}
                  — the mean of each active filter&apos;s normalized 0–1 score.
                  Hover a country to see every real value &amp; source.
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-4 p-4">
          {/* dynamic layer highlight */}
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-earth-500">
              {highlights?.heading ?? "Layer highlights"}
            </h2>
            {activeLayers.length === 0 ? (
              <p className="text-[11px] text-earth-400">
                Turn on a filter above to rank countries.
              </p>
            ) : !composite ? (
              <p className="text-[11px] text-earth-400">Loading layer data…</p>
            ) : highlights && highlights.top.length > 0 ? (
              <ol className="space-y-1">
                {highlights.top.map((d, i) => (
                  <li
                    key={d.country + i}
                    className="flex items-baseline justify-between gap-2 text-[12px] text-earth-800"
                  >
                    <span className="truncate">{d.country}</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {d.label}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[11px] text-earth-400">
                No data for the active filters.
              </p>
            )}
            {highlights && (
              <p className="mt-2 text-[10px] text-earth-500">
                {highlights.multi
                  ? `${highlights.count} countries ranked by combined severity · the rest are data gaps (no value invented).`
                  : `${highlights.count} countries with data · the rest are shown as data gaps (no value invented).`}
              </p>
            )}
          </section>

          {/* legend */}
          {activeMetas.length > 0 && (
            <section className="rounded-lg border border-earth-100 bg-earth-50/40 p-3">
              <div className="mb-1 text-[11px] font-semibold text-earth-700">
                {activeMetas.length === 1
                  ? activeMetas[0].label
                  : `Combined severity — ${activeMetas.length} filters`}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-earth-700">
                <span className="inline-block h-3 w-5 rounded-sm bg-[#440154]" />
                <span className="inline-block h-3 w-5 rounded-sm bg-[#31688e]" />
                <span className="inline-block h-3 w-5 rounded-sm bg-[#1f9e89]" />
                <span className="inline-block h-3 w-5 rounded-sm bg-[#6ece58]" />
                <span className="inline-block h-3 w-5 rounded-sm bg-[#fde725]" />
                <span className="ml-1">
                  {activeMetas.length > 1
                    ? "less → more affected"
                    : activeMetas[0].display !== "world_share"
                    ? activeMetas[0].higher_is_worse
                      ? "better → worse"
                      : "worse → better"
                    : "low → high"}
                </span>
              </div>
              <div className="mt-1.5 text-[10px] leading-snug text-earth-500">
                {activeMetas.length === 1 ? (
                  <>
                    Source:{" "}
                    <a
                      href={activeMetas[0].source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted hover:text-earth-700"
                    >
                      {activeMetas[0].source_name}
                    </a>{" "}
                    · Natural Earth · hover a country for detail.
                  </>
                ) : (
                  <>
                    Combining:{" "}
                    {activeMetas.map((m) => m.label).join(", ")}. Each value is
                    real and shown with its source on hover.
                  </>
                )}
              </div>
            </section>
          )}

          {/* ---- Planetary boundaries (global context) ---- */}
          <section className="rounded-xl border border-earth-200 p-3">
            <button
              onClick={() => setShowBoundaries((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-earth-500"
            >
              <span>Planetary boundaries</span>
              <span className="text-earth-400">
                {showBoundaries ? "Hide ▲" : "Show ▼"}
              </span>
            </button>
            {showBoundaries && (
              <div className="mt-2">
                <PlanetaryBoundariesPanel />
              </div>
            )}
          </section>

          {/* ---- Drawdown climate solutions ---- */}
          <section className="rounded-xl border border-earth-200 p-3">
            <button
              onClick={() => setShowDrawdown((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-earth-500"
            >
              <span>Climate solutions (Drawdown)</span>
              <span className="text-earth-400">
                {showDrawdown ? "Hide ▲" : "Show ▼"}
              </span>
            </button>
            {showDrawdown && (
              <div className="mt-2">
                <DrawdownPanel />
              </div>
            )}
          </section>

          {/* ---- Collaborative transition plans ---- */}
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
            <button
              onClick={() => setShowPlans((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-emerald-700"
            >
              <span>Collaborative plans</span>
              <span className="text-emerald-500">
                {showPlans ? "Hide ▲" : "Show ▼"}
              </span>
            </button>
            {showPlans && (
              <div className="mt-2">
                <CollabPlansPanel
                  activePlanId={activePlanId}
                  onOpen={openPlan}
                  onClose={closePlan}
                />
              </div>
            )}
          </section>
        </div>
        </div>
      </aside>

      {/* ===== FLOATING QUERY + ANSWER PANEL (collapsible) ===== */}
      {!rightOpen && (
        <button
          onClick={() => setRightOpen(true)}
          className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-xl border border-earth-200 bg-white/90 px-3 py-2 text-xs font-medium text-earth-700 shadow-lg backdrop-blur hover:bg-earth-50"
          title="Show panel"
        >
          Ask <span aria-hidden>›</span>
        </button>
      )}
      <aside
        className={`absolute right-4 top-4 bottom-4 z-10 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-earth-200 bg-white/85 shadow-xl backdrop-blur-md transition-all duration-300 ${
          rightOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-[120%] opacity-0"
        }`}
      >
        <div className="border-b border-earth-100 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-earth-500">
              Ask the map
            </span>
            <button
              onClick={() => setRightOpen(false)}
              className="-mr-1 rounded-md px-1.5 py-0.5 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
              title="Collapse panel"
              aria-label="Collapse panel"
            >
              ›
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="flex gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to understand?"
              className="flex-1 rounded-lg border border-earth-300 bg-white px-3 py-2.5 text-sm text-earth-900 outline-none focus:border-earth-500 focus:ring-2 focus:ring-earth-200"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-earth-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-earth-800 disabled:opacity-50"
            >
              {loading ? "…" : "Ask"}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQuestion(s);
                  ask(s);
                }}
                className="rounded-full border border-earth-200 bg-earth-50 px-2.5 py-1 text-[11px] text-earth-700 hover:border-earth-400"
              >
                {s}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-rose-700">Error: {error}</p>}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {!answer && !loading && (
            <div className="rounded-xl border border-dashed border-earth-200 bg-earth-50/50 p-6 text-center text-sm text-earth-600">
              The map shows{" "}
              <span className="font-semibold text-earth-800">
                {activeMetas.length === 0
                  ? "real source-grounded data"
                  : activeMetas.length === 1
                  ? activeMetas[0].label
                  : `${activeMetas.length} combined filters`}
              </span>{" "}
              on Natural Earth geometry. Toggle filters on the left, or ask a
              question to build a source-grounded answer beside it — every value
              traces to a real source; gaps are shown, never invented.
            </div>
          )}

          {answer && (
            <>
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-earth-500">
                  Source-grounded answer
                </h2>
                <div className="space-y-2.5">
                  {answer.narrative.map((seg, i) => (
                    <p
                      key={i}
                      className="text-sm leading-relaxed text-earth-900"
                    >
                      {seg.text}{" "}
                      {seg.evidenceIds.length > 0 && (
                        <button
                          onClick={() => setHighlight(seg.evidenceIds)}
                          className="align-baseline rounded bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-700 hover:bg-earth-200"
                          title="Show the evidence behind this statement"
                        >
                          {seg.evidenceIds.length} source
                          {seg.evidenceIds.length > 1 ? "s" : ""}
                        </button>
                      )}
                    </p>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-earth-500">
                  Key actors &amp; countries ({answer.countries.length})
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {answer.countries.map((c) => (
                    <span
                      key={c.id}
                      className="cursor-pointer rounded-md border border-earth-200 bg-earth-50 px-2 py-1 text-[11px] text-earth-800 hover:border-earth-400"
                      onClick={() => setHighlight(c.evidenceIds)}
                      title="Show evidence for this country"
                    >
                      {c.label}
                      {c.iso3 ? ` (${c.iso3})` : ""}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-earth-500">
                  Community actions source-backed:{" "}
                  {answer.communityActions.length === 0
                    ? "none yet — see data gaps."
                    : answer.communityActions.length}
                </p>
              </section>

              <section className="rounded-xl border border-earth-200 p-3">
                <button
                  onClick={() => setShowGraph((v) => !v)}
                  className="mb-1 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-earth-500"
                >
                  <span>Resource-flow network</span>
                  <span className="text-earth-400">
                    {showGraph ? "Hide ▲" : "Show ▼"}
                  </span>
                </button>
                {showGraph && (
                  <div className="h-[320px] overflow-hidden rounded-lg border border-earth-100">
                    <NetworkGraph
                      entities={answer.entities}
                      relations={answer.relations}
                      onSelectEvidence={setHighlight}
                    />
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
                <DataGapPanel
                  gaps={answer.gaps}
                  conflicts={answer.conflicts}
                />
              </section>

              <section>
                <EvidencePanel
                  evidence={answer.evidence}
                  highlightIds={highlight}
                />
              </section>
            </>
          )}
        </div>

        <div className="border-t border-earth-100 p-3 text-[10px] leading-snug text-earth-500">
          Sources: USGS MCS 2024 &amp; PP1802 · World Bank Open Data (incl.
          trade flows) · World Bank WITS (bilateral trade) · Our World in Data /
          FAOSTAT · NASA EONET · USGS Earthquakes · Digitraffic AIS · Fields of
          The World (Sentinel-2, CC-BY-4.0) · Rhodium Group via ProPublica/NYT
          (US climate) · Project Drawdown · Planetary Boundaries (Richardson
          2023) · Natural Earth. No mocked data.
        </div>
      </aside>
    </main>
  );
}
