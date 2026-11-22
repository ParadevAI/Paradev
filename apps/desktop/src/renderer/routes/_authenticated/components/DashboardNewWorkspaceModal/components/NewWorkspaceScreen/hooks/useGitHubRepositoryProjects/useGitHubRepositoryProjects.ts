import { useMemo } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { cloudRepoProjectId } from "renderer/lib/github/cloudRepoProjectId";
import { githubAppSettingsUrl } from "renderer/lib/github/githubAppSettingsUrl";
import type {
	GitHubConnectionAction,
	GitHubRepositoryOption,
	ProjectOption,
} from "../../../DashboardNewWorkspaceForm/PromptGroup/types";

interface GitHubRepositoryRow {
	id: string;
	owner: string;
	name: string;
	fullName: string;
	defaultBranch: string;
}

/**
 * The repositories the organization's GitHub App can see, as projects the
 * cloud picker can offer: the ones no project checks out yet become
 * stand-ins.
 */
export function useGitHubRepositoryProjects({
	organizationId,
	enabled,
	projects,
}: {
	organizationId: string | null;
	enabled: boolean;
	projects: readonly ProjectOption[];
}) {
	const isEnabled = enabled && organizationId !== null;
	const repositoriesQuery =
		cloudTrpc.integration.github.listRepositories.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled: isEnabled },
		);
	const installationQuery =
		cloudTrpc.integration.github.getInstallation.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled: isEnabled },
		);

	const repositoriesByFullName = useMemo(
		() =>
			new Map<string, GitHubRepositoryRow>(
				(repositoriesQuery.data ?? []).map((repository) => [
					repository.fullName.toLowerCase(),
					repository,
				]),
			),
		[repositoriesQuery.data],
	);

	const repositories = useMemo<GitHubRepositoryOption[]>(() => {
		const known = new Set(
			projects.flatMap((project) =>
				project.githubOwner && project.githubRepoName
					? [`${project.githubOwner}/${project.githubRepoName}`.toLowerCase()]
					: [],
			),
		);
		return [...repositoriesByFullName.values()]
			.filter((repository) => !known.has(repository.fullName.toLowerCase()))
			.map((repository) => ({
				id: cloudRepoProjectId(repository.fullName),
				name: repository.name,
				githubOwner: repository.owner,
				githubRepoName: repository.name,
				iconUrl: resolveProjectIconUrl({
					icon: null,
					repoOwner: repository.owner,
				}),
				needsSetup: null,
				fullName: repository.fullName,
			}));
	}, [repositoriesByFullName, projects]);

	const installation = installationQuery.data;
	const connection: GitHubConnectionAction = !installationQuery.isSuccess
		? null
		: installation?.installationId
			? { kind: "configure", url: githubAppSettingsUrl(installation) }
			: { kind: "connect" };

	return {
		repositories,
		repositoriesByFullName,
		connection,
		isLoading: repositoriesQuery.isLoading,
	};
}
