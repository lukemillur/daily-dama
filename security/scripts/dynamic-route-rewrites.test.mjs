#!/usr/bin/env node
// T227: keep every exported dynamic route reachable through the clean URL used by
// client navigation and direct browser refreshes.

import { test } from "node:test";
import assert from "node:assert/strict";

import { loadVercelConfig } from "./serve-web-export.mjs";

const ROUTES = [
  ["/app/stats/example-trick", "app/stats/[trickId].html"],
  ["/app/tricks/example-trick/notes", "app/tricks/[trickId]/notes.html"],
  ["/app/tricks/example-trick/goals", "app/tricks/[trickId]/goals.html"],
  ["/app/tricks/custom/example-trick/edit", "app/tricks/custom/[trickId]/edit.html"],
  ["/app/tricks/custom/example-trick/delete", "app/tricks/custom/[trickId]/delete.html"],
];

test("vercel rewrites cover every exported dynamic route", async (t) => {
  const config = loadVercelConfig();
  const rewrites = config.rewrites ?? [];

  for (const [route, exportPath] of ROUTES) {
    await t.test(route, () => {
      const matchingRewrite = rewrites.find((rewrite) => {
        const pattern = new RegExp(`^${rewrite.source.replace(/:[a-zA-Z0-9_]+/g, "[^/]+")}$`);
        return pattern.test(route);
      });
      assert.deepEqual(matchingRewrite, {
        source: route.replace("example-trick", ":trickId"),
        destination: `/${exportPath}`,
      });
    });
  }
});
