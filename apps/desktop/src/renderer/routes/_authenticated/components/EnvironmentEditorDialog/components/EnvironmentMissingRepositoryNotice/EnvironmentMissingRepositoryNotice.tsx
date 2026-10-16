import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuTriangleAlert } from "react-icons/lu";

interface EnvironmentMissingRepositoryNoticeProps {
	repositoryFullName: string;
	/** The account the org's GitHub App is installed on; null when GitHub is not connected. */
	installedAccountLogin: string | null;
	onConfigureGitHubApp: (() => void) | null;
}

export function EnvironmentMissingRepositoryNotice({
	repositoryFullName,
	installedAccountLogin,
	onConfigureGitHubApp,
}: EnvironmentMissingRepositoryNoticeProps) {
	const owner = repositoryFullName.split("/")[0] ?? "";
	const isOnInstalledAccount =
		installedAccountLogin !== null &&
		owner.toLowerCase() === installedAccountLogin.toLowerCase();

	return (
		<div className="flex items-start gap-2.5 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2.5">
			<LuTriangleAlert className="mt-px size-3.5 shrink-0 text-amber-500/70" />
			<p className="flex-1 text-xs leading-relaxed text-foreground/75">
				{installedAccountLogin === null ? (
					<Trans>
						Connect GitHub in Integrations to add {repositoryFullName}.
					</Trans>
				) : isOnInstalledAccount ? (
					<Trans>
						{repositoryFullName} isn't shared with the Superset GitHub App yet.
					</Trans>
				) : (
					<Trans>
						{repositoryFullName} isn't on {installedAccountLogin}, where this
						organization's GitHub App is installed.
					</Trans>
				)}
			</p>
			{onConfigureGitHubApp && (
				<Button
					className="h-7 shrink-0 px-2.5 text-xs"
					onClick={onConfigureGitHubApp}
					size="sm"
					variant="outline"
				>
					<Trans>Configure GitHub App</Trans>
				</Button>
			)}
		</div>
	);
}
