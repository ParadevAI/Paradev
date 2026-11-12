import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCommandLineToolsInstallFlow } from "./useCommandLineToolsInstallFlow";

const INSTALLER_APPEAR_TIMEOUT_MS = 20_000;
// Apple downloads several GB; past this, offer a retry instead of a spinner.
const INSTALL_STALL_TIMEOUT_MS = 45 * 60_000;

export function useCommandLineToolsInstall(installerRunning: boolean) {
	const utils = electronTrpc.useUtils();
	const installCommandLineTools =
		electronTrpc.system.installCommandLineTools.useMutation();

	const isGitInstalled = async () => {
		await utils.system.detectGit.invalidate();
		const status = await utils.system.detectGit.fetch();
		return status.installed;
	};

	return useCommandLineToolsInstallFlow({
		installerRunning,
		requestInstall: async () => {
			const result = await installCommandLineTools.mutateAsync();
			await utils.system.detectGit.invalidate();
			return result;
		},
		isGitInstalled,
		appearTimeoutMs: INSTALLER_APPEAR_TIMEOUT_MS,
		stallTimeoutMs: INSTALL_STALL_TIMEOUT_MS,
	});
}
