/**
 * Markdown as it reads aloud, for a preview that cannot render it: no
 * emphasis marks, code ticks, heading hashes, list bullets or link targets.
 */
export function plainText(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, (block) =>
			block.replace(/```\w*\n?/g, "").trim(),
		)
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^[ \t]*[-*+][ \t]+/gm, "")
		.replace(/^[ \t]*>[ \t]?/gm, "")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/(\*\*|__)(.+?)\1/g, "$2")
		.replace(/(^|[^*\w])[*_](?=\S)(.+?)(?<=\S)[*_](?=$|[^*\w])/g, "$1$2")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
