import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { runMoveOnComputer } from "../../utils/runMoveOnComputer";

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
			for (const moveId of moveIds) {
				await runMoveOnComputer({ moveId, host }).catch((error: unknown) =>
					console.warn(
						`[chat-move] could not finish move ${moveId} to this computer`,
						error,
					),
				);
			}
			void utils.chatMove.latest.invalidate();
			void utils.workspaceMove.latest.invalidate();
		})();
	}, [data, activeHostUrl, utils]);
}
