import { rawErrorMessage } from "@superset/i18n/errors";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import type { HostServiceClient } from "renderer/lib/host-service-client";

/**
 * Carries out a move to a computer, which the control plane recorded but
 * cannot reach: the chat's history and session files go into that
 * computer's host, the control plane switches the chat there, then its agent
 * starts. Any failure is reported, so the move shows as failed and the chat
 * stays where it was. A move another run already claimed is left to it.
 */
export async function runMoveOnComputer({
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
	const claimed = await cloudTrpcClient.chatMove.claim
		.mutate({ moveId })
		.catch(async (error: unknown) => {
			// Another run, or an earlier one, already took it.
			if (isClaimed(error)) return null;
			await recordFailure(moveId, error);
			throw error;
		});
	if (!claimed) return;
	try {
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
		await recordFailure(moveId, error);
		throw error;
	}
	// The chat already moved; one whose agent did not start resumes when opened.
	await host.teleport.continueChat.mutate(started).catch((error: unknown) => {
		console.warn("[chat-move] the moved chat's agent did not start", error);
	});
}

async function recordFailure(moveId: string, error: unknown): Promise<void> {
	await cloudTrpcClient.chatMove.fail
		.mutate({
			moveId,
			error:
				rawErrorMessage(error).slice(0, 2000) ||
				"The move to the computer failed",
		})
		.catch((failError: unknown) =>
			console.warn(
				`[chat-move] could not record that move ${moveId} failed`,
				failError,
			),
		);
}

function isClaimed(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"data" in error &&
		(error as { data?: { code?: string } }).data?.code === "CONFLICT"
	);
}
