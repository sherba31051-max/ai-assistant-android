// AI Assistant — fully local chat logic.
//
// This module runs a small instruction-tuned LLM (Qwen2.5-0.5B-Instruct,
// GGUF/Q4_K_M) entirely on-device via wllama (a WebAssembly build of
// llama.cpp). The model weights and the wasm binary are bundled inside the
// APK at build time (see .github/workflows/build-apk.yml and
// scripts/fetch-assets.mjs) — there is NO server, NO API key, and NO network
// request of any kind made at runtime. Once the APK is installed, the app
// works fully offline (airplane mode included).
"use strict";

import { Wllama } from "@wllama/wllama";
import {
  getStackPresets,
  buildProjectPrompt,
  parseProjectFiles,
  loadGithubSettings,
  saveGithubSettings,
  pushFilesToGithub,
} from "./projectGen.js";

var STORAGE_KEY = "ai_assistant_local_memory_v1";
var PROFILE_KEY = "ai_assistant_profile_v1";
var MODEL_URL = "models/model.gguf"; // bundled asset, relative to www/
var WASM_URL = "vendor/wllama.wasm"; // bundled asset, relative to www/
var N_CTX = 2048;
var MAX_NEW_TOKENS = 256;

var messagesEl = document.getElementById("messages");
var inputEl = document.getElementById("textInput");
var sendBtn = document.getElementById("sendBtn");
var clearBtn = document.getElementById("clearBtn");
var statusLine = document.getElementById("statusLine");
var lessonsBtn = document.getElementById("lessonsBtn");

/** @type {{role: "user"|"assistant", content: string}[]} */
var history = [];
/** @type {string[]} facts the user has stated about themselves */
var profile = [];

/** @type {Wllama|null} */
var wllama = null;
var modelReady = false;
var modelLoading = false;

function loadHistory() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) history = JSON.parse(raw);
  } catch (e) {
    history = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    /* storage full or unavailable — ignore, memory just won't persist */
  }
}

function loadProfile() {
  try {
    var raw = localStorage.getItem(PROFILE_KEY);
    if (raw) profile = JSON.parse(raw);
  } catch (e) {
    profile = [];
  }
}

function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    /* ignore */
  }
}

// Very simple heuristic long-term memory: look for a few common
// self-descriptive Russian phrases and remember them as short facts.
// No model call involved here — this must be 100% reliable and instant.
function extractFacts(text) {
  var patterns = [
    { re: /меня зовут ([^.,!\n]{2,40})/i, tpl: function (m) { return "Имя пользователя: " + m[1].trim() + "."; } },
    { re: /я работаю ([^.,!\n]{2,60})/i, tpl: function (m) { return "Пользователь работает: " + m[1].trim() + "."; } },
    { re: /я живу в ([^.,!\n]{2,40})/i, tpl: function (m) { return "Пользователь живёт в: " + m[1].trim() + "."; } },
    { re: /мне (\d{1,3}) лет/i, tpl: function (m) { return "Возраст пользователя: " + m[1] + " лет."; } },
  ];
  var found = [];
  patterns.forEach(function (p) {
    var m = text.match(p.re);
    if (m) found.push(p.tpl(m));
  });
  if (found.length) {
    found.forEach(function (fact) {
      if (profile.indexOf(fact) === -1) profile.push(fact);
    });
    if (profile.length > 20) profile = profile.slice(-20);
    saveProfile();
  }
}

function renderAll() {
  messagesEl.innerHTML = "";
  if (history.length === 0) {
    var hint = document.createElement("div");
    hint.className = "empty-hint";
    hint.textContent =
      "Это ваш личный ИИ-ассистент. Модель работает полностью на устройстве, " +
      "без интернета и без аккаунта. Напишите что-нибудь, чтобы начать.";
    messagesEl.appendChild(hint);
    return;
  }
  history.forEach(function (m) {
    appendBubble(m.role === "user" ? "user" : "ai", m.content);
  });
  scrollToBottom();
}

function appendBubble(kind, text) {
  var div = document.createElement("div");
  div.className = "msg " + kind;
  div.textContent = text;
  messagesEl.appendChild(div);
  return div;
}

function scrollToBottom() {
  requestAnimationFrame(function () {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
}

function setBusy(busy, label) {
  sendBtn.disabled = busy;
  inputEl.disabled = busy;
  statusLine.textContent = label || (busy ? "печатает..." : "локальная модель · офлайн · память на устройстве");
}

// Lazily initialize wllama + load the bundled model on first use. Shows
// download/load progress in the status line. Runs only once per app
// session (subsequent calls resolve immediately).
function ensureModelLoaded() {
  if (modelReady) return Promise.resolve();
  if (modelLoading) return modelLoading;

  setBusy(true, "загрузка локальной модели...");
  wllama = new Wllama({ default: WASM_URL });

  modelLoading = wllama
    .loadModelFromUrl(MODEL_URL, {
      n_ctx: N_CTX,
      progressCallback: function (progress) {
        var pct = progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : null;
        setBusy(true, pct !== null ? "загрузка модели: " + pct + "%" : "загрузка модели...");
      },
    })
    .then(function () {
      modelReady = true;
      setBusy(false);
    })
    .catch(function (err) {
      modelLoading = null;
      throw err;
    });

  return modelLoading;
}

function buildMessages(userText) {
  var CONTEXT_WINDOW = 6; // keep prompt short: bigger context = slower on-device inference
  var recent = history.slice(-CONTEXT_WINDOW);
  var systemParts = [
    "Ты — дружелюбный ИИ-ассистент, который отвечает кратко и по-русски.",
    "Ты — маленькая модель (0.5B параметров), работающая полностью локально на устройстве, без интернета. " +
      "Ты НЕ умеешь и не должна обещать: собирать APK/exe/установочные файлы, компилировать программы, " +
      "выполнять код или иметь доступ к интернету/файловой системе устройства во время диалога. " +
      "Если пользователь просит создать приложение, программу или файл (в том числе апк) — " +
      "честно объясни это ограничение в одном предложении и посоветуй открыть раздел «Создать проект» " +
      "(кнопка в верхней панели): там ты можешь сгенерировать простой код (HTML/JS, Python или Node.js) " +
      "и пользователь сам отправит его в свой GitHub-репозиторий одной кнопкой.",
  ];
  if (profile.length) {
    systemParts.push("Что ты знаешь о пользователе: " + profile.join(" "));
  }
  var messages = [{ role: "system", content: systemParts.join(" ") }];
  recent.forEach(function (m) {
    messages.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
  });
  messages.push({ role: "user", content: userText });
  return messages;
}

function sendMessage() {
  var text = inputEl.value.trim();
  if (!text) return;

  extractFacts(text);

  history.push({ role: "user", content: text });
  saveHistory();
  renderAll();

  inputEl.value = "";
  autoGrow();

  var typingBubble = appendBubble("typing", "печатает...");
  scrollToBottom();

  ensureModelLoaded()
    .then(function () {
      setBusy(true, "печатает...");
      return wllama.createChatCompletion({
        messages: buildMessages(text),
        nPredict: MAX_NEW_TOKENS,
        sampling: { temp: 0.7, top_p: 0.9 },
      });
    })
    .then(function (result) {
      typingBubble.remove();
      var clean = ((result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) || "").trim() || "(пустой ответ)";
      history.push({ role: "assistant", content: clean });
      saveHistory();
      renderAll();
    })
    .catch(function (err) {
      typingBubble.remove();
      var msg = "Не удалось получить ответ от локальной модели: " + (err && err.message ? err.message : "неизвестная ошибка");
      var bubble = appendBubble("error", msg);
      var retryBtn = document.createElement("button");
      retryBtn.className = "retry-btn";
      retryBtn.textContent = "Повторить";
      retryBtn.addEventListener("click", function () {
        bubble.remove();
        inputEl.value = text;
        sendMessage();
      });
      bubble.appendChild(document.createElement("br"));
      bubble.appendChild(retryBtn);
      scrollToBottom();
    })
    .finally(function () {
      setBusy(false);
      inputEl.focus();
    });
}

sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
inputEl.addEventListener("input", autoGrow);

clearBtn.addEventListener("click", function () {
  if (!confirm("Очистить всю историю переписки?")) return;
  history = [];
  saveHistory();
  renderAll();
});

loadHistory();
loadProfile();
renderAll();

// Kick off model loading in the background right away so the first message
// doesn't have to wait for the full download/init from a cold start.
ensureModelLoaded().catch(function (err) {
  statusLine.textContent = "не удалось загрузить модель: " + (err && err.message ? err.message : "ошибка");
});

// ---------------------------------------------------------------------
// Programming lessons screen — fully static/offline content from
// lessons.js. No model calls involved here.
// ---------------------------------------------------------------------
var lessonsScreen = document.getElementById("lessonsScreen");
var lessonsBackBtn = document.getElementById("lessonsBackBtn");
var lessonsTitle = document.getElementById("lessonsTitle");
var langListEl = document.getElementById("langList");
var lessonListEl = document.getElementById("lessonList");
var lessonDetailEl = document.getElementById("lessonDetail");
var LESSONS = window.AI_ASSISTANT_LESSONS || {};

var lessonsView = "langs"; // "langs" | "lessons" | "detail"
var currentLang = null;
var currentLessonIdx = null;

function renderLangList() {
  langListEl.innerHTML = "";
  Object.keys(LESSONS).forEach(function (lang) {
    var card = document.createElement("div");
    card.className = "lang-card";
    card.innerHTML =
      '<div class="lang-name">' + lang + "</div>" +
      '<div class="lang-count">' + LESSONS[lang].length + " урок(ов)</div>";
    card.addEventListener("click", function () {
      currentLang = lang;
      lessonsView = "lessons";
      renderLessonsView();
    });
    langListEl.appendChild(card);
  });
}

function renderLessonList() {
  lessonListEl.innerHTML = "";
  var lessons = LESSONS[currentLang] || [];
  lessons.forEach(function (lesson, idx) {
    var row = document.createElement("div");
    row.className = "lang-card";
    row.innerHTML =
      '<div class="lesson-row"><span>' + (idx + 1) + ". " + lesson.title + '</span><span class="arrow">›</span></div>';
    row.addEventListener("click", function () {
      currentLessonIdx = idx;
      lessonsView = "detail";
      renderLessonsView();
    });
    lessonListEl.appendChild(row);
  });
}

function renderLessonDetail() {
  var lesson = (LESSONS[currentLang] || [])[currentLessonIdx];
  if (!lesson) {
    lessonDetailEl.innerHTML = "";
    return;
  }
  lessonDetailEl.innerHTML =
    "<h3>" + lesson.title + "</h3>" +
    "<p>" + lesson.explanation + "</p>" +
    "<pre></pre>" +
    '<div class="quiz-box">' +
    '  <div class="quiz-q">Вопрос: ' + lesson.quiz.q + "</div>" +
    '  <button id="showAnswerBtn">Показать ответ</button>' +
    '  <div class="quiz-a" id="quizAnswer">' + lesson.quiz.a + "</div>" +
    "</div>";
  lessonDetailEl.querySelector("pre").textContent = lesson.code;
  var showBtn = document.getElementById("showAnswerBtn");
  var answerEl = document.getElementById("quizAnswer");
  showBtn.addEventListener("click", function () {
    answerEl.classList.toggle("shown");
  });
}

function renderLessonsView() {
  langListEl.classList.remove("open");
  lessonListEl.classList.remove("open");
  lessonDetailEl.classList.remove("open");
  if (lessonsView === "langs") {
    lessonsTitle.textContent = "Обучение языкам программирования";
    langListEl.classList.add("open");
    renderLangList();
  } else if (lessonsView === "lessons") {
    lessonsTitle.textContent = currentLang;
    lessonListEl.classList.add("open");
    renderLessonList();
  } else {
    lessonsTitle.textContent = currentLang;
    lessonDetailEl.classList.add("open");
    renderLessonDetail();
  }
}

lessonsBtn.addEventListener("click", function () {
  lessonsView = "langs";
  currentLang = null;
  currentLessonIdx = null;
  renderLessonsView();
  lessonsScreen.classList.add("open");
});

lessonsBackBtn.addEventListener("click", function () {
  if (lessonsView === "detail") {
    lessonsView = "lessons";
    renderLessonsView();
  } else if (lessonsView === "lessons") {
    lessonsView = "langs";
    currentLang = null;
    renderLessonsView();
  } else {
    lessonsScreen.classList.remove("open");
  }
});

// ---------------------------------------------------------------------
// "Создать проект" screen — generates a small multi-file project with the
// SAME on-device model used for chat (no cloud AI involved), then lets the
// user push the generated files straight to a GitHub repo of their choice.
// The GitHub Contents API calls below are the one deliberate exception to
// this app's "zero network requests" design; they carry no model output
// intelligence, only already-generated file contents, and only run when the
// user explicitly taps "Отправить в GitHub".
// ---------------------------------------------------------------------
var projectBtn = document.getElementById("projectBtn");
var projectScreen = document.getElementById("projectScreen");
var projectBackBtn = document.getElementById("projectBackBtn");
var descriptionInput = document.getElementById("projectDescription");
var stackSelect = document.getElementById("stackSelect");
var generateBtn = document.getElementById("generateBtn");
var generateStatusEl = document.getElementById("generateStatus");
var filesPreviewEl = document.getElementById("filesPreview");
var pushBtn = document.getElementById("pushBtn");
var pushStatusEl = document.getElementById("pushStatus");
var ghTokenInput = document.getElementById("ghToken");
var ghOwnerInput = document.getElementById("ghOwner");
var ghRepoInput = document.getElementById("ghRepo");
var ghBranchInput = document.getElementById("ghBranch");

var generatedFiles = [];

function renderStackOptions() {
  var presets = getStackPresets();
  stackSelect.innerHTML = "";
  Object.keys(presets).forEach(function (key) {
    var opt = document.createElement("option");
    opt.value = key;
    opt.textContent = presets[key].label;
    stackSelect.appendChild(opt);
  });
}

function loadGhSettingsIntoForm() {
  var s = loadGithubSettings();
  ghTokenInput.value = s.token || "";
  ghOwnerInput.value = s.owner || "";
  ghRepoInput.value = s.repo || "";
  ghBranchInput.value = s.branch || "main";
}

function saveGhSettingsFromForm() {
  saveGithubSettings({
    token: ghTokenInput.value.trim(),
    owner: ghOwnerInput.value.trim(),
    repo: ghRepoInput.value.trim(),
    branch: ghBranchInput.value.trim() || "main",
  });
}

function renderFilesPreview(files) {
  filesPreviewEl.innerHTML = "";
  if (!files.length) return;
  files.forEach(function (f) {
    var block = document.createElement("div");
    block.className = "file-block";
    var header = document.createElement("div");
    header.className = "file-block-header";
    header.textContent = f.path;
    var pre = document.createElement("pre");
    pre.textContent = f.content;
    block.appendChild(header);
    block.appendChild(pre);
    filesPreviewEl.appendChild(block);
  });
}

function renderPushStatus(lines) {
  pushStatusEl.innerHTML = "";
  lines.forEach(function (line) {
    var row = document.createElement("div");
    row.className = "push-row push-" + line.status;
    row.textContent = line.text;
    pushStatusEl.appendChild(row);
  });
}

renderStackOptions();
loadGhSettingsIntoForm();

projectBtn.addEventListener("click", function () {
  projectScreen.classList.add("open");
});

projectBackBtn.addEventListener("click", function () {
  projectScreen.classList.remove("open");
});

generateBtn.addEventListener("click", function () {
  var description = descriptionInput.value.trim();
  if (!description) {
    generateStatusEl.textContent = "Опишите, какое приложение сгенерировать.";
    return;
  }
  var stackKey = stackSelect.value;
  generateBtn.disabled = true;
  generateStatusEl.textContent = "загрузка локальной модели...";
  filesPreviewEl.innerHTML = "";
  pushStatusEl.innerHTML = "";
  generatedFiles = [];

  ensureModelLoaded()
    .then(function () {
      generateStatusEl.textContent = "генерирую проект локальной моделью (может занять минуту)...";
      return wllama.createChatCompletion({
        messages: buildProjectPrompt(description, stackKey),
        nPredict: 700,
        sampling: { temp: 0.4, top_p: 0.9 },
      });
    })
    .then(function (result) {
      var raw = (result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) || "";
      var parsed = parseProjectFiles(raw);
      if (parsed.error) {
        generateStatusEl.textContent = parsed.error + " Попробуйте упростить описание и повторить.";
        var rawBlock = document.createElement("pre");
        rawBlock.className = "raw-fallback";
        rawBlock.textContent = raw;
        filesPreviewEl.appendChild(rawBlock);
        return;
      }
      generatedFiles = parsed.files;
      generateStatusEl.textContent = "Готово: сгенерировано файлов — " + generatedFiles.length + ". Проверьте код ниже перед отправкой.";
      renderFilesPreview(generatedFiles);
    })
    .catch(function (err) {
      generateStatusEl.textContent = "Ошибка генерации: " + (err && err.message ? err.message : "неизвестная ошибка");
    })
    .finally(function () {
      generateBtn.disabled = false;
    });
});

pushBtn.addEventListener("click", function () {
  saveGhSettingsFromForm();
  var cfg = loadGithubSettings();
  if (!generatedFiles.length) {
    renderPushStatus([{ status: "error", text: "Сначала сгенерируйте проект." }]);
    return;
  }
  pushBtn.disabled = true;
  var lines = generatedFiles.map(function (f) { return { path: f.path, status: "pending", text: f.path + " — в очереди" }; });
  renderPushStatus(lines);

  pushFilesToGithub(cfg, generatedFiles, function (path, status, detail) {
    var line = lines.find(function (l) { return l.path === path; });
    if (!line) return;
    if (status === "pushing") {
      line.status = "pending";
      line.text = path + " — отправка...";
    } else if (status === "done") {
      line.status = "done";
      line.text = path + " — ✓ отправлено";
    } else if (status === "error") {
      line.status = "error";
      line.text = path + " — ✗ ошибка: " + detail;
    }
    renderPushStatus(lines);
  })
    .catch(function (err) {
      renderPushStatus([{ status: "error", text: "Не удалось отправить: " + (err && err.message ? err.message : String(err)) }]);
    })
    .finally(function () {
      pushBtn.disabled = false;
    });
});
