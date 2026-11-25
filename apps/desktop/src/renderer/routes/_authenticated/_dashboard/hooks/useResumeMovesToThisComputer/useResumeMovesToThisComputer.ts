import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { runMoveOnComputer } from "../../utils/runMoveOnComputer";

/**
 * A copy the app left behind when it reloaded is still held by its old run
 * until the claim lease runs out; trying again each minute takes it over
 * before the sweep fails it.
 */
const HELD_RETRY_MS = 60_000;
const HELD_RETRIES = 6;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Takes up the person's chat moves to this computer that a closed or
 * reloaded app left unfinished, one after another, as the move that
 * started them would have.
 */
export function useResumeMovesToThisComputer(): void {
	const movesEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.WORKSPACE_MOVES) === true;
	const { machineId, activeHostUrl } = useLocalHostService();
	const utils = cloudTrpc.useUtils();
	const { data } = cloudTrpc.chatMove.waitingOnHost.useQuery(
		{ hostId: machineId ?? "" },
		{
			enabled: movesEnabled && !!machineId && !!activeHostUrl,
			staleTime: Number.POSITIVE_INFINITY,
			retry: false,
		},
	);
	const taken = useRef(new Set<string>());

	useEffect(() => {
		const moveIds = (data?.moveIds ?? []).filter(
			(id) => !taken.current.has(id),
		);
		if (moveIds.length === 0 || !activeHostUrl) return;
		for (const id of moveIds) taken.current.add(id);
		const host = getHostServiceClientByUrl(activeHostUrl);
		void (async () => {
			let waiting = moveIds;
			for (let round = 0; waiting.length > 0; round++) {
				if (round > 0) await sleep(HELD_RETRY_MS);
				const held: string[] = [];
				for (const moveId of waiting) {
					const outcome = await runMoveOnComputer({ moveId, host }).catch(
						(error: unknown) => {
							console.warn(
								`[chat-move] could not finish move ${moveId} to this computer`,
								error,
							);
							return "done" as const;
						},
					);
					if (outcome === "held") held.push(moveId);
				}
				waiting = round < HELD_RETRIES ? held : [];
			}
			void utils.chatMove.latest.invalidate();
			void utils.workspaceMove.latest.invalidate();
		})();
	}, [data, activeHostUrl, utils]);
}
