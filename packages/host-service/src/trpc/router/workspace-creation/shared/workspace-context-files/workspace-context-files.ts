import { writeFileSync } from "node:fs";
import { join } from "node:path";

export const WORKSPACE_CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

/** Tells agents started in a multi-repo workspace where each repository is. */
export function writeWorkspaceContextFiles(
	root: string,
	checkouts: Array<{ name: string; path: string; branch: string }>,
): void {
	const lines = [
		"# Workspace",
		"",
		"This folder is a multi-repository workspace. It is not a git repository itself.",
		"Each repository below is its own git checkout. Run git commands inside the",
		"repository you mean, and expect a change to span several repositories.",
		"",
		"| Repository | Path | Branch |",
		"| --- | --- | --- |",
		...checkouts.map(
			(checkout) =>
				`| ${checkout.name} | ${checkout.path} | ${checkout.branch} |`,
		),
		"",
	];
	writeFileSync(join(root, "AGENTS.md"), lines.join("\n"));
	writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
}
