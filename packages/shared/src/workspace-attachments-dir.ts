import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	WORKSPACE_ATTACHMENTS_DIR,
	WORKSPACE_ATTACHMENTS_GITIGNORE,
} from "./workspace-attachments";

/**
 * The worktree directory attachments are written into, created with a
 * `.gitignore` that hides everything in it so an agent never sees
 * attachments as untracked changes. The ignore file is create-only: a
 * user's own edit wins.
 */
export function ensureWorkspaceAttachmentsDir(worktreePath: string): string {
	const dir = join(worktreePath, WORKSPACE_ATTACHMENTS_DIR);
	mkdirSync(dir, { recursive: true });
	try {
		closeSync(openSync(join(dir, ".gitignore"), "wx"));
		writeFileSync(join(dir, ".gitignore"), WORKSPACE_ATTACHMENTS_GITIGNORE);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	return dir;
}
