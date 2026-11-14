import { randomUUID } from "node:crypto";
import type { ApiClient } from "../../../../types";
import type { RelayHostClient } from "../createRelayHostClient";

/**
 * Carries out one chat's move to a computer, which the control plane
 * recorded but cannot reach: the chat's history and session files go into
 * that computer's host, the control plane switches the chat there, then its
 * agent starts. A failure is recorded, so the chat stays where it was. A move
 * that someone else already claimed, such as the destination's desktop, is
 * left to them.
 */
export async function carryOutChatMove({
	api,
	host,
	moveId,
}: {
	api: ApiClient;
	host: Pick<RelayHostClient, "teleport">;
	moveId: string;
}): Promise<void> {
	const attemptId = randomUUID();
	const claimed = await api.chatMove.claim
		.mutate({ moveId, attemptId })
		.catch(async (error: unknown) => {
			if (isConflict(error)) return null;
			await recordFailure(api, moveId, attemptId, error);
			throw error;
		});
	if (!claimed) return;
	try {
		const events = [];
		let afterSeq = 0;
		for (;;) {
			const page = await api.chatMove.events.query({ moveId, afterSeq });
			events.push(...page.events);
			if (page.nextAfterSeq === null) break;
			afterSeq = page.nextAfterSeq;
		}
		await host.teleport.importChat.mutate({ ...claimed, events });
		await api.chatMove.complete.mutate({ moveId, attemptId });
	} catch (error) {
		await recordFailure(api, moveId, attemptId, error);
		throw error;
	}
	// The chat already moved; one whose agent did not start resumes when opened.
	await host.teleport.continueChat
		.mutate({
			workspaceId: claimed.workspaceId,
			chatSessionId: claimed.chatSessionId,
			harnessSessionId: claimed.session.harnessSessionId,
		})
		.catch((error: unknown) =>
			console.warn("[chat-move] the moved chat's agent did not start", error),
		);
}

async function recordFailure(
	api: ApiClient,
	moveId: string,
	attemptId: string,
	error: unknown,
): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	await api.chatMove.fail
		.mutate({
			moveId,
			attemptId,
			error: message.slice(0, 2000) || "The move to the computer failed",
		})
		.catch((failError: unknown) =>
			console.warn(
				`[chat-move] could not record that move ${moveId} failed`,
				failError,
			),
		);
}

function isConflict(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"data" in error &&
		(error as { data?: { code?: string } }).data?.code === "CONFLICT"
	);
}
