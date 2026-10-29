import { prefetchChatSession } from "@superset/chat/react";
import {
	type ChatWiring,
	createChatSessionClient,
} from "../../../../../ChatSession/hooks/useSessionClient";

const WARM_TIMEOUT_MS = 2_000;

export async function warmTranscript(
	sessionId: string,
	wiring: ChatWiring,
	timeoutMs = WARM_TIMEOUT_MS,
): Promise<void> {
	const client = createChatSessionClient(sessionId, wiring);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			prefetchChatSession(client),
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timer);
		client.close();
	}
}
