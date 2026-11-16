import { CHATS_PUBLISH_PATH } from "@superset/shared/chats-realtime";
import { waitUntil } from "@vercel/functions";
import { env } from "../../env";

const ATTEMPTS = 2;

async function post(channel: string, data: object, ephemeral: boolean) {
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		try {
			const response = await fetch(`${env.REALTIME_URL}${CHATS_PUBLISH_PATH}`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ channel, data, ephemeral }),
				signal: AbortSignal.timeout(5_000),
			});
			if (response.ok || response.status < 500) return;
		} catch (error) {
			console.warn(
				"[chats] publish failed:",
				error instanceof Error ? error.message : error,
			);
		}
	}
}

/**
 * Sends an event to a channel's sockets after the write that caused it.
 * Delivery is best effort: a client that missed one resumes by sequence
 * number, or loads everything again when the channel no longer has it.
 */
export function publishChats(
	channel: string,
	data: { type: string } & Record<string, unknown>,
	options: { ephemeral?: boolean } = {},
): void {
	waitUntil(post(channel, data, options.ephemeral === true));
}
