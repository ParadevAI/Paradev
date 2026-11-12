import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	GitHubCliDialog,
	type GitHubCliDialogStart,
	useGhCliInstalling,
} from "renderer/routes/_authenticated/components/GitHubCliDialog";
import { CodingAgentSetupRow } from "./components/CodingAgentSetupRow";
import { GitHubSetupRow } from "./components/GitHubSetupRow";
import { GitSetupRow } from "./components/GitSetupRow";
import { useCommandLineToolsInstall } from "./hooks/useCommandLineToolsInstall";
import { useSetupStepRows } from "./providers/SetupStepRowsProvider";
import { gitDetectionPolling } from "./utils/gitDetectionPolling";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: SetupStepPage,
});

const PREREQ_POLL_MS = 4000;
const GH_CLI_HOME_URL = "https://cli.github.com/";
const isMac = navigator.platform.toUpperCase().includes("MAC");

function SetupStepPage() {
	const rows = useSetupStepRows();
	const [ghDialogStart, setGhDialogStart] =
		useState<GitHubCliDialogStart | null>(null);

	const { data: gitStatus } = electronTrpc.system.detectGit.useQuery(
		undefined,
		gitDetectionPolling({ reportedAt: null, intervalMs: PREREQ_POLL_MS }),
	);
	// Polls even while the window is unfocused, so a gh installed or signed in
	// from a terminal shows up without switching back to the app.
	const { data: ghStatus } = electronTrpc.system.detectGhCli.useQuery(
		undefined,
		{
			enabled: rows.gitHub,
			refetchInterval: PREREQ_POLL_MS,
			refetchIntervalInBackground: true,
		},
	);
	const { data: brewStatus } = electronTrpc.system.detectBrew.useQuery(
		undefined,
		{ enabled: rows.gitHub && !isMac },
	);
	const gitInstall = useCommandLineToolsInstall(
		gitStatus?.installerRunning ?? false,
	);

	// gh signed in before git worked has no git credential helper yet.
	const setUpGhGitCredentials =
		electronTrpc.system.setUpGhGitCredentials.useMutation();
	const gitWasMissing = useRef(false);
	useEffect(() => {
		if (gitStatus?.installed === false) gitWasMissing.current = true;
		if (gitStatus?.installed && gitWasMissing.current) {
			gitWasMissing.current = false;
			setUpGhGitCredentials.mutate();
		}
	}, [gitStatus?.installed, setUpGhGitCredentials.mutate]);

	const ghInstalling = useGhCliInstalling();
	const installGh = () => {
		if (isMac || brewStatus?.installed === true) {
			setGhDialogStart("install");
			return;
		}
		window.open(GH_CLI_HOME_URL, "_blank", "noopener,noreferrer");
	};

	return (
		<div className="flex flex-col gap-3">
			{rows.git && <GitSetupRow git={gitStatus} install={gitInstall} />}
			{rows.gitHub && (
				<GitHubSetupRow
					gh={ghStatus}
					installing={ghInstalling}
					onInstall={installGh}
					onSignIn={() => setGhDialogStart("auth")}
				/>
			)}
			{rows.claude && <CodingAgentSetupRow agent="claude" />}
			{rows.codex && <CodingAgentSetupRow agent="codex" />}
			<GitHubCliDialog
				open={ghDialogStart !== null}
				startWith={ghDialogStart ?? "auth"}
				onOpenChange={(open) => {
					if (!open) setGhDialogStart(null);
				}}
			/>
		</div>
	);
}
