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

const removeFolder = (path: string) =>
	rm(path, { recursive: true, force: true });

export async function copyWorktree(
	git: GitClient,
	from: string,
	to: string,
	removeSource: (path: string) => Promise<void> = removeFolder,
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
		await removeFolder(to);
		throw error;
	}
	await removeSource(from).catch((error) => {
		console.warn(
			`[moveWorktree] moved ${from} to ${to} but could not remove the old copy`,
			error,
		);
	});
}
