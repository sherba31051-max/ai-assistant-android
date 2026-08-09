#!/usr/bin/env node
// Downloads the quantized GGUF model weights at BUILD time (in CI or on a
// developer machine) and places them under www/models/model.gguf so they
// get bundled straight into the APK. This is the ONLY place in the whole
// project that talks to the network for the model — nothing on the
// end-user's device ever downloads or streams the model over the internet.
//
// Model: Qwen2.5-0.5B-Instruct, quantized to Q4_K_M (~380 MB).
// Source: https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const MODEL_URL =
  process.env.AI_ASSISTANT_MODEL_URL ||
  "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
const destDir = join(root, "www/models");
const dest = join(destDir, "model.gguf");
// Sanity-check floor: fail loudly instead of silently bundling a truncated
// / HTML-error-page file if the download got interrupted or redirected to
// an error page.
const MIN_EXPECTED_BYTES = 50 * 1024 * 1024; // 50 MB

async function main() {
  mkdirSync(destDir, { recursive: true });

  if (existsSync(dest) && statSync(dest).size > MIN_EXPECTED_BYTES) {
    console.log(`Model already present at ${dest} (${statSync(dest).size} bytes) — skipping download.`);
    return;
  }

  console.log(`Downloading model from ${MODEL_URL} ...`);
  const res = await fetch(MODEL_URL, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download model: HTTP ${res.status} ${res.statusText}`);
  }

  await pipeline(res.body, createWriteStream(dest));

  const size = statSync(dest).size;
  if (size < MIN_EXPECTED_BYTES) {
    unlinkSync(dest);
    throw new Error(`Downloaded model looks too small (${size} bytes) — aborting, likely an error page.`);
  }

  console.log(`Saved model to ${dest} (${(size / (1024 * 1024)).toFixed(1)} MB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
