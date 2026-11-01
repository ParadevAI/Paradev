import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../..";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { detectGit } from "./detect-git";

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

export type InstallCommandLineToolsResult =
	| { status: "requested" }
	| { status: "already-installed" };

async function installCommandLineTools(): Promise<InstallCommandLineToolsResult> {
	if (process.platform !== "darwin") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Command Line Tools are only available on macOS.",
		});
	}
	try {
		// Returns as soon as Apple's installer window is requested; the install
		// itself runs in that window.
		await execFileAsync("/usr/bin/xcode-select", ["--install"], {
			timeout: 10_000,
		});
		return { status: "requested" };
	} catch (error) {
		const stderr =
			error && typeof error === "object" && "stderr" in error
				? String(error.stderr)
				: "";
		// "xcode-select: error: command line tools are already installed, use
		// "Software Update" in System Settings to install updates"
		if (/already installed/i.test(stderr)) {
			return { status: "already-installed" };
		}
		const reason = stderr
			.split("\n")
			.map((line) => line.replace(/^xcode-select: (?:error|note): /, "").trim())
			.find(Boolean);
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: reason ?? "xcode-select --install failed.",
			cause: error,
		});
	}
}

export const createSystemRouter = () => {
	return router({
		detectGhCli: publicProcedure.query(detectGhCli),
		detectBrew: publicProcedure.query(detectBrew),
		detectGit: publicProcedure.query(() =>
			detectGit({
				platform: process.platform,
				run: async (command, args) =>
					(await execWithShellEnv(command, args, { timeout: 5000 })).stdout,
				fileExists: existsSync,
			}),
		),
		installCommandLineTools: publicProcedure.mutation(installCommandLineTools),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;
