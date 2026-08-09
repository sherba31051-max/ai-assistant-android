// GitHub login via OAuth Device Flow — the ONLY feature in this app that
// uses the network. Everything else (chat, lessons, code engine) stays
// fully offline. This module never talks to Adaptive or any third-party AI
// service — only to GitHub's own API, and only when the user explicitly
// taps "Войти через GitHub".
//
// Device Flow requests (login/device/code, login/oauth/access_token) are
// not CORS-enabled by GitHub for browser fetch(), so this relies on
// CapacitorHttp (enabled in capacitor.config) to route these requests
// through native Android networking instead of the WebView's fetch.
"use strict";

var CLIENT_ID_KEY = "gh_oauth_client_id_v1";
var TOKEN_KEY = "gh_oauth_token_v1";
var USER_KEY = "gh_oauth_user_v1";

export function getClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || "";
}

export function setClientId(id) {
  localStorage.setItem(CLIENT_ID_KEY, (id || "").trim());
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getUser() {
  try {
    var raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function isLoggedIn() {
  return !!getToken();
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function formBody(obj) {
  return Object.keys(obj)
    .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]); })
    .join("&");
}

// Step 1: ask GitHub for a device_code + user_code the user must enter at
// verification_uri (usually github.com/login/device) in any browser.
export function requestDeviceCode(clientId) {
  return fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: formBody({ client_id: clientId, scope: "repo" }),
  }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

// Step 2: poll for the access token while the user authorizes in the
// browser. Resolves with the token, or rejects if denied/expired.
export function pollForToken(clientId, deviceCode, intervalSec, onTick) {
  var interval = Math.max(intervalSec || 5, 5) * 1000;
  var cancelled = false;
  var promise = new Promise(function (resolve, reject) {
    function tick() {
      if (cancelled) return;
      fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: formBody({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.access_token) {
            resolve(data.access_token);
            return;
          }
          if (data.error === "authorization_pending") {
            if (onTick) onTick("waiting");
            setTimeout(tick, interval);
          } else if (data.error === "slow_down") {
            interval += 5000;
            setTimeout(tick, interval);
          } else if (data.error === "expired_token") {
            reject(new Error("Код подтверждения истёк, начните заново."));
          } else if (data.error === "access_denied") {
            reject(new Error("Вход отменён пользователем."));
          } else {
            reject(new Error(data.error_description || data.error || "Неизвестная ошибка авторизации."));
          }
        })
        .catch(reject);
    }
    tick();
  });
  promise.cancel = function () { cancelled = true; };
  return promise;
}

export function fetchGithubUser(token) {
  return fetch("https://api.github.com/user", {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
  })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify({ login: user.login, avatar_url: user.avatar_url, name: user.name }));
      return user;
    });
}

// Full login flow used by the UI. Calls onState("code", {user_code, verification_uri}) once the
// code is ready, then resolves once the token is confirmed.
export function loginWithDeviceFlow(clientId, onState) {
  return requestDeviceCode(clientId).then(function (data) {
    if (onState) onState("code", data);
    return pollForToken(clientId, data.device_code, data.interval, function (status) {
      if (onState) onState("polling", status);
    }).then(function (token) {
      return fetchGithubUser(token);
    });
  });
}

// ---------------------------------------------------------------------
// Pushing a generated project to a new (or existing) GitHub repo, using
// the Contents API — one commit per file. Simple and reliable for the
// small file counts the code engine produces.
// ---------------------------------------------------------------------

function ghRequest(token, method, path, body) {
  return fetch("https://api.github.com" + path, {
    method: method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(function (res) {
    return res.json().then(function (json) {
      if (!res.ok && res.status !== 422) throw new Error(json.message || ("HTTP " + res.status));
      return { status: res.status, body: json };
    });
  });
}

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// files: [{ path, content }]. Creates the repo if it doesn't exist yet,
// then uploads every file via the Contents API.
export function pushProjectToGithub(token, repoName, files, onProgress) {
  return ghRequest(token, "POST", "/user/repos", {
    name: repoName,
    private: true,
    auto_init: false,
    description: "Сгенерировано локальным офлайн-движком AI Assistant",
  })
    .then(function (createRes) {
      return fetchGithubUser(token).then(function (user) {
        var owner = user.login;
        var total = files.length;
        var chain = Promise.resolve();
        files.forEach(function (file, idx) {
          chain = chain.then(function () {
            if (onProgress) onProgress(idx + 1, total, file.path);
            return ghRequest(token, "PUT", "/repos/" + owner + "/" + repoName + "/contents/" + file.path, {
              message: "Добавить " + file.path,
              content: b64EncodeUtf8(file.content),
            });
          });
        });
        return chain.then(function () {
          return "https://github.com/" + owner + "/" + repoName;
        });
      });
    });
}
