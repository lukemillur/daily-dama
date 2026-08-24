#!/usr/bin/env node
// T162.2 (headers added by T162.1 report-only phase, now enforced): automated
// header-rejection check for the enforced CSP plus the remaining defensive headers.
// Builds a fresh production-like export, serves it exactly like Vercel would (via
// build-and-serve.mjs), then asserts the served Content-Security-Policy header is
// present, byte-identical across sampled routes, matches an independently written
// expected allow-list (not round-tripped from vercel.json), never contains a bare
// wildcard, that the script-src hash still matches a fresh recomputation from the
// actual exported inline bootstrap script (the drift guard called out in the plan),
// and that Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, and
// Permissions-Policy are all present with their exact expected values.

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

// Independently written expected values for the four defensive headers added in
// T162.2, not round-tripped from vercel.json.
const EXPECTED_OTHER_HEADERS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), " +
    "display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(), " +
    "geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), " +
    "picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), " +
    "usb=(), web-share=(), xr-spatial-tracking=()",
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

test("enforced CSP and defensive headers (T162.2)", async (t) => {
  const { server, port } = await buildAndServe();
  t.after(() => server.close());
  const baseUrl = `http://localhost:${port}`;

  const headerValues = new Set();
  const otherHeaderValuesByName = new Map(Object.keys(EXPECTED_OTHER_HEADERS).map((name) => [name, new Set()]));

  await t.test("is present and byte-identical across sampled routes", async () => {
    for (const route of ROUTES) {
      const response = await fetch(`${baseUrl}${route}`);
      const header = response.headers.get("content-security-policy");
      assert.ok(header, `missing CSP header on ${route}`);
      headerValues.add(header);

      for (const headerName of Object.keys(EXPECTED_OTHER_HEADERS)) {
        const value = response.headers.get(headerName);
        assert.ok(value, `missing ${headerName} header on ${route}`);
        otherHeaderValuesByName.get(headerName).add(value);
      }
    }
    assert.equal(
      headerValues.size,
      1,
      "expected a single catch-all header rule to produce one identical value across all sampled routes",
    );
    for (const [headerName, values] of otherHeaderValuesByName) {
      assert.equal(
        values.size,
        1,
        `expected ${headerName} to be byte-identical across all sampled routes`,
      );
    }
  });

  await t.test("defensive headers match their independently written expected values", () => {
    for (const [headerName, expectedValue] of Object.entries(EXPECTED_OTHER_HEADERS)) {
      const [actualValue] = [...otherHeaderValuesByName.get(headerName)];
      assert.equal(actualValue, expectedValue, `unexpected value for ${headerName}`);
    }
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
