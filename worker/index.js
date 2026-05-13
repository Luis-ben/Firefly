const DEFAULT_CONTENT_ROOT = "src/content/posts";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
			return json({}, 204);
		}

		if (url.pathname === "/api/health" && request.method === "GET") {
			return json({
				mode: "worker-assets",
				ok: true,
				service: "firefly-admin-worker",
			});
		}

		if (
			url.pathname === "/api/posts" ||
			url.pathname.startsWith("/api/posts/")
		) {
			return handlePostsRequest(request, env, url);
		}

		return env.ASSETS.fetch(request);
	},
};

async function handlePostsRequest(request, env, url) {
	try {
		if (!requireAuth(request, env)) return json({ error: "Unauthorized" }, 401);

		const slug = normalizeRouteSlug(
			url.pathname.replace(/^\/api\/posts\/?/, ""),
		);

		if (!slug && request.method === "GET") {
			const includeDraft = url.searchParams.get("includeDraft") === "true";
			return json(await listPosts(env, includeDraft));
		}

		if (!slug && request.method === "POST") {
			const payload = await request.json();
			return json(await createPost(env, payload), 201);
		}

		if (slug && request.method === "GET") {
			return json(await readPost(env, slug));
		}

		if (slug && request.method === "PUT") {
			const payload = await request.json();
			return json(await updatePost(env, slug, payload));
		}

		if (slug && request.method === "DELETE") {
			const force = url.searchParams.get("force") === "true";
			return json(await deletePost(env, slug, force));
		}

		return json({ error: "Not found" }, 404);
	} catch (error) {
		return json(
			{
				error: error.message || "Internal server error",
			},
			error.statusCode || 500,
		);
	}
}

async function listPosts(env, includeDraft) {
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

	return posts
		.filter((post) => includeDraft || post.frontmatter.draft !== true)
		.map((post) => ({
			category: post.frontmatter.category || "",
			description: post.frontmatter.description || "",
			draft: post.frontmatter.draft === true,
			id: post.id,
			published: post.frontmatter.published || "",
			relativePath: post.relativePath,
			tags: Array.isArray(post.frontmatter.tags) ? post.frontmatter.tags : [],
			title: post.frontmatter.title || post.id,
		}))
		.sort((a, b) => String(b.published).localeCompare(String(a.published)));
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

	return readPostByPath(env, filePath);
}

async function readPost(env, slug) {
	const post = normalizeSlug(slug);
	return readPostByPath(env, toGithubPath(env, post.relativePath));
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

	return readPostByPath(env, filePath);
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

	return { deleted: post.relativePath };
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

function requireAuth(request, env) {
	const token = cleanEnv(env.ADMIN_TOKEN);
	return Boolean(
		token && request.headers.get("authorization") === `Bearer ${token}`,
	);
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

function json(data, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			"Access-Control-Allow-Headers": "authorization, content-type",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
			"Content-Type": "application/json; charset=utf-8",
		},
		status,
	});
}
