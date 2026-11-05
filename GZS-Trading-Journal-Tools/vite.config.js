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

export default defineConfig({
  plugins: [backupWriter()],
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
