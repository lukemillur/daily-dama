#!/usr/bin/env node
// T162.3: scans a freshly built production-like web export for accidentally baked-in
// secrets (Supabase service-role keys, Auth session/refresh JWTs, and anything else
// gitleaks' default ruleset + this repo's .gitleaks.toml allowlist would flag). Build
// step is reused from build-and-serve.mjs (T162.1) rather than reimplemented here.
// Never prints unredacted gitleaks output -- --redact is always on in gitleaks-cli.mjs.

import { buildExport } from "./build-and-serve.mjs";
import { runGitleaks } from "./gitleaks-cli.mjs";

function main() {
  console.log("[check-bundle-secrets] building web export...");
  buildExport();

  console.log("[check-bundle-secrets] scanning dist/ for secrets...");
  const { status, stdout } = runGitleaks({ sourceDir: "dist" });
  console.log(stdout);

  if (status !== 0) {
    console.error(
      "[check-bundle-secrets] gitleaks found potential secret(s) in the built web bundle. " +
        "See the (redacted) findings above for file/line locations. Do not bake real secrets " +
        "into the client bundle -- only EXPO_PUBLIC_* values are safe there.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("[check-bundle-secrets] no secrets found in the built web bundle.");
}

main();
