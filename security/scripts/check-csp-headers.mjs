#!/usr/bin/env node
// T162.1: automated header-rejection check for the report-only CSP.
// Builds a fresh production-like export, serves it exactly like Vercel would (via
// build-and-serve.mjs), then asserts the served Content-Security-Policy-Report-Only
// header is present, byte-identical across sampled routes, matches an independently
// written expected allow-list (not round-tripped from vercel.json), never contains a
// bare wildcard, and that the script-src hash still matches a fresh recomputation from
// the actual exported inline bootstrap script (the drift guard called out in the plan).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAndServe } from "./build-and-serve.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const EXPORT_DIR = join(REPO_ROOT, "dist");

const ROUTES = [
  "/",
  "/app/home",
  "/app/tricks",
  "/app/sesh",
  "/app/stats",
  "/app/profile",
  "/auth/sign-in",
  "/auth/callback",
];

const EXPECTED_DIRECTIVES = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'", "https://*.supabase.co"],
  "frame-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

function parseCsp(value) {
  const directives = {};
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const [name, ...sources] = trimmed.split(/\s+/);
    directives[name] = sources;
  }
  return directives;
}

function collectHtmlFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectHtmlFiles(full, out);
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function extractInlineScripts(htmlFiles) {
  const scriptsByFile = new Map();
  for (const file of htmlFiles) {
    const content = readFileSync(file, "utf8");
    const matches = [...content.matchAll(/<script type="module">([^<]*)<\/script>/g)].map(
      (match) => match[1],
    );
    scriptsByFile.set(file, matches);
  }
  return scriptsByFile;
}

test("report-only CSP header (T162.1)", async (t) => {
  const { server, port } = await buildAndServe();
  t.after(() => server.close());
  const baseUrl = `http://localhost:${port}`;

  const headerValues = new Set();

  await t.test("is present and byte-identical across sampled routes", async () => {
    for (const route of ROUTES) {
      const response = await fetch(`${baseUrl}${route}`);
      const header = response.headers.get("content-security-policy-report-only");
      assert.ok(header, `missing CSP-Report-Only header on ${route}`);
      headerValues.add(header);
    }
    assert.equal(
      headerValues.size,
      1,
      "expected a single catch-all header rule to produce one identical value across all sampled routes",
    );
  });

  await t.test("matches the independently written expected allow-list, with no bare wildcard", () => {
    const [headerValue] = [...headerValues];
    const directives = parseCsp(headerValue);

    for (const [name, expectedSources] of Object.entries(EXPECTED_DIRECTIVES)) {
      assert.deepEqual(
        directives[name],
        expectedSources,
        `unexpected sources for ${name}: got ${JSON.stringify(directives[name])}`,
      );
    }

    for (const sources of Object.values(directives)) {
      assert.ok(!sources.includes("*"), "a directive contains a bare wildcard");
    }
  });

  await t.test("script-src hash matches a fresh recomputation from the exported bootstrap script", () => {
    const htmlFiles = collectHtmlFiles(EXPORT_DIR, []);
    assert.ok(htmlFiles.length > 0, "no exported HTML files found to recompute the hash from");

    const scriptsByFile = extractInlineScripts(htmlFiles);
    const allScripts = [...scriptsByFile.values()].flat();
    assert.ok(allScripts.length > 0, "no inline script type=module tags found in the export");

    const uniqueScripts = new Set(allScripts);
    assert.equal(
      uniqueScripts.size,
      1,
      "the inline bootstrap script is not identical across every exported page -- the single-hash assumption in vercel.json no longer holds; treat this failure as a stop-and-reconsider signal, not something to patch around",
    );

    const [scriptContent] = uniqueScripts;
    const recomputedHash = `'sha256-${createHash("sha256").update(scriptContent).digest("base64")}'`;

    const [headerValue] = [...headerValues];
    const directives = parseCsp(headerValue);
    assert.ok(
      directives["script-src"].includes(recomputedHash),
      `vercel.json script-src hash is stale -- recompute it and update the policy. Expected to find ${recomputedHash} in ${JSON.stringify(directives["script-src"])}`,
    );
  });
});
