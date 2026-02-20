import { isAbsolute, relative, resolve, sep } from "node:path";
import { safeReadFile } from "../project-context";

interface FileMention {
	raw: string;
	absPath: string;
	relPath: string;
	content: string | null;
}

export function parseFileMentions(text: string, cwd: string): FileMention[] {
	const mentionRegex = /@([\w./-]+(?:\/[\w./-]+|\.[\w]+))/g;
	const mentions: FileMention[] = [];
	const seen = new Set<string>();

	let match: RegExpExecArray | null = mentionRegex.exec(text);
	while (match !== null) {
		const relPath = match[1] as string;
		// Skip @task: mentions — handled separately
		if (relPath.startsWith("task:")) {
			match = mentionRegex.exec(text);
			continue;
		}
		if (!seen.has(relPath)) {
			seen.add(relPath);

			const absPath = resolve(cwd, relPath);
			const rel = relative(resolve(cwd), absPath);
			if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
				match = mentionRegex.exec(text);
				continue;
			}
			const content = safeReadFile(absPath, 50_000);
			mentions.push({
				raw: match[0],
				absPath,
				relPath,
				content,
			});
		}
		match = mentionRegex.exec(text);
	}

	return mentions;
}

export function buildFileMentionContext(mentions: FileMention[]): string {
	if (mentions.length === 0) return "";

	const parts = mentions
		.filter((m) => m.content !== null)
		.map((m) => `<file path="${m.relPath}">\n${m.content}\n</file>`);

	if (parts.length === 0) return "";
	return `\n\nThe user referenced the following files. Their contents are provided below:\n\n${parts.join("\n\n")}`;
}
