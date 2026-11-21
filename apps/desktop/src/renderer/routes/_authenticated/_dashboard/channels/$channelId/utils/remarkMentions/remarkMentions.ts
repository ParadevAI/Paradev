/** The hrefs mention links carry; the message's link renderer turns them into chips. */
export const MENTION_HREF_PREFIX = "#mention-";
export const CHANNEL_HREF_PREFIX = "#channel-";

interface MdNode {
	type: string;
	value?: string;
	url?: string;
	children?: MdNode[];
}

interface Reference {
	sigil: string;
	hrefPrefix: string;
	idByName: Map<string, string>;
}

type Named = { id: string; name: string };

const SKIP = new Set(["link", "linkReference", "inlineCode", "code"]);

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function splitText(
	value: string,
	pattern: RegExp,
	ref: Reference,
): MdNode[] | null {
	const parts: MdNode[] = [];
	let last = 0;
	for (const match of value.matchAll(pattern)) {
		const name = match[1] ?? "";
		const id = ref.idByName.get(name);
		if (!id || match.index === undefined) continue;
		if (match.index > last) {
			parts.push({ type: "text", value: value.slice(last, match.index) });
		}
		parts.push({
			type: "link",
			url: `${ref.hrefPrefix}${id}`,
			children: [{ type: "text", value: `${ref.sigil}${name}` }],
		});
		last = match.index + match[0].length;
	}
	if (parts.length === 0) return null;
	if (last < value.length)
		parts.push({ type: "text", value: value.slice(last) });
	return parts;
}

function visit(node: MdNode, pattern: RegExp, ref: Reference) {
	if (!node.children) return;
	node.children = node.children.flatMap((child) => {
		if (child.type === "text" && child.value) {
			return splitText(child.value, pattern, ref) ?? [child];
		}
		if (!SKIP.has(child.type)) visit(child, pattern, ref);
		return [child];
	});
}

function linkReferences(
	sigil: string,
	hrefPrefix: string,
	items: readonly Named[],
) {
	const idByName = new Map(items.map((item) => [item.name, item.id]));
	const names = [...idByName.keys()].sort((a, b) => b.length - a.length);
	return (tree: MdNode) => {
		if (names.length === 0) return;
		const pattern = new RegExp(
			`${escapeRegExp(sigil)}(${names.map(escapeRegExp).join("|")})(?![\\w-])`,
			"g",
		);
		visit(tree, pattern, { sigil, hrefPrefix, idByName });
	};
}

/**
 * Turns `@Name` into a mention link for the people a message mentions. Only
 * those people: a stored message keeps mentions as their `@Name` text, so a
 * name typed by hand stays text. Code is left alone.
 *
 * Use these plugins as `[remarkMentions, { people }]`: Streamdown caches its
 * processor by plugin name plus options, so names passed any other way leak
 * between messages.
 */
export function remarkMentions({ people }: { people: readonly Named[] }) {
	return linkReferences("@", MENTION_HREF_PREFIX, people);
}

/** Turns `#name` into a link for each channel the reader can see. */
export function remarkChannelRefs({
	channels,
}: {
	channels: readonly Named[];
}) {
	return linkReferences("#", CHANNEL_HREF_PREFIX, channels);
}
