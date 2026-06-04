/**
 * validate-sources.ts — checks every live data source referenced by build-db.ts
 * for validity: OWID grapher slugs and World Bank indicator codes must each
 * return real per-country rows. USGS ScienceBase item IDs are listed but only
 * validated at deploy (the catalog blocks some sandboxes). No data is written.
 *
 * Run: npx tsx scripts/validate-sources.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "scripts", "build-db.ts"), "utf8");

// Extract OWID slugs: OWID_SERIES rows are ["metric","slug","label","unit",SRC]
const owidSlugs = Array.from(
  SRC.matchAll(/\[\s*"([a-z0-9_]+)",\s*"([a-z0-9-]+)",\s*"[^"]+",\s*"[^"]*",\s*OWID_[A-Z_]+\]/g)
).map((m) => ({ metric: m[1], slug: m[2] }));

// Extract WB indicator codes from WB_INDICATORS objects.
const wbCodes = Array.from(
  SRC.matchAll(/metric:\s*"([a-z0-9_]+)",\s*code:\s*"([A-Z0-9.]+)"/g)
).map((m) => ({ metric: m[1], code: m[2] }));

// Extract USGS ScienceBase item ids (validated at deploy only).
const usgsItems = Array.from(
  SRC.matchAll(/\[\s*"([a-z0-9_]+)",\s*"[^"]+",\s*"([0-9a-f]{24})"\]/g)
).map((m) => ({ metric: m[1], item: m[2] }));

async function realCountrySet(): Promise<Set<string>> {
  const res = await fetch(
    "https://api.worldbank.org/v2/country?format=json&per_page=400"
  );
  const json = JSON.parse((await res.text()).replace(/^﻿/, ""));
  const set = new Set<string>();
  for (const c of json?.[1] ?? [])
    if (c?.region?.value && c.region.value !== "Aggregates" && c.id) set.add(c.id);
  return set;
}

async function main() {
  const real = await realCountrySet();
  console.log(`WB real-country reference set: ${real.size}\n`);
  const bad: string[] = [];

  console.log(`== OWID slugs (${owidSlugs.length}) ==`);
  for (const { metric, slug } of owidSlugs) {
    try {
      const r = await fetch(
        `https://ourworldindata.org/grapher/${slug}.csv?csvType=full&useColumnShortNames=true`
      );
      if (!r.ok) {
        console.log(`  ✗ ${metric} (${slug}) HTTP ${r.status}`);
        bad.push(`${metric}: OWID ${slug} HTTP ${r.status}`);
        continue;
      }
      const lines = (await r.text()).trim().split("\n");
      let n = 0;
      for (let i = 1; i < lines.length; i++) {
        const p = lines[i].split(",");
        if (p.length < 4) continue;
        const v = Number(p[p.length - 1]);
        const code = p[p.length - 3];
        if (code && real.has(code) && Number.isFinite(v) && v > 0) n++;
      }
      const flag = n < 30 ? "⚠" : "✓";
      console.log(`  ${flag} ${metric} (${slug}): ${n} countries`);
      if (n === 0) bad.push(`${metric}: OWID ${slug} 0 countries`);
    } catch (e) {
      console.log(`  ✗ ${metric} (${slug}) ${(e as Error).message}`);
      bad.push(`${metric}: OWID ${slug} ${(e as Error).message}`);
    }
  }

  // Faithful to build-db.ts: retry with backoff, mrnev=1 then mrv=1 fallback,
  // 500ms pacing — WB rate-limits bursts and returns XML/empty otherwise.
  async function wbFetch(url: string, tries = 4): Promise<any[] | null> {
    let last = "";
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          const txt = (await r.text()).replace(/^﻿/, "").trim();
          if (txt.startsWith("<")) throw new Error("XML body");
          return JSON.parse(txt);
        }
        last = `HTTP ${r.status}`;
      } catch (e) {
        last = (e as Error).message;
      }
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
    throw new Error(last);
  }

  console.log(`\n== World Bank indicators (${wbCodes.length}) ==`);
  for (const { metric, code } of wbCodes) {
    await new Promise((r) => setTimeout(r, 500));
    const base = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=500`;
    let series: any[] = [];
    try {
      try {
        series = (await wbFetch(`${base}&mrnev=1`))?.[1] ?? [];
      } catch {
        await new Promise((r) => setTimeout(r, 500));
        series = (await wbFetch(`${base}&mrv=1`))?.[1] ?? [];
      }
      let n = 0;
      for (const o of series)
        if (o.countryiso3code && real.has(o.countryiso3code) && o.value != null) n++;
      const flag = n < 30 ? "⚠" : "✓";
      console.log(`  ${flag} ${metric} (${code}): ${n} countries`);
      if (n === 0) bad.push(`${metric}: WB ${code} 0 countries`);
    } catch (e) {
      console.log(`  ✗ ${metric} (${code}) ${(e as Error).message}`);
      bad.push(`${metric}: WB ${code} ${(e as Error).message}`);
    }
  }

  console.log(`\n== USGS ScienceBase items (${usgsItems.length}) — validated at deploy only ==`);
  console.log(`  ${usgsItems.map((u) => u.metric).join(", ")}`);

  console.log(`\n== SUMMARY ==`);
  if (bad.length === 0) console.log("All OWID + WB sources returned real data ✓");
  else {
    console.log(`${bad.length} problem source(s):`);
    bad.forEach((b) => console.log(`  - ${b}`));
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
