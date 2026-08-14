#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeAssetManifestSchema } from "../packages/effect-system/src/index.ts";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publicRoot = join(repoRoot, "apps/simulator/public");
const defaultManifestPath = join(publicRoot, "assets/runtime-assets.json");
const manifestArgument = process.argv.indexOf("--manifest");
const manifestPath = manifestArgument < 0 ? defaultManifestPath : resolve(repoRoot, process.argv[manifestArgument + 1] ?? "");
const sourceRoot = join(repoRoot, "apps/simulator/src");
const sourceExtensions = new Set([".css", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

async function staticAssetReferences() {
  const references = new Set();
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/\/assets\/[A-Za-z0-9._/-]+/g)) references.add(match[0]);
  }
  return references;
}

async function distributableAssetPaths(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await distributableAssetPaths(path));
    else if (path !== defaultManifestPath) paths.push(`/${relative(publicRoot, path).split(sep).join("/")}`);
  }
  return paths;
}

async function main() {
  const manifest = runtimeAssetManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const manifestPaths = new Set(manifest.assets.map((asset) => asset.path));
  const references = await staticAssetReferences();
  const distributablePaths = new Set(await distributableAssetPaths(join(publicRoot, "assets")));
  const unmanifested = [...distributablePaths].filter((path) => !manifestPaths.has(path)).sort();
  const errors = [];

  for (const reference of references) {
    if (!manifestPaths.has(reference)) errors.push(`Static reference is missing from manifest: ${reference}`);
  }

  for (const asset of manifest.assets) {
    try {
      const bytes = await readFile(join(publicRoot, asset.path.slice(1)));
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== asset.sha256) errors.push(`SHA-256 mismatch: ${asset.path}`);
    } catch (error) {
      errors.push(`Cannot read ${asset.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const unverified = manifest.assets.filter((asset) => asset.provenanceStatus !== "verified" || asset.licenseStatus !== "verified");
  if (process.argv.includes("--release")) {
    if (unverified.length > 0) errors.push(`${unverified.length} asset(s) have unverified provenance or license status`);
    for (const path of unmanifested) errors.push(`Distributable asset is missing from manifest: ${path}`);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Asset integrity OK: ${manifest.assets.length} files, ${references.size} static references, ${distributablePaths.size} distributable assets.`);
  if (unverified.length > 0) console.warn(`WARNING ${unverified.length} asset(s) remain unverified; release verification will fail.`);
  if (unmanifested.length > 0) console.warn(`WARNING ${unmanifested.length} distributable asset(s) are absent from the manifest; release verification will fail.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
