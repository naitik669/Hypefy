/**
 * Asset modules, so a font can be imported rather than required.
 *
 * Metro resolves `import font from "./x.ttf"` to a number — its handle in
 * the asset registry — and TypeScript knows nothing about that. Expo
 * normally supplies this through a generated `expo-env.d.ts`, which is
 * gitignored because it is generated; this file is checked in instead, so
 * the types do not depend on whether anyone has run the generator.
 *
 * `number` rather than `any` because that is what the registry returns, and
 * because `any` here would hide a genuine mistake: passing a font handle
 * where a family NAME is wanted is the commonest way to get a screen
 * rendering in the system face with no error.
 */
declare module "*.ttf" {
  const asset: number;
  export default asset;
}

declare module "*.otf" {
  const asset: number;
  export default asset;
}

declare module "*.png" {
  const asset: number;
  export default asset;
}

declare module "*.webp" {
  const asset: number;
  export default asset;
}
