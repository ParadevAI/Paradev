import { repositoryFullNames } from "../../../../utils/repositorySet";

/**
 * The repositories a destination project must hold, known before any push:
 * the workspace's own checkouts, else the repository of a single-repo project.
 * Null when not known yet.
 */
export function earlyMoveRepositoryNames(
	checkoutNames: readonly string[] | null,
	sourceProject:
		| {
				repositories: readonly {
					owner: string | null;
					repoName: string | null;
				}[];
		  }
		| undefined,
): string[] | null {
	if (checkoutNames && checkoutNames.length > 0) return [...checkoutNames];
	if (sourceProject?.repositories.length !== 1) return null;
	const names = repositoryFullNames(sourceProject.repositories);
	return names.length === 1 ? names : null;
}
