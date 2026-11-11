import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { isInstallRunning } from "renderer/routes/_authenticated/components/ToolInstallProgress";

/** True while a GitHub CLI install runs, whichever screen started it. */
export function useGhCliInstalling(): boolean {
	const utils = electronTrpc.useUtils();
	const [installing, setInstalling] = useState(false);
	electronTrpc.system.ghCliInstallProgress.useSubscription(undefined, {
		onData: (event) => {
			setInstalling(isInstallRunning(event));
			if (event.stage === "done") void utils.system.detectGhCli.invalidate();
		},
	});
	return installing;
}
