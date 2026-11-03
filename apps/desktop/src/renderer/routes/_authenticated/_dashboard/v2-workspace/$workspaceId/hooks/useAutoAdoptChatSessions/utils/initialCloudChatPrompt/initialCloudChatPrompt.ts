import type { ChatTransport } from "@superset/chat/client";
import { userMessageText } from "@superset/chat/core";
import type { Item, UserMessage } from "@superset/chat/protocol";
import { hashCloudAgentPrompt } from "@superset/shared/cloud-agent-launch";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";

type Transport = Pick<ChatTransport, "getOutline" | "getItems">;

function firstUserMessage(items: Item[]): UserMessage | undefined {
	return items.find((item) => item.kind === "user_message") as
		| UserMessage
		| undefined;
}

export async function initialCloudChatPromptHash(
	transport: Transport,
	sessionId: string,
): Promise<string | null | undefined> {
	let prompt: UserMessage | undefined;
	try {
		const result = await transport.getOutline({ sessionId });
		if (!result.ok) return undefined;
		prompt = firstUserMessage(result.outline.items.map(({ item }) => item));
	} catch (error) {
		if (!isMissingProcedureError(error)) throw error;
		let before: { epoch: string; seq: number } | undefined;
		for (;;) {
			const page = await transport.getItems({
				sessionId,
				before,
				limit: 1_000,
			});
			if (!page.ok) return undefined;
			const first = firstUserMessage(
				page.envelopes.flatMap((envelope) =>
					envelope.event.type === "item" ? [envelope.event.item] : [],
				),
			);
			if (first) prompt = first;
			if (!page.nextBefore) break;
			before = page.nextBefore;
		}
	}
	if (!prompt) return undefined;
	if (prompt.clientId !== "superset-sessions") return null;
	return hashCloudAgentPrompt(userMessageText(prompt));
}
