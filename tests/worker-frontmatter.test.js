import assert from "node:assert/strict";
import test from "node:test";
import { parseFrontmatter } from "../worker/frontmatter.js";

test("reads escaped multiline strings and commas inside quoted YAML list values", () => {
	const parsed = parseFrontmatter(
		'---\ndescription: "第一行\\n第二行"\ntags: [one, "two, three"]\n---\n正文',
	);

	assert.equal(parsed.frontmatter.description, "第一行\n第二行");
	assert.deepEqual(parsed.frontmatter.tags, ["one", "two, three"]);
	assert.equal(parsed.body, "正文");
});
