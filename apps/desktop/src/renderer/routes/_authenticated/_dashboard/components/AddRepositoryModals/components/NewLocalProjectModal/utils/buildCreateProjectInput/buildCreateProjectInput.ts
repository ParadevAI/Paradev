import type { AppRouter } from "@superset/host-service";
import type { inferRouterInputs } from "@trpc/server";

export type CreateProjectInput =
	inferRouterInputs<AppRouter>["project"]["create"];

export type ProjectSource =
	| { kind: "local"; path: string }
	| { kind: "clone"; url: string; label: string };

export const sourceKey = (source: ProjectSource) =>
	source.kind === "local" ? source.path : source.url;

/** The host makes the first repository the primary, so the picked one leads. */
export function buildCreateProjectInput({
	name,
	sources,
	primaryKey,
	cloneDir,
}: {
	name: string;
	sources: ProjectSource[];
	primaryKey: string | undefined;
	cloneDir: string;
}): CreateProjectInput {
	const primary = sources.find((source) => sourceKey(source) === primaryKey);
	const ordered = primary
		? [primary, ...sources.filter((source) => source !== primary)]
		: sources;
	return {
		name: name.trim(),
		repositories: ordered.map((source) =>
			source.kind === "local"
				? { kind: "local" as const, path: source.path }
				: { kind: "clone" as const, url: source.url },
		),
		...(sources.some((source) => source.kind === "clone")
			? { parentDir: cloneDir }
			: {}),
	};
}
