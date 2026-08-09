// Создание нового GitHub-репозитория и загрузка в него сгенерированного
// офлайн-движком (codegen-engine.js) проекта, прямо из окна чата.
//
// Использует только официальный GitHub REST API (api.github.com), с
// токеном, полученным через существующий Device Flow логин
// (github-auth.js, скоуп "repo"). Ничего не идёт ни на какой другой
// сервер — тот же принцип "сеть только к github.com и только по
// явному действию пользователя", что и у логина.
//
// После создания репозитория и пуша файлов возвращается готовая публичная
// ссылка на скачивание архива всего проекта — используется встроенная
// возможность GitHub отдавать zip-архив любой ветки без какой-либо
// дополнительной сборки:
//   https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip
"use strict";

var API = "https://api.github.com";

function b64EncodeUnicode(str) {
  // btoa требует "latin1"-строку, поэтому сначала кодируем как UTF-8.
  return btoa(unescape(encodeURIComponent(str)));
}

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

function encodePath(path) {
  return path
    .split("/")
    .map(function (part) {
      return encodeURIComponent(part);
    })
    .join("/");
}

/**
 * Создаёт новый публичный репозиторий на аккаунте пользователя и
 * загружает в него все файлы сгенерированного проекта, по одному
 * коммиту на файл (через Contents API — не требует git на устройстве).
 *
 * @param {string} token OAuth-токен пользователя (scope: repo)
 * @param {{title: string, slug: string, raw: string}} meta
 * @param {{path: string, content: string}[]} files
 * @param {(status: string) => void} [onProgress]
 * @returns {Promise<{owner: string, name: string, repoUrl: string, zipUrl: string}>}
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
      description: ((meta.title || "Проект") + " — сгенерировано локально в AI Assistant, офлайн-движком").slice(0, 350),
      private: false,
      auto_init: false,
    }),
  }).then(function (repo) {
    var owner = repo.owner && repo.owner.login;

    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        report("Загружаю " + f.path + "...");
        return ghRequest(API + "/repos/" + owner + "/" + repoName + "/contents/" + encodePath(f.path), token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "feat: add " + f.path,
            content: b64EncodeUnicode(f.content),
          }),
        });
      });
    });

    return chain.then(function () {
      report("Готовлю ссылку на скачивание...");
      return ghRequest(API + "/repos/" + owner + "/" + repoName, token).then(function (full) {
        var branch = full.default_branch || "main";
        return {
          owner: owner,
          name: repoName,
          repoUrl: full.html_url,
          zipUrl: "https://github.com/" + owner + "/" + repoName + "/archive/refs/heads/" + branch + ".zip",
        };
      });
    });
  });
}
