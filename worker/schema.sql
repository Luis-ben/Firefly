CREATE TABLE IF NOT EXISTS live_posts (
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
);

CREATE INDEX IF NOT EXISTS idx_live_posts_published
	ON live_posts(published DESC);

CREATE INDEX IF NOT EXISTS idx_live_posts_category
	ON live_posts(category);

CREATE INDEX IF NOT EXISTS idx_live_posts_draft
	ON live_posts(draft);
