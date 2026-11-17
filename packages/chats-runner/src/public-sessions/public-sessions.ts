import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/** A public page conversation is ephemeral: its session's files go two days after they were last written. */
const KEEP_MS = 48 * 60 * 60_000;

/**
 * Deletes the files of public page conversations' sessions (`…_<chat>.public-<conversation>.jsonl`, archived or not)
 * that haven't been written for two days, as the box starts. Returns how many went.
 */
export function clearOldPublicSessions(
	agentDir: string,
	now = Date.now(),
): number {
	let removed = 0;
	for (const dir of [
		join(agentDir, "sessions"),
		join(agentDir, "sessions", "archive"),
	]) {
		let names: string[];
		try {
			names = readdirSync(dir);
		} catch {
			continue;
		}
		for (const name of names) {
			if (!name.includes(".public-")) continue;
			const path = join(dir, name);
			const stat = statSync(path, { throwIfNoEntry: false });
			if (!stat?.isFile() || now - stat.mtimeMs < KEEP_MS) continue;
			rmSync(path, { force: true });
			removed++;
		}
	}
	return removed;
}
