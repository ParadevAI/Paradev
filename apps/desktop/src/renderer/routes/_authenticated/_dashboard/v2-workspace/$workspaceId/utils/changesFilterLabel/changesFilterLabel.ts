import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

interface CommitRef {
	hash: string;
	shortHash: string;
}

export function changesFilterLabel(
	filter: ChangesFilter,
	commits: CommitRef[],
): string {
	if (filter.kind === "all")
		return i18n._(
			msg({
				message: "All commits",
			}),
		);
	if (filter.kind === "uncommitted")
		return i18n._(
			msg({
				message: "Uncommitted",
			}),
		);
	if (filter.kind === "range") {
		const from = commits.find((c) => c.hash === filter.fromHash);
		const to = commits.find((c) => c.hash === filter.toHash);
		return `${from?.shortHash ?? filter.fromHash.slice(0, 7)}..${to?.shortHash ?? filter.toHash.slice(0, 7)}`;
	}
	const commit = commits.find((c) => c.hash === filter.hash);
	return commit?.shortHash ?? filter.hash.slice(0, 7);
}
