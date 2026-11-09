import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { getBinDir } from "@superset/agent-setup/paths";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { net } from "electron";
import { publicProcedure, router } from "../..";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { COMMAND_LINE_TOOLS_INSTALLER_PATH, detectGit } from "./detect-git";
import {
	createGhCliDeps,
	finishPendingGhGitSetup,
	type GhAuthLoginEvent,
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
	// Resolve `gh` via the user's login-shell PATH (execWithShellEnv retries with
	// the derived shell env on ENOENT), so we find it wherever it's installed —
	// homebrew, MacPorts, nix, asdf, etc. — not just a hardcoded path list.
	let version: string | null = null;
	try {
		const { stdout } = await execWithShellEnv("gh", ["--version"], {
			timeout: 5000,
		});
		const firstLine = stdout.split("\n")[0]?.trim() ?? "";
		version = firstLine.match(/gh version (\S+)/)?.[1] ?? null;
	} catch {
		return {
			installed: false,
			authenticated: false,
			version: null,
			path: null,
		};
	}

	let authenticated = false;
	try {
		await execWithShellEnv(
			"gh",
			["auth", "status", "--active", "--hostname", "github.com"],
			{ timeout: 5000 },
		);
		authenticated = true;
	} catch {
		// `--active` requires gh >= 2.40; retry without it for older installs.
		// Both variants exit non-zero when not logged in.
		try {
			await execWithShellEnv(
				"gh",
				["auth", "status", "--hostname", "github.com"],
				{ timeout: 5000 },
			);
			authenticated = true;
		} catch {}
	}

	if (authenticated) void finishPendingGhGitSetup();
	return { installed: true, authenticated, version, path: "gh" };
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
		installGhCli: publicProcedure.subscription(() => {
			return observable<GhInstallEvent>((emit) => {
				const controller = new AbortController();
				const finish = (event: GhInstallEvent) => {
					if (controller.signal.aborted) return;
					emit.next(event);
					emit.complete();
				};
				if (process.platform === "darwin") {
					void installGhCli({
						binDir: getBinDir(),
						fetch: (url, init) => net.fetch(url, init),
						signal: controller.signal,
						onProgress: (event) => {
							if (event.stage === "done" || event.stage === "failed") return;
							if (!controller.signal.aborted) emit.next(event);
						},
					}).then(finish);
				} else {
					emit.next({ stage: "installing" });
					void installGhWithBrew().then(finish);
				}
				return () => controller.abort();
			});
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
