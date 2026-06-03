"use client";

// Collaborative transition plans — source-grounded, map-anchored action plans.
// The first plan helps Bangladesh tea-garden farmers move to vermicompost.
// Every mapped entity is a real OpenStreetMap/Wikidata feature; every figure is
// cited. Missing ownership / economics are shown as data gaps, never invented.

export interface PlanCitation {
  id: string;
  label: string;
  publisher: string;
  url: string;
}
export type PlanEntityType = "garden" | "research" | "trial" | "company_hq";
export interface PlanEntity {
  id: string;
  name: string;
  type: PlanEntityType;
  lat: number;
  lon: number;
  district?: string;
  note?: string;
  source: string; // citation id
}
export interface PlanMetric {
  label: string;
  value: string;
  unit: string;
  year?: string;
  source: string;
}
export interface PlanStep {
  title: string;
  body: string;
  evidence: string[];
  caveat?: boolean;
}
export interface PlanCompany {
  name: string;
  facts: string;
  source: string;
}
export interface CollabPlan {
  id: string;
  title: string;
  subtitle: string;
  region: string;
  status: string;
  focus: { lat: number; lon: number; zoom: number };
  summary: string;
  metrics: PlanMetric[];
  entities: PlanEntity[];
  companies: PlanCompany[];
  steps: PlanStep[];
  dataGaps: string[];
}
export interface PlansPayload {
  provenance: { note: string; built: string };
  citations: PlanCitation[];
  plans: CollabPlan[];
}

export const PLANS_SOURCE = {
  name: "OpenStreetMap · Wikidata · BTRI · peer-reviewed vermicompost research",
  url: "https://en.wikipedia.org/wiki/Tea_production_in_Bangladesh",
};

// Map dot color per entity type (also used by the panel legend).
export const ENTITY_COLOR: Record<PlanEntityType, string> = {
  garden: "#16a34a", // tea garden — green
  research: "#0d9488", // research institute — teal
  trial: "#7c3aed", // vermicompost trial site — purple
  company_hq: "#d97706", // company office — amber
};
export const ENTITY_LABEL: Record<PlanEntityType, string> = {
  garden: "Tea garden",
  research: "Research institute",
  trial: "Vermicompost trial",
  company_hq: "Company office",
};

let cache: PlansPayload | null = null;

export async function loadPlans(): Promise<PlansPayload> {
  if (cache) return cache;
  const r = await fetch("/api/plans");
  const data = (await r.json()) as PlansPayload;
  cache = data;
  return data;
}

// Resolve a citation id to its record (for rendering source links).
export function citationOf(
  payload: PlansPayload,
  id: string
): PlanCitation | undefined {
  return payload.citations.find((c) => c.id === id);
}
