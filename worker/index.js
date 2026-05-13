import { marked } from "marked";

const DEFAULT_CONTENT_ROOT = "src/content/posts";
const DEFAULT_PAGE_SIZE = 10;
const LIVE_POST_SHELL_PATH = "/live-post-shell/";
const LIVE_CACHE_TTL_MS = 10000;
const LIVE_POLL_MS = 15000;
const LIVE_SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS live_posts (
		slug TEXT PRIMARY KEY,
		relative_path TEXT NOT NULL UNIQUE,
		extension TEXT NOT NULL,
		title TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		body TEXT NOT NULL DEFAULT '',
		category TEXT NOT NULL DEFAULT '',
		tags_json TEXT NOT NULL DEFAULT '[]',
		published TEXT NOT NULL,
		updated TEXT,
		image TEXT NOT NULL DEFAULT '',
		lang TEXT NOT NULL DEFAULT '',
		author TEXT NOT NULL DEFAULT '',
		source_link TEXT NOT NULL DEFAULT '',
		license_name TEXT NOT NULL DEFAULT '',
		license_url TEXT NOT NULL DEFAULT '',
		password TEXT NOT NULL DEFAULT '',
		password_hint TEXT NOT NULL DEFAULT '',
		draft INTEGER NOT NULL DEFAULT 1,
		pinned INTEGER NOT NULL DEFAULT 0,
		comment INTEGER NOT NULL DEFAULT 1,
		extra_json TEXT NOT NULL DEFAULT '{}',
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		modified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	"CREATE INDEX IF NOT EXISTS idx_live_posts_published ON live_posts(published DESC)",
	"CREATE INDEX IF NOT EXISTS idx_live_posts_category ON live_posts(category)",
	"CREATE INDEX IF NOT EXISTS idx_live_posts_draft ON live_posts(draft)",
];
const KNOWN_FRONTMATTER_KEYS = new Set([
	"title",
	"published",
	"updated",
	"description",
	"image",
	"tags",
	"category",
	"draft",
	"pinned",
	"comment",
	"lang",
	"author",
	"sourceLink",
	"licenseName",
	"licenseUrl",
	"password",
	"passwordHint",
]);

marked.setOptions({
	breaks: true,
	gfm: true,
});

const publicCache = new Map();
let d1BootstrapPromise = null;

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
			return json({}, 204);
		}

		if (url.pathname === "/api/health" && request.method === "GET") {
			return json({
				liveContentEnabled: hasLiveDataSource(env),
				mode: "worker-assets",
				ok: true,
				pollMs: LIVE_POLL_MS,
				service: "firefly-admin-worker",
				storage: getStorageMode(env),
			});
		}

		if (url.pathname === "/api/allPostMeta.json" && request.method === "GET") {
			return json(await getAllPostMeta(env), 200, true);
		}

		if (url.pathname === "/api/live/status" && request.method === "GET") {
			return json(await getLiveStatus(env), 200, true);
		}

		if (url.pathname === "/api/live/sync" && request.method === "POST") {
			try {
				if (!requireAuth(request, env))
					return json({ error: "Unauthorized" }, 401);
				const result = await syncLiveStoreFromGithub(env, true);
				invalidatePublicCache();
				return json(result, 200, true);
			} catch (error) {
				return json(
					{ error: error.message || "Failed to sync live store" },
					error.statusCode || 500,
					true,
				);
			}
		}

		if (
			request.method === "GET" &&
			(url.pathname === "/api/live/posts" ||
				url.pathname.startsWith("/api/live/posts/"))
		) {
			try {
				return await handlePublicLiveRequest(env, url);
			} catch (error) {
				return json(
					{ error: error.message || "Failed to read live content" },
					error.statusCode || 500,
					true,
				);
			}
		}

		if (
			url.pathname === "/api/posts" ||
			url.pathname.startsWith("/api/posts/")
		) {
			return handleAdminPostsRequest(request, env, url);
		}

		if (request.method === "GET" && isPostRoute(url.pathname)) {
			const assetResponse = await env.ASSETS.fetch(request);
			if (assetResponse.status !== 404) return assetResponse;

			const slug = normalizeRouteSlug(url.pathname.replace(/^\/posts\/?/, ""));
			const livePost = await getPublicPostBySlug(env, slug);
			if (livePost) {
				return serveLivePostShell(request, env);
			}
			return assetResponse;
		}

		return env.ASSETS.fetch(request);
	},
};

async function handlePublicLiveRequest(env, url) {
	if (!hasLiveDataSource(env)) {
		return json(
			{
				enabled: false,
				error: "Live content source is not configured",
			},
			503,
			true,
		);
	}

	const slug = normalizeRouteSlug(
		url.pathname.replace(/^\/api\/live\/posts\/?/, ""),
	);

	if (!slug) {
		const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10));
		const pageSize = Math.max(
			1,
			Number.parseInt(
				url.searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE),
				10,
			),
		);
		const category = url.searchParams.get("category") || "";
		const tag = url.searchParams.get("tag") || "";
		const includeDraft = url.searchParams.get("includeDraft") === "true";
		const all = url.searchParams.get("all") === "true";
		const feed = await getPublicFeed(env, {
			all,
			category,
			includeDraft,
			page,
			pageSize,
			tag,
		});
		return json(feed, 200, true);
	}

	const post = await getPublicPostBySlug(env, slug);
	if (!post) {
		return json({ error: "Post not found" }, 404, true);
	}

	return json(post, 200, true);
}

async function handleAdminPostsRequest(request, env, url) {
	try {
		if (!requireAuth(request, env)) return json({ error: "Unauthorized" }, 401);

		const slug = normalizeRouteSlug(
			url.pathname.replace(/^\/api\/posts\/?/, ""),
		);

		if (!slug && request.method === "GET") {
			const includeDraft = url.searchParams.get("includeDraft") === "true";
			return json(await listAdminPosts(env, includeDraft), 200, true);
		}

		if (!slug && request.method === "POST") {
			const payload = await request.json();
			return json(await createPost(env, payload), 201, true);
		}

		if (slug && request.method === "GET") {
			return json(await readAdminPost(env, slug), 200, true);
		}

		if (slug && request.method === "PUT") {
			const payload = await request.json();
			return json(await updatePost(env, slug, payload), 200, true);
		}

		if (slug && request.method === "DELETE") {
			const force = url.searchParams.get("force") === "true";
			return json(await deletePost(env, slug, force), 200, true);
		}

		return json({ error: "Not found" }, 404, true);
	} catch (error) {
		return json(
			{
				error: error.message || "Internal server error",
			},
			error.statusCode || 500,
			true,
		);
	}
}

async function listAdminPosts(env, includeDraft) {
	const posts = await getSourcePosts(env, { includeDraft: true });
	return sortPosts(posts)
		.filter((post) => includeDraft || !post.frontmatter.draft)
		.map(toListPost);
}

async function readAdminPost(env, slug) {
	const normalized = normalizeSlug(slug);
	const posts = await getSourcePosts(env, { includeDraft: true });
	const post = posts.find((item) => item.id === normalized.id);
	if (post) return clonePost(post);
	return readPostByPath(env, toGithubPath(env, normalized.relativePath));
}

async function createPost(env, payload) {
	const extension = payload.extension === ".mdx" ? ".mdx" : ".md";
	const post = normalizeSlug(payload.slug || payload.title, extension);
	const filePath = toGithubPath(env, post.relativePath);

	const exists = await getContent(env, filePath, false);
	if (exists) {
		const error = new Error("Post already exists");
		error.statusCode = 409;
		throw error;
	}

	const frontmatter = buildFrontmatter(payload);
	await putContent(env, filePath, {
		content: stringifyPost(frontmatter, payload.body || ""),
		message: `content: create ${post.relativePath}`,
	});

	const created = await readPostByPath(env, filePath);
	await mirrorPostToLiveStore(env, created);
	invalidatePublicCache();
	return created;
}

async function updatePost(env, slug, payload) {
	const post = normalizeSlug(slug);
	const filePath = toGithubPath(env, post.relativePath);
	const existing = await readPostByPath(env, filePath);
	const frontmatter = buildFrontmatter(payload, existing.frontmatter);
	const body = typeof payload.body === "string" ? payload.body : existing.body;

	await putContent(env, filePath, {
		content: stringifyPost(frontmatter, body),
		message: `content: update ${post.relativePath}`,
		sha: existing.sha,
	});

	const updated = await readPostByPath(env, filePath);
	await mirrorPostToLiveStore(env, updated);
	invalidatePublicCache();
	return updated;
}

async function deletePost(env, slug, force) {
	const post = normalizeSlug(slug);
	const filePath = toGithubPath(env, post.relativePath);
	const existing = await readPostByPath(env, filePath);

	if (!force && existing.frontmatter.draft !== true) {
		const error = new Error(
			"Only draft posts can be deleted unless force=true is provided",
		);
		error.statusCode = 409;
		throw error;
	}

	await github(env, `/contents/${encodePath(filePath)}`, {
		body: {
			branch: getBranch(env),
			message: `content: delete ${post.relativePath}`,
			sha: existing.sha,
		},
		method: "DELETE",
	});

	await deletePostFromLiveStore(env, existing.id);
	invalidatePublicCache();
	return { deleted: post.relativePath };
}

async function getAllPostMeta(env) {
	const posts = await getSourcePosts(env, { includeDraft: false });
	return sortPosts(posts).map((post) => ({
		category: post.frontmatter.category || "",
		description: post.frontmatter.description || "",
		id: post.id,
		password: Boolean(post.frontmatter.password),
		published: new Date(post.frontmatter.published).getTime(),
		title: post.frontmatter.title,
	}));
}

async function getLiveStatus(env) {
	let postCount = 0;
	try {
		const posts = await getSourcePosts(env, { includeDraft: true });
		postCount = posts.length;
	} catch {}

	return {
		enabled: hasLiveDataSource(env),
		pollMs: LIVE_POLL_MS,
		postCount,
		storage: getStorageMode(env),
	};
}

async function getPublicFeed(env, options) {
	const posts = await getSourcePosts(env, {
		includeDraft: options.includeDraft === true,
	});
	const sorted = sortPosts(posts);
	let filtered = sorted.filter((post) =>
		options.includeDraft ? true : !post.frontmatter.draft,
	);

	if (options.category) {
		filtered = filtered.filter(
			(post) => (post.frontmatter.category || "") === options.category,
		);
	}
	if (options.tag) {
		filtered = filtered.filter((post) =>
			Array.isArray(post.frontmatter.tags)
				? post.frontmatter.tags.includes(options.tag)
				: false,
		);
	}

	const total = filtered.length;
	const pageSize = options.all ? total || 1 : options.pageSize;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const page = Math.min(options.page, totalPages);
	const pageItems = options.all
		? filtered
		: filtered.slice((page - 1) * pageSize, page * pageSize);

	return {
		html: renderFeedHtml(env, pageItems),
		items: pageItems.map((post) => toFeedItem(env, post)),
		page,
		pageSize,
		pollMs: LIVE_POLL_MS,
		total,
		totalPages,
	};
}

async function getPublicPostBySlug(env, slug) {
	const normalized = normalizeSlug(slug);
	const posts = await getSourcePosts(env, { includeDraft: true });
	const sorted = sortPosts(posts);
	const publicPosts = sorted.filter((post) => !post.frontmatter.draft);
	const post = publicPosts.find((item) => item.id === normalized.id);

	if (!post) return null;

	const currentIndex = publicPosts.findIndex((item) => item.id === normalized.id);
	const previous = currentIndex < publicPosts.length - 1 ? publicPosts[currentIndex + 1] : null;
	const next = currentIndex > 0 ? publicPosts[currentIndex - 1] : null;

	return {
		category: post.frontmatter.category || "",
		description: post.frontmatter.description || "",
		id: post.id,
		image: resolveAssetUrl(env, post, post.frontmatter.image || ""),
		mainHtml: renderLivePostMainHtml(env, post, { next, previous }),
		password: Boolean(post.frontmatter.password),
		pollMs: LIVE_POLL_MS,
		published: post.frontmatter.published,
		relativePath: post.relativePath,
		tags: Array.isArray(post.frontmatter.tags) ? post.frontmatter.tags : [],
		title: post.frontmatter.title,
		updated: post.frontmatter.updated || "",
	};
}

async function serveLivePostShell(request, env) {
	const shellRequest = new Request(new URL(LIVE_POST_SHELL_PATH, request.url), request);
	const shell = await env.ASSETS.fetch(shellRequest);
	if (shell.status !== 404) {
		return withNoStore(shell);
	}

	return new Response(
		`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Loading...</title></head><body><main id="live-post-main" style="max-width:960px;margin:4rem auto;padding:2rem;color:#fff;background:#111;border-radius:16px">正在加载文章...</main><script>location.reload()</script></body></html>`,
		{
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "text/html; charset=utf-8",
			},
		},
	);
}

async function getSourcePosts(env, options = {}) {
	const includeDraft = options.includeDraft === true;
	const cacheKey = `${getStorageMode(env)}:${includeDraft ? "drafts" : "public"}`;
	const cached = publicCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.posts.map(clonePost);
	}

	let posts = [];
	if (hasLiveDatabase(env)) {
		await ensureLiveDatabaseReady(env);
		posts = await listPostsFromD1(env);
	} else {
		posts = await listPostsFromGithub(env);
	}

	if (!includeDraft) {
		posts = posts.filter((post) => !post.frontmatter.draft);
	}

	publicCache.set(cacheKey, {
		expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
		posts: posts.map(clonePost),
	});
	return posts;
}

function invalidatePublicCache() {
	publicCache.clear();
}

async function ensureLiveDatabaseReady(env) {
	if (!hasLiveDatabase(env)) return;

	for (const statement of LIVE_SCHEMA_STATEMENTS) {
		await env.POSTS_DB.prepare(statement).run();
	}

	const countResult = await env.POSTS_DB.prepare(
		"SELECT COUNT(*) AS count FROM live_posts",
	).first();
	const count = Number(countResult?.count || 0);

	if (count > 0 || !hasGithubConfig(env)) return;

	if (!d1BootstrapPromise) {
		d1BootstrapPromise = syncLiveStoreFromGithub(env, false).finally(() => {
			d1BootstrapPromise = null;
		});
	}
	await d1BootstrapPromise;
}

async function syncLiveStoreFromGithub(env, clearExisting) {
	if (!hasLiveDatabase(env)) {
		return { synced: 0, storage: "github" };
	}

	await ensureD1Tables(env);
	if (clearExisting) {
		await env.POSTS_DB.prepare("DELETE FROM live_posts").run();
	}

	const posts = await listPostsFromGithub(env);
	for (const post of posts) {
		await upsertPostInD1(env, post);
	}
	return {
		storage: "d1",
		synced: posts.length,
	};
}

async function ensureD1Tables(env) {
	for (const statement of LIVE_SCHEMA_STATEMENTS) {
		await env.POSTS_DB.prepare(statement).run();
	}
}

async function listPostsFromD1(env) {
	const { results = [] } = await env.POSTS_DB.prepare(
		"SELECT * FROM live_posts",
	).all();
	return results.map(mapRowToPost);
}

async function upsertPostInD1(env, post) {
	if (!hasLiveDatabase(env)) return;

	const normalized = normalizeStoredPost(post);
	await ensureD1Tables(env);
	await env.POSTS_DB.prepare(
		`INSERT INTO live_posts (
			slug,
			relative_path,
			extension,
			title,
			description,
			body,
			category,
			tags_json,
			published,
			updated,
			image,
			lang,
			author,
			source_link,
			license_name,
			license_url,
			password,
			password_hint,
			draft,
			pinned,
			comment,
			extra_json,
			modified_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(slug) DO UPDATE SET
			relative_path = excluded.relative_path,
			extension = excluded.extension,
			title = excluded.title,
			description = excluded.description,
			body = excluded.body,
			category = excluded.category,
			tags_json = excluded.tags_json,
			published = excluded.published,
			updated = excluded.updated,
			image = excluded.image,
			lang = excluded.lang,
			author = excluded.author,
			source_link = excluded.source_link,
			license_name = excluded.license_name,
			license_url = excluded.license_url,
			password = excluded.password,
			password_hint = excluded.password_hint,
			draft = excluded.draft,
			pinned = excluded.pinned,
			comment = excluded.comment,
			extra_json = excluded.extra_json,
			modified_at = CURRENT_TIMESTAMP`,
	)
		.bind(
			normalized.id,
			normalized.relativePath,
			normalized.extension,
			normalized.frontmatter.title,
			normalized.frontmatter.description || "",
			normalized.body || "",
			normalized.frontmatter.category || "",
			JSON.stringify(normalized.frontmatter.tags || []),
			normalized.frontmatter.published,
			normalized.frontmatter.updated || null,
			normalized.frontmatter.image || "",
			normalized.frontmatter.lang || "",
			normalized.frontmatter.author || "",
			normalized.frontmatter.sourceLink || "",
			normalized.frontmatter.licenseName || "",
			normalized.frontmatter.licenseUrl || "",
			normalized.frontmatter.password || "",
			normalized.frontmatter.passwordHint || "",
			normalized.frontmatter.draft ? 1 : 0,
			normalized.frontmatter.pinned ? 1 : 0,
			normalized.frontmatter.comment !== false ? 1 : 0,
			JSON.stringify(normalized.frontmatter.extra || {}),
		)
		.run();
}

async function deletePostFromLiveStore(env, slug) {
	if (!hasLiveDatabase(env)) return;
	await ensureD1Tables(env);
	await env.POSTS_DB.prepare("DELETE FROM live_posts WHERE slug = ?")
		.bind(slug)
		.run();
}

async function mirrorPostToLiveStore(env, post) {
	if (!hasLiveDatabase(env)) return;
	await upsertPostInD1(env, post);
}

function mapRowToPost(row) {
	const extra = parseJson(row.extra_json, {});
	const frontmatter = {
		...extra,
		author: row.author || "",
		category: row.category || "",
		comment: Number(row.comment) !== 0,
		description: row.description || "",
		draft: Number(row.draft) !== 0,
		image: row.image || "",
		lang: row.lang || "",
		licenseName: row.license_name || "",
		licenseUrl: row.license_url || "",
		password: row.password || "",
		passwordHint: row.password_hint || "",
		pinned: Number(row.pinned) !== 0,
		published: row.published || new Date().toISOString().slice(0, 10),
		sourceLink: row.source_link || "",
		tags: parseJson(row.tags_json, []),
		title: row.title || row.slug,
		...(row.updated ? { updated: row.updated } : {}),
	};

	return {
		body: row.body || "",
		frontmatter,
		id: row.slug,
		relativePath: row.relative_path,
	};
}

function normalizeStoredPost(post) {
	const extension = pathExtension(post.relativePath) || ".md";
	const frontmatter = {
		...post.frontmatter,
		title: post.frontmatter.title || post.id,
		description: post.frontmatter.description || "",
		category: post.frontmatter.category || "",
		tags: Array.isArray(post.frontmatter.tags) ? post.frontmatter.tags : [],
		published: normalizeDateValue(post.frontmatter.published),
		...(post.frontmatter.updated
			? { updated: normalizeDateValue(post.frontmatter.updated) }
			: {}),
		draft: Boolean(post.frontmatter.draft),
		pinned: Boolean(post.frontmatter.pinned),
		comment: post.frontmatter.comment !== false,
		image: post.frontmatter.image || "",
		lang: post.frontmatter.lang || "",
		author: post.frontmatter.author || "",
		sourceLink: post.frontmatter.sourceLink || "",
		licenseName: post.frontmatter.licenseName || "",
		licenseUrl: post.frontmatter.licenseUrl || "",
		password: post.frontmatter.password || "",
		passwordHint: post.frontmatter.passwordHint || "",
		extra: extractExtraFrontmatter(post.frontmatter),
	};

	return {
		body: post.body || "",
		extension,
		frontmatter,
		id: post.id,
		relativePath: post.relativePath,
	};
}

function extractExtraFrontmatter(frontmatter) {
	return Object.fromEntries(
		Object.entries(frontmatter).filter(
			([key]) => !KNOWN_FRONTMATTER_KEYS.has(key),
		),
	);
}

async function listPostsFromGithub(env) {
	const tree = await github(
		env,
		`/git/trees/${encodeURIComponent(getBranch(env))}?recursive=1`,
	);
	const contentRoot = getContentRoot(env);
	const postPaths = tree.tree
		.filter((item) => item.type === "blob")
		.map((item) => item.path)
		.filter(
			(itemPath) =>
				itemPath.startsWith(`${contentRoot}/`) && /\.(md|mdx)$/i.test(itemPath),
		);
	const posts = await Promise.all(
		postPaths.map((itemPath) => readPostByPath(env, itemPath)),
	);
	return posts;
}

async function readPostByPath(env, filePath) {
	const item = await getContent(env, filePath, true);
	const raw = decodeBase64(item.content || "");
	const parsed = parseFrontmatter(raw);
	const contentRoot = getContentRoot(env);
	const relativePath = filePath.slice(contentRoot.length + 1);

	return {
		body: parsed.body.trimStart(),
		frontmatter: parsed.frontmatter,
		id: relativePath.replace(/\.(md|mdx)$/i, ""),
		relativePath,
		sha: item.sha,
	};
}

async function getContent(env, filePath, required) {
	const response = await github(
		env,
		`/contents/${encodePath(filePath)}?ref=${encodeURIComponent(getBranch(env))}`,
		{
			allowNotFound: !required,
		},
	);
	if (!response && required) {
		const error = new Error("Post not found");
		error.statusCode = 404;
		throw error;
	}
	return response;
}

async function putContent(env, filePath, input) {
	await github(env, `/contents/${encodePath(filePath)}`, {
		body: {
			branch: getBranch(env),
			content: encodeBase64(input.content),
			message: input.message,
			...(input.sha ? { sha: input.sha } : {}),
		},
		method: "PUT",
	});
}

async function github(env, path, options = {}) {
	const owner = cleanEnv(env.GITHUB_OWNER);
	const repo = cleanEnv(env.GITHUB_REPO);
	const token = cleanEnv(env.GITHUB_TOKEN);

	if (!owner || !repo || !token) {
		const error = new Error("Missing GitHub environment variables");
		error.statusCode = 500;
		throw error;
	}

	const response = await fetch(
		`https://api.github.com/repos/${owner}/${repo}${path}`,
		{
			body: options.body ? JSON.stringify(options.body) : undefined,
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"User-Agent": "firefly-admin-worker",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			method: options.method || "GET",
		},
	);

	if (response.status === 404 && options.allowNotFound) return null;

	if (!response.ok) {
		const details = await response.text();
		const error = new Error(`GitHub API failed: ${response.status} ${details}`);
		error.statusCode = response.status;
		throw error;
	}

	if (response.status === 204) return {};
	return response.json();
}

function renderFeedHtml(env, posts) {
	return posts
		.map((post) => {
			const cover = resolveAssetUrl(env, post, post.frontmatter.image || "");
			const hasCover = Boolean(cover);
			const tagHtml = Array.isArray(post.frontmatter.tags)
				? post.frontmatter.tags
						.slice(0, 5)
						.map(
							(tag) =>
								`<span class="btn-regular h-6 text-xs px-2 py-1 rounded-md">#${escapeHtml(tag)}</span>`,
						)
						.join("")
				: "";
			const category = post.frontmatter.category
				? `<a href="/archive/?category=${encodeURIComponent(
						post.frontmatter.category,
					)}" class="link-lg transition text-50 text-sm font-medium hover:text-(--primary) dark:hover:text-(--primary) whitespace-nowrap">${escapeHtml(post.frontmatter.category)}</a>`
				: "";
			const published = escapeHtml(
				normalizeDateValue(post.frontmatter.published || ""),
			);
			const pinned = post.frontmatter.pinned
				? `<div class="pinned-btn flex items-center gap-1 bg-(--btn-regular-bg) text-(--btn-content) rounded-md px-2 py-1.5 font-bold"><span class="text-sm">置顶</span></div>`
				: "";
			return `
				<div class="post-card-wrapper ${hasCover ? "has-cover" : "no-cover"} ${
					post.frontmatter.pinned ? "pinned" : ""
				} card-base flex flex-col-reverse w-full rounded-(--radius-large) overflow-hidden relative onload-animation post-card-item">
					<div class="post-card-content pl-4 md:pl-9 pr-4 md:pr-2 pt-4 md:pt-7 pb-4 md:pb-7 relative flex flex-col h-full ${
						hasCover
							? "w-full md:w-[calc(100%-var(--coverWidth)-1.5rem)]"
							: "w-full md:w-[calc(100%-52px-12px)]"
					}">
						<a href="/posts/${encodeURI(post.id)}/" class="post-card-title transition group w-full block font-bold mb-3 text-3xl text-90 hover:text-(--primary) dark:hover:text-(--primary) active:text-(--title-active) dark:active:text-(--title-active) before:w-1 before:h-5 before:rounded-md before:bg-(--primary) before:absolute before:top-[35px] before:left-[18px] before:hidden md:before:block">
							${escapeHtml(post.frontmatter.title)}
							${post.frontmatter.password ? '<span class="inline text-2xl align-middle -translate-y-px">🔒</span>' : ""}
						</a>
						<div class="post-meta-root flex flex-wrap text-neutral-500 dark:text-neutral-400 items-center gap-4 gap-x-4 gap-y-2 mb-4 post-meta">
							${pinned}
							<div class="flex items-center"><span class="text-50 text-sm font-medium">${published}</span></div>
							${category ? `<div class="flex items-center"><div class="flex flex-row flex-nowrap items-center">${category}</div></div>` : ""}
						</div>
						<div class="transition text-75 md:pr-4 description grow description-clamped" title="${escapeHtml(
							post.frontmatter.description || "",
						)}">${escapeHtml(post.frontmatter.description || "")}</div>
						<div class="text-sm text-black/30 dark:text-white/30 flex flex-wrap gap-2 transition stats pt-3">${tagHtml}</div>
					</div>
					${
						hasCover
							? `<a href="/posts/${encodeURI(post.id)}/" aria-label="${escapeHtml(
									post.frontmatter.title,
								)}" class="post-card-image group w-full md:w-(--coverWidth) aspect-2/1 md:aspect-auto relative md:absolute md:top-4 md:bottom-4 md:right-4 rounded-(--radius-large) md:rounded-xl overflow-hidden">
									<div class="absolute pointer-events-none z-10 w-full h-full group-hover:bg-black/30 group-active:bg-black/50 transition"></div>
									<img src="${escapeHtml(cover)}" alt="${escapeHtml(
										post.frontmatter.title,
									)}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 group-active:scale-115" loading="lazy" />
								</a>`
							: `<a href="/posts/${encodeURI(post.id)}/" aria-label="${escapeHtml(
									post.frontmatter.title,
								)}" class="post-card-enter-btn flex btn-regular w-13 absolute right-3 top-3 bottom-3 rounded-xl bg-(--enter-btn-bg) hover:bg-(--enter-btn-bg-hover) active:bg-(--enter-btn-bg-active) active:scale-95"><span class="transition text-(--primary) text-4xl mx-auto">›</span></a>`
					}
				</div>
			`;
		})
		.join("");
}

function renderLivePostMainHtml(env, post, neighbors) {
	const cover = resolveAssetUrl(env, post, post.frontmatter.image || "");
	const category = post.frontmatter.category
		? `<a href="/archive/?category=${encodeURIComponent(
				post.frontmatter.category,
			)}" class="link-lg transition text-50 text-sm font-medium hover:text-(--primary) dark:hover:text-(--primary) whitespace-nowrap">${escapeHtml(post.frontmatter.category)}</a>`
		: "";
	const tags = Array.isArray(post.frontmatter.tags)
		? post.frontmatter.tags
				.map(
					(tag) =>
						`<a href="/archive/?tag=${encodeURIComponent(
							tag,
						)}" class="btn-regular h-6 text-xs px-2 py-1 rounded-md transition-all duration-200">#${escapeHtml(tag)}</a>`,
				)
				.join("")
		: "";
	const bodyHtml = post.frontmatter.password
		? `<div class="rounded-xl bg-(--license-block-bg) p-5 text-sm text-75">这篇文章启用了密码保护。实时模式下暂不直接展示加密正文，请等待静态构建版本，或在后台改为非加密文章。</div>`
		: marked.parse(rewriteRelativeAssets(post.body || "", post, env));
	const published = escapeHtml(normalizeDateValue(post.frontmatter.published || ""));
	const updated = post.frontmatter.updated
		? `<div class="flex flex-row items-center"><div class="text-sm">${escapeHtml(
				normalizeDateValue(post.frontmatter.updated),
			)}</div></div>`
		: "";
	const wordCount = countWords(post.body || "");
	const minutes = estimateReadingMinutes(post.body || "");
	const previousHref = neighbors.previous
		? `/posts/${encodeURI(neighbors.previous.id)}/`
		: "/";
	const previousTitle = neighbors.previous
		? neighbors.previous.frontmatter.title
		: "首页";
	const nextHref = neighbors.next ? `/posts/${encodeURI(neighbors.next.id)}/` : "/";
	const nextTitle = neighbors.next ? neighbors.next.frontmatter.title : "首页";

	return `
		<div class="flex w-full rounded-(--radius-large) overflow-hidden relative mb-4">
			<div id="post-container" class="card-base z-10 px-6 md:px-9 pt-6 pb-4 relative w-full">
				<div class="flex flex-row text-black/30 dark:text-white/30 gap-5 mb-3 transition onload-animation">
					<div class="flex flex-row items-center">
						<div class="transition h-6 w-6 rounded-md bg-black/5 dark:bg-white/10 text-black/50 dark:text-white/50 flex items-center justify-center mr-2">≡</div>
						<div class="text-sm">${wordCount} 字</div>
					</div>
					<div class="flex flex-row items-center">
						<div class="transition h-6 w-6 rounded-md bg-black/5 dark:bg-white/10 text-black/50 dark:text-white/50 flex items-center justify-center mr-2">⏱</div>
						<div class="text-sm">${minutes} 分钟</div>
					</div>
				</div>

				<div class="relative onload-animation">
					<div data-pagefind-body data-pagefind-weight="10" data-pagefind-meta="title" class="transition w-full block font-bold mb-3 text-3xl md:text-[2.25rem]/[2.75rem] text-black/90 dark:text-white/90 md:before:w-1 before:h-5 before:rounded-md before:bg-(--primary) before:absolute before:top-3 before:-left-4.5">
						${escapeHtml(post.frontmatter.title)}
					</div>
				</div>

				<div class="onload-animation">
					<div class="post-meta-root flex flex-wrap text-neutral-500 dark:text-neutral-400 items-center gap-4 gap-x-4 gap-y-2 mb-4 post-meta">
						<div class="flex items-center"><span class="text-50 text-sm font-medium">${published}</span></div>
						${updated}
						${category ? `<div class="flex items-center"><div class="flex flex-row flex-nowrap items-center">${category}</div></div>` : ""}
					</div>
					${cover ? "" : '<div class="border-(--line-divider) border-dashed border-b mt-3 mb-5"></div>'}
				</div>

				${
					cover
						? `<div style="margin-top:1rem;"><div class="mb-8 rounded-xl banner-container onload-animation overflow-hidden"><img src="${escapeHtml(
								cover,
							)}" alt="${escapeHtml(
								post.frontmatter.title,
							)}" class="w-full h-auto object-cover rounded-xl" /></div></div>`
						: ""
				}

				<div class="mb-4 text-sm text-black/30 dark:text-white/30 flex flex-wrap gap-2 transition stats">${tags}</div>
				<div class="mb-6 markdown-content onload-animation"><div class="prose dark:prose-invert prose-base max-w-none! custom-md">${bodyHtml}</div></div>
			</div>
		</div>

		<div class="flex flex-col md:flex-row justify-between mb-4 gap-4 overflow-hidden w-full">
			<a href="${escapeHtml(previousHref)}" class="w-full font-bold overflow-hidden active:scale-95">
				<div class="btn-card rounded-2xl w-full h-15 max-w-full px-4 flex items-center justify-start! gap-4">
					<span class="text-[2rem] text-(--primary)">‹</span>
					<div class="overflow-hidden transition text-ellipsis whitespace-nowrap max-w-[calc(100%-3rem)] text-black/75 dark:text-white/75">${escapeHtml(previousTitle)}</div>
				</div>
			</a>
			<a href="${escapeHtml(nextHref)}" class="w-full font-bold overflow-hidden active:scale-95">
				<div class="btn-card rounded-2xl w-full h-15 max-w-full px-4 flex items-center justify-end! gap-4">
					<div class="overflow-hidden transition text-ellipsis whitespace-nowrap max-w-[calc(100%-3rem)] text-black/75 dark:text-white/75">${escapeHtml(nextTitle)}</div>
					<span class="text-[2rem] text-(--primary)">›</span>
				</div>
			</a>
		</div>
	`;
}

function rewriteRelativeAssets(markdown, post, env) {
	if (!markdown) return "";
	const baseDir = dirname(post.relativePath || "");
	return markdown
		.replace(
			/!\[([^\]]*)\]\((?!https?:\/\/|\/|#|data:)([^)]+)\)/g,
			(_full, alt, src) =>
				`![${alt}](${resolveAssetUrl(env, post, joinPosix(baseDir, src))})`,
		)
		.replace(
			/<img([^>]*?)src=["'](?!https?:\/\/|\/|#|data:)([^"']+)["']([^>]*)>/gi,
			(_full, before, src, after) =>
				`<img${before}src="${escapeHtml(
					resolveAssetUrl(env, post, joinPosix(baseDir, src)),
				)}"${after}>`,
		);
}

function resolveAssetUrl(env, post, assetPath) {
	const value = String(assetPath || "").trim();
	if (!value) return "";
	if (
		value.startsWith("/") ||
		value.startsWith("http://") ||
		value.startsWith("https://") ||
		value.startsWith("data:")
	) {
		return value;
	}

	const owner = cleanEnv(env.GITHUB_OWNER);
	const repo = cleanEnv(env.GITHUB_REPO);
	const branch = cleanEnv(env.GITHUB_BRANCH) || "master";
	const contentRoot = getContentRoot(env);
	const baseDir = dirname(post.relativePath || "");
	const resolvedPath = joinPosix(contentRoot, baseDir, value);
	if (!owner || !repo) return value;
	return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${resolvedPath}`;
}

function toListPost(post) {
	return {
		category: post.frontmatter.category || "",
		description: post.frontmatter.description || "",
		draft: post.frontmatter.draft === true,
		id: post.id,
		published: normalizeDateValue(post.frontmatter.published || ""),
		relativePath: post.relativePath,
		tags: Array.isArray(post.frontmatter.tags) ? post.frontmatter.tags : [],
		title: post.frontmatter.title || post.id,
	};
}

function toFeedItem(env, post) {
	return {
		...toListPost(post),
		image: resolveAssetUrl(env, post, post.frontmatter.image || ""),
		password: Boolean(post.frontmatter.password),
		pinned: Boolean(post.frontmatter.pinned),
		updated: post.frontmatter.updated || "",
	};
}

function sortPosts(posts) {
	return posts.slice().sort((a, b) => {
		if (a.frontmatter.pinned && !b.frontmatter.pinned) return -1;
		if (!a.frontmatter.pinned && b.frontmatter.pinned) return 1;
		const dateA = new Date(a.frontmatter.published);
		const dateB = new Date(b.frontmatter.published);
		return dateA > dateB ? -1 : 1;
	});
}

function clonePost(post) {
	return {
		...post,
		frontmatter: {
			...post.frontmatter,
			tags: Array.isArray(post.frontmatter.tags)
				? [...post.frontmatter.tags]
				: [],
		},
	};
}

function normalizeDateValue(value) {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return String(value || "").slice(0, 10);
}

function countWords(content) {
	return String(content || "").replace(/\s+/g, "").length;
}

function estimateReadingMinutes(content) {
	return Math.max(1, Math.ceil(countWords(content) / 500));
}

function requireAuth(request, env) {
	const token = cleanEnv(env.ADMIN_TOKEN);
	return Boolean(
		token && request.headers.get("authorization") === `Bearer ${token}`,
	);
}

function hasLiveDatabase(env) {
	return Boolean(env.POSTS_DB && typeof env.POSTS_DB.prepare === "function");
}

function hasGithubConfig(env) {
	return Boolean(
		cleanEnv(env.GITHUB_OWNER) &&
			cleanEnv(env.GITHUB_REPO) &&
			cleanEnv(env.GITHUB_TOKEN),
	);
}

function hasLiveDataSource(env) {
	return hasLiveDatabase(env) || hasGithubConfig(env);
}

function getStorageMode(env) {
	if (hasLiveDatabase(env)) return "d1";
	if (hasGithubConfig(env)) return "github";
	return "none";
}

function cleanEnv(value) {
	return String(value || "").trim();
}

function normalizeRouteSlug(value) {
	return decodeURIComponent(value || "")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
}

function normalizeSlug(slug, extension = ".md") {
	if (typeof slug !== "string" || !slug.trim()) {
		const error = new Error("slug is required");
		error.statusCode = 400;
		throw error;
	}

	const normalized = slug
		.trim()
		.replaceAll("\\", "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");

	if (normalized.includes("..") || /^[a-zA-Z]:/.test(normalized)) {
		const error = new Error("Invalid slug");
		error.statusCode = 400;
		throw error;
	}

	const fileName = pathExtension(normalized)
		? normalized
		: `${normalized}${extension}`;
	const ext = pathExtension(fileName).toLowerCase();
	if (![".md", ".mdx"].includes(ext)) {
		const error = new Error("Only .md and .mdx posts are supported");
		error.statusCode = 400;
		throw error;
	}

	return {
		id: fileName.replace(/\.(md|mdx)$/i, ""),
		relativePath: fileName,
	};
}

function buildFrontmatter(payload, existing = {}) {
	const input =
		payload.frontmatter && typeof payload.frontmatter === "object"
			? payload.frontmatter
			: payload;
	const frontmatter = {
		...existing,
		...input,
	};

	if (!frontmatter.title && payload.title) frontmatter.title = payload.title;
	if (!frontmatter.title) frontmatter.title = "未命名文章";
	if (!frontmatter.published)
		frontmatter.published = new Date().toISOString().slice(0, 10);
	if (!Array.isArray(frontmatter.tags)) frontmatter.tags = [];
	if (frontmatter.category == null) frontmatter.category = "";
	if (frontmatter.description == null) frontmatter.description = "";
	if (frontmatter.draft == null) frontmatter.draft = true;

	delete frontmatter.body;
	delete frontmatter.slug;
	delete frontmatter.extension;

	return frontmatter;
}

function parseFrontmatter(raw) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { body: raw, frontmatter: {} };

	const frontmatter = {};
	for (const line of match[1].split(/\r?\n/)) {
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!field) continue;
		frontmatter[field[1]] = parseYamlValue(field[2]);
	}

	return {
		body: raw.slice(match[0].length),
		frontmatter,
	};
}

function parseYamlValue(value) {
	const trimmed = value.trim();
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (trimmed === "null") return null;
	if (trimmed === "[]" || trimmed === "") return trimmed === "[]" ? [] : "";
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return trimmed
			.slice(1, -1)
			.split(",")
			.map((item) => stripQuotes(item.trim()))
			.filter(Boolean);
	}
	return stripQuotes(trimmed);
}

function stringifyPost(frontmatter, body) {
	const preferredKeys = [
		"title",
		"published",
		"updated",
		"description",
		"image",
		"tags",
		"category",
		"draft",
		"pinned",
		"comment",
		"lang",
		"author",
		"sourceLink",
		"licenseName",
		"licenseUrl",
		"password",
		"passwordHint",
	];
	const keys = [
		...preferredKeys.filter((key) => Object.hasOwn(frontmatter, key)),
		...Object.keys(frontmatter)
			.filter((key) => !preferredKeys.includes(key))
			.sort(),
	];
	const frontmatterText = keys
		.map((key) => `${key}: ${formatYamlValue(key, frontmatter[key])}`)
		.join("\n");
	return `---\n${frontmatterText}\n---\n\n${(body || "").trimStart()}`;
}

function formatYamlValue(key, value) {
	if (Array.isArray(value))
		return `[${value.map((item) => formatYamlString(String(item))).join(", ")}]`;
	if (typeof value === "boolean") return value ? "true" : "false";
	if (value == null) return "null";
	if (
		(key === "published" || key === "updated") &&
		/^\d{4}-\d{2}-\d{2}/.test(String(value))
	) {
		return String(value).slice(0, 10);
	}
	return formatYamlString(String(value));
}

function formatYamlString(value) {
	if (!value) return "''";
	if (/^[A-Za-z0-9_-]+$/.test(value)) return value;
	return JSON.stringify(value);
}

function stripQuotes(value) {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function toGithubPath(env, relativePath) {
	return `${getContentRoot(env)}/${relativePath}`.replaceAll("\\", "/");
}

function getBranch(env) {
	return env.GITHUB_BRANCH || "master";
}

function getContentRoot(env) {
	return (env.GITHUB_CONTENT_ROOT || DEFAULT_CONTENT_ROOT).replace(/\/+$/, "");
}

function encodePath(filePath) {
	return filePath
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/");
}

function pathExtension(value) {
	const match = value.match(/(\.[^./]+)$/);
	return match ? match[1] : "";
}

function dirname(value) {
	const normalized = String(value || "").replaceAll("\\", "/");
	if (!normalized.includes("/")) return "";
	return normalized.slice(0, normalized.lastIndexOf("/"));
}

function joinPosix(...parts) {
	return parts
		.filter(Boolean)
		.join("/")
		.replace(/\/{2,}/g, "/")
		.replace(/\/\.\//g, "/")
		.replace(/(^|\/)\.(?=\/|$)/g, "")
		.replace(/\/+$/, "");
}

function isPostRoute(pathname) {
	return /^\/posts\/.+/.test(pathname);
}

function decodeBase64(value) {
	const binary = atob(value.replace(/\s/g, ""));
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
	}
	return btoa(binary);
}

function parseJson(value, fallback) {
	try {
		return JSON.parse(String(value || ""));
	} catch {
		return fallback;
	}
}

function escapeHtml(value) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function json(data, status = 200, noStore = false) {
	const headers = {
		"Access-Control-Allow-Headers": "authorization, content-type",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Content-Type": "application/json; charset=utf-8",
	};
	if (noStore) headers["Cache-Control"] = "no-store";
	return new Response(JSON.stringify(data, null, 2), {
		headers,
		status,
	});
}

function withNoStore(response) {
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store");
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}
