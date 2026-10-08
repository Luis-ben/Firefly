export function renderLiveCodeBlock({ text, lang }) {
	const rawLanguage = String(lang || "").split(/\s+/)[0];
	const language = /^[a-z0-9_+#.-]{1,32}$/i.test(rawLanguage)
		? rawLanguage
		: "text";
	const code = String(text || "").replace(/\r\n?/g, "\n");
	if (language.toLowerCase() === "mermaid") {
		const safeCode = escapeHtml(code);
		return '<div class="mermaid-diagram-container live-mermaid"><div class="mermaid-wrapper"><div class="mermaid" data-mermaid-code="' + safeCode + '"><pre><code>' + safeCode + '</code></pre></div></div></div>';
	}
	const lines = String(text || "")
		.replace(/\r\n?/g, "\n")
		.replace(/\n$/, "")
		.split("\n")
		.map((line) => '<span class="live-code-line">' + escapeHtml(line) + '</span>')
		.join("");

	return '<figure class="live-code-block"><div class="live-code-header"><span class="live-code-language">' + escapeHtml(language) + '</span><button class="live-code-copy" type="button" aria-label="复制代码" title="复制代码">复制</button></div><pre><code>' + lines + '</code></pre></figure>';
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}
