interface MarkdownNode {
	type: string;
	value?: string;
	data?: { hName: string };
	children?: MarkdownNode[];
}

/** A plain `<br>`; markdown's own break node also emits a newline after it, which copies as a second line. */
const LINE_BREAK: MarkdownNode = { type: "lineBreak", data: { hName: "br" } };

function splitLines(node: MarkdownNode): MarkdownNode[] {
	if (node.type !== "text" || !node.value?.includes("\n")) return [node];
	return node.value.split("\n").flatMap((value, index) => {
		const text = value === "" ? [] : [{ type: "text", value }];
		return index === 0 ? text : [{ ...LINE_BREAK }, ...text];
	});
}

function breakLines(node: MarkdownNode) {
	if (!node.children) return;
	node.children = node.children.flatMap(splitLines);
	for (const child of node.children) breakLines(child);
}

/** A typed line break stays a line break, as it was in the composer. */
export function remarkLineBreaks() {
	return (tree: MarkdownNode) => breakLines(tree);
}
