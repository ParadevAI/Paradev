import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { SiGithub } from "react-icons/si";
import { SetupRow } from "../SetupRow";

interface GitHubSetupRowProps {
	gh: { installed: boolean; authenticated: boolean } | undefined;
	/** An install is running, maybe started on another screen. */
	installing: boolean;
	onInstall: () => void;
	onSignIn: () => void;
}

export function GitHubSetupRow({
	gh,
	installing,
	onInstall,
	onSignIn,
}: GitHubSetupRowProps) {
	const { t } = useLingui();
	const installed = gh?.installed === true;
	const ready = installed && gh?.authenticated === true;

	return (
		<SetupRow
			icon={<SiGithub />}
			title="GitHub CLI"
			detail={
				!gh
					? t`Checking…`
					: installing && !installed
						? t`Installing…`
						: ready
							? t`Signed in · clones private repos and opens pull requests`
							: installed
								? t`Not signed in · needed for private repos and pull requests`
								: t`Not installed · needed for private repos and pull requests`
			}
			done={ready}
			actions={
				gh &&
				(installed ? (
					<Button size="sm" onClick={onSignIn}>
						<Trans>Sign in</Trans>
					</Button>
				) : (
					<Button size="sm" onClick={onInstall}>
						<Trans>Install</Trans>
					</Button>
				))
			}
		/>
	);
}
