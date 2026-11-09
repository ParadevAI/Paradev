import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useCommandLineToolsInstall } from "../../../hooks/useCommandLineToolsInstall";

const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";
const GIT_MAC_DOWNLOAD_URL = "https://git-scm.com/downloads/mac";

interface GitMissingNoticeProps {
	needsCommandLineTools: boolean;
	installerRunning: boolean;
	error: string | null;
}

function openExternal(url: string) {
	window.open(url, "_blank", "noopener,noreferrer");
}

export function GitMissingNotice({
	needsCommandLineTools,
	installerRunning,
	error,
}: GitMissingNoticeProps) {
	const { t } = useLingui();
	const { phase, openInstaller, isRequesting } =
		useCommandLineToolsInstall(installerRunning);

	if (!needsCommandLineTools) {
		return (
			<NoticeRow
				title={t`Paradev needs Git to add a project.`}
				detail={error ?? t`Install Git, then come back.`}
				actions={
					!error && (
						<Button
							size="sm"
							className="shrink-0"
							onClick={() => openExternal(GIT_DOWNLOAD_URL)}
						>
							{t`Get Git`}
						</Button>
					)
				}
			/>
		);
	}

	const detail = (() => {
		switch (phase.kind) {
			case "idle":
				return t`On a Mac, Git comes with Apple's Command Line Tools.`;
			case "requested":
				return `${t`In Apple's window, click Install. It takes a few minutes, and this page updates when it's done.`} ${t`Apple's time estimate is usually much longer than the real install.`}`;
			case "closed":
				return t`Apple's installer closed before Git was installed.`;
			case "timed-out":
				return t`This is taking longer than expected.`;
			case "not-found":
				return t`Apple says the tools are installed, but Paradev can't find Git.`;
			case "failed":
				return t`Apple's installer did not open: ${phase.reason}`;
		}
	})();

	const primaryLabel =
		phase.kind === "idle"
			? t`Install Command Line Tools`
			: phase.kind === "requested"
				? t`Show Apple's installer`
				: t`Try again`;

	return (
		<NoticeRow
			title={t`Paradev needs Git to add a project.`}
			detail={detail}
			actions={
				<>
					{phase.kind !== "idle" && phase.kind !== "requested" && (
						<Button
							size="sm"
							variant="ghost"
							className="shrink-0"
							onClick={() => openExternal(GIT_MAC_DOWNLOAD_URL)}
						>
							{t`Other ways to get Git`}
						</Button>
					)}
					<Button
						size="sm"
						className="shrink-0"
						variant={phase.kind === "requested" ? "outline" : "default"}
						onClick={() => void openInstaller()}
						disabled={isRequesting}
					>
						{primaryLabel}
					</Button>
				</>
			}
		/>
	);
}

function NoticeRow({
	title,
	detail,
	actions,
}: {
	title: string;
	detail: string;
	actions: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-lg bg-foreground/[0.05] p-4">
			<div className="min-w-0">
				<p className="font-medium text-foreground text-sm">{title}</p>
				<p className="mt-1 select-text break-words text-muted-foreground text-xs">
					{detail}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">{actions}</div>
		</div>
	);
}
