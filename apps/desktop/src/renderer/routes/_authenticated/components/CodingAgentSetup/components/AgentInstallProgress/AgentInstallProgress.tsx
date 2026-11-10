import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Progress } from "@superset/ui/progress";
import { Spinner } from "@superset/ui/spinner";
import { useState } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { StepError } from "renderer/routes/_authenticated/components/GitHubCliDialog/components/StepError";
import { useStallTimeout } from "renderer/routes/_authenticated/hooks/useStallTimeout";
import {
	CODING_AGENT_MANUAL_INSTALL_URLS,
	CODING_AGENT_NAMES,
	CODING_AGENT_VENDORS,
	type CodingAgentId,
} from "../../constants";

const INSTALL_STALL_TIMEOUT_MS = 60_000;

type FailureReason =
	| "unsupported"
	| "offline"
	| "download"
	| "checksum"
	| "signature"
	| "install"
	| "stalled";

type InstallState =
	| { stage: "starting" }
	| { stage: "downloading"; fraction: number | null; receivedBytes: number }
	| { stage: "verifying" | "installing" }
	| { stage: "failed"; reason: FailureReason };

interface AgentInstallProgressProps {
	agent: CodingAgentId;
	onInstalled: () => void;
	onRetry: () => void;
	/** Resolves true when the agent is now installed, e.g. by the user. */
	onCheckAgain: () => Promise<boolean>;
}

export function AgentInstallProgress({
	agent,
	onInstalled,
	onRetry,
	onCheckAgain,
}: AgentInstallProgressProps) {
	const { t } = useLingui();
	const name = CODING_AGENT_NAMES[agent];
	const vendor = CODING_AGENT_VENDORS[agent];
	const [state, setState] = useState<InstallState>({ stage: "starting" });
	const [checking, setChecking] = useState(false);
	const [stillMissing, setStillMissing] = useState(false);

	useStallTimeout({
		active: state.stage !== "failed",
		resetKey: state.stage === "downloading" ? state.receivedBytes : state.stage,
		timeoutMs: INSTALL_STALL_TIMEOUT_MS,
		onTimeout: () => setState({ stage: "failed", reason: "stalled" }),
	});

	electronTrpc.codingAgents.install.useSubscription(
		{ agent },
		{
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
			onError: () => setState({ stage: "failed", reason: "install" }),
		},
	);

	if (state.stage === "failed") {
		const messages: Record<FailureReason, string> = {
			unsupported: t`Paradev can install ${name} on a Mac only. Install it yourself, then click Check again.`,
			offline: t`Couldn't reach the download server. Check your internet connection and try again.`,
			download: t`The download didn't finish. Try again.`,
			checksum: t`The download looked wrong, so Paradev didn't install it. Try again.`,
			signature: t`The download isn't signed by ${vendor}, so Paradev didn't install it.`,
			install: t`Couldn't set up ${name} on this Mac.`,
			stalled: t`The install stopped responding.`,
		};
		const checkAgain = async () => {
			setChecking(true);
			const installed = await onCheckAgain().catch(() => false);
			setChecking(false);
			setStillMissing(!installed);
		};
		return (
			<div className="flex flex-col gap-2">
				<StepError
					message={messages[state.reason]}
					onRetry={onRetry}
					fallback={
						<>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() =>
									window.open(
										CODING_AGENT_MANUAL_INSTALL_URLS[agent],
										"_blank",
										"noopener,noreferrer",
									)
								}
							>
								<Trans>Install it yourself</Trans>
								<LuArrowUpRight className="size-3" />
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={checking}
								onClick={() => void checkAgain()}
							>
								<Trans>Check again</Trans>
							</Button>
						</>
					}
				/>
				<p className="text-xs text-muted-foreground">
					{stillMissing ? (
						<Trans>Paradev still can't find {name}.</Trans>
					) : (
						<Trans>Installed it another way? Click Check again.</Trans>
					)}
				</p>
			</div>
		);
	}

	const label =
		state.stage === "verifying"
			? t`Checking the download…`
			: state.stage === "installing"
				? t`Installing…`
				: t`Downloading ${name}…`;
	const fraction = state.stage === "downloading" ? state.fraction : null;

	return (
		<div className="flex flex-col gap-3 py-1">
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
