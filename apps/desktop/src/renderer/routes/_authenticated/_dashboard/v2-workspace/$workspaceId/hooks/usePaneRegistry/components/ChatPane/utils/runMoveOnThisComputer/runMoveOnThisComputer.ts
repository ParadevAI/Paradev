import { rawErrorMessage } from "@superset/i18n/errors";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import type { HostServiceClient } from "renderer/lib/host-service-client";

/**
 * Carries out a move to this computer, which the control plane recorded but
 * cannot reach: the chat's history and session files go into this
 * computer's host, the control plane switches the chat here, then its agent
 * starts. Any failure is reported, so the move shows as failed and the chat
 * stays where it was.
 */
export async function runMoveOnThisComputer({
	moveId,
	host,
}: {
	moveId: string;
	host: HostServiceClient;
}): Promise<void> {
	let started: {
		workspaceId: string;
		chatSessionId: string;
		harnessSessionId: string;
	};
	try {
		const { eventCount: _count, ...claimed } =
			await cloudTrpcClient.chatMove.claim.mutate({ moveId });
		const events = [];
		let afterSeq = 0;
		for (;;) {
			const page = await cloudTrpcClient.chatMove.events.query({
				moveId,
				afterSeq,
			});
			events.push(...page.events);
			if (page.nextAfterSeq === null) break;
			afterSeq = page.nextAfterSeq;
		}
		await host.teleport.importChat.mutate({ ...claimed, events });
		await cloudTrpcClient.chatMove.complete.mutate({ moveId });
		started = {
			workspaceId: claimed.workspaceId,
			chatSessionId: claimed.chatSessionId,
			harnessSessionId: claimed.session.harnessSessionId,
		};
	} catch (error) {
		await cloudTrpcClient.chatMove.fail
			.mutate({ moveId, error: rawErrorMessage(error).slice(0, 2000) })
			.catch(() => {});
		throw error;
	}
	// The chat already moved; one whose agent did not start resumes when opened.
	await host.teleport.continueChat.mutate(started).catch((error: unknown) => {
		console.warn("[chat-move] the moved chat's agent did not start", error);
	});
}
