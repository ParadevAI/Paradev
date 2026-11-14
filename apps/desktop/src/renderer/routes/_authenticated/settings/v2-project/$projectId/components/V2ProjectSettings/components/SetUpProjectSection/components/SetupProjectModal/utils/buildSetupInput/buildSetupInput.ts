import type { ProjectSetupInput } from "renderer/lib/legacySetupInput";

export type RepositoryChoice =
	| { kind: "clone" }
	| { kind: "import"; path: string };

export interface SetupOriginProject {
	name: string;
	primaryRepositoryId: string;
	repositories: { id: string; name: string; url: string | null }[];
}

export type BuildSetupInputResult =
	| { ok: true; input: ProjectSetupInput }
	| { ok: false; missing: string[] };

export function defaultRepositoryChoice(repository: {
	url: string | null;
}): RepositoryChoice {
	return repository.url ? { kind: "clone" } : { kind: "import", path: "" };
}

/** Every repository is cloned into `parentDir` unless it has a folder of its own. */
export function buildSetupInput({
	projectId,
	project,
	parentDir,
	choices,
}: {
	projectId: string;
	project: SetupOriginProject;
	parentDir: string;
	choices: Record<string, RepositoryChoice | undefined>;
}): BuildSetupInputResult {
	const cloneInto = parentDir.trim();
	const missing: string[] = [];
	const repositories: ProjectSetupInput["repositories"] = [];
	for (const repository of project.repositories) {
		const choice =
			choices[repository.id] ?? defaultRepositoryChoice(repository);
		if (choice.kind === "import") {
			const path = choice.path.trim();
			if (path)
				repositories.push({
					id: repository.id,
					mode: { kind: "import", path },
				});
			else missing.push(repository.name);
		} else if (repository.url && cloneInto) {
			repositories.push({
				id: repository.id,
				mode: { kind: "clone", parentDir: cloneInto },
			});
		} else {
			missing.push(repository.name);
		}
	}
	if (missing.length > 0) return { ok: false, missing };
	return {
		ok: true,
		input: {
			projectId,
			origin: {
				name: project.name,
				primaryRepositoryId: project.primaryRepositoryId,
				repositories: project.repositories.map(({ id, name, url }) => ({
					id,
					name,
					url,
				})),
			},
			repositories,
		},
	};
}
