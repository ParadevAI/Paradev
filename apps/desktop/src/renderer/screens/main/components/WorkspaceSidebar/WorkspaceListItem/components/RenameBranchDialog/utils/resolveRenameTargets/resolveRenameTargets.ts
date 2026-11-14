export type RenameTargets =
	| { kind: "rename"; repositoryIds: (string | undefined)[] }
	| { kind: "unknown-workspace" };

/**
 * The checkouts a branch rename applies to: those on the current branch.
 * `checkouts` is null for a workspace no host lists (v1, one checkout) and
 * undefined while the hosts' lists are not loaded.
 */
export function resolveRenameTargets({
	checkouts,
	currentBranchName,
}: {
	checkouts:
		| readonly {
				repositoryId: string;
				branch: string | null;
				isPrimary?: boolean;
		  }[]
		| null
		| undefined;
	currentBranchName: string;
}): RenameTargets {
	if (checkouts === null) return { kind: "rename", repositoryIds: [undefined] };
	if (checkouts === undefined) return { kind: "unknown-workspace" };
	if (checkouts.length === 0) {
		return { kind: "rename", repositoryIds: [undefined] };
	}
	const onBranch = (branch: string | null) =>
		checkouts
			.filter((checkout) => checkout.branch === branch)
			.map((checkout) => checkout.repositoryId);
	const matching = onBranch(currentBranchName);
	if (matching.length > 0) return { kind: "rename", repositoryIds: matching };
	// Background naming renamed the branch after the dialog read it; the host
	// renames what each checkout is on now.
	const primary =
		checkouts.find((checkout) => checkout.isPrimary) ?? checkouts[0];
	return { kind: "rename", repositoryIds: onBranch(primary?.branch ?? null) };
}
