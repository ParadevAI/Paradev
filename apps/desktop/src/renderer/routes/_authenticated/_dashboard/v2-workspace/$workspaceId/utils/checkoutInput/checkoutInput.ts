/**
 * The `{ workspaceId, repositoryId }` input every per-checkout git and pull
 * request procedure takes. The key is left out when there is no repository:
 * a query filter with `repositoryId: undefined` matches no cached query.
 */
export function checkoutInput(
	workspaceId: string,
	repositoryId: string | undefined,
): { workspaceId: string; repositoryId?: string } {
	return repositoryId ? { workspaceId, repositoryId } : { workspaceId };
}
