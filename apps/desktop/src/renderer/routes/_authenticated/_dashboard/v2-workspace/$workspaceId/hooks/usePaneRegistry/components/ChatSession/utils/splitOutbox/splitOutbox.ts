import type { OutboxEntry } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";

const NONE: UserMessage[] = [];

function joinsQueue(entry: OutboxEntry): boolean {
	if (entry.steer || entry.state === "failed") return false;
	return entry.state === "inflight" || entry.attempts > 0;
}

function queuedPrompt(entry: OutboxEntry): UserMessage {
	return {
		id: entry.clientId,
		kind: "user_message",
		clientId: entry.clientId,
		startedAtMs: 0,
		content: entry.content,
		queued: true,
	};
}

/**
 * Where each sending prompt shows until the host confirms it. One the host
 * receives during a running turn joins the queue, so it shows there and
 * never as a message.
 */
export function splitOutbox(
	outbox: OutboxEntry[],
	turnRunning: boolean,
): { transcript: OutboxEntry[]; queue: UserMessage[] } {
	if (!turnRunning || !outbox.some(joinsQueue))
		return { transcript: outbox, queue: NONE };
	return {
		transcript: outbox.filter((entry) => !joinsQueue(entry)),
		queue: outbox.filter(joinsQueue).map(queuedPrompt),
	};
}
