/**
 * aisStream.ts — server-side bridge to AISStream.io's free global AIS feed.
 *
 * AISStream pushes real-time vessel position reports over a WebSocket. We hold
 * ONE long-lived connection on the server, keep the latest position per vessel
 * in memory, and expose it to the browser via /api/vessels — so the API key
 * never reaches the client and the layer stays same-origin like the others.
 *
 * The key is read from AISSTREAM_API_KEY (a free key you register for at
 * https://aisstream.io). With no key the bridge stays dormant and the API
 * reports `configured: false`, which the UI renders as an honest data gap —
 * never fabricated positions.
 *
 * Every value here is a real broadcast from the vessel; nothing is synthesized.
 */
import WebSocket from "ws";

export interface Vessel {
  mmsi: number;
  lat: number;
  lon: number;
  sog: number | null; // speed over ground (knots)
  cog: number | null; // course over ground (degrees)
  heading: number | null;
  name: string | null;
  ts: number; // last update (ms epoch)
}

const ENDPOINT = "wss://stream.aisstream.io/v0/stream";
const STALE_MS = 15 * 60 * 1000; // drop vessels not heard from in 15 min
const MAX_VESSELS = 6000; // memory cap

const g = globalThis as unknown as { __aisBridge?: AisBridge };

class AisBridge {
  private ws: WebSocket | null = null;
  private vessels = new Map<number, Vessel>();
  private connecting = false;
  private lastMsgAt = 0;
  started = false;

  get configured() {
    return Boolean(process.env.AISSTREAM_API_KEY);
  }

  ensureStarted() {
    if (!this.configured || this.started) return;
    this.started = true;
    this.connect();
    // Watchdog: reconnect if the stream goes quiet for 60s.
    setInterval(() => {
      if (this.lastMsgAt && Date.now() - this.lastMsgAt > 60_000) {
        try {
          this.ws?.terminate();
        } catch {}
        this.ws = null;
        this.connect();
      }
    }, 30_000).unref?.();
  }

  private connect() {
    if (this.connecting || this.ws) return;
    const key = process.env.AISSTREAM_API_KEY;
    if (!key) return;
    this.connecting = true;
    const ws = new WebSocket(ENDPOINT);
    this.ws = ws;

    ws.on("open", () => {
      this.connecting = false;
      // Subscribe to the whole world; filter to position reports only.
      ws.send(
        JSON.stringify({
          APIKey: key,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ["PositionReport"],
        })
      );
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      this.lastMsgAt = Date.now();
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.MessageType !== "PositionReport") return;
      const meta = msg.MetaData ?? {};
      const pr = msg.Message?.PositionReport ?? {};
      const mmsi = Number(meta.MMSI ?? pr.UserID);
      const lat = Number(meta.latitude ?? pr.Latitude);
      const lon = Number(meta.longitude ?? pr.Longitude);
      if (!Number.isFinite(mmsi) || !Number.isFinite(lat) || !Number.isFinite(lon))
        return;
      this.vessels.set(mmsi, {
        mmsi,
        lat,
        lon,
        sog: Number.isFinite(pr.Sog) ? pr.Sog : null,
        cog: Number.isFinite(pr.Cog) ? pr.Cog : null,
        heading:
          Number.isFinite(pr.TrueHeading) && pr.TrueHeading !== 511
            ? pr.TrueHeading
            : null,
        name: typeof meta.ShipName === "string" ? meta.ShipName.trim() : null,
        ts: Date.now(),
      });
      if (this.vessels.size > MAX_VESSELS) this.evict(true);
    });

    ws.on("close", () => {
      this.ws = null;
      this.connecting = false;
      setTimeout(() => this.connect(), 3000);
    });
    ws.on("error", (err: Error) => {
      // Surface real connection problems (auth, network) without spamming;
      // position data never flows if this fires, so it's worth logging.
      console.error("[ais] websocket error:", err?.message);
      try {
        ws.terminate();
      } catch {}
      this.ws = null;
      this.connecting = false;
    });
  }

  private evict(force = false) {
    const now = Date.now();
    for (const [mmsi, v] of this.vessels) {
      if (now - v.ts > STALE_MS) this.vessels.delete(mmsi);
    }
    // If still over cap, drop the oldest.
    if (force && this.vessels.size > MAX_VESSELS) {
      const sorted = [...this.vessels.values()].sort((a, b) => a.ts - b.ts);
      for (let i = 0; i < sorted.length - MAX_VESSELS; i++)
        this.vessels.delete(sorted[i].mmsi);
    }
  }

  snapshot(limit = 4000): Vessel[] {
    this.evict();
    const all = [...this.vessels.values()];
    // Most recently updated first, then cap.
    all.sort((a, b) => b.ts - a.ts);
    return all.slice(0, limit);
  }
}

export function aisBridge(): AisBridge {
  if (!g.__aisBridge) g.__aisBridge = new AisBridge();
  g.__aisBridge.ensureStarted();
  return g.__aisBridge;
}
