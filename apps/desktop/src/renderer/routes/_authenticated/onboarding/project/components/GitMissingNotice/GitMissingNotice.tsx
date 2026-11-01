import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

const GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";
const GIT_MAC_DOWNLOAD_URL = "https://git-scm.com/downloads/mac";
// Apple's installer window normally appears within a few seconds of
// `xcode-select --install`; past this we treat it as never opened.
const INSTALLER_APPEAR_TIMEOUT_MS = 20_000;

interface GitMissingNoticeProps {
	needsCommandLineTools: boolean;
	installerRunning: boolean;
	error: string | null;
}

type InstallPhase =
	| { kind: "idle" }
	| { kind: "requested"; sawInstaller: boolean }
	| { kind: "closed" }
	| { kind: "failed"; reason: string };

function openExternal(url: string) {
	window.open(url, "_blank", "noopener,noreferrer");
}

export function GitMissingNotice({
	needsCommandLineTools,
	installerRunning,
	error,
}: GitMissingNoticeProps) {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const [phase, setPhase] = useState<InstallPhase>({ kind: "idle" });
	const appearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const installCommandLineTools =
		electronTrpc.system.installCommandLineTools.useMutation();

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

	useEffect(
		() => () => {
			if (appearTimer.current) clearTimeout(appearTimer.current);
		},
		[],
	);

	const openInstaller = async () => {
		try {
			const result = await installCommandLineTools.mutateAsync();
			if (result.status === "already-installed") {
				await utils.system.detectGit.invalidate();
				return;
			}
			setPhase({ kind: "requested", sawInstaller: installerRunning });
			if (appearTimer.current) clearTimeout(appearTimer.current);
			appearTimer.current = setTimeout(() => {
				setPhase((current) =>
					current.kind === "requested" && !current.sawInstaller
						? { kind: "closed" }
						: current,
				);
			}, INSTALLER_APPEAR_TIMEOUT_MS);
			await utils.system.detectGit.invalidate();
		} catch (err) {
			setPhase({ kind: "failed", reason: errorMessage(err) });
		}
	};

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
				return t`In Apple's window, click Install. It takes a few minutes, and this page updates when it's done.`;
			case "closed":
				return t`Apple's installer closed before Git was installed.`;
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
					{(phase.kind === "closed" || phase.kind === "failed") && (
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
						disabled={installCommandLineTools.isPending}
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
