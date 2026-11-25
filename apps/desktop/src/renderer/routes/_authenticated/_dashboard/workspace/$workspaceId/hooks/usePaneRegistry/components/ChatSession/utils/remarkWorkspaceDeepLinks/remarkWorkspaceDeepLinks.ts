import {
	ACCEPTED_PROTOCOL_SCHEMES,
	PROTOCOL_SCHEMES,
} from "@superset/shared/constants";

interface MarkdownNode {
	type: string;
	url?: string;
	value?: string;
	children?: MarkdownNode[];
}

const SCHEMES = [...ACCEPTED_PROTOCOL_SCHEMES, PROTOCOL_SCHEMES.DEV].join("|");
const ID = "[A-Za-z0-9_-]{1,128}";
const DEEP_LINK = `(?:${SCHEMES})://(?:v2-workspace|workspace)/(${ID})(?:\\?sessionId=(${ID}))?`;
const WHOLE_DEEP_LINK = new RegExp(`^${DEEP_LINK}$`);
const DEEP_LINK_IN_TEXT = new RegExp(
	`(?<![\\w-])${DEEP_LINK}(?![\\w/?&=-])`,
	"g",
);

function workspaceWebUrl(
	workspaceId: string,
	sessionId: string | undefined,
	webUrl: string,
): string {
	const url = new URL(`/workspaces/${workspaceId}`, webUrl);
	if (sessionId) url.searchParams.set("sessionId", sessionId);
	return url.toString();
}

function linkedText(text: string, webUrl: string): MarkdownNode[] | null {
	const nodes: MarkdownNode[] = [];
	let end = 0;
	for (const match of text.matchAll(DEEP_LINK_IN_TEXT)) {
		const [deepLink, workspaceId, sessionId] = match;
		if (!workspaceId) continue;
		if (match.index > end) {
			nodes.push({ type: "text", value: text.slice(end, match.index) });
		}
		const url = workspaceWebUrl(workspaceId, sessionId, webUrl);
		nodes.push({
			type: "link",
			url,
			children: [{ type: "text", value: url }],
		});
		end = match.index + deepLink.length;
	}
	if (nodes.length === 0) return null;
	if (end < text.length) nodes.push({ type: "text", value: text.slice(end) });
	return nodes;
}

function rewriteDeepLinks(node: MarkdownNode, webUrl: string) {
	if (node.type === "link") {
		const match = node.url?.match(WHOLE_DEEP_LINK);
		if (match?.[1]) node.url = workspaceWebUrl(match[1], match[2], webUrl);
		return;
	}
	if (!node.children) return;
	node.children = node.children.flatMap((child) => {
		if (child.type === "text" && child.value) {
			return linkedText(child.value, webUrl) ?? [child];
		}
		rewriteDeepLinks(child, webUrl);
		return [child];
	});
}

/**
 * Streamdown blocks every link that is not a web link, so a desktop deep link
 * to a workspace becomes that workspace's web link, which the chat opens in
 * the app.
 */
export function remarkWorkspaceDeepLinks({ webUrl }: { webUrl: string }) {
	return (tree: MarkdownNode) => rewriteDeepLinks(tree, webUrl);
}
