/**
 * Canonical project paths.
 *
 * Kept separate from `util.mjs` so that CLI, engine, server and reporters all
 * agree on where the repository root, `runs/` and the UI live without having to
 * re-derive them from `import.meta.url` in every module.
 */

export {
  SRC_DIR,
  CODE_DIR,
  ROOT_DIR as PROJECT_ROOT,
  RUNS_DIR,
  UI_DIR,
  ensureDir,
  createLogger,
  exists,
  readJson,
  writeJson,
  resolveFrom,
} from './util.mjs';
