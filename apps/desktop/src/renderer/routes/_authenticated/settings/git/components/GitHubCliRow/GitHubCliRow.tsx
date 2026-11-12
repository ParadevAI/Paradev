import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	GitHubCliDialog,
	type GitHubCliDialogStart,
	useGhCliInstalling,
} from "renderer/routes/_authenticated/components/GitHubCliDialog";
import { SettingsRow } from "../../../components/SettingsRow";

const GH_CLI_HOME_URL = "https://cli.github.com/";
const isMac = navigator.platform.toUpperCase().includes("MAC");

export function GitHubCliRow() {
	const { t } = useLingui();
	const [dialogStart, setDialogStart] = useState<GitHubCliDialogStart | null>(
		null,
	);
	const status = electronTrpc.system.detectGhCli.useQuery(undefined, {
		refetchOnWindowFocus: "always",
	});
	const brew = electronTrpc.system.detectBrew.useQuery(undefined, {
		enabled: !isMac,
	});
	const installing = useGhCliInstalling();
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
		<SettingsRow
			label={t`GitHub CLI`}
			hint={
				status.isPending ? (
					<Skeleton className="h-3 w-40" />
				) : installing && !installed ? (
					t`Installing…`
				) : ready ? (
					t`Signed in · clones private repos and opens pull requests`
				) : installed ? (
					t`Not signed in · needed for private repos and pull requests`
				) : (
					t`Not installed · needed for private repos and pull requests`
				)
			}
		>
			{!status.isPending && !ready && (
				<Button
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
		</SettingsRow>
	);
}
