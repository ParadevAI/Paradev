import { useState } from "react";
import { useStallTimeout } from "renderer/routes/_authenticated/hooks/useStallTimeout";

export type ToolInstallFailure =
	| "unsupported"
	| "offline"
	| "rate-limited"
	| "download"
	| "checksum"
	| "signature"
	| "disk-full"
	| "install"
	| "stalled";

/** What an install subscription sends: gh's and the coding agents' share it. */
export type ToolInstallEvent =
	| { stage: "downloading"; receivedBytes: number; totalBytes: number | null }
	| { stage: "verifying" }
	| { stage: "installing"; untimed?: boolean }
	| { stage: "done" }
	| { stage: "cancelled" }
	| {
			stage: "failed";
			reason: ToolInstallFailure;
			downloadUrl?: string | null;
	  };

export type ToolInstallState =
	| { stage: "starting" }
	| { stage: "downloading"; fraction: number | null; receivedBytes: number }
	| { stage: "verifying" }
	| { stage: "installing"; untimed: boolean }
	| {
			stage: "failed";
			reason: ToolInstallFailure;
			downloadUrl: string | null;
	  };

const INSTALL_STALL_TIMEOUT_MS = 60_000;

export function isInstallRunning(event: ToolInstallEvent): boolean {
	return (
		event.stage === "downloading" ||
		event.stage === "verifying" ||
		event.stage === "installing"
	);
}

export function nextToolInstallState(
	event: Exclude<ToolInstallEvent, { stage: "done" } | { stage: "cancelled" }>,
): ToolInstallState {
	switch (event.stage) {
		case "downloading":
			return {
				stage: "downloading",
				receivedBytes: event.receivedBytes,
				fraction: event.totalBytes
					? Math.min(event.receivedBytes / event.totalBytes, 1)
					: null,
			};
		case "installing":
			return { stage: "installing", untimed: event.untimed === true };
		case "failed":
			return {
				stage: "failed",
				reason: event.reason,
				downloadUrl: event.downloadUrl ?? null,
			};
		default:
			return event;
	}
}

/**
 * The state of one install subscription, failed as "stalled" after a minute
 * with no progress, except during a step that prints none (brew).
 */
export function useToolInstallState({
	onInstalled,
	onCancelled,
	timeoutMs = INSTALL_STALL_TIMEOUT_MS,
}: {
	onInstalled: () => void;
	/** Someone pressed Cancel, here or on another screen. */
	onCancelled: () => void;
	timeoutMs?: number;
}) {
	const [state, setState] = useState<ToolInstallState>({ stage: "starting" });

	useStallTimeout({
		active:
			state.stage !== "failed" &&
			!(state.stage === "installing" && state.untimed),
		resetKey: state.stage === "downloading" ? state.receivedBytes : state.stage,
		timeoutMs,
		onTimeout: () =>
			setState({ stage: "failed", reason: "stalled", downloadUrl: null }),
	});

	return {
		state,
		onData: (event: ToolInstallEvent) => {
			if (event.stage === "done") onInstalled();
			else if (event.stage === "cancelled") onCancelled();
			else setState(nextToolInstallState(event));
		},
		onError: () =>
			setState({ stage: "failed", reason: "install", downloadUrl: null }),
	};
}
