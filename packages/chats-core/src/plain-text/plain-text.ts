/** Markdown as one line of plain text (a notification, a preview): no syntax, links as their label. */
export function plainText(markdown: string): string {
	return markdown
		.replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
		.replace(
			/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/gm,
			"",
		)
		.replace(/(\*\*|__|~~|`)(.+?)\1/g, "$2")
		.replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=$|[^\w*])/g, "$1$2")
		.replace(/\s+/g, " ")
		.trim();
}
