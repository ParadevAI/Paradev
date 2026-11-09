import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Skeleton } from "@superset/ui/skeleton";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	GitHubCliDialog,
	type GitHubCliDialogStart,
} from "renderer/routes/_authenticated/components/GitHubCliDialog";

const GH_CLI_HOME_URL = "https://cli.github.com/";
const isMac = navigator.platform.toUpperCase().includes("MAC");

export function GitHubCliRow() {
	const [dialogStart, setDialogStart] = useState<GitHubCliDialogStart | null>(
		null,
	);
	const status = electronTrpc.system.detectGhCli.useQuery(undefined, {
		refetchOnWindowFocus: "always",
	});
	const brew = electronTrpc.system.detectBrew.useQuery(undefined, {
		enabled: !isMac,
	});
	const installed = status.data?.installed === true;
	const ready = installed && status.data?.authenticated === true;

	const install = () => {
		if (isMac || brew.data?.installed === true) {
			setDialogStart("install");
			return;
		}
		window.open(GH_CLI_HOME_URL, "_blank", "noopener,noreferrer");
	};

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 space-y-0.5">
				<Label className="text-sm font-medium">
					<Trans>GitHub CLI</Trans>
				</Label>
				<div className="text-xs text-muted-foreground">
					{status.isPending ? (
						<Skeleton className="h-3 w-40" />
					) : ready ? (
						<Trans>
							Signed in · clones private repos and opens pull requests
						</Trans>
					) : installed ? (
						<Trans>
							Not signed in · needed for private repos and pull requests
						</Trans>
					) : (
						<Trans>
							Not installed · needed for private repos and pull requests
						</Trans>
					)}
				</div>
			</div>
			{!status.isPending && !ready && (
				<Button
					className="shrink-0"
					onClick={installed ? () => setDialogStart("auth") : install}
					size="sm"
					variant="outline"
				>
					<Trans>Connect</Trans>
				</Button>
			)}
			<GitHubCliDialog
				open={dialogStart !== null}
				startWith={dialogStart ?? "auth"}
				onOpenChange={(open) => {
					if (!open) setDialogStart(null);
				}}
			/>
		</div>
	);
}
