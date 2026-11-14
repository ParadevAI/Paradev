import { repositoryFullNames } from "../../../../utils/repositorySet";

/** The project that holds most, but not all, of these repositories, and the ones it lacks. */
export function closestPartialProject<
	Row extends {
		name: string;
		repositories: readonly { owner: string | null; repoName: string | null }[];
	},
>(
	rows: readonly Row[],
	names: readonly string[],
): { project: Row; missing: string[] } | null {
	let best: { project: Row; missing: string[] } | null = null;
	for (const project of rows) {
		const held = new Set(
			repositoryFullNames(project.repositories).map((name) =>
				name.toLowerCase(),
			),
		);
		const missing = names.filter((name) => !held.has(name.toLowerCase()));
		if (missing.length === 0 || missing.length === names.length) continue;
		if (!best || missing.length < best.missing.length) {
			best = { project, missing };
		}
	}
	return best;
}
