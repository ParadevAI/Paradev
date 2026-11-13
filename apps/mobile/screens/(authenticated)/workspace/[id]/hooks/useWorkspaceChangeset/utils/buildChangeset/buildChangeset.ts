import type { CheckoutTarget } from "@/lib/host-service/checkouts";
import type { GitStatusSnapshot } from "@/lib/host-service/client";

export type ChangesetSource = "against-base" | "staged" | "unstaged";

type StatusFile = GitStatusSnapshot["againstBase"][number];

export interface ChangesetFile extends StatusFile {
	source: ChangesetSource;
	/**
	 * Relative to the workspace folder: `<repository>/<path>` when the
	 * workspace has several checkouts. The file's identity in every store.
	 */
	path: string;
	/** Relative to its checkout; what git procedures take. */
	gitPath: string;
	repositoryId: string | null;
	/** The repository name, or null when the workspace has one checkout. */
	checkoutName: string | null;
	/** The checkout folder on the host. */
	checkoutPath: string;
}

export interface ChangesetCheckout extends CheckoutTarget {
	files: ChangesetFile[];
	additions: number;
	deletions: number;
	currentBranch: string | null;
	baseBranch: string | null;
}

export interface Changeset {
	/** Grouped by checkout in the order given, then sorted by path. */
	files: ChangesetFile[];
	checkouts: ChangesetCheckout[];
	additions: number;
	deletions: number;
}

/**
 * One row per path per checkout: last write wins across against-base →
 * staged → unstaged, matching useVisibleDiffStats so totals agree with the
 * home diff chip. A checkout whose status has not answered has no files.
 */
export function buildChangeset(
	entries: Array<{
		target: CheckoutTarget;
		status: GitStatusSnapshot | undefined;
	}>,
): Changeset {
	const checkouts = entries.map(({ target, status }): ChangesetCheckout => {
		const byPath = new Map<string, ChangesetFile>();
		if (status) {
			const groups: Array<[ChangesetSource, StatusFile[]]> = [
				["against-base", status.againstBase],
				["staged", status.staged],
				["unstaged", status.unstaged],
			];
			for (const [source, groupFiles] of groups) {
				for (const file of groupFiles) {
					byPath.set(file.path, {
						...file,
						source,
						path: target.name ? `${target.name}/${file.path}` : file.path,
						gitPath: file.path,
						repositoryId: target.repositoryId,
						checkoutName: target.name,
						checkoutPath: target.path,
					});
				}
			}
		}
		const files = [...byPath.values()].sort((a, b) =>
			a.gitPath.localeCompare(b.gitPath),
		);
		let additions = 0;
		let deletions = 0;
		for (const file of files) {
			additions += file.additions ?? 0;
			deletions += file.deletions ?? 0;
		}
		return {
			...target,
			files,
			additions,
			deletions,
			currentBranch: status?.currentBranch?.name ?? null,
			baseBranch: status?.defaultBranch?.name ?? null,
		};
	});
	return {
		files: checkouts.flatMap((checkout) => checkout.files),
		checkouts,
		additions: checkouts.reduce((sum, checkout) => sum + checkout.additions, 0),
		deletions: checkouts.reduce((sum, checkout) => sum + checkout.deletions, 0),
	};
}
