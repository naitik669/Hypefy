/**
 * Pull real path data out of @phosphor-icons/react.
 *
 * The web draws the bottom bar with Phosphor. React Native cannot run those
 * components — they are React DOM — but the geometry is just path data, and
 * the package the web already depends on is sitting in node_modules. Taking
 * the paths from there rather than from an eyeballed lookalike is the
 * difference between "close" and "the same shape".
 *
 * The definitions are imported and their React element trees walked, rather
 * than scraped with a regular expression. A regex over minified JSX output
 * is guessing; walking the tree is reading. It also means a Phosphor upgrade
 * that reshapes an icon is picked up exactly, which is what the drift test
 * in tests/mobile-icons.test.ts relies on.
 *
 * Phosphor draws on a 256x256 grid, unlike Lucide's 24x24, so the viewBox
 * below travels with the paths.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const PHOSPHOR_VIEW_BOX = "0 0 256 256";

/** The weights the web's nav actually uses: active and inactive. */
export const WEIGHTS = ["fill", "regular"];

/**
 * The icons the web's BottomNav draws. Add here, regenerate, commit.
 *
 * Lives in this module rather than in the generator because the test
 * imports it, and importing the generator RUNS it — its `await main()` is
 * top level. The first version of the drift test did exactly that: it
 * regenerated phosphor-paths.ts and then compared the file to itself, so
 * it could not fail. The data moved here so the test can read the list
 * without rewriting the thing it is checking.
 */
export const ICONS = ["House", "Lightning", "Chat"];

function collectPaths(node, out) {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) collectPaths(n, out);
    return out;
  }
  const props = node.props;
  if (props) {
    if (typeof props.d === "string") out.push(props.d);
    if (props.children !== undefined) collectPaths(props.children, out);
  }
  return out;
}

/**
 * `extract("House")` -> `{ fill: ["M..."], regular: ["M..."] }`.
 *
 * Throws rather than returning empty: an icon name that does not resolve, or
 * a weight that yields no path, is a build-time mistake and silently
 * shipping a blank icon is the worse failure.
 */
export async function extract(icon) {
  const file = resolve("node_modules/@phosphor-icons/react/dist/defs", `${icon}.es.js`);
  const mod = await import(pathToFileURL(file).href);
  const defs = mod.default;
  if (!(defs instanceof Map)) {
    throw new Error(`${icon}: expected a Map of weights, got ${Object.prototype.toString.call(defs)}`);
  }

  const out = {};
  for (const weight of WEIGHTS) {
    const node = defs.get(weight);
    if (!node) throw new Error(`${icon}: no "${weight}" weight in the package`);
    const paths = collectPaths(node, []);
    if (paths.length === 0) throw new Error(`${icon}/${weight}: no path data found`);
    out[weight] = paths;
  }
  return out;
}
