/** A chat as far as choosing an app's agent goes: its kind and the Devs in it. */
interface AgentChat {
	kind: "direct" | "group";
	devs: { id: string; kind: "personal" | "group" | "custom" | "added" }[];
}

/**
 * Whom an app's `window.dev.agent.ask` asks: the Dev that made the app while it's still in the app's chat, else
 * the chat's own Dev (a group's Dev, or a 1:1's only one). Null when the chat has neither.
 */
export function appAgentId(
	chat: AgentChat,
	creatorDevId: string | null,
): string | null {
	if (creatorDevId && chat.devs.some((m) => m.id === creatorDevId))
		return creatorDevId;
	const own =
		chat.kind === "direct"
			? chat.devs[0]
			: chat.devs.find((m) => m.kind === "group");
	return own?.id ?? null;
}
