import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { Progress } from "@superset/ui/progress";
import { Spinner } from "@superset/ui/spinner";
import { type ReactNode, useState } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import { StepError } from "renderer/routes/_authenticated/components/StepError";
import type {
	ToolInstallFailure,
	ToolInstallState,
} from "./hooks/useToolInstallState";

interface ToolInstallProgressProps {
	state: ToolInstallState;
	/** The tool's name, e.g. "GitHub CLI". */
	name: string;
	/** Who signs and serves it, e.g. "GitHub". */
	vendor: string;
	manualInstall: { label: ReactNode; url: string };
	onRetry: () => void;
	/** Resolves true when the tool is now installed, e.g. by the user. */
	onCheckAgain: () => Promise<boolean>;
	/** Stops the install. Leaving the screen does not. */
	onCancel: () => void;
}

/** An install's progress, or why it failed with a way to do it by hand. */
export function ToolInstallProgress({
	state,
	name,
	vendor,
	manualInstall,
	onRetry,
	onCheckAgain,
	onCancel,
}: ToolInstallProgressProps) {
	const { t } = useLingui();
	const [checking, setChecking] = useState(false);
	const [stillMissing, setStillMissing] = useState(false);

	if (state.stage === "failed") {
		const messages: Record<ToolInstallFailure, string> = {
			unsupported: t`Paradev can install ${name} on a Mac only. Install it yourself, then click Check again.`,
			offline: t`Couldn't reach ${vendor}. Check your internet connection and try again.`,
			"rate-limited": t`${vendor} is limiting downloads right now. Wait a minute and try again.`,
			download: t`The download didn't finish. Try again.`,
			checksum: t`The download looked wrong, so Paradev didn't install it. Try again.`,
			signature: t`The download isn't signed by ${vendor}, so Paradev didn't install it.`,
			"disk-full": t`There isn't enough free disk space to install ${name}. Free up some space and try again.`,
			install: t`Couldn't set up ${name} on this computer.`,
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
										manualInstall.url,
										"_blank",
										"noopener,noreferrer",
									)
								}
							>
								{manualInstall.label}
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
				<span className="ml-auto flex items-center gap-2">
					{fraction !== null && (
						<span className="tabular-nums">
							{formatPercent(fraction, { maximumFractionDigits: 0 })}
						</span>
					)}
					<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
						<Trans>Cancel</Trans>
					</Button>
				</span>
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
