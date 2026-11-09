import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const backupDirectory = fileURLToPath(new URL("./public/backups", import.meta.url));
const maxBackupBytes = 50 * 1024 * 1024;
const isValidBackupName = (name) => path.basename(name) === name && /^[\w .-]+\.json$/.test(name);

async function listBackups() {
  try {
    const entries = await readdir(backupDirectory, { withFileTypes: true });
    const files = await Promise.all(entries.filter((entry) => entry.isFile() && isValidBackupName(entry.name)).map(async (entry) => {
      const info = await stat(path.join(backupDirectory, entry.name));
      return { name: entry.name, size: info.size, modified: info.mtime.toISOString() };
    }));
    return files.sort((a, b) => b.modified.localeCompare(a.modified));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function backupWriter() {
  const middleware = async (req, res, next) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/api/backups") return next();
    const filename = url.searchParams.get("filename") || "";
    if (req.method === "GET") {
      if (!filename) {
        try {
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ ok: true, backups: await listBackups() }));
        } catch {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Could not list backups" }));
        }
        return;
      }
      if (!isValidBackupName(filename)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid backup filename" }));
        return;
      }
      try {
        const content = await readFile(path.join(backupDirectory, filename), "utf8");
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(content);
      } catch (error) {
        const status = error.code === "ENOENT" ? 404 : 500;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: status === 404 ? "Backup not found" : "Could not read backup" }));
      }
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, POST" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    const safeName = filename;
    if (!isValidBackupName(safeName)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Invalid backup filename" }));
      return;
    }
    let body = "";
    let bytes = 0;
    let rejected = false;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      if (rejected) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBackupBytes) {
        rejected = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Backup is too large" }));
        return;
      }
      body += chunk;
    });
    req.on("end", async () => {
      if (rejected) return;
      try {
        JSON.parse(body);
        await mkdir(backupDirectory, { recursive: true });
        await writeFile(path.join(backupDirectory, safeName), body, "utf8");
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, file: `public/backups/${safeName}` }));
      } catch (error) {
        const status = error instanceof SyntaxError ? 400 : 500;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: status === 400 ? "Invalid backup JSON" : "Could not save backup" }));
      }
    });
    req.on("error", () => {
      if (res.writableEnded) return;
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Could not read backup" }));
    });
  };
  return {
    name: "clanbook-backup-writer",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function historicalReader() {
  // GET /api/historical?symbol=XAUUSD&ts=<epoch ms>&field=open|high|low|close
  // Proxies Yahoo Finance chart candles for GC=F (COMEX gold futures, the
  // closest Yahoo series to spot XAU/USD — prices are illustrative).
  // Yahoo sends no CORS headers, so the browser cannot query it directly;
  // routing through this middleware keeps the client code simple. The
  // granularity is chosen from the age of the requested moment (Yahoo
  // limits 1m data to ~7 days, 5m to 60 days, 1h to 2 years).
  const supported = { XAUUSD: "GC=F" };
  const fields = new Set(["open", "high", "low", "close"]);
  const middleware = async (req, res, next) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/api/historical") return next();
    const json = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(payload));
    };
    try {
      const symbol = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
      const yahooSymbol = supported[symbol];
      if (!yahooSymbol) {
        json(200, { ok: false, error: `Historical lookup is available for ${Object.keys(supported).join(" and ")} only` });
        return;
      }
      const field = (url.searchParams.get("field") || "close").toLowerCase();
      if (!fields.has(field)) {
        json(400, { ok: false, error: "Invalid price field" });
        return;
      }
      const ts = Number(url.searchParams.get("ts"));
      if (!Number.isFinite(ts)) {
        json(400, { ok: false, error: "Invalid timestamp" });
        return;
      }
      const ageDays = (Date.now() - ts) / 86400000;
      if (ageDays < 0) {
        json(200, { ok: false, error: "That time is in the future — no historical data exists yet" });
        return;
      }
      let granularity, spanMs;
      if (ageDays <= 10 / 24) { granularity = "1m"; spanMs = 60000; }
      else if (ageDays <= 7) { granularity = "5m"; spanMs = 300000; }
      else if (ageDays <= 730) { granularity = "1h"; spanMs = 3600000; }
      else { granularity = "1d"; spanMs = 86400000; }
      // Yahoo's free chart endpoint only serves candles reliably when the
      // requested window ends at "now" (it clamps period2 and caps the
      // number of candles returned per interval). So: always query from a
      // little before the target moment up to now, then pick the candle
      // closest to the requested timestamp.
      const beforeFor = { "1m": 1800000, "5m": 3600000, "1h": 7200000, "1d": 5 * 86400000 };
      const fetchCandles = async (interval) => {
        const period1 = Math.floor((ts - (beforeFor[interval] ?? 3600000)) / 1000);
        const period2 = Math.ceil((Date.now() + 60000) / 1000);
        const api = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&period1=${period1}&period2=${period2}&includePrePost=false`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        try {
          const resp = await fetch(api, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; GZSTradingJournal/1.0)" },
          });
          return resp.ok ? await resp.json() : null;
        } finally {
          clearTimeout(timer);
        }
      };
      const coarse = { "1m": "5m", "5m": "1h", "1h": "1d", "1d": null };
      const intervals = [granularity, coarse[granularity]].filter(Boolean);
      let payload = null;
      for (const interval of intervals) {
        payload = await fetchCandles(interval);
        if (payload?.chart?.result?.[0]?.timestamp?.length) {
          granularity = interval;
          spanMs = { "1m": 60000, "5m": 300000, "1h": 3600000, "1d": 86400000 }[interval];
          break;
        }
        payload = null;
      }
      const result = payload?.chart?.result?.[0];
      const stamps = result?.timestamp;
      const quote = result?.indicators?.quote?.[0];
      if (!stamps?.length || !quote) {
        json(200, { ok: false, error: "No historical candles for that time" });
        return;
      }
      let bestIdx = -1;
      let bestDist = Infinity;
      stamps.forEach((sec, i) => {
        const price = quote[field]?.[i];
        if (price == null) return;
        const dist = Math.abs(sec * 1000 - ts);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
      if (bestIdx < 0) {
        json(200, { ok: false, error: "No historical candles for that time" });
        return;
      }
      const candleMs = stamps[bestIdx] * 1000;
      const candle = {};
      for (const f of fields) candle[f] = quote[f]?.[bestIdx] ?? null;
      json(200, {
        ok: true,
        field,
        price: candle[field],
        ...candle,
        candleTs: new Date(candleMs).toISOString(),
        granularity,
        distanceMs: candleMs - ts,
        exact: bestDist <= spanMs,
        source: `Yahoo Finance GC=F gold futures (${granularity} candle)`,
      });
    } catch {
      json(200, { ok: false, error: "Historical feed unreachable" });
    }
  };
  return {
    name: "gzs-historical-reader",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [backupWriter(), historicalReader()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [".monkeycode-ai.live"],
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [".monkeycode-ai.live"],
  },
});
