import { errorMessage } from "@superset/i18n/errors";
import { useEffect, useState } from "react";
import { useStallTimeout } from "renderer/routes/_authenticated/hooks/useStallTimeout";

export type CommandLineToolsInstallPhase =
	| { kind: "idle" }
	| { kind: "requested"; sawInstaller: boolean }
	/** Apple's installer ended, or never appeared, while git is still missing. */
	| { kind: "closed" }
	| { kind: "timed-out" }
	/** xcode-select says the tools are installed, but git is still missing. */
	| { kind: "not-found" }
	| { kind: "failed"; reason: string };

export type RequestInstallResult =
	| { status: "requested" }
	| { status: "already-installed" }
	| { status: "already-running" };

export interface CommandLineToolsInstallFlowOptions {
	installerRunning: boolean;
	requestInstall: () => Promise<RequestInstallResult>;
	isGitInstalled: () => Promise<boolean>;
	/** Apple's window normally appears within seconds of `xcode-select --install`. */
	appearTimeoutMs: number;
	/** Longest an install may run before we offer a retry. */
	stallTimeoutMs: number;
}

export function useCommandLineToolsInstallFlow({
	installerRunning,
	requestInstall,
	isGitInstalled,
	appearTimeoutMs,
	stallTimeoutMs,
}: CommandLineToolsInstallFlowOptions) {
	const [phase, setPhase] = useState<CommandLineToolsInstallPhase>({
		kind: "idle",
	});
	const [isRequesting, setIsRequesting] = useState(false);
	const [stillMissing, setStillMissing] = useState(false);

	// Follow Apple's installer window: once we've seen it open, it closing
	// while git is still missing means the user cancelled or the install failed.
	useEffect(() => {
		if (phase.kind !== "requested") return;
		if (installerRunning && !phase.sawInstaller) {
			setPhase({ kind: "requested", sawInstaller: true });
		} else if (!installerRunning && phase.sawInstaller) {
			setPhase({ kind: "closed" });
		}
	}, [installerRunning, phase]);

	const waitingForWindow = phase.kind === "requested" && !phase.sawInstaller;
	useStallTimeout({
		active: waitingForWindow,
		resetKey: waitingForWindow,
		timeoutMs: appearTimeoutMs,
		onTimeout: () => setPhase({ kind: "closed" }),
	});
	useStallTimeout({
		active: phase.kind === "requested",
		resetKey: phase.kind,
		timeoutMs: stallTimeoutMs,
		onTimeout: () => setPhase({ kind: "timed-out" }),
	});

	const openInstaller = async () => {
		setIsRequesting(true);
		setStillMissing(false);
		try {
			const result = await requestInstall();
			if (result.status === "already-installed") {
				if (!(await isGitInstalled())) setPhase({ kind: "not-found" });
				return;
			}
			// Also for "already-running": wait until polling sees the window, or
			// the effect below would read the stale poll as "closed".
			setPhase({ kind: "requested", sawInstaller: installerRunning });
		} catch (err) {
			setPhase({ kind: "failed", reason: errorMessage(err) });
		} finally {
			setIsRequesting(false);
		}
	};

	const checkAgain = async () => {
		setIsRequesting(true);
		const installed = await isGitInstalled().catch(() => false);
		setIsRequesting(false);
		setStillMissing(!installed);
	};

	return { phase, openInstaller, checkAgain, isRequesting, stillMissing };
}
