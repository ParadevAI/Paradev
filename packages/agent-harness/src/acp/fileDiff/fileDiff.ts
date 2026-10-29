import { structuredPatch } from "diff";

export interface FileChange {
	path: string;
	oldText: string | null;
	newText: string;
}

function range(start: number, lines: number): string {
	return `${lines === 0 ? start - 1 : start},${lines}`;
}

/** ACP v2 diff content for one file: its change, plus a git patch with absolute paths. */
export function fileDiff({ path, oldText, newText }: FileChange) {
	const added = oldText === null;
	const lines = [`diff --git ${path} ${path}`];
	if (added) lines.push("new file mode 100644");
	lines.push(`--- ${added ? "/dev/null" : path}`, `+++ ${path}`);
	for (const hunk of structuredPatch(path, path, oldText ?? "", newText)
		.hunks) {
		lines.push(
			`@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@`,
			...hunk.lines,
		);
	}
	return {
		type: "diff",
		changes: [{ operation: added ? "add" : "modify", path, fileType: "text" }],
		patch: { format: "git_patch", text: `${lines.join("\n")}\n` },
	};
}
