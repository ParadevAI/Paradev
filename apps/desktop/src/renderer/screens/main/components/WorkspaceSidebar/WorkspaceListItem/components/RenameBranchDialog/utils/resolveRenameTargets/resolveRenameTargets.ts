export type RenameTargets =
	| { kind: "rename"; repositoryIds: (string | undefined)[] }
	| { kind: "no-match" }
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
		| readonly { repositoryId: string; branch: string | null }[]
		| null
		| undefined;
	currentBranchName: string;
}): RenameTargets {
	if (checkouts === null) return { kind: "rename", repositoryIds: [undefined] };
	if (checkouts === undefined) return { kind: "unknown-workspace" };
	if (checkouts.length === 0) {
		return { kind: "rename", repositoryIds: [undefined] };
	}
	const onBranch = checkouts.filter(
		(checkout) => checkout.branch === currentBranchName,
	);
	if (onBranch.length === 0) return { kind: "no-match" };
	return {
		kind: "rename",
		repositoryIds: onBranch.map((checkout) => checkout.repositoryId),
	};
}
