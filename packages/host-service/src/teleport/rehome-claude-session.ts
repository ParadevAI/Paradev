/**
 * A Claude session file with the working directory it was recorded in
 * replaced by `cwd`. Claude stores the directory on every line, and resume
 * reads it back. Lines that are not JSON are kept as they are.
 */
export function rehomeClaudeSession(content: string, cwd: string): string {
	let sourceCwd: string | undefined;
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
			if (!isRecord(entry) || typeof entry.cwd !== "string") return line;
			sourceCwd ??= entry.cwd;
			if (entry.cwd !== sourceCwd) return line;
			return JSON.stringify({ ...entry, cwd });
		})
		.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
