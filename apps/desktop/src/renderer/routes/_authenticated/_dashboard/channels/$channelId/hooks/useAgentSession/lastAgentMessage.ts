interface MessageEnvelope {
	ts?: number;
	event: {
		type: string;
		item?: { kind?: string; text?: string; completedAtMs?: number };
	};
}

export interface AgentLastMessage {
	text: string;
	/** When the journal recorded it, host clock. */
	at: number | null;
	/** False while the agent is still writing it. */
	complete: boolean;
	/** True once the person wrote back after it. */
	answered: boolean;
}

/**
 * The newest agent message with something in it. A message is journaled
 * again as it grows, so the last envelope for it carries the whole text.
 */
export function lastAgentMessage(
	envelopes: readonly MessageEnvelope[],
): AgentLastMessage | null {
	let answered = false;
	for (let index = envelopes.length - 1; index >= 0; index -= 1) {
		const envelope = envelopes[index];
		const item = envelope?.event.item;
		if (envelope?.event.type !== "item") continue;
		if (item?.kind === "user_message") {
			answered = true;
			continue;
		}
		if (item?.kind !== "agent_message") continue;
		const text = item.text?.trim() ?? "";
		if (!text) continue;
		return {
			text,
			at: envelope.ts ?? null,
			complete: item.completedAtMs !== undefined,
			answered,
		};
	}
	return null;
}
