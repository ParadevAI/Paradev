import { cp, rm } from "node:fs/promises";
import type { GitClient } from "./types";

/** `git worktree move`, which renames the folder, so it falls back to a copy across filesystems. */
export async function moveWorktree(
	git: GitClient,
	from: string,
	to: string,
): Promise<void> {
	try {
		await git.raw(["worktree", "move", from, to]);
		return;
	} catch (error) {
		if (!/cross-device/i.test(String(error))) throw error;
	}
	await copyWorktree(git, from, to);
}

export async function copyWorktree(
	git: GitClient,
	from: string,
	to: string,
): Promise<void> {
	await cp(from, to, {
		recursive: true,
		verbatimSymlinks: true,
		preserveTimestamps: true,
		errorOnExist: true,
		force: false,
	});
	try {
		await git.raw(["worktree", "repair", to]);
	} catch (error) {
		await rm(to, { recursive: true, force: true });
		throw error;
	}
	await rm(from, { recursive: true, force: true });
}
