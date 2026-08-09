# Статус пайплайна «код → Android APK»

Документирует 4 реализованные функции AI Assistant.

## 1. Универсальный шаблон Android-приложения (WebView-обёртка)
`android-template/` — Capacitor-обёртка (`www/index.html` + `www/app.js`) с
вкладками README и Файлы/код. Пакуется в `TEMPLATE_FILES` через
`scripts/pack-android-template.mjs` и добавляется в каждый сгенерированный проект.

## 2. Workflow автосборки APK
`.github/workflows/build-apk.yml` (в корне и в `android-template/`) — GitHub Actions:
JDK17 + Android SDK + Node22 → `npm install` → сборка JS → `cap sync android` →
`gradlew assembleDebug` → артефакт + GitHub Release (`softprops/action-gh-release`).

## 3. Функция создания репозитория и пуша
`src/github-push.js` → `createRepoAndPush()`: создаёт репозиторий и одним коммитом
пушит шаблон-обёртку + workflow + сгенерированный код через Git Data API.

## 4. Статус сборки в чате
`src/app.js`: `appendCodegenBubble`, `pollBuildStatus` (опрос `/actions/runs` каждые 15с),
`renderRepoState` (кнопки Repo / Actions / Releases / APK).

## Живая проверка
(заполняется по результатам теста ниже)
