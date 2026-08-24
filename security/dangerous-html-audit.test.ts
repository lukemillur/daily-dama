import { describe, expect, it } from "@jest/globals";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// T162.1 regression guard: the CSP report-only policy in vercel.json assumes there is
// exactly one raw-HTML sink in the whole src/ tree (src/app/+html.tsx), and that its
// value is a fixed, non-interpolated string -- never note or custom-trick content.
// If this test ever fails, do not widen the CSP to compensate. Read the new sink and
// either remove it or prove it cannot carry untrusted content, then update this test.

const SINK_PATTERNS: readonly RegExp[] = [
  /dangerouslySetInnerHTML/,
  /\.innerHTML\s*=/,
  /\.outerHTML\s*=/,
  /insertAdjacentHTML\s*\(/,
];

const SRC_ROOT = join(__dirname, "..", "src");

interface SinkMatch {
  readonly file: string;
  readonly line: string;
}

function collectSourceFiles(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function findSinkMatches(): SinkMatch[] {
  const files = collectSourceFiles(SRC_ROOT, []);
  const matches: SinkMatch[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      if (SINK_PATTERNS.some((pattern) => pattern.test(line))) {
        matches.push({ file, line: line.trim() });
      }
    }
  }
  return matches;
}

describe("raw-HTML sink audit (T162.1)", () => {
  it("has exactly one known, non-interpolated raw-HTML sink: src/app/+html.tsx", () => {
    const matches = findSinkMatches();

    expect(
      matches
        .map((match) => match.file)
        .filter((file) => !file.endsWith(join("app", "+html.tsx"))),
    ).toEqual([]);
    expect(matches.length).toBeGreaterThan(0);

    const [match] = matches;
    expect(match.file.endsWith(join("app", "+html.tsx"))).toBe(true);
    expect(match.line).toContain("dangerouslySetInnerHTML");

    // The sink must carry a fixed literal string, never a variable, prop, or template
    // interpolation -- that is what makes it safe from note/custom-trick content today.
    expect(match.line).toContain("html,body{background:#f4c94d}");
    expect(match.line).not.toMatch(/\$\{/);
    expect(match.line).not.toMatch(/__html:\s*[a-zA-Z_][a-zA-Z0-9_.]*\s*[},]/);
  });
});
