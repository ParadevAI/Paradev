/**
 * The checkouts are settled once `workspace.get` answers or fails. A failure
 * counts as settled so git reads run and surface their error state instead
 * of loading forever.
 */
export function areCheckoutsSettled(query: {
	data: unknown;
	isError: boolean;
}): boolean {
	return query.data !== undefined || query.isError;
}
