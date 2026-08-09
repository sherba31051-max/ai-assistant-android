(function () {
  "use strict";
  var data = window.PROJECT_DATA || { title: "Generated App", readme: "", files: [] };

  document.getElementById("app-title").textContent = data.title || "Generated App";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Minimal Markdown -> HTML renderer (headers, bold/italic, code, links, lists).
  function renderMarkdown(md) {
    var lines = String(md || "").split("\n");
    var html = [];
    var inCode = false;
    var inList = false;
    lines.forEach(function (line) {
      if (/^```/.test(line)) {
        if (!inCode) {
          html.push("<pre><code>");
          inCode = true;
        } else {
          html.push("</code></pre>");
          inCode = false;
        }
        return;
      }
      if (inCode) {
        html.push(escapeHtml(line));
        html.push("\n");
        return;
      }
      var m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
        if (inList) { html.push("</ul>"); inList = false; }
        var lvl = m[1].length;
        html.push("<h" + lvl + ">" + inline(m[2]) + "</h" + lvl + ">");
        return;
      }
      if (/^[-*]\s+/.test(line)) {
        if (!inList) { html.push("<ul>"); inList = true; }
        html.push("<li>" + inline(line.replace(/^[-*]\s+/, "")) + "</li>");
        return;
      }
      if (inList) { html.push("</ul>"); inList = false; }
      if (line.trim() === "") {
        html.push("<br/>");
        return;
      }
      html.push("<p>" + inline(line) + "</p>");
    });
    if (inList) html.push("</ul>");
    if (inCode) html.push("</code></pre>");
    return html.join("\n");

    function inline(text) {
      var t = escapeHtml(text);
      t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return t;
    }
  }

  var sidebar = document.getElementById("sidebar");
  var content = document.getElementById("content");
  var tabReadme = document.getElementById("tab-readme");
  var tabFiles = document.getElementById("tab-files");

  function showReadme() {
    tabReadme.classList.add("active");
    tabFiles.classList.remove("active");
    sidebar.classList.add("hidden");
    content.className = "readme";
    content.innerHTML = renderMarkdown(data.readme || "# " + (data.title || "Generated App") + "\n\n_Нет README._");
  }

  function showFile(f) {
    content.className = "";
    content.innerHTML =
      '<div id="filepath">' + escapeHtml(f.path) + "</div><pre><code>" + escapeHtml(f.content) + "</code></pre>";
    Array.prototype.forEach.call(sidebar.querySelectorAll(".file"), function (el) {
      el.classList.toggle("active", el.dataset.path === f.path);
    });
  }

  function showFiles() {
    tabFiles.classList.add("active");
    tabReadme.classList.remove("active");
    sidebar.classList.remove("hidden");
    sidebar.innerHTML = "";
    (data.files || []).forEach(function (f, i) {
      var el = document.createElement("div");
      el.className = "file";
      el.textContent = f.path;
      el.dataset.path = f.path;
      el.addEventListener("click", function () {
        showFile(f);
      });
      sidebar.appendChild(el);
      if (i === 0) showFile(f);
    });
    if (!data.files || !data.files.length) {
      content.className = "";
      content.innerHTML = "<p>Нет файлов.</p>";
    }
  }

  tabReadme.addEventListener("click", showReadme);
  tabFiles.addEventListener("click", showFiles);

  showReadme();
})();
