import type { CheckoutTarget } from "@/lib/host-service/checkouts";

interface Commit {
	hash: string;
	date: string;
}

export type CheckoutCommit<T extends Commit> = T & {
	/** Unique across checkouts; a hash alone is not when repositories share history. */
	key: string;
	repositoryId: string | null;
	/** The repository name, or null when the workspace has one checkout. */
	checkoutName: string | null;
};

/** One list for the sheet: each checkout's own order when there is one, else newest first. */
export function mergeCheckoutCommits<T extends Commit>(
	entries: Array<{ target: CheckoutTarget; commits: T[] }>,
): CheckoutCommit<T>[] {
	const merged = entries.flatMap(({ target, commits }) =>
		commits.map(
			(commit): CheckoutCommit<T> => ({
				...commit,
				key: `${target.repositoryId ?? ""}:${commit.hash}`,
				repositoryId: target.repositoryId,
				checkoutName: target.name,
			}),
		),
	);
	if (entries.length < 2) return merged;
	return merged.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);
}
