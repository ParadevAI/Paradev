import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { LuArrowUpRight } from "react-icons/lu";
import { SiGit } from "react-icons/si";
import type { CommandLineToolsInstallPhase } from "../../hooks/useCommandLineToolsInstall";
import { SetupRow } from "../SetupRow";

const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";
const APPLE_DOWNLOADS_URL = "https://developer.apple.com/download/all/";

interface GitSetupRowProps {
	git:
		| {
				installed: boolean;
				needsCommandLineTools: boolean;
				error: string | null;
		  }
		| undefined;
	install: {
		phase: CommandLineToolsInstallPhase;
		openInstaller: () => Promise<void>;
		checkAgain: () => Promise<void>;
		isRequesting: boolean;
		stillMissing: boolean;
	};
}

function openExternal(url: string) {
	window.open(url, "_blank", "noopener,noreferrer");
}

export function GitSetupRow({ git, install }: GitSetupRowProps) {
	const { t } = useLingui();
	const { phase, isRequesting } = install;

	if (git?.installed) {
		return <SetupRow icon={<SiGit />} title="Git" detail={t`Installed`} done />;
	}

	if (git && !git.needsCommandLineTools) {
		return (
			<SetupRow
				icon={<SiGit />}
				title="Git"
				detail={git.error ?? t`Install Git, then come back.`}
				done={false}
				actions={
					<Button size="sm" onClick={() => openExternal(GIT_DOWNLOAD_URL)}>
						<Trans>Get Git</Trans>
					</Button>
				}
			/>
		);
	}

	if (phase.kind === "idle" || phase.kind === "requested") {
		return (
			<SetupRow
				icon={<SiGit />}
				title="Git"
				detail={
					phase.kind === "idle"
						? t`Comes with Apple's Command Line Tools.`
						: t`In Apple's window, click Install. It takes a few minutes, and this page updates when it's done.`
				}
				done={false}
				actions={
					phase.kind === "idle" ? (
						<Button
							size="sm"
							disabled={isRequesting}
							onClick={() => void install.openInstaller()}
						>
							<Trans>Install</Trans>
						</Button>
					) : (
						<Button
							size="sm"
							variant="outline"
							disabled={isRequesting}
							onClick={() => void install.openInstaller()}
						>
							<Spinner className="size-3" />
							<Trans>Show Apple's installer</Trans>
						</Button>
					)
				}
			/>
		);
	}

	const problem = {
		closed: t`Apple's installer closed before Git was installed.`,
		"timed-out": t`This is taking longer than expected.`,
		"not-found": t`Apple says the tools are installed, but Paradev can't find Git.`,
		failed:
			phase.kind === "failed"
				? t`Apple's installer did not open: ${phase.reason}`
				: "",
	}[phase.kind];

	return (
		<SetupRow
			icon={<SiGit />}
			title="Git"
			detail={install.stillMissing ? t`Git still isn't installed.` : problem}
			done={false}
			footer={
				<div className="flex flex-wrap items-center justify-between gap-2 pl-12">
					<p className="text-muted-foreground text-xs">
						<Trans>
							Downloading from Apple needs an Apple ID. The install can need
							about 20 GB of free space.
						</Trans>
					</p>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="ghost"
							onClick={() => openExternal(APPLE_DOWNLOADS_URL)}
						>
							<Trans>Download from Apple</Trans>
							<LuArrowUpRight className="size-3" />
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={isRequesting}
							onClick={() => void install.checkAgain()}
						>
							<Trans>Check again</Trans>
						</Button>
						<Button
							size="sm"
							disabled={isRequesting}
							onClick={() => void install.openInstaller()}
						>
							<Trans>Try again</Trans>
						</Button>
					</div>
				</div>
			}
		/>
	);
}
