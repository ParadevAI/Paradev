import { useLingui } from "@lingui/react/macro";
import type { MergeMethod } from "@superset/shared/pull-request-merge-methods";

export function useMergeMethodLabels(): Record<MergeMethod, string> {
	const { t } = useLingui();
	return {
		squash: t({ message: "Squash and merge" }),
		merge: t({ message: "Merge commit" }),
		rebase: t({ message: "Rebase and merge" }),
	};
}
