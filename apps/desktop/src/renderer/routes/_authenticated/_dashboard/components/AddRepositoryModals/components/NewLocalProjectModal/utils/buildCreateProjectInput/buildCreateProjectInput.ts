import type { AppRouter } from "@superset/host-service";
import type { inferRouterInputs } from "@trpc/server";

export type CreateProjectInput =
	inferRouterInputs<AppRouter>["project"]["create"];

/** Local folders first, then clones; the first repository is the primary. */
export function buildCreateProjectInput({
	name,
	repoPaths,
	cloneUrls,
	cloneDir,
}: {
	name: string;
	repoPaths: string[];
	cloneUrls: string[];
	cloneDir: string;
}): CreateProjectInput {
	return {
		name: name.trim(),
		repositories: [
			...repoPaths.map((path) => ({ kind: "local" as const, path })),
			...cloneUrls.map((url) => ({ kind: "clone" as const, url })),
		],
		...(cloneUrls.length > 0 ? { parentDir: cloneDir } : {}),
	};
}
