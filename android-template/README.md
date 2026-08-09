# android-template

Универсальный Android-шаблон (WebView-обёртка на Capacitor), в который `src/github-push.js` пакует
любой сгенерированный проект перед созданием нового GitHub-репозитория.

## Что внутри

- `android/` — стандартный Capacitor Android-проект (Gradle, манифест, иконки, splash) с
  `applicationId`/`namespace` = `ai.adaptive.generated` и `MainActivity`, который просто грузит
  WebView с локальными файлами из `www/`.
- `www/index.html` + `www/app.js` — простой просмотрщик: вкладка «README» (рендер Markdown) и
  вкладка «Файлы» (дерево файлов + просмотр кода).
- `www/project-data.js` — точка встраивания данных. При создании нового репозитория этот файл
  заменяется на реальные `{ title, readme, files[] }` сгенерированного проекта (см. `github-push.js`).
- `.github/workflows/build-apk.yml` — тот же паттерн CI, что и в этом репозитории: `npm install` →
  `cap sync android` → `gradlew assembleDebug` → релиз с APK (`v1.0.<run_number>`).
- `capacitor.config.json`, `package.json` — минимальные, без специфичных для AI Assistant
  зависимостей (esbuild/wllama/модель не нужны — обёртка не бандлит JS и не грузит LLM).

## Как это используется

`createRepoAndPush()` в `src/github-push.js` пушит: файлы этого шаблона (с заменённым
`www/project-data.js` и `strings.xml`/`capacitor.config.json` под название проекта) + исходники
сгенерированного проекта под `www/generated/`. После пуша GitHub Actions в новом репозитории сам
собирает APK и публикует релиз.
