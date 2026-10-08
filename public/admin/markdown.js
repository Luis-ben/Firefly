const LANGUAGE_PATTERN = /^[A-Za-z0-9_+#.-]{1,32}$/;
const CODE_PLACEHOLDER = "在此粘贴代码";
const FENCE = String.fromCharCode(96).repeat(3);

export function parseMarkdownImport(source, fileName) {
	const normalized = String(source || "")
		.replace(/^\uFEFF/, "")
		.replace(/\r\n?/g, "\n");
	const file = String(fileName || "").split(/[\\/]/).pop() || "";
	if (!/\.md$/i.test(file)) throw new Error("请选择 .md 格式的 Markdown 文件");

	const slug = file
		.replace(/\.md$/i, "")
		.replace(/[\s\\/:*?"<>|\u0000-\u001f]+/g, "-")
		.replace(/\.{2,}/g, "-")
		.replace(/^[.-]+|[.-]+$/g, "")
		.replace(/-{2,}/g, "-");
	if (!slug) throw new Error("文件名无法用作文章 Slug");

	const lines = normalized.split("\n");
	if (lines[0] !== "---") {
		return { body: normalized, frontmatter: {}, slug };
	}

	const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
	if (closingIndex < 0) throw new Error("Frontmatter 未闭合，缺少结束标记 ---");

	const frontmatter = parseYamlFrontmatter(lines.slice(1, closingIndex));
	const body = lines.slice(closingIndex + 1).join("\n").replace(/^(?:\n)+/, "");
	return { body, frontmatter, slug };
}

function parseYamlFrontmatter(lines) {
	const frontmatter = {};
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		if (/^\s/.test(line)) throw unsupportedFrontmatter(index + 1);

		const field = line.match(/^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$/);
		if (!field) throw new Error(`无法解析 frontmatter 第 ${index + 1} 行`);
		const key = field[1];
		const rawValue = field[2] || "";

		if (/^[|>][+-]?$/.test(rawValue.trim())) {
			const block = [];
			let indent = Infinity;
			while (index + 1 < lines.length) {
				const next = lines[index + 1];
				if (next.trim() && !/^\s/.test(next)) break;
				index += 1;
				if (!next.trim()) {
					block.push("");
					continue;
				}
				const leading = next.match(/^\s*/)[0].length;
				indent = Math.min(indent, leading);
				block.push(next);
			}
			const content = block.map((entry) => entry ? entry.slice(indent) : "");
			frontmatter[key] = rawValue.trim().startsWith(">")
				? foldYamlLines(content)
				: content.join("\n").replace(/\n+$/, "");
			continue;
		}

		if (!rawValue.trim()) {
			let nextIndex = index + 1;
			while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
			if (nextIndex < lines.length && /^\s/.test(lines[nextIndex])) {
				if (!/^\s+-\s*(.*)$/.test(lines[nextIndex])) {
					throw unsupportedFrontmatter(nextIndex + 1);
				}
				const items = [];
				index = nextIndex - 1;
				while (index + 1 < lines.length && /^\s+-\s*(.*)$/.test(lines[index + 1])) {
					index += 1;
					items.push(parseYamlScalar(lines[index].match(/^\s+-\s*(.*)$/)[1]));
				}
				frontmatter[key] = items;
			} else {
				frontmatter[key] = "";
			}
			continue;
		}

		frontmatter[key] = parseYamlScalar(rawValue);
	}
	return frontmatter;
}

function parseYamlScalar(rawValue) {
	const value = stripYamlComment(rawValue.trim());
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "null" || value === "~") return null;
	if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
	if (value === "[]") return [];
	if (value.startsWith("[") || value.endsWith("]")) {
		if (!(value.startsWith("[") && value.endsWith("]"))) {
			throw new Error("Frontmatter 中存在未闭合的数组");
		}
		return splitYamlFlowItems(value.slice(1, -1)).map(parseYamlScalar);
	}
	if (value.startsWith("{") || value.endsWith("}")) {
		throw new Error("暫不支持嵌套 frontmatter，请先把对象改成普通字段");
	}
	if (value.startsWith('"') || value.endsWith('"')) {
		if (!(value.startsWith('"') && value.endsWith('"'))) {
			throw new Error("Frontmatter 中存在未闭合的双引号字符串");
		}
		try {
			return JSON.parse(value);
		} catch {
			throw new Error("Frontmatter 中存在无效的双引号字符串");
		}
	}
	if (value.startsWith("'") || value.endsWith("'")) {
		if (!(value.startsWith("'") && value.endsWith("'"))) {
			throw new Error("Frontmatter 中存在未闭合的单引号字符串");
		}
		return value.slice(1, -1).replaceAll("''", "'");
	}
	return value;
}

function splitYamlFlowItems(value) {
	const items = [];
	let start = 0;
	let quote = "";
	let escaped = false;
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (quote === '"' && character === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (character === quote) {
				if (quote === "'" && value[index + 1] === "'") index += 1;
				else quote = "";
			}
			continue;
		}
		if (character === '"' || character === "'") quote = character;
		else if (character === ",") {
			items.push(value.slice(start, index).trim());
			start = index + 1;
		}
	}
	if (quote) throw new Error("Frontmatter 中存在未闭合的引号");
	const last = value.slice(start).trim();
	if (last || items.length) items.push(last);
	return items;
}

function stripYamlComment(value) {
	let quote = "";
	let escaped = false;
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (quote === '"' && character === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (character === quote) quote = "";
			continue;
		}
		if (character === '"' || character === "'") quote = character;
		else if (character === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
			return value.slice(0, index).trimEnd();
		}
	}
	return value;
}

function foldYamlLines(lines) {
	const paragraphs = [];
	let paragraph = [];
	for (const line of lines) {
		if (!line.trim()) {
			if (paragraph.length) paragraphs.push(paragraph.join(" "));
			paragraph = [];
		} else {
			paragraph.push(line);
		}
	}
	if (paragraph.length) paragraphs.push(paragraph.join(" "));
	return paragraphs.join("\n");
}

function unsupportedFrontmatter(line) {
	return new Error(`暂不支持嵌套 frontmatter（第 ${line} 行），请先改成顶层字段`);
}

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
			const code = codeLines.join("\n");
			output.push(
				language.toLowerCase() === "mermaid"
					? renderMermaidBlock(code)
					: renderCodeBlock(code, language),
			);
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

function renderMermaidBlock(code) {
	const safeCode = escapeHtml(code);
	return `<div class="preview-mermaid" data-mermaid-code="${safeCode}"><pre><code>${safeCode}</code></pre></div>`;
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
