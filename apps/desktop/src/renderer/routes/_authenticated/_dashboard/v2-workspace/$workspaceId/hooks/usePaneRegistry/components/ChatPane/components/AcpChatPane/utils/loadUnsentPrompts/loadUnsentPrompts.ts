import type { ChatTransport } from "@superset/chat/client";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { unsentPrompts } from "../../../../../ChatSession/utils/startFailure";

/** The prompts a stopped chat holds that its agent never got to see. */
export async function loadUnsentPrompts(
	transport: Pick<ChatTransport, "getItems">,
	sessionId: string,
): Promise<UserContent[][]> {
	const page = await transport.getItems({ sessionId, limit: 200 });
	if (!page.ok) return [];
	return unsentPrompts(reduceMany(emptySnapshot(), page.envelopes));
}
