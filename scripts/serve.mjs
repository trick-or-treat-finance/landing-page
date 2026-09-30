// Serve dist/ under /landing-page/ on a fixed port (for Lighthouse and screenshots by hand).
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
const dist = resolve("dist");
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
createServer((req, res) => {
  const f = join(dist, req.url.split(/[?#]/)[0].replace("/landing-page", "").replace(/\/$/, "/index.html"));
  if (!f.startsWith(dist) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream", "cache-control": "max-age=3600" }).end(readFileSync(f));
}).listen(Number(process.argv[2] ?? 4177), "127.0.0.1");
