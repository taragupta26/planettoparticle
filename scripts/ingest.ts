/**
 * DataIngestionPipeline (build-time portion).
 * Fetches REAL data and writes provenance-tagged JSON into /data and /public.
 * No values are invented. Missing values are preserved as null / "data unavailable".
 *
 * Run: npm run ingest
 */
import { writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";

const USGS_COBALT_2024_WORLD_CSV =
  "https://www.sciencebase.gov/catalog/file/get/65b7d778d34e36a39045b4af?f=__disk__bb%2F98%2Fbc%2Fbb98bcc2f21d7863294692d7131ee7971aaa1022";

// USGS Professional Paper 1802 — "Global Distribution of Selected Mines,
// Deposits, and Districts of Critical Minerals". ScienceBase item; the
// shapefile zip carries a point layer (DBF holds name/commodity/lat/lon/etc.).
const USGS_PP1802_ITEM =
  "https://www.sciencebase.gov/catalog/item/594d3c8ee4b062508e39b332";
const USGS_PP1802_SHP_ZIP =
  "https://www.sciencebase.gov/catalog/file/get/594d3c8ee4b062508e39b332?f=__disk__0a%2Fd5%2F3c%2F0ad53ca985bbc6ac61a3587176a0c37b57ac8053";

const NATURAL_EARTH_COUNTRIES =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

// Project Drawdown — official "Table of Solutions" CSV export from the public
// Solutions Explorer. Real, structured climate-solution data (no invented
// numbers): each row has sector, mode, GHG impact (Gt CO₂-eq/yr range), cost,
// adoption, and co-benefits.
const DRAWDOWN_SOLUTIONS_CSV =
  "https://drawdown.org/explorer-solutions-table-export.csv";
const DRAWDOWN_EXPLORER_URL = "https://drawdown.org/explorer";

const DATA_DIR = join(process.cwd(), "data");
const PUBLIC_DIR = join(process.cwd(), "public");

// USGS country label -> ISO A3. Only producers present in the dataset.
const NAME_TO_ISO3: Record<string, string> = {
  "United States": "USA",
  Australia: "AUS",
  Canada: "CAN",
  "Congo (Kinshasa)": "COD",
  Cuba: "CUB",
  Indonesia: "IDN",
  Madagascar: "MDG",
  "New Caledonia": "NCL",
  "Papua New Guinea": "PNG",
  Philippines: "PHL",
  Russia: "RUS",
  Turkey: "TUR",
};

// Minimal RFC-4180-ish CSV parser (handles quoted fields with commas/newlines).
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // ignore
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function cleanCountry(raw: string): string {
  // Strip trailing footnote digits, e.g. "New Caledonia11" -> "New Caledonia".
  return raw.replace(/\d+$/, "").trim();
}

function num(v: string): number | null {
  const t = v.trim();
  if (t === "" || t.toUpperCase() === "NA") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "planet-to-particle/0.1 (ingest)" } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

async function ingestUSGSCobalt() {
  console.log("Fetching USGS MCS 2024 cobalt world CSV…");
  const csv = await fetchText(USGS_COBALT_2024_WORLD_CSV);
  const rows = parseCSV(csv).filter((r) => r.length > 1 && r[0].trim() !== "");
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  const idx = (name: string) => header.indexOf(name);
  const iSource = idx("Source");
  const iCountry = idx("Country");
  const iProd22 = idx("Prod_t_est_2022");
  const iProd23 = idx("Prod_t_est_2023");
  const iProdNotes = idx("Prod_notes");
  const iReserves = idx("Reserves_t");
  const iResNotes = idx("Reserves_notes");

  const retrievedAt = new Date().toISOString();
  const records: any[] = [];
  for (const r of rows.slice(1)) {
    const rawCountry = (r[iCountry] || "").trim();
    if (!rawCountry) continue;
    const country = cleanCountry(rawCountry);
    const isWorld = /world total/i.test(country);
    const isAggregate = isWorld || /other countries/i.test(country);
    records.push({
      sourceTag: (r[iSource] || "").trim(),
      country,
      iso3: NAME_TO_ISO3[country] ?? null,
      isAggregate,
      isWorld,
      production2022_t: num(r[iProd22] || ""),
      production2023_t: num(r[iProd23] || ""),
      productionNotes: (r[iProdNotes] || "").trim() || null,
      reserves_t: num(r[iReserves] || ""),
      reservesNotes: (r[iResNotes] || "").trim() || null,
    });
  }

  const out = {
    resource: "cobalt",
    sourceId: "usgs_mcs_cobalt_2024",
    retrievedAt,
    unit: "metric tons of contained cobalt",
    rows: records,
  };
  writeFileSync(join(DATA_DIR, "cobalt_usgs.json"), JSON.stringify(out, null, 2));
  console.log(`  wrote data/cobalt_usgs.json (${records.length} country rows)`);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "planet-to-particle/0.1 (ingest)" },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Extract one named file from a ZIP buffer via its central directory (handles
// stored and deflate). Avoids adding a zip dependency for a single static file.
function unzipEntry(zip: Buffer, target: string): Buffer {
  // Locate End Of Central Directory (signature 0x06054b50), scanning back.
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: no end-of-central-directory record");
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16); // central directory start
  for (let n = 0; n < entries; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50)
      throw new Error("zip: bad central directory header");
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const fnLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + fnLen);
    if (name === target) {
      // Local header: filename + extra lengths live at offsets 26/28.
      const lfn = zip.readUInt16LE(localOff + 26);
      const lextra = zip.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lfn + lextra;
      const raw = zip.subarray(dataStart, dataStart + compSize);
      return method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    }
    p += 46 + fnLen + extraLen + commentLen;
  }
  throw new Error(`zip: entry "${target}" not found`);
}

// Parse a dBASE III (.dbf) buffer into an array of field-keyed records.
function parseDBF(dbf: Buffer): Record<string, string>[] {
  const numRec = dbf.readUInt32LE(4);
  const headerSize = dbf.readUInt16LE(8);
  const recSize = dbf.readUInt16LE(10);
  const fields: { name: string; len: number }[] = [];
  let o = 32;
  while (dbf[o] !== 0x0d) {
    fields.push({
      name: dbf.toString("ascii", o, o + 11).replace(/\0.*$/, ""),
      len: dbf[o + 16],
    });
    o += 32;
  }
  const out: Record<string, string>[] = [];
  for (let i = 0; i < numRec; i++) {
    let off = headerSize + i * recSize + 1; // skip the deletion flag
    const rec: Record<string, string> = {};
    for (const f of fields) {
      rec[f.name] = dbf.toString("latin1", off, off + f.len).trim();
      off += f.len;
    }
    out.push(rec);
  }
  return out;
}

async function ingestCritMinPoints() {
  console.log("Fetching USGS PP1802 critical-minerals point shapefile…");
  const zip = await fetchBuffer(USGS_PP1802_SHP_ZIP);
  const dbf = unzipEntry(zip, "PP1802_CritMin_pts.dbf");
  const recs = parseDBF(dbf);
  const points = recs
    .map((r) => {
      const lat = Number(r.LATITUDE);
      const lon = Number(r.LONGITUDE);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (lat === 0 && lon === 0) return null;
      return {
        name: r.DEPOSIT_NA,
        commodity: r.CRITICAL_M,
        depositType: r.DEPOSIT_TY,
        lat,
        lon,
        country: r.LOCATION,
        region: r.LOC_DETAIL,
      };
    })
    .filter(Boolean);
  const out = {
    dataset:
      "USGS Professional Paper 1802 — Global Distribution of Selected Mines, Deposits, and Districts of Critical Minerals",
    sourceId: "usgs_pp1802_critmin",
    sourceUrl: USGS_PP1802_ITEM,
    retrievedAt: new Date().toISOString(),
    count: points.length,
    points,
  };
  writeFileSync(
    join(PUBLIC_DIR, "critmin_points.json"),
    JSON.stringify(out)
  );
  console.log(`  wrote public/critmin_points.json (${points.length} points)`);
}

async function ingestDrawdown() {
  console.log("Fetching Project Drawdown table of solutions…");
  const csv = await fetchText(DRAWDOWN_SOLUTIONS_CSV);
  const table = parseCSV(csv.replace(/^﻿/, "")).filter(
    (r) => r.length > 1 && (r[1] || "").trim() !== ""
  );
  if (table.length < 2) throw new Error("Drawdown CSV: no rows");
  const header = table[0].map((h) => h.replace(/^﻿/, "").trim());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const idx = {
    action: col(/^Action$/i),
    solution: col(/^Solution$/i),
    classification: col(/Classification/i),
    mode: col(/^Mode$/i),
    sector: col(/^Sector$/i),
    cluster: col(/^Cluster$/i),
    adoptionUnit: col(/Adoption Unit/i),
    effectiveness: col(/Effectiveness/i),
    adoptionCurrent: col(/Adoption Current/i),
    adoptionRange: col(/Adoption Achievable/i),
    ghgImpact: col(/GHG Impact/i),
    cost: col(/^Cost/i),
    pollutants: col(/Climate Pollutants/i),
    speed: col(/Speed of Action/i),
    adaptation: col(/Climate Adaptation/i),
    environment: col(/Environment Benefits/i),
    wellbeing: col(/Human Well-being/i),
  };
  const clean = (s: string | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim() || null;
  const solutions = table.slice(1).map((r) => ({
    solution: clean(r[idx.solution]),
    action: clean(r[idx.action]),
    classification: clean(r[idx.classification]),
    mode: clean(r[idx.mode]),
    sector: clean(r[idx.sector]),
    cluster: clean(r[idx.cluster]),
    adoptionUnit: clean(r[idx.adoptionUnit]),
    effectiveness: clean(r[idx.effectiveness]),
    adoptionCurrent: clean(r[idx.adoptionCurrent]),
    adoptionRange: clean(r[idx.adoptionRange]),
    ghgImpactGt: clean(r[idx.ghgImpact]),
    costPerTon: clean(r[idx.cost]),
    pollutants: clean(r[idx.pollutants]),
    speed: clean(r[idx.speed]),
    adaptationBenefits: clean(r[idx.adaptation]),
    environmentBenefits: clean(r[idx.environment]),
    wellbeingBenefits: clean(r[idx.wellbeing]),
  }));
  const out = {
    dataset: "Project Drawdown — Table of Solutions",
    sourceId: "project_drawdown_explorer",
    sourceUrl: DRAWDOWN_EXPLORER_URL,
    note:
      "Climate solutions ranked by modeled greenhouse-gas impact. GHG impact is a Gt CO₂-eq/yr range across Drawdown's adoption scenarios; values as published by Project Drawdown.",
    retrievedAt: new Date().toISOString(),
    count: solutions.length,
    solutions,
  };
  writeFileSync(
    join(PUBLIC_DIR, "drawdown_solutions.json"),
    JSON.stringify(out)
  );
  console.log(
    `  wrote public/drawdown_solutions.json (${solutions.length} solutions)`
  );
}

async function ingestBoundaries() {
  console.log("Fetching Natural Earth admin-0 country boundaries…");
  const geo = await fetchText(NATURAL_EARTH_COUNTRIES);
  // Validate it parses as GeoJSON before writing.
  const parsed = JSON.parse(geo);
  if (parsed.type !== "FeatureCollection") throw new Error("Unexpected GeoJSON");
  writeFileSync(join(PUBLIC_DIR, "countries.geo.json"), geo);
  console.log(`  wrote public/countries.geo.json (${parsed.features.length} features)`);
}

async function main() {
  await ingestUSGSCobalt();
  await ingestCritMinPoints();
  await ingestDrawdown();
  await ingestBoundaries();
  console.log("Ingestion complete.");
}

main().catch((e) => {
  console.error("Ingestion failed:", e);
  process.exit(1);
});
