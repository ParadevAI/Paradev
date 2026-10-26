/** The href a mention link carries; the message's link renderer turns it into a chip. */
export const MENTION_HREF_PREFIX = "#mention-";

interface MdNode {
	type: string;
	value?: string;
	url?: string;
	children?: MdNode[];
}

const SKIP = new Set(["link", "linkReference", "inlineCode", "code"]);

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function splitText(
	value: string,
	pattern: RegExp,
	idByName: Map<string, string>,
): MdNode[] | null {
	const parts: MdNode[] = [];
	let last = 0;
	for (const match of value.matchAll(pattern)) {
		const name = match[1] ?? "";
		const id = idByName.get(name);
		if (!id || match.index === undefined) continue;
		if (match.index > last) {
			parts.push({ type: "text", value: value.slice(last, match.index) });
		}
		parts.push({
			type: "link",
			url: `${MENTION_HREF_PREFIX}${id}`,
			children: [{ type: "text", value: `@${name}` }],
		});
		last = match.index + match[0].length;
	}
	if (parts.length === 0) return null;
	if (last < value.length)
		parts.push({ type: "text", value: value.slice(last) });
	return parts;
}

function visit(node: MdNode, pattern: RegExp, idByName: Map<string, string>) {
	if (!node.children) return;
	node.children = node.children.flatMap((child) => {
		if (child.type === "text" && child.value) {
			return splitText(child.value, pattern, idByName) ?? [child];
		}
		if (!SKIP.has(child.type)) visit(child, pattern, idByName);
		return [child];
	});
}

/**
 * Turns `@Name` into a mention link for the people a message mentions. Only
 * those people: a stored message keeps mentions as their `@Name` text, so a
 * name typed by hand stays text. Code is left alone.
 */
export function remarkMentions(
	people: readonly { id: string; name: string }[],
) {
	const idByName = new Map(people.map((person) => [person.name, person.id]));
	const names = [...idByName.keys()].sort((a, b) => b.length - a.length);
	return () => (tree: MdNode) => {
		if (names.length === 0) return;
		const pattern = new RegExp(
			`@(${names.map(escapeRegExp).join("|")})(?![\\w])`,
			"g",
		);
		visit(tree, pattern, idByName);
	};
}
