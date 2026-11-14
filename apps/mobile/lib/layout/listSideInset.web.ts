import type { ListSideInsetFor } from "./listSideInset.types";

// LegendList's web rows are absolutely positioned at left: 0 and right: 0, so
// they ignore the content container's side padding.
export const listSideInset: ListSideInsetFor = (inset) => ({
	content: undefined,
	row: { paddingHorizontal: inset },
});
