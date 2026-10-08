import test from "node:test";
import assert from "node:assert/strict";
import {
  insertCodeBlock,
	isInsertCodeShortcut,
	parseMarkdownImport,
  renderMarkdownPreview,
} from "../public/admin/markdown.js";

test("imports flat YAML frontmatter, list tags, and a Markdown body", () => {
	const result = parseMarkdownImport(
		'---\ntitle: "文章标题: 带冒号"\npublished: 2026-10-08\ndescription: 摘要\ntags:\n  - 博客\n  - "AI, 工具"\ncategory: 随笔\ndraft: true\ncomment: false\ncustomField: keep-me\n---\n\n正文内容\n',
		"我的文章.md",
	);

	assert.equal(result.slug, "我的文章");
	assert.equal(result.frontmatter.title, "文章标题: 带冒号");
	assert.deepEqual(result.frontmatter.tags, ["博客", "AI, 工具"]);
	assert.equal(result.frontmatter.draft, true);
	assert.equal(result.frontmatter.comment, false);
	assert.equal(result.frontmatter.customField, "keep-me");
	assert.equal(result.body, "正文内容\n");
});

test("imports flow-style lists and folded or literal multiline scalars", () => {
	const result = parseMarkdownImport(
		'---\ntags: [one, "two, three"]\ndescription: >-\n  第一行\n  第二行\n  \n  新段落\nnotes: |\n  原样保留\n  第二行\n---\n正文',
		"post.md",
	);

	assert.deepEqual(result.frontmatter.tags, ["one", "two, three"]);
	assert.equal(result.frontmatter.description, "第一行 第二行\n新段落");
	assert.equal(result.frontmatter.notes, "原样保留\n第二行");
	assert.equal(result.body, "正文");
});

test("imports Markdown without frontmatter using its filename as the slug", () => {
	const result = parseMarkdownImport("# 直接写正文", "快速开始.md");

	assert.equal(result.slug, "快速开始");
	assert.deepEqual(result.frontmatter, {});
	assert.equal(result.body, "# 直接写正文");
});

test("rejects malformed or nested frontmatter instead of silently dropping data", () => {
	assert.throws(
		() => parseMarkdownImport("---\ntitle: 未闭合\n# 正文", "post.md"),
		/Frontmatter 未闭合/,
	);
	assert.throws(
		() => parseMarkdownImport("---\nseo:\n  title: nested\n---\n正文", "post.md"),
		/暂不支持嵌套 frontmatter/,
	);
	assert.throws(
		() => parseMarkdownImport("---\ntags: [one, two\n---\n正文", "post.md"),
		/未闭合的数组/,
	);
	assert.throws(
		() => parseMarkdownImport("正文", "post.txt"),
		/请选择 .md 格式/,
	);
});

test("renders Mermaid fences as diagram containers for the browser renderer", () => {
	const html = renderMarkdownPreview(
		"```mermaid\nsequenceDiagram\n    User->>App: hello\n```",
	);

	assert.match(html, /class=\"preview-mermaid\"/);
	assert.match(html, /data-mermaid-code=/);
	assert.match(html, /sequenceDiagram/);
});

test("renders a fenced code block with language and preserves blank lines", () => {
  const html = renderMarkdownPreview(
    "```python\nimport re\n\nclass Parser:\n    pass\n```",
  );

  assert.match(html, /class="preview-code-language">python</);
  assert.match(html, /import re\n\nclass Parser:/);
  assert.match(html, /data-copy-code/);
});

test("wraps selected plain text in a fenced block for the chosen language", () => {
  const result = insertCodeBlock("before\nprint(1)\nafter", 7, 15, "python");

  assert.equal(result.value, "before\n```python\nprint(1)\n```\nafter");
  assert.equal(result.value.slice(result.selectionStart), "\nafter");
});

test("inserts and selects a placeholder when no code is selected", () => {
  const result = insertCodeBlock("", 0, 0, "javascript");

  assert.equal(result.value, "```javascript\n在此粘贴代码\n```");
  assert.equal(
    result.value.slice(result.selectionStart, result.selectionEnd),
    "在此粘贴代码",
  );
});

test("escapes code and rejects unsafe language identifiers", () => {
  const html = renderMarkdownPreview(
    "```<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n```",
  );

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /preview-code-language/);
});

test("renders headings, lists, quotes, and inline formatting", () => {
  const html = renderMarkdownPreview(
    "## 标题\n\n- **条目**\n- `code`\n\n> 提示内容",
  );

  assert.match(html, /<h2>标题<\/h2>/);
  assert.match(html, /<ul><li><strong>条目<\/strong><\/li>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<blockquote>/);
});

test("Alt+K inserts code without requiring a browser-reserved shortcut", () => {
	assert.equal(isInsertCodeShortcut({ altKey: true, code: "KeyK", ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false }), true);
  assert.equal(isInsertCodeShortcut({ altKey: false, code: "", key: "k", ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false }), false);
  assert.equal(isInsertCodeShortcut({ altKey: false, code: "", key: "k", ctrlKey: true, metaKey: false, shiftKey: true, isComposing: false }), true);
	assert.equal(isInsertCodeShortcut({ altKey: true, code: "KeyK", ctrlKey: true, metaKey: false, shiftKey: false, isComposing: false }), false);
	assert.equal(isInsertCodeShortcut({ altKey: true, code: "KeyK", ctrlKey: false, metaKey: false, shiftKey: false, isComposing: true }), false);
});
