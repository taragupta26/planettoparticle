/**
 * db.ts — read-only access to the preloaded DuckDB store (data/p2p.duckdb).
 * Built by `npm run build-db`. Every value here traces to a real source row;
 * nothing is invented. Missing metrics surface as absent keys (data gaps).
 */
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

const DB_PATH = join(process.cwd(), "data", "p2p.duckdb");

export interface LayerMeta {
  id: string;
  label: string;
  unit: string;
  display: string; // "world_share" | "percent"
  higher_is_worse: boolean;
  source_name: string;
  source_url: string;
}

export interface MetricValue {
  iso3: string;
  name: string;
  value: number;
  unit: string;
  year: string | null;
  source_name: string;
  source_url: string;
  note: string | null;
}

let connPromise: Promise<DuckDBConnection> | null = null;
let openedMtimeMs = 0;

async function getConn(): Promise<DuckDBConnection> {
  if (!existsSync(DB_PATH))
    throw new Error(`DuckDB store missing at ${DB_PATH} — run \`npm run build-db\``);
  // Auto-reconnect when the store is rebuilt under us. `npm run build-db`
  // replaces the file; a connection held to the old (deleted) inode keeps
  // serving stale data without erroring, so we compare the file's mtime and
  // reopen when it changes. Cheap stat on each call; negligible vs. a query.
  const mtimeMs = statSync(DB_PATH).mtimeMs;
  if (connPromise && mtimeMs !== openedMtimeMs) connPromise = null;
  if (!connPromise) {
    openedMtimeMs = mtimeMs;
    connPromise = (async () => {
      const inst = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
      return inst.connect();
    })();
  }
  return connPromise;
}

async function runOnce<T>(sql: string, params: string[]): Promise<T[]> {
  const conn = await getConn();
  const prepared = await conn.prepare(sql);
  params.forEach((p, i) => prepared.bindVarchar(i + 1, p));
  const reader = await prepared.runAndReadAll();
  return reader.getRowObjects() as T[];
}

async function query<T = Record<string, unknown>>(
  sql: string,
  params: string[] = []
): Promise<T[]> {
  try {
    return await runOnce<T>(sql, params);
  } catch (e) {
    // The store may have been rebuilt under us (npm run build-db replaces the
    // file). Drop the stale handle and reopen the new file once before failing.
    connPromise = null;
    return runOnce<T>(sql, params);
  }
}

export async function listLayers(): Promise<LayerMeta[]> {
  // Only return layers that actually have data in metric_by_country — this
  // prevents layers from appearing in the UI when the upstream source was
  // unreachable at build time (e.g. ScienceBase returning empty for a
  // particular commodity). A layer with 0 rows is a data gap, not a feature.
  return query<LayerMeta>(
    `SELECT l.id, l.label, l.unit, l.display, l.higher_is_worse,
            l.source_name, l.source_url
     FROM layer l
     WHERE EXISTS (
       SELECT 1 FROM metric_by_country m WHERE m.metric = l.id LIMIT 1
     )
     ORDER BY l.id`
  );
}

export interface CountryMetric {
  metric: string;
  value: number;
  unit: string;
  year: string | null;
  source_name: string;
  source_url: string;
  note: string | null;
  label: string | null;
  higher_is_worse: boolean | null;
  display: string | null;
}

// All real metrics recorded for one country, joined to layer meta (label,
// direction, display) where the metric is also a map layer. Used by the
// per-country "what people here live with" view. Absent metrics = data gaps.
export async function getCountry(
  iso: string
): Promise<{ name: string | null; metrics: CountryMetric[] }> {
  const rows = await query<CountryMetric & { name: string }>(
    `SELECT m.metric, m.name, m.value, m.unit, m.year,
            m.source_name, m.source_url, m.note,
            l.label AS label, l.higher_is_worse AS higher_is_worse,
            l.display AS display
     FROM metric_by_country m
     LEFT JOIN layer l ON l.id = m.metric
     WHERE m.iso3 = ?
     ORDER BY m.metric`,
    [iso]
  );
  return { name: rows[0]?.name ?? null, metrics: rows };
}

export async function getLayer(
  metric: string
): Promise<{ meta: LayerMeta | null; values: MetricValue[] }> {
  const metas = await query<LayerMeta>(
    `SELECT id, label, unit, display, higher_is_worse, source_name, source_url
     FROM layer WHERE id = ?`,
    [metric]
  );
  const values = await query<MetricValue>(
    `SELECT iso3, name, value, unit, year, source_name, source_url, note
     FROM metric_by_country WHERE metric = ? ORDER BY value DESC`,
    [metric]
  );
  return { meta: metas[0] ?? null, values };
}
