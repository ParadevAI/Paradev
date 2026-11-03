/**
 * A Claude session file recorded under `from` rewritten for `to`. Claude
 * keeps the working directory on every line and reads it back on resume,
 * and names large tool outputs by absolute path. Lines that are not JSON
 * are kept as they are.
 */
export function rehomeClaudeLines(
	content: string,
	from: { cwd: string; dir: string },
	to: { cwd: string; dir: string },
): string {
	return content
		.split("\n")
		.map((line) => {
			if (!line.trim()) return line;
			let entry: unknown;
			try {
				entry = JSON.parse(line);
			} catch {
				return line;
			}
			if (!isRecord(entry)) return line;
			let changed = false;
			if (typeof entry.cwd === "string") {
				const cwd = rebase(entry.cwd, from.cwd, to.cwd);
				if (cwd !== entry.cwd) {
					entry = { ...entry, cwd };
					changed = true;
				}
			}
			let text = changed ? JSON.stringify(entry) : line;
			if (from.dir !== to.dir && text.includes(from.dir)) {
				text = text.split(`${from.dir}/`).join(`${to.dir}/`);
			}
			return text;
		})
		.join("\n");
}

function rebase(path: string, from: string, to: string): string {
	if (path === from) return to;
	if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
	return path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
