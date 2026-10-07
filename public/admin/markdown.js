const LANGUAGE_PATTERN = /^[A-Za-z0-9_+#.-]{1,32}$/;
const CODE_PLACEHOLDER = "在此粘贴代码";
const FENCE = String.fromCharCode(96).repeat(3);

export function isInsertCodeShortcut(event) {
	const isK = event.code === "KeyK" || String(event.key || "").toLowerCase() === "k";
	const isAltK =
		event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
	const isCtrlShiftK =
		event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
	return isK && (isAltK || isCtrlShiftK) && !event.isComposing;
}

export function insertCodeBlock(value, selectionStart, selectionEnd, language) {
  const text = String(value || "");
  const start = clamp(selectionStart, 0, text.length);
  const end = clamp(selectionEnd, start, text.length);
  const selected = text.slice(start, end);
  const safeLanguage = normalizeLanguage(language);
  const code = selected || CODE_PLACEHOLDER;
  const before = text.slice(0, start);
  const after = text.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n" : "";
  const opening = FENCE + safeLanguage + "\n";
  const closing = "\n" + FENCE;
  const insertion = prefix + opening + code + closing + suffix;
  const result = before + insertion + after;
  const codeStart = before.length + prefix.length + opening.length;
  return {
    selectionEnd: selected
      ? before.length + insertion.length
      : codeStart + CODE_PLACEHOLDER.length,
    selectionStart: selected ? before.length + insertion.length : codeStart,
    value: result,
  };
}

export function renderMarkdownPreview(markdown) {
  const source = String(markdown || "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return "<p>暂无正文</p>";
  const lines = source.split("\n");
  const output = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = line.match(/^ {0,3}\x60{3}([^\x60\s]*)[^\x60]*$/);
    if (fence) {
      const language = normalizeLanguage(fence[1]);
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^ {0,3}\x60{3}\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      output.push(renderCodeBlock(codeLines.join("\n"), language));
      continue;
    }
    const heading = line.match(/^ {0,3}(#{1,3})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = heading[1].length;
      output.push(
        "<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">",
      );
      index += 1;
      continue;
    }
    if (/^ {0,3}(?:[-*_]\s*){3,}$/.test(line)) {
      output.push("<hr />");
      index += 1;
      continue;
    }
    const list = line.match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/);
    if (list) {
      const ordered = /^\d/.test(list[1]);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push("<li>" + renderInline(item[2]) + "</li>");
        index += 1;
      }
      output.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
        quote.push(lines[index].replace(/^ {0,3}> ?/, ""));
        index += 1;
      }
      output.push(
        "<blockquote><p>" +
          quote.map(renderInline).join("<br />") +
          "</p></blockquote>",
      );
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsBlock(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    output.push("<p>" + paragraph.map(renderInline).join("<br />") + "</p>");
  }
  return output.join("");
}

function renderCodeBlock(code, language) {
  return (
    '<div class="preview-code-card"><div class="preview-code-toolbar"><span class="preview-code-language">' +
    escapeHtml(language || "text") +
    '</span><button class="preview-copy-button" type="button" data-copy-code aria-label="复制代码">复制</button></div><pre><code>' +
    escapeHtml(code) +
    "</code></pre></div>"
  );
}

function renderInline(value) {
  let html = escapeHtml(value);
  html = html.replace(
    /!\[([^\]]*)\]\(([^\s)]+)(?:\s+[^)]*)?\)/g,
    (_match, alt, rawUrl) => {
      const url = safeUrl(rawUrl);
      return url
        ? '<img src="' + url + '" alt="' + alt + '" loading="lazy" />'
        : alt;
    },
  );
  html = html.replace(
    /\[([^\]]+)\]\(([^\s)]+)(?:\s+[^)]*)?\)/g,
    (_match, label, rawUrl) => {
      const url = safeUrl(rawUrl);
      return url
        ? '<a href="' +
            url +
            '" target="_blank" rel="noreferrer">' +
            label +
            "</a>"
        : label;
    },
  );
  return html
    .replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>");
}

function safeUrl(value) {
  const decoded = String(value || "").replaceAll("&amp;", "&");
  return /^(?:https?:|mailto:|\/|\.\.?\/|#)/i.test(decoded)
    ? escapeHtml(decoded)
    : "";
}

function normalizeLanguage(value) {
  const language = String(value || "").trim();
  return LANGUAGE_PATTERN.test(language) ? language : "text";
}

function startsBlock(line) {
  return (
    /^ {0,3}(?:\x60{3}|#{1,3}\s|>|[-+*]\s|\d+[.)]\s)/.test(line) ||
    /^ {0,3}(?:[-*_]\s*){3,}$/.test(line)
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
