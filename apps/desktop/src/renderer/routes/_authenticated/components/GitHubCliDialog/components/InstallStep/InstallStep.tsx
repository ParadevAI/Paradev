import { Trans } from "@lingui/react/macro";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	ToolInstallProgress,
	useToolInstallState,
} from "renderer/routes/_authenticated/components/ToolInstallProgress";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const GH_CLI_HOME_URL = "https://cli.github.com/";
const GH_CLI_RELEASES_URL = "https://github.com/cli/cli/releases/latest";

interface InstallStepProps {
	onInstalled: () => void;
	onRetry: () => void;
	onCheckAgain: () => Promise<boolean>;
}

export function InstallStep({
	onInstalled,
	onRetry,
	onCheckAgain,
}: InstallStepProps) {
	const install = useToolInstallState(onInstalled);
	electronTrpc.system.installGhCli.useSubscription(undefined, {
		onData: install.onData,
		onError: install.onError,
	});
	const downloadUrl =
		install.state.stage === "failed" ? install.state.downloadUrl : null;

	return (
		<ToolInstallProgress
			state={install.state}
			name="GitHub CLI"
			vendor="GitHub"
			manualInstall={{
				label: <Trans>Download from GitHub</Trans>,
				url: isMac ? (downloadUrl ?? GH_CLI_RELEASES_URL) : GH_CLI_HOME_URL,
			}}
			onRetry={onRetry}
			onCheckAgain={onCheckAgain}
		/>
	);
}
