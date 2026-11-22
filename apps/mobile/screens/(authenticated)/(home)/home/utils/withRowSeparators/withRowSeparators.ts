import type { HomeListItem } from "../../types";

const isSectionLabel = (item: HomeListItem | undefined) =>
	item === undefined ||
	item.kind === "hostLabel" ||
	item.kind === "sectionLabel";

/** Marks each row that draws a hairline: every one but the last before a section label. */
export function withRowSeparators(
	items: readonly HomeListItem[],
): HomeListItem[] {
	return items.map((item, index) => {
		if (item.kind !== "workspace" && item.kind !== "cloudRow") return item;
		return { ...item, separator: !isSectionLabel(items[index + 1]) };
	});
}
