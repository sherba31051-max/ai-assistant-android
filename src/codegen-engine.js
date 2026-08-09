// ---------------------------------------------------------------------
// Локальный движок генерации кода — "задача на естественном языке" →
// готовый мини-проект (несколько файлов). Полностью офлайн:
//
//   • Никаких обращений к ИИ-модели (ни к локальной wllama, ни к какому-
//     либо внешнему API) — только детерминированный разбор текста
//     регулярными выражениями и заполнение готовых шаблонов.
//   • Никаких сетевых запросов.
//   • Никакого участия агента/оператора — вся логика работает на
//     устройстве пользователя мгновенно, без сервера.
//
// Это ровно тот тип "движка", который отличается от чат-модели (app.js +
// wllama): здесь нет вероятностной генерации текста, только простые
// правила вида "нашли ключевое слово языка/типа проекта → взяли шаблон
// → подставили значения".
// ---------------------------------------------------------------------
"use strict";

// -------------------- Разбор задачи (простые правила) --------------------

var LANGUAGE_RULES = [
  { id: "python", re: /python|питон|\.py\b|flask|pandas|django/i },
  { id: "kotlin", re: /kotlin|котлин|\.kt\b/i },
  { id: "java", re: /\bjava\b(?!script)|джава/i },
  { id: "bash", re: /bash|shell|шелл|оболочк|\.sh\b|скрипт для терминала/i },
  { id: "node", re: /node\.?js|javascript|\bjs\b|нод\.?js|экспресс|express|npm/i },
];

var TYPE_RULES = [
  { id: "telegram-bot", re: /телеграм|telegram|тг[\s-]?бот/i },
  { id: "rest-api", re: /rest\s*api|веб[\s-]?сервер|http[\s-]?сервер|эндпоинт|endpoint|\bapi\b|веб-сервис/i },
  { id: "cli", re: /cli\b|консольн|командная строка|утилита командной строки|терминальн/i },
  { id: "script", re: /скрипт|парсер|csv|excel|обработ(ка|ать)|конверт(ер|ировать)|автоматизац/i },
];

var STOPWORDS = new Set([
  "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то",
  "все", "она", "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за",
  "бы", "по", "только", "ее", "мне", "было", "вот", "от", "меня", "еще",
  "нет", "о", "из", "ему", "теперь", "когда", "даже", "ну", "вдруг", "ли",
  "если", "уже", "или", "ни", "быть", "был", "него", "до", "вас", "нибудь",
  "опять", "уж", "вам", "сказал", "ведь", "там", "потом", "себя", "ничего",
  "ей", "может", "они", "тут", "где", "есть", "надо", "ней", "для", "мы",
  "тебя", "их", "чем", "была", "сам", "чтоб", "без", "будто", "чего",
  "раз", "тоже", "себе", "под", "будет", "ж", "тогда", "кто", "этот",
  "того", "потому", "этого", "какой", "совсем", "ним", "здесь", "этом",
  "один", "почти", "мой", "тем", "чтобы", "нее", "сейчас", "были", "куда",
  "зачем", "всех", "никогда", "можно", "при", "наконец", "два", "об",
  "другой", "хоть", "после", "над", "больше", "тот", "через", "эти", "нас",
  "про", "всего", "них", "какая", "много", "разве", "три", "эту", "моя",
  "впрочем", "хорошо", "свою", "этой", "перед", "иногда", "лучше", "чуть",
  "том", "нельзя", "такой", "им", "более", "всегда", "конечно", "всю",
  "между", "приложение", "программа", "проект", "сделай", "создай",
  "напиши", "хочу", "нужен", "нужна", "нужно", "который", "которая",
  "которое", "чтобы", "с помощью", "make", "create", "build", "a", "an",
  "the", "for", "with", "app", "application", "project", "please",
]);

function tokenizeSignificant(text) {
  return (text.toLowerCase().match(/[a-zа-яё0-9]+/gi) || [])
    .filter(function (w) { return w.length > 2 && !STOPWORDS.has(w); });
}

function detectLanguage(text) {
  for (var i = 0; i < LANGUAGE_RULES.length; i++) {
    if (LANGUAGE_RULES[i].re.test(text)) return LANGUAGE_RULES[i].id;
  }
  return "node"; // самый нейтральный дефолт
}

function detectType(text) {
  for (var i = 0; i < TYPE_RULES.length; i++) {
    if (TYPE_RULES[i].re.test(text)) return TYPE_RULES[i].id;
  }
  return "script";
}

function toSlug(words) {
  var slug = words.join("-").replace(/[^a-z0-9-]/gi, "");
  return slug || "project";
}

function toTitle(words) {
  return words
    .slice(0, 4)
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(" ") || "Проект";
}

// Транслитерация — чтобы имя проекта/файлов было валидным в латинице,
// даже если задача была сформулирована на русском.
var TRANSLIT_MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function translit(word) {
  return word
    .toLowerCase()
    .split("")
    .map(function (ch) { return TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch; })
    .join("");
}

/**
 * Разбирает текст задачи и возвращает структурированные параметры:
 * язык, тип проекта, "человеческое" название и слаг для имён файлов.
 * @param {string} taskText
 */
export function parseTask(taskText) {
  var text = (taskText || "").trim();
  var language = detectLanguage(text);
  var projectType = detectType(text);
  var significant = tokenizeSignificant(text);
  var titleWords = significant.slice(0, 4);
  var slugWords = significant.slice(0, 3).map(translit).filter(Boolean);

  return {
    raw: text,
    language: language,
    projectType: projectType,
    title: toTitle(titleWords.length ? titleWords : ["локальный", "проект"]),
    slug: toSlug(slugWords.length ? slugWords : ["local-project"]),
  };
}

// -------------------- Подстановка простых {{placeholders}} --------------------

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, function (_, key) {
    return values[key] !== undefined ? values[key] : "";
  });
}

// -------------------- Шаблоны проектов --------------------
// Каждый шаблон — чистая функция (ctx) → [{path, content}]. Никакой
// логики, кроме подстановки строк — без обращения к ИИ или сети.

function tplPythonScript(ctx) {
  return [
    {
      path: "README.md",
      content: fill(
        "# {{title}}\n\n" +
          "Автоматически сгенерированный офлайн-скрипт на Python по задаче:\n\n" +
          "> {{raw}}\n\n" +
          "## Запуск\n\n" +
          "```bash\npip install -r requirements.txt\npython main.py\n```\n",
        ctx
      ),
    },
    { path: "requirements.txt", content: "# зависимости не требуются для базового скрипта\n" },
    {
      path: "main.py",
      content: fill(
        '"""{{title}}\n\nСгенерировано локальным офлайн-движком AI Assistant.\nЗадача пользователя: {{raw}}\n"""\n\n' +
          "def main():\n" +
          '    print("{{title}}: запуск...")\n' +
          "    # TODO: реализуйте здесь основную логику задачи:\n" +
          "    # {{raw}}\n" +
          '    print("Готово.")\n\n\n' +
          'if __name__ == "__main__":\n' +
          "    main()\n",
        ctx
      ),
    },
  ];
}

function tplPythonRestApi(ctx) {
  return [
    {
      path: "README.md",
      content: fill(
        "# {{title}} — REST API (Flask)\n\n" +
          "Сгенерировано офлайн-движком по задаче:\n\n> {{raw}}\n\n" +
          "## Запуск\n\n```bash\npip install -r requirements.txt\npython app.py\n```\n\n" +
          "Сервер стартует на http://localhost:5000\n\n" +
          "- `GET /health` — проверка работоспособности\n" +
          "- `GET /` — базовая информация\n",
        ctx
      ),
    },
    { path: "requirements.txt", content: "flask>=3.0\n" },
    {
      path: "app.py",
      content: fill(
        "from flask import Flask, jsonify\n\n" +
          "# {{title}}\n" +
          "# Сгенерировано локальным офлайн-движком AI Assistant.\n" +
          "# Задача пользователя: {{raw}}\n\n" +
          'app = Flask(__name__)\n\n\n' +
          '@app.get("/health")\n' +
          "def health():\n" +
          '    return jsonify(status="ok")\n\n\n' +
          '@app.get("/")\n' +
          "def index():\n" +
          '    return jsonify(name="{{title}}", description="{{raw}}")\n\n\n' +
          '# TODO: добавьте здесь эндпоинты, реализующие: {{raw}}\n\n\n' +
          'if __name__ == "__main__":\n' +
          '    app.run(host="0.0.0.0", port=5000)\n',
        ctx
      ),
    },
  ];
}

function tplNodeCli(ctx) {
  return [
    {
      path: "README.md",
      content: fill(
        "# {{title}}\n\n" +
          "Консольная утилита на Node.js, сгенерирована офлайн-движком по задаче:\n\n> {{raw}}\n\n" +
          "## Запуск\n\n```bash\nnpm install\nnode index.js\n```\n",
        ctx
      ),
    },
    {
      path: "package.json",
      content: fill(
        JSON.stringify(
          {
            name: "{{slug}}",
            version: "1.0.0",
            description: "{{raw}}",
            main: "index.js",
            type: "commonjs",
            scripts: { start: "node index.js" },
          },
          null,
          2
        ).replace('"{{slug}}"', '"{{slug}}"').replace('"{{raw}}"', '"{{raw}}"'),
        ctx
      ),
    },
    {
      path: "index.js",
      content: fill(
        "// {{title}}\n" +
          "// Сгенерировано локальным офлайн-движком AI Assistant.\n" +
          "// Задача пользователя: {{raw}}\n\n" +
          "function main() {\n" +
          '  console.log("{{title}}: запуск...");\n' +
          "  // TODO: реализуйте здесь основную логику задачи:\n" +
          "  // {{raw}}\n" +
          '  console.log("Готово.");\n' +
          "}\n\n" +
          "main();\n",
        ctx
      ),
    },
  ];
}

function tplNodeExpress(ctx) {
  return [
    {
      path: "README.md",
      content: fill(
        "# {{title}} — REST API (Express)\n\n" +
          "Сгенерировано офлайн-движком по задаче:\n\n> {{raw}}\n\n" +
          "## Запуск\n\n```bash\nnpm install\nnode index.js\n```\n\n" +
          "Сервер стартует на http://localhost:3000\n\n" +
          "- `GET /health` — проверка работоспособности\n" +
          "- `GET /` — базовая информация\n",
        ctx
      ),
    },
    {
      path: "package.json",
      content: fill(
        JSON.stringify(
          {
            name: "{{slug}}",
            version: "1.0.0",
            description: "{{raw}}",
            main: "index.js",
            type: "commonjs",
            scripts: { start: "node index.js" },
            dependencies: { express: "^4.19.2" },
          },
          null,
          2
        ),
        ctx
      ),
    },
    {
      path: "index.js",
      content: fill(
        "// {{title}}\n" +
          "// Сгенерировано локальным офлайн-движком AI Assistant.\n" +
          "// Задача пользователя: {{raw}}\n\n" +
          'const express = require("express");\n' +
          "const app = express();\n" +
          "const PORT = process.env.PORT || 3000;\n\n" +
          'app.get("/health", (req, res) => res.json({ status: "ok" }));\n\n' +
          'app.get("/", (req, res) => res.json({ name: "{{title}}", description: "{{raw}}" }));\n\n' +
          "// TODO: добавьте здесь маршруты, реализующие: {{raw}}\n\n" +
          "app.listen(PORT, () => {\n" +
          '  console.log("{{title}} слушает на порту " + PORT);\n' +
          "});\n",
        ctx
      ),
    },
  ];
}

function tplTelegramBot(ctx) {
  var lang = ctx.language === "python" ? "python" : "node";
  if (lang === "python") {
    return [
      {
        path: "README.md",
        content: fill(
          "# {{title}} — Telegram-бот (Python)\n\n" +
            "Сгенерировано офлайн-движком по задаче:\n\n> {{raw}}\n\n" +
            "## Запуск\n\n```bash\npip install -r requirements.txt\nBOT_TOKEN=... python bot.py\n```\n\n" +
            "Токен бота получите у @BotFather в Telegram и передайте через переменную окружения `BOT_TOKEN`.\n",
          ctx
        ),
      },
      { path: "requirements.txt", content: "python-telegram-bot>=21.0\n" },
      {
        path: "bot.py",
        content: fill(
          "import os\n" +
            "from telegram import Update\n" +
            "from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes\n\n" +
            "# {{title}}\n" +
            "# Сгенерировано локальным офлайн-движком AI Assistant.\n" +
            "# Задача пользователя: {{raw}}\n\n" +
            "async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):\n" +
            '    await update.message.reply_text("Привет! Я — {{title}}.")\n\n\n' +
            "# TODO: добавьте здесь обработчики, реализующие: {{raw}}\n\n\n" +
            'def main():\n' +
            '    token = os.environ.get("BOT_TOKEN")\n' +
            "    if not token:\n" +
            '        raise SystemExit("Задайте переменную окружения BOT_TOKEN")\n' +
            "    app = ApplicationBuilder().token(token).build()\n" +
            '    app.add_handler(CommandHandler("start", start))\n' +
            "    app.run_polling()\n\n\n" +
            'if __name__ == "__main__":\n' +
            "    main()\n",
          ctx
        ),
      },
    ];
  }
  return [
    {
      path: "README.md",
      content: fill(
        "# {{title}} — Telegram-бот (Node.js)\n\n" +
          "Сгенерировано офлайн-движком по задаче:\n\n> {{raw}}\n\n" +
          "## Запуск\n\n```bash\nnpm install\nBOT_TOKEN=... node bot.js\n```\n\n" +
          "Токен бота получите у @BotFather в Telegram и передайте через переменную окружения `BOT_TOKEN`.\n",
        ctx
      ),
    },
    {
      path: "package.json",
      content: fill(
        JSON.stringify(
          {
            name: "{{slug}}",
            version: "1.0.0",
            description: "{{raw}}",
            main: "bot.js",
            scripts: { start: "node bot.js" },
            dependencies: { "node-telegram-bot-api": "^0.66.0" },
          },
          null,
          2
        ),
        ctx
      ),
    },
    {
      path: "bot.js",
      content: fill(
        "// {{title}}\n" +
          "// Сгенерировано локальным офлайн-движком AI Assistant.\n" +
          "// Задача пользователя: {{raw}}\n\n" +
          'const TelegramBot = require("node-telegram-bot-api");\n' +
          "const token = process.env.BOT_TOKEN;\n" +
          "if (!token) {\n" +
          '  throw new Error("Задайте переменную окружения BOT_TOKEN");\n' +
          "}\n\n" +
          "const bot = new TelegramBot(token, { polling: true });\n\n" +
          'bot.onText(/\\/start/, (msg) => {\n' +
          '  bot.sendMessage(msg.chat.id, "Привет! Я — {{title}}.");\n' +
          "});\n\n" +
          "// TODO: добавьте здесь обработчики, реализующие: {{raw}}\n",
        ctx
      ),
    },
  ];
}

function tplJavaCli(ctx) {
  return [
    {
      path: "README.md",
      content: fill(
        "# {{title}} (Java)\n\n" +
          "Сгенерировано офлайн-движком по задаче:\n\n> {{raw}}\n\n" +
          "## Запуск\n\n```bash\njavac Main.java\njava Main\n```\n",
        ctx
      ),
    },
    {
      path: "Main.java",
      content: fill(
        "// {{title}}\n" +
          "// Сгенерировано локальным офлайн-движком AI Assistant.\n" +
          "// Задача пользователя: {{raw}}\n\n" +
          "public class Main {\n" +
          "    public static void main(String[] args) {\n" +
          '        System.out.println("{{title}}: запуск...");\n' +
          "        // TODO: реализуйте здесь основную логику задачи:\n" +
          "        // {{raw}}\n" +
          '        System.out.println("Готово.");\n' +
          "    }\n" +
          "}\n",
        ctx
      ),
    },
  ];
}

function tplKotlinCli(ctx) {
  return [
    {
      path: "README.md",
      content: fill(
        "# {{title}} (Kotlin)\n\n" +
          "Сгенерировано офлайн-движком по задаче:\n\n> {{raw}}\n\n" +
          "## Запуск\n\n```bash\nkotlinc main.kt -include-runtime -d app.jar\njava -jar app.jar\n```\n",
        ctx
      ),
    },
    {
      path: "main.kt",
      content: fill(
        "// {{title}}\n" +
          "// Сгенерировано локальным офлайн-движком AI Assistant.\n" +
          "// Задача пользователя: {{raw}}\n\n" +
          "fun main() {\n" +
          '    println("{{title}}: запуск...")\n' +
          "    // TODO: реализуйте здесь основную логику задачи:\n" +
          "    // {{raw}}\n" +
          '    println("Готово.")\n' +
          "}\n",
        ctx
      ),
    },
  ];
}

function tplBashScript(ctx) {
  return [
    {
      path: "README.md",
      content: fill(
        "# {{title}} (Bash)\n\n" +
          "Сгенерировано офлайн-движком по задаче:\n\n> {{raw}}\n\n" +
          "## Запуск\n\n```bash\nchmod +x run.sh\n./run.sh\n```\n",
        ctx
      ),
    },
    {
      path: "run.sh",
      content: fill(
        "#!/usr/bin/env bash\n" +
          "# {{title}}\n" +
          "# Сгенерировано локальным офлайн-движком AI Assistant.\n" +
          "# Задача пользователя: {{raw}}\n" +
          "set -euo pipefail\n\n" +
          'echo "{{title}}: запуск..."\n' +
          "# TODO: реализуйте здесь основную логику задачи:\n" +
          "# {{raw}}\n" +
          'echo "Готово."\n',
        ctx
      ),
    },
  ];
}

// Матрица language × projectType → шаблон. Если точного сочетания нет,
// используется наиболее близкий разумный вариант для языка.
function pickTemplate(language, projectType) {
  if (projectType === "telegram-bot") return tplTelegramBot;
  if (language === "python") return projectType === "rest-api" ? tplPythonRestApi : tplPythonScript;
  if (language === "node") return projectType === "rest-api" ? tplNodeExpress : tplNodeCli;
  if (language === "java") return tplJavaCli;
  if (language === "kotlin") return tplKotlinCli;
  if (language === "bash") return tplBashScript;
  return tplNodeCli;
}

/**
 * Главная функция движка: текст задачи → готовый мини-проект.
 * Полностью синхронная и детерминированная — без ИИ, без сети, без
 * какого-либо участия внешнего агента.
 * @param {string} taskText
 * @returns {{ meta: object, files: {path: string, content: string}[] }}
 */
export function generateProject(taskText) {
  var ctx = parseTask(taskText);
  var template = pickTemplate(ctx.language, ctx.projectType);
  var files = template(ctx).map(function (f) {
    return { path: ctx.slug + "/" + f.path, content: f.content };
  });
  return {
    meta: {
      title: ctx.title,
      slug: ctx.slug,
      language: ctx.language,
      projectType: ctx.projectType,
      raw: ctx.raw,
      fileCount: files.length,
    },
    files: files,
  };
}
