/**
 * Store files are named by id, so a bare path hands the agent a UUID; the
 * name the user gave it goes beside the path.
 */
export function attachedFilesBlock(
	files: { name: string; path: string }[],
): string {
	const lines = files.map((file) => `- ${file.name}: ${file.path}`);
	return `# Attached files\n\nThe user attached these files. They are available on this host at:\n\n${lines.join("\n")}`;
}
