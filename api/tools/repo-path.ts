import { fileURLToPath } from 'node:url';

// This file sits in `api/tools/`, two folders below the repo root, so the root
// is found from here whatever the working directory is.
const REPO_ROOT = new URL('../../', import.meta.url);

/**
 * An absolute path to a file in the repo, from its path relative to the root:
 * `repoPath('docs/schema.md')`. Specs, tools and test setup use it, so moving
 * a folder means changing the one relative path that names it.
 */
export function repoPath(relative: string): string {
  return fileURLToPath(new URL(relative, REPO_ROOT));
}
