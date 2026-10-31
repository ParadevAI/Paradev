/**
 * Deletes a secondary agent profile: its dir and (Claude, macOS) its
 * scoped keychain items, so no orphaned credentials linger. The system
 * default homes are never removable — the guards here are belt to the
 * router's braces (which only accepts currently discovered profiles).
 */

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { resolveAmbientCodexHome } from "@superset/agent-setup";
import { TRPCError } from "@trpc/server";
import { discoverCodexHomes, keychainServicesForConfigDir } from "./profiles";
import type { UsageAccountStatus } from "./types";

const execFileAsync = promisify(execFile);

function protectedDirs(): Set<string> {
	const home = homedir();
	const dirs = new Set([
		home,
		join(home, ".claude"),
		join(home, ".config", "claude"),
		join(home, ".config"),
		join(home, ".codex"),
		resolveAmbientCodexHome(home),
	]);
	return dirs;
}

export function assertRemovableProfileDir(dir: string): string {
	const resolved = resolve(dir);
	const home = homedir();
	if (!resolved.startsWith(home + sep)) {
		throw new Error(
			`Refusing to remove a profile outside the home dir: ${dir}`,
		);
	}
	if (protectedDirs().has(resolved)) {
		throw new Error(`Refusing to remove the system-default profile: ${dir}`);
	}
	return resolved;
}

export async function removeClaudeProfile(configDir: string): Promise<void> {
	const dir = assertRemovableProfileDir(configDir);
	if (platform() === "darwin") {
		// The CLI scopes keychain items by config-dir hash; drop every spelling
		// so no orphaned credential outlives the dir.
		for (const service of keychainServicesForConfigDir(dir)) {
			await execFileAsync("security", [
				"delete-generic-password",
				"-s",
				service,
			]).catch(() => {
				// Item absent for this spelling — nothing to delete.
			});
		}
	}
	await rm(dir, { recursive: true, force: true });
}

export async function removeCodexHome(home: string): Promise<void> {
	const dir = assertRemovableProfileDir(home);
	await rm(dir, { recursive: true, force: true });
}

/**
 * Reads a Codex home again right before Remove deletes it. The card the user
 * acted on comes from the cached quota list, which can be minutes old: the
 * home must still be a discovered secondary home, and one that card showed
 * as signed out must still hold no login. `homeDir` overrides the home dir
 * for tests.
 */
export async function assertCodexHomeStillRemovable(
	home: string,
	listedStatus: UsageAccountStatus,
	homeDir?: string,
): Promise<void> {
	const [, ...secondary] = await discoverCodexHomes(homeDir);
	const current = secondary.find((entry) => entry.home === home);
	if (!current) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `No removable codex profile at ${home}.`,
		});
	}
	if (listedStatus === "signed_out" && !current.signedOut) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `${home} holds a login again, so nothing was deleted. Refresh usage and try again.`,
		});
	}
}
