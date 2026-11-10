import type { OutboxEntry, SessionSnapshot } from "@superset/chat/core";
import {
	noticeSchema,
	type UserContent,
	userMessageSchema,
} from "@superset/chat/protocol";

export type StartFailure = {
	detail: string;
	/** What the user asked for, which no agent has seen yet. */
	prompts: UserContent[][];
};

function agentStarted(snapshot: SessionSnapshot): boolean {
	if (snapshot.session?.harnessSessionId) return true;
	for (const { item } of snapshot.items.values()) {
		if (item.kind === "agent_message" || item.kind === "tool_call") return true;
	}
	return false;
}

/** The prompts of a chat whose agent never ran, in the order they were sent. */
export function unsentPrompts(
	snapshot: SessionSnapshot,
	outbox: readonly OutboxEntry[] = [],
): UserContent[][] {
	if (agentStarted(snapshot)) return [];
	const prompts: UserContent[][] = [];
	const seen = new Set<string>();
	for (const { item } of snapshot.items.values()) {
		const message = userMessageSchema.safeParse(item);
		if (!message.success || message.data.discarded || message.data.from)
			continue;
		if (message.data.clientId) seen.add(message.data.clientId);
		prompts.push(message.data.content);
	}
	for (const entry of outbox) {
		if (entry.state !== "failed" && !seen.has(entry.clientId))
			prompts.push(entry.content);
	}
	return prompts;
}

/**
 * Why a chat could not start its agent, read from the chat itself: the host
 * may still report the session as live while its transcript says it died.
 */
export function startFailure(
	snapshot: SessionSnapshot,
	outbox: readonly OutboxEntry[] = [],
): StartFailure | null {
	if (agentStarted(snapshot)) return null;
	let detail: string | null = null;
	for (const { item } of snapshot.items.values()) {
		const notice = noticeSchema.safeParse(item);
		if (
			notice.success &&
			notice.data.noticeKind === "error" &&
			notice.data.text
		)
			detail = notice.data.text;
	}
	if (!detail) return null;
	return { detail, prompts: unsentPrompts(snapshot, outbox) };
}
