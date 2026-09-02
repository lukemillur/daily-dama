#!/usr/bin/env node
// T162.1: builds a production-like static web export (using a well-formed placeholder
// Supabase URL/key if the real ones are not already in the environment -- this suite is
// about page loads and CSP headers, not exercising real Auth/Data calls, so a live
// Supabase project is never required) and serves it exactly the way vercel.json would.
// This is the one place that build+serve sequence lives; check-csp-headers.mjs and
// playwright.security.config.ts both run this script.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./serve-web-export.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const EXPORT_DIR = "dist";

function parseArgs(argv) {
  const result = { port: 0, extraConnectSrc: [] };
  for (const arg of argv) {
    if (arg.startsWith("--port=")) result.port = Number(arg.slice("--port=".length));
    else if (arg.startsWith("--extra-connect-src=")) {
      result.extraConnectSrc = arg
        .slice("--extra-connect-src=".length)
        .split(" ")
        .filter(Boolean);
    }
  }
  return result;
}

export function buildExport() {
  const env = Object.assign({}, process.env, {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://placeholder-project.supabase.co",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "placeholder-anon-key",
  });
  const result = spawnSync(
    "yarn",
    ["expo", "export", "--platform", "web", "--output-dir", EXPORT_DIR],
    { cwd: REPO_ROOT, env, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("web export failed");
  }
}

export async function buildAndServe(args = {}) {
  buildExport();
  return startServer({ dir: EXPORT_DIR, port: args.port ?? 0, extraConnectSrc: args.extraConnectSrc ?? [] });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { port } = await buildAndServe(args);
  console.log(`[build-and-serve] Serving ${EXPORT_DIR} on http://localhost:${port}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
