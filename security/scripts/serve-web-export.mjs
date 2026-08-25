#!/usr/bin/env node
// T162.1: a small, dependency-free static server that mirrors how Vercel serves the
// static export from vercel.json -- clean-URL resolution, the one explicit rewrite
// entry, and the headers block (right now, just the report-only CSP). Used by
// build-and-serve.mjs, check-csp-headers.mjs, and the Playwright security suite so
// every automated/manual check exercises the same header behavior a real deploy would.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function parseArgs(argv) {
  const result = { dir: "dist", port: 0, extraConnectSrc: [] };
  for (const arg of argv) {
    if (arg.startsWith("--dir=")) result.dir = arg.slice("--dir=".length);
    else if (arg.startsWith("--port=")) result.port = Number(arg.slice("--port=".length));
    else if (arg.startsWith("--extra-connect-src=")) {
      result.extraConnectSrc = arg
        .slice("--extra-connect-src=".length)
        .split(" ")
        .filter(Boolean);
    }
  }
  return result;
}

function rewriteToRegExp(source) {
  // Only supports the one dynamic segment shape used in vercel.json today (":name").
  const pattern = source.replace(/:[a-zA-Z0-9_]+/g, "([^/]+)");
  return new RegExp("^" + pattern + "$");
}

function applyRewrite(rewrites, pathname) {
  for (const rewrite of rewrites) {
    const paramNames = [...rewrite.source.matchAll(/:([a-zA-Z0-9_]+)/g)].map((match) => match[1]);
    const regexp = rewriteToRegExp(rewrite.source);
    const match = pathname.match(regexp);
    if (!match) continue;
    let destination = rewrite.destination;
    paramNames.forEach((name, index) => {
      destination = destination.replace(`:${name}`, match[index + 1]);
    });
    return destination;
  }
  return pathname;
}

function headerValueWithExtraConnectSrc(value, extraConnectSrc) {
  if (extraConnectSrc.length === 0) return value;
  return value.replace(/connect-src([^;]*)/, (full, rest) => `connect-src${rest} ${extraConnectSrc.join(" ")}`);
}

async function resolveFile(rootDir, pathname) {
  const cleanPath = pathname.split("?")[0];
  const candidates = [
    join(rootDir, cleanPath),
    join(rootDir, `${cleanPath}.html`),
    join(rootDir, cleanPath, "index.html"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && (await stat(candidate)).isFile()) return candidate;
  }
  return null;
}

export function loadVercelConfig() {
  const raw = readFileSync(join(REPO_ROOT, "vercel.json"), "utf8");
  return JSON.parse(raw);
}

export function startServer({ dir, port, extraConnectSrc }) {
  const rootDir = resolve(REPO_ROOT, dir);
  const config = loadVercelConfig();
  const rewrites = config.rewrites ?? [];
  const headerRules = config.headers ?? [];

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const rewrittenPath = applyRewrite(rewrites, url.pathname);
    const filePath = await resolveFile(rootDir, rewrittenPath);

    for (const rule of headerRules) {
      const matches = new RegExp(`^${rule.source}$`).test(url.pathname);
      if (!matches) continue;
      for (const header of rule.headers) {
        response.setHeader(header.key, headerValueWithExtraConnectSrc(header.value, extraConnectSrc));
      }
    }

    if (!filePath) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    const contentType = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
    response.setHeader("Content-Type", contentType);
    response.end(await readFile(filePath));
  });

  return new Promise((resolvePromise) => {
    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolvePromise({ server, port: actualPort });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { port } = await startServer(args);
  console.log(`[serve-web-export] Serving ${args.dir} on http://localhost:${port}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
