import test from 'node:test';
import assert from 'node:assert/strict';

import { selectSecurityScans } from '../../../security/scripts/select-ci-scans.mjs';

test('security cadence skips expensive checks for unrelated documentation', () => {
  assert.deepEqual(selectSecurityScans(['README.md', 'docs/product-notes.md']), {
    dependency: false,
    bundle: false,
    selfTest: false,
  });
});

test('dependency inputs select only the dependency audit', () => {
  assert.deepEqual(selectSecurityScans(['security/accepted-dependency-advisories.json']), {
    dependency: true,
    bundle: false,
    selfTest: false,
  });
});

test('application and dependency changes select the built-bundle scan', () => {
  assert.equal(selectSecurityScans(['src/features/sesh/components/sesh.tsx']).bundle, true);
  assert.deepEqual(selectSecurityScans(['yarn.lock']), {
    dependency: true,
    bundle: true,
    selfTest: false,
  });
});

test('dependency-audit gate regression suite changes select only the dependency audit', () => {
  assert.deepEqual(selectSecurityScans(['security/scripts/verify-dependency-audit-gate.mjs']), {
    dependency: true,
    bundle: false,
    selfTest: false,
  });
});

test('gitleaks wiring changes select bundle scanning and the scanner self-test', () => {
  assert.deepEqual(selectSecurityScans(['security/scripts/gitleaks-cli.mjs']), {
    dependency: false,
    bundle: true,
    selfTest: true,
  });
});

test('CI cadence changes conservatively select every expensive check', () => {
  assert.deepEqual(selectSecurityScans(['.github/workflows/ci.yml']), {
    dependency: true,
    bundle: true,
    selfTest: true,
  });
});
