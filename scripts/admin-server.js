import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import matter from "gray-matter";

const projectRoot = process.cwd();
const adminRoot = path.resolve(projectRoot, "public/admin");
const postsRoot = path.resolve(projectRoot, "src/content/posts");

await loadEnv();

const host = process.env.ADMIN_HOST || "127.0.0.1";
const port = Number(process.env.ADMIN_PORT || 8787);
const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
};

function sendJson(res, statusCode, data) {
	const body = JSON.stringify(data, null, 2);
	res.writeHead(statusCode, {
		"Access-Control-Allow-Headers": "authorization, content-type",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Origin":
			process.env.ADMIN_CORS_ORIGIN || "http://localhost:4321",
		"Content-Type": "application/json; charset=utf-8",
	});
	res.end(body);
}

function sendText(
	res,
	statusCode,
	body,
	contentType = "text/plain; charset=utf-8",
) {
	res.writeHead(statusCode, {
		"Content-Type": contentType,
	});
	res.end(body);
}

function sendError(res, statusCode, message, details) {
	sendJson(res, statusCode, { error: message, details });
}

function redirect(res, location) {
	res.writeHead(302, { Location: location });
	res.end();
}

function getToken() {
	return process.env.ADMIN_TOKEN || "";
}

function requireAuth(req, res) {
	const token = getToken();
	if (!token) {
		sendError(
			res,
			500,
			"ADMIN_TOKEN is not configured. Add it to .env or set it before starting the backend.",
		);
		return false;
	}

	const header = req.headers.authorization || "";
	if (header !== `Bearer ${token}`) {
		sendError(res, 401, "Unauthorized");
		return false;
	}

	return true;
}

async function readJson(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	const raw = Buffer.concat(chunks).toString("utf8");
	if (!raw.trim()) return {};

	try {
		return JSON.parse(raw);
	} catch {
		const error = new Error("Invalid JSON request body");
		error.statusCode = 400;
		throw error;
	}
}

async function serveAdminAsset(res, pathname) {
	const relativePath =
		pathname === "/admin" || pathname === "/admin/"
			? "index.html"
			: pathname.replace(/^\/admin\/?/, "");
	const fullPath = path.resolve(adminRoot, relativePath);
	const safeRelativePath = path.relative(adminRoot, fullPath);

	if (safeRelativePath.startsWith("..") || path.isAbsolute(safeRelativePath)) {
		sendText(res, 403, "Forbidden");
		return;
	}

	try {
		const body = await fs.readFile(fullPath);
		sendText(
			res,
			200,
			body,
			contentTypes[path.extname(fullPath)] || "application/octet-stream",
		);
	} catch {
		sendText(res, 404, "Not found");
	}
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

	if (
		normalized.includes("..") ||
		path.isAbsolute(normalized) ||
		/^[a-zA-Z]:/.test(normalized)
	) {
		const error = new Error("Invalid slug");
		error.statusCode = 400;
		throw error;
	}

	const ext = path.extname(normalized);
	const fileName = ext ? normalized : `${normalized}${extension}`;
	if (![".md", ".mdx"].includes(path.extname(fileName).toLowerCase())) {
		const error = new Error("Only .md and .mdx posts are supported");
		error.statusCode = 400;
		throw error;
	}

	const fullPath = path.resolve(postsRoot, fileName);
	const relativePath = path.relative(postsRoot, fullPath);
	if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
		const error = new Error("Invalid post path");
		error.statusCode = 400;
		throw error;
	}

	return {
		fullPath,
		id: relativePath.replaceAll("\\", "/").replace(/\.(md|mdx)$/i, ""),
		relativePath: relativePath.replaceAll("\\", "/"),
	};
}

async function listPostFiles(dir = postsRoot) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) return listPostFiles(fullPath);
			if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) return [fullPath];
			return [];
		}),
	);

	return files.flat();
}

function serializeDate(value) {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return value;
}

function serializeFrontmatter(data) {
	return Object.fromEntries(
		Object.entries(data).map(([key, value]) => [key, serializeDate(value)]),
	);
}

async function readPostByPath(fullPath) {
	const raw = await fs.readFile(fullPath, "utf8");
	const parsed = matter(raw);
	const relativePath = path.relative(postsRoot, fullPath).replaceAll("\\", "/");

	return {
		body: parsed.content.trimStart(),
		frontmatter: serializeFrontmatter(parsed.data),
		id: relativePath.replace(/\.(md|mdx)$/i, ""),
		relativePath,
	};
}

async function listPosts(includeDraft = false) {
	const files = await listPostFiles();
	const posts = await Promise.all(files.map((file) => readPostByPath(file)));

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

function today() {
	return new Date().toISOString().slice(0, 10);
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
	if (!frontmatter.published) frontmatter.published = today();
	if (!Array.isArray(frontmatter.tags)) frontmatter.tags = [];
	if (frontmatter.category == null) frontmatter.category = "";
	if (frontmatter.description == null) frontmatter.description = "";
	if (frontmatter.draft == null) frontmatter.draft = true;

	delete frontmatter.body;
	delete frontmatter.slug;
	delete frontmatter.extension;

	return frontmatter;
}

async function writePost(postPath, frontmatter, body) {
	await fs.mkdir(path.dirname(postPath), { recursive: true });
	const content = stringifyPost(frontmatter, body);
	await fs.writeFile(postPath, content, "utf8");
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

async function handleCreate(req, res) {
	const payload = await readJson(req);
	const extension = payload.extension === ".mdx" ? ".mdx" : ".md";
	const post = normalizeSlug(payload.slug || payload.title, extension);

	try {
		await fs.access(post.fullPath);
		sendError(res, 409, "Post already exists", {
			relativePath: post.relativePath,
		});
		return;
	} catch {
		// The file should not exist when creating a post.
	}

	const frontmatter = buildFrontmatter(payload);
	await writePost(post.fullPath, frontmatter, payload.body || "");
	sendJson(res, 201, await readPostByPath(post.fullPath));
}

async function handleUpdate(req, res, slug) {
	const payload = await readJson(req);
	const post = normalizeSlug(slug);
	const existing = await readPostByPath(post.fullPath);
	const frontmatter = buildFrontmatter(payload, existing.frontmatter);
	const body = typeof payload.body === "string" ? payload.body : existing.body;

	await writePost(post.fullPath, frontmatter, body);
	sendJson(res, 200, await readPostByPath(post.fullPath));
}

async function handleDelete(_req, res, slug, url) {
	const post = normalizeSlug(slug);
	const existing = await readPostByPath(post.fullPath);
	const force = url.searchParams.get("force") === "true";

	if (!force && existing.frontmatter.draft !== true) {
		sendError(
			res,
			409,
			"Only draft posts can be deleted unless force=true is provided",
		);
		return;
	}

	await fs.unlink(post.fullPath);
	sendJson(res, 200, { deleted: post.relativePath });
}

async function handleRequest(req, res) {
	const url = new URL(
		req.url || "/",
		`http://${req.headers.host || `${host}:${port}`}`,
	);
	const pathname = decodeURIComponent(url.pathname);

	if (req.method === "OPTIONS") {
		sendJson(res, 204, {});
		return;
	}

	if (req.method === "GET" && pathname === "/") {
		redirect(res, "/admin");
		return;
	}

	if (
		req.method === "GET" &&
		(pathname === "/admin" || pathname.startsWith("/admin/"))
	) {
		await serveAdminAsset(res, pathname);
		return;
	}

	if (req.method === "GET" && pathname === "/api/health") {
		sendJson(res, 200, { ok: true, service: "firefly-admin", postsRoot });
		return;
	}

	if (pathname === "/api/posts" && req.method === "GET") {
		if (!requireAuth(req, res)) return;
		const includeDraft = url.searchParams.get("includeDraft") === "true";
		sendJson(res, 200, await listPosts(includeDraft));
		return;
	}

	if (pathname === "/api/posts" && req.method === "POST") {
		if (!requireAuth(req, res)) return;
		await handleCreate(req, res);
		return;
	}

	const postMatch = pathname.match(/^\/api\/posts\/(.+)$/);
	if (postMatch) {
		if (!requireAuth(req, res)) return;
		const slug = postMatch[1];

		if (req.method === "GET") {
			const post = normalizeSlug(slug);
			sendJson(res, 200, await readPostByPath(post.fullPath));
			return;
		}

		if (req.method === "PUT") {
			await handleUpdate(req, res, slug);
			return;
		}

		if (req.method === "DELETE") {
			await handleDelete(req, res, slug, url);
			return;
		}
	}

	sendError(res, 404, "Not found");
}

const server = http.createServer((req, res) => {
	handleRequest(req, res).catch((error) => {
		sendError(
			res,
			error.statusCode || 500,
			error.message || "Internal server error",
		);
	});
});

server.listen(port, host, () => {
	console.log(`Firefly admin backend running at http://${host}:${port}`);
	console.log(
		"Use Authorization: Bearer <ADMIN_TOKEN> for protected endpoints.",
	);
});

async function loadEnv() {
	const envPath = path.resolve(projectRoot, ".env");

	try {
		const raw = await fs.readFile(envPath, "utf8");
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("="))
				continue;

			const [key, ...valueParts] = trimmed.split("=");
			if (!process.env[key]) {
				process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
			}
		}
	} catch {
		// .env is optional. The server will explain missing required values at request time.
	}
}
