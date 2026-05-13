const state = {
	current: null,
	dirty: false,
	posts: [],
	token: localStorage.getItem("firefly-admin-token") || "",
};

const els = {
	authForm: document.querySelector("#auth-form"),
	authStatus: document.querySelector("#auth-status"),
	body: document.querySelector("#body-field"),
	category: document.querySelector("#category-field"),
	comment: document.querySelector("#comment-field"),
	currentPath: document.querySelector("#current-path"),
	deleteButton: document.querySelector("#delete-button"),
	description: document.querySelector("#description-field"),
	draft: document.querySelector("#draft-field"),
	draftButton: document.querySelector("#draft-button"),
	editorHeading: document.querySelector("#editor-heading"),
	form: document.querySelector("#post-form"),
	image: document.querySelector("#image-field"),
	logoutButton: document.querySelector("#logout-button"),
	newPostButton: document.querySelector("#new-post-button"),
	pinned: document.querySelector("#pinned-field"),
	postCount: document.querySelector("#post-count"),
	postList: document.querySelector("#post-list"),
	preview: document.querySelector("#preview-output"),
	publishButton: document.querySelector("#publish-button"),
	published: document.querySelector("#published-field"),
	refreshButton: document.querySelector("#refresh-button"),
	saveButton: document.querySelector("#save-button"),
	search: document.querySelector("#search-input"),
	siteLink: document.querySelector("#site-link"),
	slug: document.querySelector("#slug-field"),
	statusFilter: document.querySelector("#status-filter"),
	tags: document.querySelector("#tags-field"),
	title: document.querySelector("#title-field"),
	toast: document.querySelector("#toast"),
	token: document.querySelector("#token-input"),
	wordCount: document.querySelector("#word-count"),
};

els.token.value = state.token;
els.siteLink.href =
	location.hostname === "127.0.0.1" && location.port === "8787"
		? "http://127.0.0.1:4321/"
		: "/";
bindEvents();
updateAuthState();
setEditorEnabled(false);

if (state.token) {
	loadPosts();
}

function bindEvents() {
	els.authForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		state.token = els.token.value.trim();
		localStorage.setItem("firefly-admin-token", state.token);
		updateAuthState();
		await loadPosts();
	});

	els.logoutButton.addEventListener("click", () => {
		state.token = "";
		state.posts = [];
		state.current = null;
		localStorage.removeItem("firefly-admin-token");
		els.token.value = "";
		updateAuthState();
		renderPostList();
		renderEmptyEditor();
	});

	els.refreshButton.addEventListener("click", () => loadPosts());
	els.newPostButton.addEventListener("click", () =>
		renderEditor(createEmptyPost()),
	);
	els.saveButton.addEventListener("click", () => saveCurrent());
	els.draftButton.addEventListener("click", () => saveCurrent(true));
	els.publishButton.addEventListener("click", () => saveCurrent(false));
	els.deleteButton.addEventListener("click", () => deleteCurrent());
	els.search.addEventListener("input", renderPostList);
	els.statusFilter.addEventListener("change", renderPostList);
	els.postList.addEventListener("click", (event) => {
		const button = event.target.closest("[data-post-id]");
		if (!button) return;
		openPost(button.dataset.postId);
	});

	for (const field of els.form.elements) {
		field.addEventListener("input", () => {
			state.dirty = true;
			updatePreview();
			if (
				!state.current?.id &&
				field === els.title &&
				!els.slug.dataset.touched
			) {
				els.slug.value = slugify(els.title.value);
			}
		});
	}

	els.slug.addEventListener("input", () => {
		els.slug.dataset.touched = "true";
	});
}

function updateAuthState() {
	const loggedIn = Boolean(state.token);
	els.authStatus.textContent = loggedIn ? "已登录" : "未登录";
	els.logoutButton.disabled = !loggedIn;
	els.refreshButton.disabled = !loggedIn;
	els.newPostButton.disabled = !loggedIn;
}

async function request(path, options = {}) {
	if (!state.token) throw new Error("请先输入 ADMIN_TOKEN");

	const headers = {
		Authorization: `Bearer ${state.token}`,
		...(options.headers || {}),
	};

	let body = options.body;
	if (body && typeof body !== "string") {
		headers["Content-Type"] = "application/json";
		body = JSON.stringify(body);
	}

	const response = await fetch(path, { ...options, body, headers });
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(data.error || `请求失败：${response.status}`);
	}

	return data;
}

async function loadPosts() {
	try {
		setBusy(true);
		state.posts = await request("/api/posts?includeDraft=true");
		renderPostList();
		if (state.current?.id) {
			const exists = state.posts.some((post) => post.id === state.current.id);
			if (exists) await openPost(state.current.id, false);
		}
		notify("文章列表已刷新");
	} catch (error) {
		notify(error.message, true);
	} finally {
		setBusy(false);
	}
}

function renderPostList() {
	const query = els.search.value.trim().toLowerCase();
	const status = els.statusFilter.value;
	const posts = state.posts.filter((post) => {
		const haystack = [post.title, post.category, post.id, ...(post.tags || [])]
			.join(" ")
			.toLowerCase();
		const matchesQuery = !query || haystack.includes(query);
		const matchesStatus =
			status === "all" ||
			(status === "draft" && post.draft) ||
			(status === "published" && !post.draft);
		return matchesQuery && matchesStatus;
	});

	els.postCount.textContent = `${posts.length} 篇文章`;
	els.postList.innerHTML = "";

	for (const post of posts) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `post-item${state.current?.id === post.id ? " active" : ""}`;
		button.dataset.postId = post.id;
		button.innerHTML = `
			<span class="post-title">${escapeHtml(post.title || post.id)}</span>
			<span class="post-meta">
				<span class="status-pill ${post.draft ? "draft" : ""}">${post.draft ? "草稿" : "已发布"}</span>
				<span>${escapeHtml(post.published || "未设置日期")}</span>
				<span>${escapeHtml(post.category || "未分类")}</span>
			</span>
		`;
		els.postList.append(button);
	}
}

async function openPost(id, showMessage = true) {
	if (state.dirty && !confirm("当前文章还没有保存，确定切换吗？")) return;

	try {
		setBusy(true);
		const post = await request(`/api/posts/${encodeURIComponent(id)}`);
		renderEditor(post);
		if (showMessage) notify("文章已打开");
	} catch (error) {
		notify(error.message, true);
	} finally {
		setBusy(false);
	}
}

function renderEditor(post) {
	state.current = post;
	state.dirty = false;
	els.slug.dataset.touched = post.id ? "true" : "";
	els.slug.readOnly = Boolean(post.id);
	els.slug.value =
		post.id || post.suggestedSlug || slugify(post.frontmatter.title || "");
	els.title.value = post.frontmatter.title || "";
	els.published.value = formatDate(post.frontmatter.published) || today();
	els.category.value = post.frontmatter.category || "";
	els.tags.value = Array.isArray(post.frontmatter.tags)
		? post.frontmatter.tags.join(", ")
		: "";
	els.image.value = post.frontmatter.image || "";
	els.description.value = post.frontmatter.description || "";
	els.draft.checked = post.frontmatter.draft !== false;
	els.pinned.checked = post.frontmatter.pinned === true;
	els.comment.checked = post.frontmatter.comment !== false;
	els.body.value = post.body || "";
	els.currentPath.textContent = post.relativePath || "新文章";
	els.editorHeading.textContent = post.frontmatter.title || "新文章";
	setEditorEnabled(true);
	updatePreview();
	renderPostList();
}

function renderEmptyEditor() {
	state.current = null;
	state.dirty = false;
	els.form.reset();
	els.slug.readOnly = false;
	els.currentPath.textContent = "未选择文章";
	els.editorHeading.textContent = "请选择或新建文章";
	setEditorEnabled(false);
	updatePreview();
}

function createEmptyPost() {
	const slug = `post-${compactTimestamp()}`;
	return {
		body: "",
		frontmatter: {
			category: "",
			comment: true,
			description: "",
			draft: true,
			image: "",
			pinned: false,
			published: today(),
			tags: [],
			title: "",
		},
		id: "",
		relativePath: "",
		suggestedSlug: slug,
	};
}

async function saveCurrent(forceDraft) {
	if (!state.current) return;

	const payload = collectPayload(forceDraft);
	if (!payload.frontmatter.title.trim()) {
		notify("标题不能为空", true);
		els.title.focus();
		return;
	}

	if (!state.current.id && !payload.slug.trim()) {
		notify("Slug 不能为空", true);
		els.slug.focus();
		return;
	}

	try {
		setBusy(true);
		const saved = state.current.id
			? await request(`/api/posts/${encodeURIComponent(state.current.id)}`, {
					body: payload,
					method: "PUT",
				})
			: await request("/api/posts", {
					body: payload,
					method: "POST",
				});
		renderEditor(saved);
		await loadPosts();
		notify(saved.frontmatter.draft === true ? "草稿已保存" : "文章已发布");
	} catch (error) {
		notify(error.message, true);
	} finally {
		setBusy(false);
	}
}

async function deleteCurrent() {
	if (!state.current?.id) return;

	const isDraft = state.current.frontmatter.draft === true;
	const message = isDraft
		? "确定删除这篇草稿吗？"
		: "这是一篇已发布文章，删除会从博客移除。确定删除吗？";
	if (!confirm(message)) return;

	try {
		setBusy(true);
		const suffix = isDraft ? "" : "?force=true";
		await request(
			`/api/posts/${encodeURIComponent(state.current.id)}${suffix}`,
			{
				method: "DELETE",
			},
		);
		renderEmptyEditor();
		await loadPosts();
		notify("文章已删除");
	} catch (error) {
		notify(error.message, true);
	} finally {
		setBusy(false);
	}
}

function collectPayload(forceDraft) {
	return {
		body: els.body.value,
		frontmatter: {
			category: els.category.value.trim(),
			comment: els.comment.checked,
			description: els.description.value.trim(),
			draft: typeof forceDraft === "boolean" ? forceDraft : els.draft.checked,
			image: els.image.value.trim(),
			pinned: els.pinned.checked,
			published: els.published.value || today(),
			tags: parseTags(els.tags.value),
			title: els.title.value.trim(),
		},
		slug: els.slug.value.trim(),
	};
}

function setEditorEnabled(enabled) {
	for (const field of els.form.elements) {
		field.disabled = !enabled;
	}

	els.saveButton.disabled = !enabled;
	els.draftButton.disabled = !enabled;
	els.publishButton.disabled = !enabled;
	els.deleteButton.disabled = !enabled || !state.current?.id;
}

function setBusy(busy) {
	for (const button of document.querySelectorAll("button")) {
		if (button.classList.contains("link-button")) continue;
		button.disabled = busy || (!state.token && button.id !== "");
	}
	updateAuthState();
	setEditorEnabled(Boolean(state.current) && !busy);
}

function updatePreview() {
	const text = els.body.value || "";
	els.wordCount.textContent = `${text.replace(/\s+/g, "").length} 字`;
	els.preview.innerHTML = renderMarkdownPreview(text);
}

function renderMarkdownPreview(markdown) {
	if (!markdown.trim()) {
		return "<p>暂无正文</p>";
	}

	const blocks = escapeHtml(markdown).split(/\n{2,}/);
	return blocks
		.map((block) => {
			if (block.startsWith("```")) {
				return `<pre><code>${block.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "")}</code></pre>`;
			}

			const withInline = block
				.replace(/^### (.*)$/gm, "<h3>$1</h3>")
				.replace(/^## (.*)$/gm, "<h2>$1</h2>")
				.replace(/^# (.*)$/gm, "<h1>$1</h1>")
				.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
				.replace(/`([^`]+)`/g, "<code>$1</code>");

			if (/^<h[1-3]>/.test(withInline)) return withInline;
			return `<p>${withInline.replace(/\n/g, "<br />")}</p>`;
		})
		.join("");
}

function parseTags(value) {
	return value
		.split(/[,，]/)
		.map((tag) => tag.trim())
		.filter(Boolean);
}

function slugify(value) {
	const slug = value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9/]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/\/-+|-+\//g, "/");

	return slug || `post-${compactTimestamp()}`;
}

function today() {
	return new Date().toISOString().slice(0, 10);
}

function compactTimestamp() {
	return new Date()
		.toISOString()
		.replace(/[-:T.Z]/g, "")
		.slice(0, 12);
}

function formatDate(value) {
	if (!value) return "";
	return String(value).slice(0, 10);
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function notify(message, isError = false) {
	els.toast.textContent = message;
	els.toast.style.background = isError ? "#c44848" : "#202634";
	els.toast.classList.add("show");
	window.clearTimeout(notify.timer);
	notify.timer = window.setTimeout(
		() => els.toast.classList.remove("show"),
		2600,
	);
}
