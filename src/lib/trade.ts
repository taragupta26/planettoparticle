"use client";

// Bilateral merchandise-trade flows for a single reporter country, from the
// World Bank WITS TradeStats service (free, no key). Each flow is a real
// reporter→partner value in current US$ thousand, anchored to Natural Earth
// label points so the globe can draw arcs. Nothing is invented: an unavailable
// reporter/year returns an explicit gap.

export interface TradeNode {
  iso: string;
  name: string;
  lat: number;
  lon: number;
}
export interface TradeFlow extends TradeNode {
  value: number; // US$ thousand
}
export interface TradePayload {
  available: boolean;
  reason?: string;
  reporter?: TradeNode;
  flow?: "X" | "M"; // X = exports, M = imports
  year?: string;
  unit?: string;
  source?: { name: string; url: string };
  total?: number;
  flows?: TradeFlow[];
}

export const TRADE_SOURCE = {
  name: "World Bank WITS (TradeStats)",
  url: "https://wits.worldbank.org",
};

const cache = new Map<string, TradePayload>();

export async function loadTradeFlows(
  iso: string,
  flow: "X" | "M",
  year: string
): Promise<TradePayload> {
  const key = `${iso}|${flow}|${year}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await fetch(
    `/api/trade-flows?iso=${encodeURIComponent(iso)}&flow=${flow}&year=${year}`
  );
  const data = (await r.json()) as TradePayload;
  cache.set(key, data);
  return data;
}

// Compact US$ label from a US$-thousand value (e.g. 306900000 -> "$307B").
export function fmtUsdThousand(v: number): string {
  const dollars = v * 1000;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(dollars);
}
