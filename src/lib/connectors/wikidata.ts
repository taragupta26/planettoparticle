import type { Evidence } from "@/lib/types";
import { getSource } from "@/lib/sources/registry";

// Live connector to Wikidata. Used ONLY for safe direct entity lookups
// (canonical label + description of a known QID), never for inferring
// relationships we cannot cleanly source. Community-edited => medium confidence.

export async function wikidataEntityEvidence(
  qid: string,
  fallbackLabel: string
): Promise<Evidence | null> {
  const src = getSource("wikidata");
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels|descriptions&languages=en&format=json&origin=*`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const ent = json?.entities?.[qid];
    const label = ent?.labels?.en?.value ?? fallbackLabel;
    const desc = ent?.descriptions?.en?.value;
    if (!desc) return null;
    return {
      id: `wd:${qid}`,
      sourceId: src.id,
      statement: `${label}: ${desc}.`,
      value: null,
      confidence: "medium",
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      sourceName: src.name,
      retrievedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
