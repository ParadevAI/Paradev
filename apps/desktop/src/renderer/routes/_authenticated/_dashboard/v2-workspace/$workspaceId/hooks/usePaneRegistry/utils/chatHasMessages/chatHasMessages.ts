import type { ChatTransport } from "@superset/chat/client";

/** True when the chat has a user message, or when that can't be told from the first page. */
export async function chatHasMessages(
	transport: ChatTransport,
	sessionId: string,
): Promise<boolean> {
	const page = await transport.getItems({ sessionId });
	return (
		!page.ok ||
		page.nextBefore !== null ||
		page.envelopes.some(
			(envelope) =>
				envelope.event.type === "item" &&
				envelope.event.item.kind === "user_message",
		)
	);
}
