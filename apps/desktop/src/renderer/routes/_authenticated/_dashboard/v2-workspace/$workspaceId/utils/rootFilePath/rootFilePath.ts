/**
 * A checkout-relative path as a path from the workspace folder. With one
 * checkout the folder is the checkout; with several, each sits in a folder
 * named after its repository.
 */
export function rootFilePath(
	checkouts: Array<{ repositoryId: string; name: string }>,
	repositoryId: string | undefined,
	path: string,
): string {
	if (checkouts.length <= 1) return path;
	const checkout = checkouts.find(
		(candidate) => candidate.repositoryId === repositoryId,
	);
	return checkout ? `${checkout.name}/${path}` : path;
}
