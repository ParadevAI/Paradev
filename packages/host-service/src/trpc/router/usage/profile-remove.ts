/**
 * Deletes a secondary agent profile: its dir and (Claude, macOS) its
 * scoped keychain items, so no orphaned credentials linger. The system
 * default homes are never removable — the guards here are belt to the
 * router's braces (which only accepts currently discovered profiles).
 * Discovery also lists homes the user or another tool made, so only a dir
 * that carries Paradev's creation marker is deleted.
 */

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { resolveAmbientCodexHome } from "@superset/agent-setup";
import { TRPCError } from "@trpc/server";
import {
	hasProfileCreatedMarker,
	keychainServicesForConfigDir,
} from "./profiles";

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

async function assertCreatedByParadev(
	dir: string,
	agent: "claude" | "codex",
): Promise<void> {
	if (await hasProfileCreatedMarker(dir, agent)) return;
	throw new TRPCError({
		code: "PRECONDITION_FAILED",
		message: `Paradev only removes profiles it created and has no record of creating ${dir}, so nothing was deleted. Delete the folder yourself if you no longer need it.`,
	});
}

async function deleteMacKeychainItem(service: string): Promise<void> {
	if (platform() !== "darwin") return;
	await execFileAsync("security", [
		"delete-generic-password",
		"-s",
		service,
	]).catch(() => {
		// Item absent for this spelling — nothing to delete.
	});
}

export async function removeClaudeProfile(
	configDir: string,
	deleteKeychainItem = deleteMacKeychainItem,
): Promise<void> {
	const dir = assertRemovableProfileDir(configDir);
	await assertCreatedByParadev(dir, "claude");
	// The CLI scopes keychain items by config-dir hash; drop every spelling
	// so no orphaned credential outlives the dir.
	for (const service of keychainServicesForConfigDir(dir)) {
		await deleteKeychainItem(service);
	}
	await rm(dir, { recursive: true, force: true });
}

export async function removeCodexHome(home: string): Promise<void> {
	const dir = assertRemovableProfileDir(home);
	await assertCreatedByParadev(dir, "codex");
	await rm(dir, { recursive: true, force: true });
}
