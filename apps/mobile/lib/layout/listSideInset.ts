import type { ListSideInsetFor } from "./listSideInset.types";

export const listSideInset: ListSideInsetFor = (inset) => ({
	content: { paddingHorizontal: inset },
	row: undefined,
});
