interface Checkout {
	repositoryId: string;
	isPrimary: boolean;
}

/** The picked repository while the workspace still checks it out, else the primary. */
export function pickActiveRepositoryId(
	checkouts: Checkout[],
	picked: string | null | undefined,
): string | undefined {
	return (
		checkouts.find((checkout) => checkout.repositoryId === picked)
			?.repositoryId ??
		checkouts.find((checkout) => checkout.isPrimary)?.repositoryId ??
		checkouts[0]?.repositoryId
	);
}
