interface MarkdownNode {
	type: string;
	value?: string;
	position?: { start: { offset?: number }; end: { offset?: number } };
	children?: MarkdownNode[];
}

const FORMATTED = new Set(["emphasis", "strong", "delete"]);

/** The composer writes formatting as `*`, `**` and `~~`; any other marker was typed. */
function typedMarker(node: MarkdownNode, source: string): string | null {
	const start = node.position?.start.offset;
	if (!FORMATTED.has(node.type) || start === undefined) return null;
	const marker = source[start];
	if (marker === "_") return node.type === "strong" ? "__" : "_";
	if (marker === "~" && source[start + 1] !== "~") return "~";
	return null;
}

function unwrap(node: MarkdownNode, source: string): MarkdownNode[] {
	node.children = node.children?.flatMap((child) => unwrap(child, source));
	const marker = typedMarker(node, source);
	if (!marker) return [node];
	return [
		{ type: "text", value: marker },
		...(node.children ?? []),
		{ type: "text", value: marker },
	];
}

/** Typed `__init__`, `snake_case` or `~/src` stays as typed. */
export function remarkTypedMarkers() {
	return (tree: MarkdownNode, file: { value: unknown }) => {
		tree.children = tree.children?.flatMap((child) =>
			unwrap(child, String(file.value)),
		);
	};
}
