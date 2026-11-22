import type { HomeListItem } from "../../types";

const isSectionLabel = (item: HomeListItem | undefined) =>
	item?.kind === "hostLabel" || item?.kind === "sectionLabel";

/**
 * What each item draws from its neighbours: a row's hairline (none before a
 * section label or at the end), and a project header's tight top when a
 * section label sits right above it.
 */
export function withNeighbourFlags(
	items: readonly HomeListItem[],
): HomeListItem[] {
	return items.map((item, index) => {
		if (item.kind === "projectHeader") {
			return { ...item, afterLabel: isSectionLabel(items[index - 1]) };
		}
		if (item.kind !== "workspace" && item.kind !== "cloudRow") return item;
		const next = items[index + 1];
		return { ...item, separator: next !== undefined && !isSectionLabel(next) };
	});
}
