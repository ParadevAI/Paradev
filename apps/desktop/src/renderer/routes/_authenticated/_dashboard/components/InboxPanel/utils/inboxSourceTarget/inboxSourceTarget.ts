export type SourceTarget =
	| { kind: "url"; url: string }
	| { kind: "workspace"; workspaceId: string }
	| { kind: "session"; workspaceId: string; terminalId: string }
	| { kind: "none" };

interface SourceBlock {
	type: string;
	resolved?: { source?: string };
}

/**
 * Where "open in its app" goes: the web address of what the card is about,
 * else the session that sent it. A finished workspace is its own source.
 */
export function inboxSourceTarget(
	item:
		| { kind: "finished"; workspaceId: string }
		| {
				kind: "card";
				workspaceId: string | null;
				agentSessionId: string;
				blocks: SourceBlock[] | null;
		  },
): SourceTarget {
	if (item.kind === "finished")
		return { kind: "workspace", workspaceId: item.workspaceId };
	const url = item.blocks?.find(
		(block) => block.type === "card" && block.resolved?.source,
	)?.resolved?.source;
	if (url) return { kind: "url", url };
	if (item.workspaceId)
		return {
			kind: "session",
			workspaceId: item.workspaceId,
			terminalId: item.agentSessionId,
		};
	return { kind: "none" };
}
