// Core data model for Planet to Particle.
// Every visible value must trace back to a Source via an Evidence record.

export type Confidence = "high" | "medium" | "low";

export interface Source {
  id: string;
  name: string;
  publisher: string;
  url: string;
  license?: string;
  retrievedAt?: string; // ISO timestamp of ingestion / fetch
  publishedAt?: string; // ISO date of the underlying dataset
  kind: "dataset" | "api" | "document" | "geodata";
  notes?: string;
}

// A single grounded data point. `value` is whatever was actually retrieved.
export interface Evidence {
  id: string;
  sourceId: string;
  statement: string; // human-readable claim, populated only from real values
  value?: string | number | null;
  unit?: string;
  asOf?: string; // period the value refers to (e.g. "2023")
  confidence: Confidence;
  sourceUrl: string;
  sourceName: string;
  retrievedAt?: string;
}

export type EntityType =
  | "resource"
  | "country"
  | "company"
  | "community"
  | "organization";

export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  iso3?: string; // for countries
  wikidata?: string;
  evidenceIds: string[]; // provenance for the entity's existence/attributes
}

export type RelationKind =
  | "produces"
  | "holds_reserves"
  | "trades"
  | "processes"
  | "owns"
  | "impacts"
  | "advocates";

export interface Relation {
  id: string;
  from: string; // entity id
  to: string; // entity id
  kind: RelationKind;
  label: string;
  value?: number;
  unit?: string;
  asOf?: string;
  evidenceIds: string[]; // every edge MUST carry provenance
}

export interface DataGap {
  id: string;
  topic: string;
  description: string;
  attemptedSource?: string;
  reason: string;
}

export interface Conflict {
  id: string;
  topic: string;
  description: string;
  evidenceIds: string[];
}

// A fully source-grounded answer returned to the client.
export interface GroundedAnswer {
  question: string;
  resource?: string;
  narrative: NarrativeSegment[];
  entities: Entity[];
  relations: Relation[];
  evidence: Evidence[];
  countries: Entity[];
  actors: Entity[];
  communityActions: Entity[];
  gaps: DataGap[];
  conflicts: Conflict[];
  generatedAt: string;
}

// Narrative is a list of segments; each factual segment references evidence.
// Text is only ever assembled from real retrieved values — never invented.
export interface NarrativeSegment {
  text: string;
  evidenceIds: string[];
}
