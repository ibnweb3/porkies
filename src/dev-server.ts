// Local server: serves site/ and the same /api/* code the Worker uses. Run: node src/dev-server.ts
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.ts";
import { handle, secure, type Env } from "./live.ts";

loadEnv();
const root = fileURLToPath(new URL("../site", import.meta.url));
const port = Number(process.env.PORT ?? 4195);
const env: Env = {
  SERV_API_KEY: process.env.SERV_API_KEY,
  REPPO_EVAL_KEY: process.env.REPPO_EVAL_KEY,
  LIMIT_IP: process.env.LIMIT_IP ?? "20", // generous while debugging; the deployed default is 2
  LIMIT_DAY: process.env.LIMIT_DAY ?? "200",
};
const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp4": "video/mp4" };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      headers.set("x-forwarded-for", req.socket.remoteAddress ?? "local");
      const r = secure(await handle(new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : Buffer.concat(chunks) }), env));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end("Forbidden"); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || file.endsWith(sep + "_headers")) { res.writeHead(404).end("Not found"); return; } // _headers is Cloudflare config, not content
    const body = readFileSync(file);
    res.writeHead(200, { "content-length": body.length, "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=()" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (e) {
    res.writeHead(500).end("Server error: " + (e as Error).message);
  }
}).listen(port, "127.0.0.1", () => console.log(`Porkies running at http://localhost:${port}  (live checks ${env.SERV_API_KEY && env.REPPO_EVAL_KEY ? "ON" : "OFF: keys missing in .env"})`));
