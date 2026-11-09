import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
	resolveAppHomeDir,
	withBinDirOnPath,
} from "@superset/agent-setup/paths";
import { getProcessEnvWithShellEnv } from "../../../workspaces/utils/shell-env";
import { detectGit } from "../../detect-git";
import {
	finishPendingGitSetup,
	type GhAuthLoginDeps,
	setUpGitCredentials,
} from "./gh-auth-login";

const execFileAsync = promisify(execFile);

function pendingMarkerPath(): string {
	return path.join(resolveAppHomeDir(), "gh-setup-git-pending");
}

async function toolEnv(): Promise<Record<string, string>> {
	return withBinDirOnPath(await getProcessEnvWithShellEnv());
}

export function createGhCliDeps(): GhAuthLoginDeps {
	return {
		hasUsableGit: async () => {
			const env = await toolEnv();
			const git = await detectGit({
				platform: process.platform,
				run: async (command, args) =>
					(await execFileAsync(command, args, { env, timeout: 5000 })).stdout,
				fileExists: fs.existsSync,
			});
			return git.installed;
		},
		toolEnv,
		gitShimDir: async () => {
			const dir = path.join(resolveAppHomeDir(), "gh-git-shim");
			await fs.promises.mkdir(dir, { recursive: true });
			const shim = path.join(dir, "git");
			await fs.promises.writeFile(shim, "#!/bin/sh\nexit 1\n");
			await fs.promises.chmod(shim, 0o755);
			return dir;
		},
		runGh: async (args) => {
			await execFileAsync("gh", args, {
				env: await toolEnv(),
				timeout: 15_000,
			});
		},
		spawnGh: (args, env) => {
			const child = spawn("gh", args, {
				env,
				stdio: ["ignore", "pipe", "pipe"],
			});
			const listeners: Array<(chunk: string) => void> = [];
			const forward = (data: Buffer) => {
				for (const listener of listeners) listener(data.toString("utf8"));
			};
			child.stdout?.on("data", forward);
			child.stderr?.on("data", forward);
			const exited = new Promise<number | null>((resolve) => {
				child.on("error", () => resolve(null));
				child.on("close", (code) => resolve(code));
			});
			return {
				onOutput: (listener) => listeners.push(listener),
				exited,
				kill: () => child.kill(),
			};
		},
		isGitSetupPending: async () => fs.existsSync(pendingMarkerPath()),
		setGitSetupPending: async (pending) => {
			const marker = pendingMarkerPath();
			if (pending) {
				await fs.promises.mkdir(path.dirname(marker), { recursive: true });
				await fs.promises.writeFile(marker, "");
			} else {
				await fs.promises.rm(marker, { force: true });
			}
		},
	};
}

function singleFlight(run: () => Promise<boolean>): () => Promise<boolean> {
	let inFlight: Promise<boolean> | null = null;
	return () => {
		inFlight ??= run()
			.catch(() => false)
			.finally(() => {
				inFlight = null;
			});
		return inFlight;
	};
}

export const finishPendingGhGitSetup = singleFlight(() =>
	finishPendingGitSetup(createGhCliDeps()),
);

export const setUpGhGitCredentials = singleFlight(() =>
	setUpGitCredentials(createGhCliDeps()),
);
