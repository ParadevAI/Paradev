import { parseGitHubRemote } from "@superset/shared/github-remote";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";

export type ProjectSetupInput = Parameters<
	HostServiceClient["project"]["setup"]["mutate"]
>[0];

/**
 * A legacy cloud project has one repository, and its repository id is the
 * project id: the folder becomes that repository on this host.
 */
export function legacySetupInput({
	candidate,
	path,
	allowRelocate,
}: {
	candidate: { id: string; name: string; repoCloneUrl: string | null };
	path: string;
	allowRelocate?: boolean;
}): ProjectSetupInput {
	const url = candidate.repoCloneUrl;
	return {
		projectId: candidate.id,
		origin: {
			name: candidate.name,
			primaryRepositoryId: candidate.id,
			repositories: [
				{
					id: candidate.id,
					name: (url && parseGitHubRemote(url)?.name) || getBaseName(path),
					url,
				},
			],
		},
		repositories: [
			{
				id: candidate.id,
				mode: {
					kind: "import",
					path,
					...(allowRelocate ? { allowRelocate } : {}),
				},
			},
		],
	};
}
