interface MarkdownNode {
	type: string;
	value?: string;
	children?: MarkdownNode[];
	data?: { hName: string; hProperties: Record<string, string> };
}

const LITERAL = new Set(["code", "inlineCode", "link", "linkReference"]);

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function split(text: string, pattern: RegExp): MarkdownNode[] {
	const nodes: MarkdownNode[] = [];
	let last = 0;
	for (const match of text.matchAll(pattern)) {
		const start = match.index + (match[1]?.length ?? 0);
		if (start > last)
			nodes.push({ type: "text", value: text.slice(last, start) });
		nodes.push({
			type: "emphasis",
			data: { hName: "span", hProperties: { "data-mention": "" } },
			children: [{ type: "text", value: match[2] ?? "" }],
		});
		last = match.index + match[0].length;
	}
	if (last < text.length) nodes.push({ type: "text", value: text.slice(last) });
	return nodes;
}

function walk(node: MarkdownNode, pattern: RegExp) {
	if (!node.children || LITERAL.has(node.type)) return;
	node.children = node.children.flatMap((child) => {
		if (child.type === "text" && child.value)
			return split(child.value, pattern);
		walk(child, pattern);
		return [child];
	});
}

/** Marks `@handle` in running text, for the handles Linear knows, so it draws as a mention. */
export function remarkMentions(handles: readonly string[]) {
	const known = handles.filter(Boolean);
	if (known.length === 0) return () => () => {};
	const pattern = new RegExp(
		`(^|[^\\w@])(@(?:${[...known]
			.sort((a, b) => b.length - a.length)
			.map(escaped)
			.join("|")}))(?![\\w])`,
		"g",
	);
	return () => (tree: MarkdownNode) => walk(tree, pattern);
}
