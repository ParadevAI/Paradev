import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import { StepError } from "../../../StepError";

export type InstallFailureReason =
	| "offline"
	| "rate-limited"
	| "download"
	| "checksum"
	| "install"
	| "stalled";

const GH_CLI_HOME_URL = "https://cli.github.com/";
const GH_CLI_RELEASES_URL = "https://github.com/cli/cli/releases/latest";

interface InstallFailedProps {
	reason: InstallFailureReason;
	downloadUrl: string | null;
	isMac: boolean;
	onRetry: () => void;
	/** Resolves true when GitHub CLI is now installed, e.g. with Homebrew. */
	onCheckAgain: () => Promise<boolean>;
}

export function InstallFailed({
	reason,
	downloadUrl,
	isMac,
	onRetry,
	onCheckAgain,
}: InstallFailedProps) {
	const { t } = useLingui();
	const [checking, setChecking] = useState(false);
	const [stillMissing, setStillMissing] = useState(false);

	const messages: Record<InstallFailureReason, string> = {
		offline: t`Couldn't reach GitHub. Check your internet connection and try again.`,
		"rate-limited": t`GitHub is limiting downloads right now. Wait a minute and try again.`,
		download: t`The download didn't finish. Try again.`,
		checksum: t`The download looked wrong, so Paradev didn't install it. Try again.`,
		install: t`Couldn't unpack or save GitHub CLI on this Mac.`,
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
				message={messages[reason]}
				onRetry={onRetry}
				fallback={
					<>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() =>
								window.open(
									isMac
										? (downloadUrl ?? GH_CLI_RELEASES_URL)
										: GH_CLI_HOME_URL,
									"_blank",
									"noopener,noreferrer",
								)
							}
						>
							<Trans>Download from GitHub</Trans>
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
					<Trans>Paradev still can't find GitHub CLI.</Trans>
				) : (
					<Trans>
						Installed it another way, like Homebrew? Click Check again.
					</Trans>
				)}
			</p>
		</div>
	);
}
