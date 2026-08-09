// Fully offline code-generation engine.
//
// Given a free-text task description, this module:
//   1. Detects a target language and complexity level (or uses the user's
//      manual override).
//   2. Builds a short execution plan (subtasks).
//   3. Picks a project template for that language.
//   4. Asks the on-device model (the same wllama/Qwen2.5-0.5B instance used
//      by the chat) to generate the core logic for the task.
//   5. Assembles a small multi-file project around that logic.
//
// No network calls happen anywhere in this file. No Adaptive/OpenAI/etc.
// service is used — generation is 100% local, via the model already
// bundled in the APK.
"use strict";

import { zipSync, strToU8 } from "fflate";

export var LANGUAGES = ["javascript", "python", "java", "kotlin", "bash"];
export var COMPLEXITIES = ["simple", "medium", "advanced"];

var LANG_LABELS = {
  javascript: "JavaScript (Node.js)",
  python: "Python",
  java: "Java",
  kotlin: "Kotlin",
  bash: "Bash",
};

var LANG_KEYWORDS = {
  javascript: ["javascript", "js", "node", "npm", "express", "реакт", "react", "фронтенд", "веб-страниц"],
  python: ["python", "питон", "пайтон", "django", "flask", "pandas", "скрипт на python"],
  java: ["java", "джава", "spring", "андроид на java"],
  kotlin: ["kotlin", "котлин", "android", "андроид"],
  bash: ["bash", "shell", "скрипт для linux", "консольная команда", "cron"],
};

var COMPLEXITY_KEYWORDS = {
  simple: ["просто", "простой", "мелк", "быстро", "однострочн", "минимал"],
  advanced: ["сложн", "продвинут", "многофункциональн", "полноценн", "архитектур", "несколько модулей", "с базой данных", "апи и"],
};

export function detectLanguage(taskText) {
  var text = (taskText || "").toLowerCase();
  var best = "python"; // sensible default: quick to read/write for small scripts
  var bestScore = 0;
  LANGUAGES.forEach(function (lang) {
    var score = 0;
    LANG_KEYWORDS[lang].forEach(function (kw) {
      if (text.indexOf(kw) !== -1) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  });
  return best;
}

export function detectComplexity(taskText) {
  var text = (taskText || "").toLowerCase();
  var advancedHits = COMPLEXITY_KEYWORDS.advanced.filter(function (kw) { return text.indexOf(kw) !== -1; }).length;
  var simpleHits = COMPLEXITY_KEYWORDS.simple.filter(function (kw) { return text.indexOf(kw) !== -1; }).length;
  if (advancedHits > 0 || text.length > 400) return "advanced";
  if (simpleHits > 0 || text.length < 80) return "simple";
  return "medium";
}

export function buildPlan(taskText, language, complexity) {
  var steps = [
    "Анализ формулировки задачи",
    "Определение языка: " + LANG_LABELS[language] + " и уровня сложности: " + complexity,
    "Выбор структуры проекта (шаблон + файлы)",
    "Генерация основной логики локальной моделью",
  ];
  if (complexity !== "simple") steps.push("Генерация вспомогательных модулей и обработки ошибок");
  steps.push("Сборка итогового проекта и файлов конфигурации");
  return steps;
}

var TOKENS_BY_COMPLEXITY = { simple: 180, medium: 320, advanced: 480 };

function systemPromptFor(language, complexity) {
  return (
    "Ты — офлайн-движок генерации кода. Пиши только код, без markdown-заборов ``` и без пояснений на естественном языке. " +
    "Целевой язык: " + LANG_LABELS[language] + ". Уровень сложности: " + complexity + ". " +
    "Код должен быть рабочим, самодостаточным, с комментариями на русском внутри кода. " +
    "Не добавляй ничего до или после кода — только сам код одного файла."
  );
}

function stripCodeFences(text) {
  var t = (text || "").trim();
  t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
  return t.trim();
}

// wllamaInstance must already have a model loaded (same instance the chat
// screen uses — ensureModelLoaded() in app.js).
export function generateCoreLogic(wllamaInstance, taskText, language, complexity) {
  var messages = [
    { role: "system", content: systemPromptFor(language, complexity) },
    { role: "user", content: "Задача пользователя: " + taskText },
  ];
  return wllamaInstance
    .createChatCompletion({
      messages: messages,
      nPredict: TOKENS_BY_COMPLEXITY[complexity] || 320,
      sampling: { temp: 0.4, top_p: 0.9 },
    })
    .then(function (result) {
      var raw = (result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) || "";
      return stripCodeFences(raw) || "// Модель не вернула код, повторите попытку.";
    });
}

function mainFileName(language) {
  switch (language) {
    case "javascript": return "src/main.js";
    case "python": return "main.py";
    case "java": return "src/Main.java";
    case "kotlin": return "src/Main.kt";
    case "bash": return "main.sh";
    default: return "main.txt";
  }
}

function scaffoldFiles(language, taskText, coreLogic) {
  var files = [];
  switch (language) {
    case "javascript":
      files.push({ path: "package.json", content: JSON.stringify({ name: "generated-project", version: "1.0.0", type: "module", main: "src/main.js", scripts: { start: "node src/main.js" } }, null, 2) });
      files.push({ path: "src/main.js", content: "// Автогенерация локальным офлайн-движком AI Assistant\n// Задача: " + taskText + "\n\n" + coreLogic + "\n" });
      break;
    case "python":
      files.push({ path: "requirements.txt", content: "# зависимостей не требуется для базовой версии\n" });
      files.push({ path: "main.py", content: "# Автогенерация локальным офлайн-движком AI Assistant\n# Задача: " + taskText + "\n\n" + coreLogic + "\n" });
      break;
    case "java":
      files.push({ path: "src/Main.java", content: "// Автогенерация локальным офлайн-движком AI Assistant\n// Задача: " + taskText + "\n\n" + coreLogic + "\n" });
      break;
    case "kotlin":
      files.push({ path: "src/Main.kt", content: "// Автогенерация локальным офлайн-движком AI Assistant\n// Задача: " + taskText + "\n\n" + coreLogic + "\n" });
      break;
    case "bash":
      files.push({ path: "main.sh", content: "#!/usr/bin/env bash\n# Автогенерация локальным офлайн-движком AI Assistant\n# Задача: " + taskText + "\n\n" + coreLogic + "\n" });
      break;
  }
  files.push({
    path: "README.md",
    content: "# Сгенерированный проект\n\nЗадача:\n\n" + taskText + "\n\nЯзык: " + LANG_LABELS[language] + "\n\nСоздано полностью офлайн локальным движком AI Assistant (без внешних ИИ-сервисов).\n",
  });
  return files;
}

// Full pipeline: detect (or use overrides) -> plan -> generate -> scaffold.
// onPlan(steps) is called once the plan is known, before generation starts.
export function generateProject(wllamaInstance, taskText, overrides, onPlan) {
  overrides = overrides || {};
  var language = overrides.language && LANGUAGES.indexOf(overrides.language) !== -1 ? overrides.language : detectLanguage(taskText);
  var complexity = overrides.complexity && COMPLEXITIES.indexOf(overrides.complexity) !== -1 ? overrides.complexity : detectComplexity(taskText);
  var plan = buildPlan(taskText, language, complexity);
  if (onPlan) onPlan(plan, language, complexity);

  return generateCoreLogic(wllamaInstance, taskText, language, complexity).then(function (coreLogic) {
    var files = scaffoldFiles(language, taskText, coreLogic);
    return { language: language, complexity: complexity, plan: plan, files: files, mainFile: mainFileName(language) };
  });
}

// Builds a zip archive (Uint8Array) from generated files, using fflate —
// pure JS, no native/network dependency, works fully offline.
export function buildZip(files) {
  var entries = {};
  files.forEach(function (f) {
    entries[f.path] = strToU8(f.content);
  });
  return zipSync(entries);
}

export function downloadZip(zipBytes, filename) {
  var blob = new Blob([zipBytes], { type: "application/zip" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename || "generated-project.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
}
