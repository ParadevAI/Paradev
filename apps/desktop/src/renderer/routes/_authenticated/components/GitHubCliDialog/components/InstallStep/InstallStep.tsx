import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { Progress } from "@superset/ui/progress";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useStallTimeout } from "renderer/routes/_authenticated/hooks/useStallTimeout";
import {
	InstallFailed,
	type InstallFailureReason,
} from "./components/InstallFailed";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const INSTALL_STALL_TIMEOUT_MS = 60_000;

type InstallState =
	| { stage: "starting" }
	| { stage: "downloading"; fraction: number | null; receivedBytes: number }
	| { stage: "verifying" | "installing" }
	| {
			stage: "failed";
			reason: InstallFailureReason;
			downloadUrl: string | null;
	  };

interface InstallStepProps {
	onInstalled: () => void;
	onRetry: () => void;
	onCheckAgain: () => Promise<boolean>;
}

export function InstallStep({
	onInstalled,
	onRetry,
	onCheckAgain,
}: InstallStepProps) {
	const { t } = useLingui();
	const [state, setState] = useState<InstallState>({ stage: "starting" });

	useStallTimeout({
		active: state.stage !== "failed",
		resetKey: state.stage === "downloading" ? state.receivedBytes : state.stage,
		timeoutMs: INSTALL_STALL_TIMEOUT_MS,
		onTimeout: () =>
			setState({ stage: "failed", reason: "stalled", downloadUrl: null }),
	});

	electronTrpc.system.installGhCli.useSubscription(undefined, {
		onData: (event) => {
			if (event.stage === "done") {
				onInstalled();
			} else if (event.stage === "downloading") {
				setState({
					stage: "downloading",
					receivedBytes: event.receivedBytes,
					fraction: event.totalBytes
						? Math.min(event.receivedBytes / event.totalBytes, 1)
						: null,
				});
			} else {
				setState(event);
			}
		},
		onError: () =>
			setState({ stage: "failed", reason: "install", downloadUrl: null }),
	});

	if (state.stage === "failed") {
		return (
			<InstallFailed
				reason={state.reason}
				downloadUrl={state.downloadUrl}
				isMac={isMac}
				onRetry={onRetry}
				onCheckAgain={onCheckAgain}
			/>
		);
	}

	const label =
		state.stage === "verifying"
			? t`Checking the download…`
			: state.stage === "installing"
				? t`Installing…`
				: t`Downloading GitHub CLI…`;
	const fraction = state.stage === "downloading" ? state.fraction : null;

	return (
		<div className="flex flex-col gap-3 py-2">
			<div className="flex items-center gap-2.5 text-sm text-muted-foreground">
				<Spinner className="size-3.5 shrink-0" />
				<span>{label}</span>
				{fraction !== null && (
					<span className="ml-auto tabular-nums">
						{formatPercent(fraction, { maximumFractionDigits: 0 })}
					</span>
				)}
			</div>
			<Progress
				value={
					fraction !== null
						? fraction * 100
						: state.stage === "starting"
							? 0
							: 100
				}
			/>
		</div>
	);
}
