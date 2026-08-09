// Создание нового GitHub-репозитория и загрузка в него:
//   1) универсального Android WebView-шаблона (android-template/, запечён в
//      TEMPLATE_FILES при сборке — см. scripts/pack-android-template.mjs),
//      с подставленными названием/README/appId под конкретный проект;
//   2) его GitHub Actions workflow для автосборки APK (входит в TEMPLATE_FILES,
//      .github/workflows/build-apk.yml);
//   3) исходников, сгенерированных офлайн-движком (codegen-engine.js), —
//      под source/ в корне репозитория, для прямого просмотра на GitHub.
//
// Все файлы пушатся ОДНИМ коммитом через Git Data API (blobs → tree →
// commit → ref), а не по одному PUT на файл — иначе push каждого из ~60
// файлов шаблона запускал бы отдельный GitHub Actions run.
//
// Использует только официальный GitHub REST API (api.github.com), с
// токеном, полученным через существующий Device Flow логин
// (github-auth.js, скоуп "repo"). Ничего не идёт ни на какой другой
// сервер — тот же принцип "сеть только к github.com и только по
// явному действию пользователя", что и у логина.
"use strict";

import { TEMPLATE_FILES } from "./android-template-files.generated.js";

var API = "https://api.github.com";

function ghRequest(url, token, options) {
  options = options || {};
  var headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  Object.keys(options.headers || {}).forEach(function (k) {
    headers[k] = options.headers[k];
  });
  return fetch(url, {
    method: options.method || "GET",
    headers: headers,
    body: options.body,
  }).then(function (res) {
    return res
      .json()
      .catch(function () {
        return {};
      })
      .then(function (body) {
        if (!res.ok) {
          var msg = (body && (body.message || body.error)) || "HTTP " + res.status;
          throw new Error(msg);
        }
        return body;
      });
  });
}

// Имя репозитория должно быть уникальным в рамках аккаунта — добавляем
// короткий суффикс из времени создания, чтобы повторные генерации с тем
// же слагом не конфликтовали с уже существующими репозиториями.
function uniqueRepoName(slug) {
  var base = (slug || "project").replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  var suffix = Date.now().toString(36).slice(-5);
  return (base + "-" + suffix).slice(0, 90);
}

// Android applicationId должен быть уникален на устройстве — иначе
// два сгенерированных приложения нельзя установить одновременно.
// Физический Java-пакет (namespace) у всех генерируемых приложений
// остаётся одним и тем же (ai.adaptive.generated) — меняется только
// applicationId в build.gradle/capacitor.config.json.
function appIdSuffix(slug) {
  var s = (slug || "app").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) s = "app";
  if (/^[0-9]/.test(s)) s = "g" + s;
  return s.slice(0, 40);
}

function escapeXml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findReadme(files) {
  var f = (files || []).find(function (f) {
    return /(^|\/)README\.md$/i.test(f.path);
  });
  return f ? f.content : null;
}

/**
 * Собирает список файлов, которые нужно запушить в новый репозиторий:
 * шаблон-обёртка (с подстановкой title/appId/README/project-data.js) +
 * исходники сгенерированного проекта под source/.
 */
function buildFileSet(meta, files) {
  var appId = "ai.adaptive.generated." + appIdSuffix(meta.slug);
  var readme = findReadme(files) || "# " + meta.title;
  var projectData = { title: meta.title, readme: readme, files: files };
  var projectDataJs = "window.PROJECT_DATA = " + JSON.stringify(projectData, null, 2) + ";\n";

  var wrapperFiles = TEMPLATE_FILES.map(function (tf) {
    var path = tf.path;
    var content = tf.content;
    var encoding = tf.encoding;

    if (path === "www/project-data.js") {
      content = projectDataJs;
      encoding = "utf-8";
    } else if (path === "capacitor.config.json") {
      content =
        JSON.stringify(
          {
            appId: appId,
            appName: meta.title,
            webDir: "www",
            server: { androidScheme: "https" },
            android: { allowMixedContent: false },
          },
          null,
          2
        ) + "\n";
      encoding = "utf-8";
    } else if (path === "android/app/src/main/res/values/strings.xml") {
      content =
        "<?xml version='1.0' encoding='utf-8'?>\n" +
        "<resources>\n" +
        '    <string name="app_name">' + escapeXml(meta.title) + "</string>\n" +
        '    <string name="title_activity_main">' + escapeXml(meta.title) + "</string>\n" +
        '    <string name="package_name">' + appId + "</string>\n" +
        '    <string name="custom_url_scheme">' + appId + "</string>\n" +
        "</resources>\n";
      encoding = "utf-8";
    } else if (path === "android/app/build.gradle") {
      content = content.replace('applicationId "ai.adaptive.generated"', 'applicationId "' + appId + '"');
    } else if (path === "package.json") {
      try {
        var pkg = JSON.parse(content);
        pkg.name = meta.slug || pkg.name;
        pkg.description = (meta.title || "Generated App") + " — Android app, сгенерировано локально в AI Assistant";
        content = JSON.stringify(pkg, null, 2) + "\n";
      } catch (e) {
        /* оставляем как есть, если не распарсилось */
      }
    } else if (path === "README.md") {
      content =
        "# " + meta.title + "\n\n" +
        "Android-приложение (WebView-обёртка с просмотром README и файлов проекта), " +
        "сгенерировано локально в AI Assistant, офлайн-движком.\n\n" +
        "APK собирается автоматически через GitHub Actions при каждом push — смотрите вкладки " +
        "**Actions** (артефакт `generated-app-debug-apk`) или **Releases** (готовый `.apk`) этого " +
        "репозитория через несколько минут.\n\n" +
        "Исходники сгенерированного проекта лежат в [`source/`](./source).\n\n" +
        "---\n\n" +
        readme +
        "\n";
    }

    return { path: path, content: content, encoding: encoding };
  });

  var sourceFiles = (files || []).map(function (f) {
    return { path: "source/" + f.path, content: f.content, encoding: "utf-8" };
  });

  return wrapperFiles.concat(sourceFiles);
}

// GitHub отказывается создавать blobs через Git Data API в репозитории,
// где вообще ещё нет ни одного коммита ("Git Repository is empty", 409) —
// даже если blobs формально не привязаны к какой-либо ветке. Поэтому перед
// использованием Git Data API репозиторий нужно "бутстрапнуть" одним
// маленьким коммитом через Contents API (единственный API, который умеет
// создавать самый первый коммит в пустом репо). Сообщение коммита содержит
// "[skip ci]" — GitHub Actions распознаёт эту метку и не запускает workflow
// на этот push, так что лишней (и обречённой на провал — там нет ни
// android/, ни www/) сборки не происходит.
function bootstrapRepo(token, owner, repo) {
  return ghRequest(API + "/repos/" + owner + "/" + repo + "/contents/.gitkeep", token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "chore: bootstrap repository [skip ci]",
      content: "",
    }),
  });
}

// Пушит произвольный набор файлов ОДНИМ коммитом (поверх текущего HEAD
// ветки main) через Git Data API: blobs → tree (base_tree = дерево
// текущего HEAD) → commit (parent = текущий HEAD) → обновление ref
// refs/heads/main. Требует, чтобы в репозитории уже был хотя бы один
// коммит (см. bootstrapRepo выше).
function pushAllFilesAsSingleCommit(token, owner, repo, allFiles, report) {
  report("Готовлю файлы (" + allFiles.length + ")...");

  var parentSha, baseTreeSha;
  var prep = ghRequest(API + "/repos/" + owner + "/" + repo + "/git/ref/heads/main", token)
    .then(function (ref) {
      parentSha = ref.object.sha;
      return ghRequest(API + "/repos/" + owner + "/" + repo + "/git/commits/" + parentSha, token);
    })
    .then(function (parentCommit) {
      baseTreeSha = parentCommit.tree.sha;
    });

  // Создаём blobs с ограниченной параллельностью, чтобы не упереться в
  // абузивные лимиты GitHub на конкурентные запросы.
  var CONCURRENCY = 6;
  var results = new Array(allFiles.length);
  var next = 0;
  var created = 0;

  function worker() {
    if (next >= allFiles.length) return Promise.resolve();
    var i = next++;
    var f = allFiles[i];
    return ghRequest(API + "/repos/" + owner + "/" + repo + "/git/blobs", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: f.content,
        encoding: f.encoding === "base64" ? "base64" : "utf-8",
      }),
    }).then(function (blob) {
      results[i] = { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
      created++;
      report("Загружаю файлы... (" + created + "/" + allFiles.length + ")");
      return worker();
    });
  }

  var workers = [];
  for (var w = 0; w < CONCURRENCY; w++) workers.push(prep.then(worker));

  return Promise.all(workers)
    .then(function () {
      report("Создаю дерево коммита...");
      return ghRequest(API + "/repos/" + owner + "/" + repo + "/git/trees", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: results }),
      });
    })
    .then(function (tree) {
      report("Создаю коммит...");
      return ghRequest(API + "/repos/" + owner + "/" + repo + "/git/commits", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "feat: add generated Android app (WebView wrapper + build workflow + sources)",
          tree: tree.sha,
          parents: [parentSha],
        }),
      });
    })
    .then(function (commit) {
      report("Публикую ветку main...");
      return ghRequest(API + "/repos/" + owner + "/" + repo + "/git/refs/heads/main", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commit.sha }),
      }).then(function () {
        return commit.sha;
      });
    });
}

/**
 * Создаёт новый публичный репозиторий на аккаунте пользователя и одним
 * коммитом загружает в него: Android WebView-обёртку (с встроенным
 * просмотрщиком README/файлов), её workflow автосборки APK, и исходники
 * сгенерированного проекта.
 *
 * @param {string} token OAuth-токен пользователя (scope: repo)
 * @param {{title: string, slug: string, raw: string}} meta
 * @param {{path: string, content: string}[]} files
 * @param {(status: string) => void} [onProgress]
 * @returns {Promise<{owner: string, name: string, repoUrl: string, actionsUrl: string, releasesUrl: string, defaultBranch: string}>}
 */
export function createRepoAndPush(token, meta, files, onProgress) {
  function report(status) {
    if (onProgress) onProgress(status);
  }

  var repoName = uniqueRepoName(meta.slug);
  report("Создаю репозиторий " + repoName + " на GitHub...");

  return ghRequest(API + "/user/repos", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: repoName,
      description: ((meta.title || "Проект") + " — Android-приложение, сгенерировано локально в AI Assistant, офлайн-движком").slice(0, 350),
      private: false,
      auto_init: false,
    }),
  }).then(function (repo) {
    var owner = repo.owner && repo.owner.login;
    var allFiles = buildFileSet(meta, files);

    report("Инициализирую репозиторий...");
    return bootstrapRepo(token, owner, repoName)
      .then(function () {
        return pushAllFilesAsSingleCommit(token, owner, repoName, allFiles, report);
      })
      .then(function () {
        report("Готово, репозиторий опубликован...");
        return {
          owner: owner,
          name: repoName,
          repoUrl: repo.html_url,
          defaultBranch: "main",
          actionsUrl: repo.html_url + "/actions",
          releasesUrl: repo.html_url + "/releases",
          zipUrl: repo.html_url + "/archive/refs/heads/main.zip",
        };
      });
  });
}

/**
 * Возвращает последний GitHub Actions run для репозитория (или null,
 * если ещё ни один не запустился) — используется чат-UI для показа
 * живого статуса сборки APK.
 */
export function getLatestWorkflowRun(token, owner, repo) {
  return ghRequest(API + "/repos/" + owner + "/" + repo + "/actions/runs?per_page=1", token).then(function (data) {
    return (data && data.workflow_runs && data.workflow_runs[0]) || null;
  });
}

/**
 * Возвращает последний GitHub Release репозитория (или null) — как
 * только сборка публикует релиз с .apk, отсюда достаётся прямая ссылка
 * на скачивание файла.
 */
export function getLatestRelease(token, owner, repo) {
  return ghRequest(API + "/repos/" + owner + "/" + repo + "/releases?per_page=1", token)
    .then(function (data) {
      return (Array.isArray(data) && data[0]) || null;
    })
    .catch(function () {
      return null;
    });
}
