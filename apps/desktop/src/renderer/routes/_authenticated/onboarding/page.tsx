import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiGithub } from "react-icons/si";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GhAuthDialog, type GhAuthDialogMode } from "./components/GhAuthDialog";
import { OnboardingTile } from "./components/OnboardingTile";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingDashboardPage,
});

const PREREQ_POLL_MS = 4000;

function OnboardingDashboardPage() {
	const { t } = useLingui();
	const [ghDialogMode, setGhDialogMode] = useState<GhAuthDialogMode | null>(
		null,
	);

	// Poll while mounted so external changes (installing gh in a browser,
	// signing in from a terminal) are picked up without a focus change.
	const statusPolling = { refetchInterval: PREREQ_POLL_MS } as const;

	const {
		data: ghStatus,
		refetch: refetchGh,
		isPending: isPendingGh,
	} = electronTrpc.system.detectGhCli.useQuery(undefined, statusPolling);
	const { data: brewStatus } = electronTrpc.system.detectBrew.useQuery();

	const ghInstalled = ghStatus?.installed === true;
	const ghReady = ghInstalled && ghStatus?.authenticated === true;

	const ghStatusLabel = ghReady
		? t`Connected`
		: ghInstalled
			? t`Not signed in`
			: t`Not installed`;

	const brewAvailable = brewStatus?.installed === true;

	const openGitHubInstall = () => {
		if (brewAvailable) {
			setGhDialogMode("install");
			return;
		}
		window.open("https://cli.github.com/", "_blank", "noopener,noreferrer");
	};

	const statusDot = (
		<span
			className={cn(
				"size-1.5 rounded-full",
				ghReady
					? "bg-emerald-500"
					: ghInstalled
						? "bg-amber-500"
						: "bg-muted-foreground/40",
			)}
		/>
	);

	return (
		<>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<OnboardingTile
					icon={<SiGithub />}
					label={
						ghReady
							? "GitHub CLI"
							: ghInstalled
								? t`Sign in to GitHub`
								: t`Install GitHub CLI`
					}
					status={
						isPendingGh ? (
							t`Checking…`
						) : (
							<>
								{statusDot}
								{ghStatusLabel}
							</>
						)
					}
					onClick={
						ghReady
							? () => {}
							: ghInstalled
								? () => setGhDialogMode("auth")
								: openGitHubInstall
					}
					disabled={isPendingGh}
				/>
			</div>

			<GhAuthDialog
				open={ghDialogMode !== null}
				mode={ghDialogMode ?? "auth"}
				onOpenChange={(open) => {
					if (!open) setGhDialogMode(null);
				}}
				onExit={() => void refetchGh()}
			/>
		</>
	);
}
