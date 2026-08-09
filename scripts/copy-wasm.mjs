#!/usr/bin/env node
// Copies the wllama wasm binary from node_modules into www/vendor so it can
// be bundled inside the APK and loaded with a same-origin relative path at
// runtime (no CDN, no network).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const src = join(root, "node_modules/@wllama/wllama/esm/wasm/wllama.wasm");
const destDir = join(root, "www/vendor");
const dest = join(destDir, "wllama.wasm");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("Copied wllama.wasm ->", dest);
