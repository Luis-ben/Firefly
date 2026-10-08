export function parseFrontmatter(raw) {
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
		return splitYamlArrayItems(trimmed.slice(1, -1))
			.map((item) => parseYamlValue(item))
			.filter((item) => item !== "");
	}
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return stripQuotes(trimmed);
		}
	}
	return stripQuotes(trimmed);
}

function splitYamlArrayItems(value) {
	const items = [];
	let start = 0;
	let quote = "";
	let escaped = false;
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (quote === '"' && character === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (character === quote) {
				if (quote === "'" && value[index + 1] === "'") index += 1;
				else quote = "";
			}
			continue;
		}
		if (character === '"' || character === "'") quote = character;
		else if (character === ",") {
			items.push(value.slice(start, index).trim());
			start = index + 1;
		}
	}
	items.push(value.slice(start).trim());
	return items;
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
