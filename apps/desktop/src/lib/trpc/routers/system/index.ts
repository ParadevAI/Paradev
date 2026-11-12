import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import {
	getToolsBinDir,
	withAppToolsOnPath,
} from "@superset/agent-setup/paths";
import {
	COMMAND_LINE_TOOLS_INSTALLER_PATH,
	detectGit,
} from "@superset/shared/detect-git";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { net } from "electron";
import { publicProcedure, router } from "../..";
import { macArch } from "../utils/mac-arch";
import {
	createSingleInstall,
	installSubscription,
} from "../utils/single-install";
import {
	execWithShellEnv,
	getProcessEnvWithShellEnv,
} from "../workspaces/utils/shell-env";
import {
	createGhCliDeps,
	finishPendingGhGitSetup,
	type GhAuthLoginEvent,
	resolveInstalledGh,
	runGhAuthLogin,
	setUpGhGitCredentials,
} from "./utils/gh-auth-login";
import { installCommandLineTools } from "./utils/install-command-line-tools";
import { type GhInstallEvent, installGhCli } from "./utils/install-gh-cli";

const execFileAsync = promisify(execFile);

interface GhDetectResult {
	installed: boolean;
	authenticated: boolean;
	version: string | null;
	path: string | null;
}

async function detectGhCli(): Promise<GhDetectResult> {
	const gh = await resolveInstalledGh();
	if (!gh) {
		return {
			installed: false,
			authenticated: false,
			version: null,
			path: null,
		};
	}
	const version =
		gh.versionOutput.split("\n")[0]?.match(/gh version (\S+)/)?.[1] ?? null;
	const env = withAppToolsOnPath(await getProcessEnvWithShellEnv());
	const authStatus = (args: string[]) =>
		execFileAsync(gh.command, ["auth", "status", ...args], {
			env,
			timeout: 5000,
		});

	let authenticated = false;
	try {
		await authStatus(["--active", "--hostname", "github.com"]);
		authenticated = true;
	} catch {
		// `--active` requires gh >= 2.40; retry without it for older installs.
		// Both variants exit non-zero when not logged in.
		try {
			await authStatus(["--hostname", "github.com"]);
			authenticated = true;
		} catch {}
	}

	if (authenticated) void finishPendingGhGitSetup();
	return { installed: true, authenticated, version, path: gh.command };
}

interface BrewDetectResult {
	installed: boolean;
	version: string | null;
}

async function detectBrew(): Promise<BrewDetectResult> {
	try {
		const { stdout } = await execWithShellEnv("brew", ["--version"], {
			timeout: 5000,
		});
		const version = stdout.match(/Homebrew (\S+)/)?.[1] ?? null;
		return { installed: true, version };
	} catch {
		return { installed: false, version: null };
	}
}

const COMMAND_LINE_TOOLS_INSTALLER_BUNDLE_ID =
	"com.apple.dt.CommandLineTools.installondemand";

/**
 * Apple's installer opens behind the focused app (Paradev), where a new user
 * never sees it. Wait for its process, then activate it. Running
 * `xcode-select --install` again does not raise an open installer; this does.
 */
async function bringInstallerToFront(): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			await execFileAsync("/usr/bin/pgrep", [
				"-f",
				COMMAND_LINE_TOOLS_INSTALLER_PATH,
			]);
			await execFileAsync("/usr/bin/open", [
				"-b",
				COMMAND_LINE_TOOLS_INSTALLER_BUNDLE_ID,
			]);
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
}

async function isInstallerRunning(): Promise<boolean> {
	try {
		await execFileAsync("/usr/bin/pgrep", [
			"-f",
			COMMAND_LINE_TOOLS_INSTALLER_PATH,
		]);
		return true;
	} catch {
		return false;
	}
}

async function installCommandLineToolsOnMac() {
	if (process.platform !== "darwin") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Command Line Tools are only available on macOS.",
		});
	}
	const result = await installCommandLineTools({
		isInstallerRunning,
		// Returns as soon as Apple's installer window is requested; the install
		// itself runs in that window.
		runXcodeSelectInstall: async () => {
			await execFileAsync("/usr/bin/xcode-select", ["--install"], {
				timeout: 10_000,
			});
		},
		bringInstallerToFront,
	});
	if (result.status === "failed") {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.reason ?? "xcode-select --install failed.",
		});
	}
	return result;
}

async function installGhWithBrew(): Promise<GhInstallEvent> {
	try {
		await execWithShellEnv("brew", ["install", "gh"], { timeout: 600_000 });
		const { version } = await detectGhCli();
		return { stage: "done", version: version ?? "" };
	} catch {
		return { stage: "failed", reason: "install", downloadUrl: null };
	}
}

async function installGh(
	emit: (event: GhInstallEvent) => void,
	signal: AbortSignal,
): Promise<GhInstallEvent> {
	if (process.platform !== "darwin") {
		emit({ stage: "installing", untimed: true });
		return installGhWithBrew();
	}
	return installGhCli({
		binDir: getToolsBinDir(),
		arch: await macArch(),
		fetch: (url, init) => net.fetch(url, init),
		signal,
		onProgress: emit,
	});
}

type GhInstallUpdate = GhInstallEvent | { stage: "cancelled" };

const ghInstalls = createSingleInstall<GhInstallUpdate>({
	cancelled: { stage: "cancelled" },
});

export const createSystemRouter = () => {
	return router({
		detectGhCli: publicProcedure.query(detectGhCli),
		detectBrew: publicProcedure.query(detectBrew),
		detectGit: publicProcedure.query(async () => {
			const result = await detectGit({
				platform: process.platform,
				run: async (command, args) =>
					(await execWithShellEnv(command, args, { timeout: 5000 })).stdout,
				fileExists: existsSync,
			});
			if (result.installed) void finishPendingGhGitSetup();
			return result;
		}),
		installCommandLineTools: publicProcedure.mutation(
			installCommandLineToolsOnMac,
		),
		installGhCli: publicProcedure.subscription(() =>
			installSubscription<GhInstallUpdate>((listener) =>
				ghInstalls.join("gh", installGh, listener),
			),
		),
		ghCliInstallProgress: publicProcedure.subscription(() =>
			installSubscription<GhInstallUpdate>(
				(listener) => ghInstalls.watch("gh", listener),
				{
					endAtLast: false,
				},
			),
		),
		cancelGhCliInstall: publicProcedure.mutation(() => {
			ghInstalls.cancel("gh");
		}),
		setUpGhGitCredentials: publicProcedure.mutation(setUpGhGitCredentials),
		ghAuthLogin: publicProcedure.subscription(() => {
			return observable<GhAuthLoginEvent>((emit) =>
				runGhAuthLogin((event) => {
					emit.next(event);
					if (event.type !== "code") emit.complete();
				}, createGhCliDeps()),
			);
		}),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;
