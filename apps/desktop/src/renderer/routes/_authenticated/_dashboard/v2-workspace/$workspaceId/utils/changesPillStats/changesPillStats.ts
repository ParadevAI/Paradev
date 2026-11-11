interface ChangedFileStats {
	path: string;
	additions: number | null;
	deletions: number | null;
}

interface ChangesPillInput {
	againstBase: ChangedFileStats[];
	staged: ChangedFileStats[];
	unstaged: ChangedFileStats[];
}

export interface ChangesPillStats {
	fileCount: number;
	additions: number;
	deletions: number;
}

/**
 * Unique-path totals for the Changes control. Working-tree entries override the
 * against-base row for the same path (and unstaged overrides staged) — the
 * same precedence the host uses for workspace-list diff stats and the
 * Changes pane's tree dedupe, so a path counts once with its most current
 * numbers instead of double-counting across sections. A multi-repo workspace
 * passes one status per checkout, and the same path in two checkouts is two files.
 */
export function changesPillStats(
	status: ChangesPillInput | ChangesPillInput[],
): ChangesPillStats {
	const totals = { fileCount: 0, additions: 0, deletions: 0 };
	for (const checkout of Array.isArray(status) ? status : [status]) {
		const byPath = new Map<string, ChangedFileStats>();
		for (const list of [
			checkout.againstBase,
			checkout.staged,
			checkout.unstaged,
		]) {
			for (const file of list) {
				byPath.set(file.path, file);
			}
		}
		totals.fileCount += byPath.size;
		for (const file of byPath.values()) {
			totals.additions += file.additions ?? 0;
			totals.deletions += file.deletions ?? 0;
		}
	}
	return totals;
}
