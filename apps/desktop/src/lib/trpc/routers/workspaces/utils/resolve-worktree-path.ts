import { join } from "node:path";
import { type SelectProject, settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";
import { WORKTREES_DIR_NAME } from "shared/constants";

/** Resolves base dir: project override > global setting > default (<app home>/worktrees) */
export function resolveWorktreePath(
	project: Pick<SelectProject, "name" | "worktreeBaseDir">,
	branch: string,
): string {
	if (project.worktreeBaseDir) {
		return join(project.worktreeBaseDir, project.name, branch);
	}

	const row = localDb.select().from(settings).get();
	const baseDir =
		row?.worktreeBaseDir ??
		join(resolveAppHomeDir(), WORKTREES_DIR_NAME);

	return join(baseDir, project.name, branch);
}
