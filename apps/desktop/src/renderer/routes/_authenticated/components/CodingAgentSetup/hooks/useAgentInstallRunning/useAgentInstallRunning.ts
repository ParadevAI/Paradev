import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { isInstallRunning } from "renderer/routes/_authenticated/components/ToolInstallProgress";
import type { CodingAgentId } from "../../constants";

/**
 * True while this agent installs, whichever screen started it, so every
 * screen shows the same install instead of offering another.
 */
export function useAgentInstallRunning(
	agent: CodingAgentId,
	{ enabled = true }: { enabled?: boolean } = {},
): boolean {
	const utils = electronTrpc.useUtils();
	const [running, setRunning] = useState(false);
	electronTrpc.codingAgents.installProgress.useSubscription(
		{ agent },
		{
			enabled,
			onData: (event) => {
				setRunning(isInstallRunning(event));
				if (event.stage === "done") {
					void utils.codingAgents.status.invalidate({ agent });
				}
			},
		},
	);
	return enabled && running;
}
