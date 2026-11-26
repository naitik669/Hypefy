/* eslint-disable @typescript-eslint/no-require-imports --
 * Metro loads this file itself, as CommonJS, before any bundler or
 * transpiler is involved. `import` here is not a style choice the rule can
 * win: it would simply fail to load, and the app would not build. Disabled
 * for the file with the reason rather than recorded as debt, because debt
 * implies somebody could one day pay it.
 */

// Metro, taught about the monorepo.
//
// Two things it does not work out for itself. It only watches the folder it
// is started in, so a change in packages/core would not trigger a reload and
// — worse — the import would not resolve at all. And npm hoists most
// dependencies to the workspace root while leaving this app's own react and
// typescript nested, so there are two places to look for a module.
//
// Straight from Expo's monorepo guidance rather than invented here.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace, so packages/core and packages/tokens are
//    seen and hot-reload.
config.watchFolders = [workspaceRoot];

// 2. Look here FIRST, then at the root. Order matters: this app pins
//    react 19.3.0 while the web is on 19.2.4, and resolving react from the
//    root would give React Native the wrong one.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Keep the hierarchical walk as well. Turning it off is the usual advice
//    for pnpm; with npm's hoisting it breaks packages that expect to find a
//    transitive dependency beside them.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
