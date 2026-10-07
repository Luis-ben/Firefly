import test from "node:test";
import assert from "node:assert/strict";
import {
  insertCodeBlock,
	isInsertCodeShortcut,
  renderMarkdownPreview,
} from "../public/admin/markdown.js";

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
