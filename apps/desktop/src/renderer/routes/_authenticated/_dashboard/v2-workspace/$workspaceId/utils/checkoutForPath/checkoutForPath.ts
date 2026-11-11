interface Checkout {
	id: string;
	worktreePath: string;
}

/**
 * The checkout that holds an absolute path: the one with the longest
 * worktree path that contains it, so a nested checkout wins over its parent.
 */
export function checkoutForPath(
	checkouts: Checkout[],
	absolutePath: string,
): string | undefined {
	let match: Checkout | undefined;
	for (const checkout of checkouts) {
		const root = checkout.worktreePath.replace(/[\\/]+$/, "");
		const inside =
			absolutePath === root ||
			absolutePath.startsWith(`${root}/`) ||
			absolutePath.startsWith(`${root}\\`);
		if (inside && root.length > (match?.worktreePath.length ?? -1)) {
			match = { id: checkout.id, worktreePath: root };
		}
	}
	return match?.id;
}
