// Читает весь android-template/ (универсальный WebView-шаблон, в который
// github-push.js встраивает каждый сгенерированный проект) и запекает его
// в один JS-модуль (src/android-template-files.generated.js), который затем
// esbuild включает прямо в www/app.bundle.js.
//
// Так createRepoAndPush() может собрать и запушить полноценный
// Android-проект в новый репозиторий без единого сетевого запроса к
// чему-либо кроме api.github.com в момент пуша — сам шаблон уже "зашит"
// в приложение на этапе сборки, как и модель/wasm.
"use strict";

import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, relative, sep } from "path";
import { fileURLToPath } from "url";

var __dirname = fileURLToPath(new URL(".", import.meta.url));
var TEMPLATE_DIR = join(__dirname, "..", "android-template");
var OUT_FILE = join(__dirname, "..", "src", "android-template-files.generated.js");

// Расширения, которые нужно паковать как base64 (бинарные файлы).
var BINARY_EXT = new Set([".png", ".jar", ".webp", ".jpg", ".jpeg", ".gif", ".ico"]);

function walk(dir, out) {
  readdirSync(dir).forEach(function (name) {
    var full = join(dir, name);
    var st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  });
}

function extOf(path) {
  var i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i).toLowerCase();
}

var allFiles = [];
walk(TEMPLATE_DIR, allFiles);

var entries = allFiles.map(function (full) {
  var relPath = relative(TEMPLATE_DIR, full).split(sep).join("/");
  var isBinary = BINARY_EXT.has(extOf(relPath));
  if (isBinary) {
    return { path: relPath, encoding: "base64", content: readFileSync(full).toString("base64") };
  }
  return { path: relPath, encoding: "utf-8", content: readFileSync(full, "utf8") };
});

// Гарантируем стабильный порядок (не влияет на функциональность, но делает
// диффы предсказуемыми при повторной генерации).
entries.sort(function (a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
});

var banner =
  "// Автоматически сгенерировано scripts/pack-android-template.mjs из android-template/.\n" +
  "// НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ — правьте файлы в android-template/ и запустите `npm run build`.\n";

writeFileSync(
  OUT_FILE,
  banner + "export var TEMPLATE_FILES = " + JSON.stringify(entries, null, 2) + ";\n",
  "utf8"
);

console.log("pack-android-template: запаковано " + entries.length + " файлов -> " + relative(join(__dirname, ".."), OUT_FILE));
