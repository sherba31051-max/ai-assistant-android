// Project generation + GitHub push module.
//
// IMPORTANT (read before touching this file): this module does NOT call any
// cloud AI service. Code generation happens by prompting the very same
// on-device local model (Qwen2.5-0.5B via wllama) that already powers the
// chat screen — see app.js's `wllama` instance, passed in here by the
// caller. The ONLY network requests made anywhere in this module are direct
// calls to api.github.com to commit generated files to a user-chosen
// repository. That is an intentional, explicit exception to this app's
// "zero network requests" design — it is used purely for git operations,
// never for inference/intelligence, and is clearly labelled as such in the
// UI (see the "Создать проект" screen in index.html / app.js).
"use strict";

var GH_SETTINGS_KEY = "ai_assistant_github_settings_v1";

// ---------------------------------------------------------------------
// File format contract for model output:
//
//   ---FILE: path/to/file.ext---
//   <full file content>
//   ---END---
//
// Repeated once per file. Nothing else should appear outside these blocks.
// This is intentionally simple (not JSON) because small local models are
// much more reliable at reproducing a literal delimiter than valid JSON
// with escaped strings.
// ---------------------------------------------------------------------
var FILE_BLOCK_RE = /---FILE:\s*([^\r\n]+?)\s*---\r?\n([\s\S]*?)---END---/g;

var STACK_PRESETS = {
  "html-js": {
    label: "HTML/JS (веб-страница)",
    hint: "простая статичная веб-страница на HTML, CSS и чистом JavaScript, без сборки и фреймворков",
  },
  python: {
    label: "Python (скрипт)",
    hint: "один или несколько .py файлов, запускаемых через `python main.py`, без внешних зависимостей кроме стандартной библиотеки",
  },
  node: {
    label: "Node.js (скрипт)",
    hint: "один или несколько .js файлов для Node.js (CommonJS, require/module.exports), без внешних npm-зависимостей",
  },
};

function getStackPresets() {
  return STACK_PRESETS;
}

function buildProjectPrompt(description, stackKey) {
  var stack = STACK_PRESETS[stackKey] || STACK_PRESETS["html-js"];
  var system =
    "Ты — офлайн-генератор простого кода. Пользователь описывает приложение. " +
    "Стек: " + stack.hint + ". " +
    "Ответь СТРОГО в этом формате, без единого слова до или после него:\n" +
    "---FILE: относительный/путь/файл.ext---\n" +
    "<полное содержимое файла>\n" +
    "---END---\n" +
    "Повтори блок ---FILE:...--- / ---END--- для каждого файла (не больше 4 файлов). " +
    "Делай проект максимально простым и рабочим — это маленькая офлайн-модель, сложность не нужна. " +
    "Не используй markdown-заборы (```) внутри блоков — только чистый код файла.";
  return [
    { role: "system", content: system },
    { role: "user", content: description },
  ];
}

/**
 * @param {string} rawText raw model output
 * @returns {{files: {path: string, content: string}[], error: string|null}}
 */
function parseProjectFiles(rawText) {
  var files = [];
  var text = String(rawText || "");
  var match;
  FILE_BLOCK_RE.lastIndex = 0;
  while ((match = FILE_BLOCK_RE.exec(text)) !== null) {
    var path = match[1].trim().replace(/^\/+/, "");
    var content = match[2].replace(/\r\n/g, "\n");
    // Trim exactly one trailing newline introduced by the delimiter format,
    // keep the rest of the content (including intentional blank lines) intact.
    if (content.endsWith("\n")) content = content.slice(0, -1);
    if (path) files.push({ path: path, content: content });
  }
  if (files.length === 0) {
    return { files: [], error: "Не удалось разобрать ответ модели: не найдено ни одного блока ---FILE:...---END---." };
  }
  return { files: files, error: null };
}

function loadGithubSettings() {
  try {
    var raw = localStorage.getItem(GH_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* ignore */
  }
  return { token: "", owner: "", repo: "", branch: "main" };
}

function saveGithubSettings(settings) {
  try {
    localStorage.setItem(
      GH_SETTINGS_KEY,
      JSON.stringify({
        token: settings.token || "",
        owner: settings.owner || "",
        repo: settings.repo || "",
        branch: settings.branch || "main",
      })
    );
  } catch (e) {
    /* storage unavailable — settings just won't persist */
  }
}

// UTF-8 safe base64 encoding (btoa alone only handles Latin1).
function utf8ToBase64(str) {
  var utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p1) {
    return String.fromCharCode(parseInt(p1, 16));
  });
  return btoa(utf8);
}

function githubApiUrl(owner, repo, path) {
  var encodedPath = path
    .split("/")
    .map(function (seg) { return encodeURIComponent(seg); })
    .join("/");
  return "https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/contents/" + encodedPath;
}

function githubHeaders(token) {
  return {
    Authorization: "token " + token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

function getExistingFileSha(cfg, path) {
  var url = githubApiUrl(cfg.owner, cfg.repo, path) + "?ref=" + encodeURIComponent(cfg.branch);
  return fetch(url, { method: "GET", headers: githubHeaders(cfg.token) }).then(function (res) {
    if (res.status === 404) return null;
    if (!res.ok) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        throw new Error("GitHub GET " + res.status + ": " + (body && body.message ? body.message : res.statusText));
      });
    }
    return res.json().then(function (body) { return body.sha || null; });
  });
}

function putFile(cfg, file, sha) {
  var url = githubApiUrl(cfg.owner, cfg.repo, file.path);
  var body = {
    message: "Add/update " + file.path + " (сгенерировано локальной моделью в AI Assistant)",
    content: utf8ToBase64(file.content),
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  return fetch(url, { method: "PUT", headers: githubHeaders(cfg.token), body: JSON.stringify(body) }).then(function (res) {
    if (!res.ok) {
      return res.json().catch(function () { return {}; }).then(function (respBody) {
        throw new Error("GitHub PUT " + res.status + ": " + (respBody && respBody.message ? respBody.message : res.statusText));
      });
    }
    return res.json();
  });
}

/**
 * Pushes each generated file to GitHub via the Contents API, sequentially.
 * Calls onFileStatus(path, status, detail) for each file as it starts/finishes,
 * where status is "pushing" | "done" | "error".
 * @returns {Promise<{path:string, ok:boolean, error?:string}[]>}
 */
function pushFilesToGithub(cfg, files, onFileStatus) {
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    return Promise.reject(new Error("Заполните GitHub токен, owner и repo в настройках."));
  }
  var results = [];
  var chain = Promise.resolve();
  files.forEach(function (file) {
    chain = chain.then(function () {
      if (onFileStatus) onFileStatus(file.path, "pushing", null);
      return getExistingFileSha(cfg, file.path)
        .then(function (sha) { return putFile(cfg, file, sha); })
        .then(function () {
          if (onFileStatus) onFileStatus(file.path, "done", null);
          results.push({ path: file.path, ok: true });
        })
        .catch(function (err) {
          var detail = err && err.message ? err.message : String(err);
          if (onFileStatus) onFileStatus(file.path, "error", detail);
          results.push({ path: file.path, ok: false, error: detail });
        });
    });
  });
  return chain.then(function () { return results; });
}

export {
  getStackPresets,
  buildProjectPrompt,
  parseProjectFiles,
  loadGithubSettings,
  saveGithubSettings,
  pushFilesToGithub,
};
