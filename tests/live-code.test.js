import assert from "node:assert/strict";
import test from "node:test";
import { marked } from "marked";
import { renderLiveCodeBlock } from "../worker/live-code.js";

test("live fenced code uses a light-frame structure with language, lines, and copy control", () => {
	const markdown = String.fromCharCode(96).repeat(3) + "python\nprint(1)\nprint(2)\n" + String.fromCharCode(96).repeat(3);
	const html = marked.parse(markdown, {
		renderer: { code: renderLiveCodeBlock },
	});
	assert.match(html, /class="live-code-block"/);
	assert.match(html, /class="live-code-language">python</);
	assert.match(html, /class="live-code-line">print\(1\)<\/span>/);
	assert.match(html, /class="live-code-line">print\(2\)<\/span>/);
	assert.match(html, /class="live-code-copy"/);
});

test("live code escapes HTML and rejects unsafe language labels", () => {
	const html = renderLiveCodeBlock({
		lang: '<img src=x onerror=alert(1)>',
		text: "<script>alert(1)</script>",
	});
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	assert.doesNotMatch(html, /<script>|onerror=/);
	assert.match(html, /class="live-code-language">text</);
});
