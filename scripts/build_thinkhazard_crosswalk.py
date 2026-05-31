#!/usr/bin/env python3
"""
build_thinkhazard_crosswalk.py — generate a VERIFIED ISO3 -> GAUL0 crosswalk.

ThinkHazard! (GFDRR) keys its hazard reports by FAO GAUL admin codes, not ISO.
Its public autocomplete (https://www.thinkhazard.org/en/administrativedivision?q=NAME)
is the authoritative source: each hit returns {"code": <GAUL0>, "admin0": <official name>}.

We resolve every country in public/countries.geo.json by querying that endpoint
with the country's own name variants and accepting a hit ONLY when the official
name matches a variant exactly (normalized) or by token-set. Nothing is guessed:
a country we can't confidently resolve is left out (an honest data gap, surfaced
as "hazard baseline unavailable" in the UI), never mapped to a wrong code.

Output: public/thinkhazard_gaul.json  { "ISO3": {"code": 93, "name": "Germany"} }
Run once (and re-run if the basemap changes): python3 scripts/build_thinkhazard_crosswalk.py
"""
import json, re, sys, time, unicodedata, urllib.parse, subprocess, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEO = ROOT / "public" / "countries.geo.json"
OUT = ROOT / "public" / "thinkhazard_gaul.json"
BASE = "https://www.thinkhazard.org/en/administrativedivision?q="

STOP = {"the", "of", "and", "&", "republic", "rep", "dem", "democratic",
        "people", "peoples", "state", "states", "islamic", "federation",
        "plurinational", "bolivarian", "arab", "kingdom", "union", "pdr"}

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()

def tokens(s: str) -> frozenset:
    return frozenset(t for t in norm(s).split() if t and t not in STOP)

_cache: dict[str, list] = {}
def query(q: str) -> list:
    if q in _cache:
        return _cache[q]
    url = BASE + urllib.parse.quote(q)
    try:
        # curl, not urllib: the macOS python.org build can't verify the TLS
        # chain. This is a one-time fetch of a public, read-only endpoint.
        raw = subprocess.run(["curl", "-fsS", "--max-time", "20", url],
                             capture_output=True, text=True, timeout=25).stdout
        data = json.loads(raw).get("data", []) if raw else []
    except Exception as e:
        print(f"  ! query failed for {q!r}: {e}", file=sys.stderr)
        data = []
    _cache[q] = data
    time.sleep(0.12)  # be polite to a free public service
    return data

def main():
    geo = json.loads(GEO.read_text())
    out, unresolved = {}, []
    for feat in geo["features"]:
        p = feat["properties"]
        iso = p.get("ISO_A3")
        if not iso or iso == "-99":
            continue
        variants = [p.get(k) for k in ("NAME", "ADMIN", "NAME_LONG",
                                       "FORMAL_EN", "NAME_EN", "GEOUNIT", "BRK_NAME")]
        variants = [v for v in variants if v]
        vnorms = {norm(v) for v in variants}
        vtoks = {tokens(v) for v in variants}

        best = None  # (tier, code, name)  tier 0 = exact, 1 = token-set
        for v in variants:
            for hit in query(v):
                code, name = hit.get("code"), hit.get("admin0")
                if code is None or not name:
                    continue
                if norm(name) in vnorms:
                    best = (0, code, name)
                    break
                if tokens(name) and tokens(name) in vtoks:
                    if best is None or best[0] > 1:
                        best = (1, code, name)
            if best and best[0] == 0:
                break

        if best:
            out[iso] = {"code": best[1], "name": best[2]}
            tag = "exact" if best[0] == 0 else "tokens"
            print(f"  {iso} -> {best[1]:>5}  {best[2]}  [{tag}]")
        else:
            unresolved.append((iso, p.get("NAME")))
            print(f"  {iso} -> UNRESOLVED ({p.get('NAME')})")

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True))
    print(f"\nResolved {len(out)} / {len(out)+len(unresolved)} countries -> {OUT}")
    if unresolved:
        print("Unresolved (left as data gaps):")
        for iso, nm in unresolved:
            print(f"  {iso}  {nm}")

if __name__ == "__main__":
    main()
