// T155.9: a minimal `node:module` customization hook that resolves this
// repo's `@/` TypeScript path alias (see tsconfig.json/jest's
// moduleNameMapper) to `<repo root>/src/` with an explicit `.ts` extension,
// so `t155_9_cloud_repositories.test.mjs` can import the real domain
// repository files (which import each other via `@/...`) under plain
// `node --test`. Node's built-in loader already strips TypeScript types
// natively (no ts-node/tsx dependency needed) once the specifier resolves
// to a real `.ts` file -- this hook only does the path rewrite `@/` imports
// need; it does not touch anything else.

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// supabase/tests/data-api/lib -> repo root is four levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SRC_ROOT_HREF = pathToFileURL(path.join(REPO_ROOT, 'src') + path.sep).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rewritten = `${SRC_ROOT_HREF}${specifier.slice(2)}.ts`;
    return nextResolve(rewritten, context);
  }
  return nextResolve(specifier, context);
}
