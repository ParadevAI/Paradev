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
 * The repositories this person may start a cloud workspace on — public ones
 * the organization's GitHub App delivers, private ones their own account also
 * reaches — as projects the cloud picker can offer: the ones no project checks
 * out yet become stand-ins.
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
		cloudTrpc.integration.github.listAccessibleRepositories.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled: isEnabled },
		);
	const installationsQuery =
		cloudTrpc.integration.github.listInstallations.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled: isEnabled },
		);

	const repositoriesByFullName = useMemo(
		() =>
			new Map<string, GitHubRepositoryRow>(
				(repositoriesQuery.data?.repositories ?? []).map((repository) => [
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

	// The first installation's settings stand for the App; a person's own
	// account comes before configuring it, since without one the list is
	// public repositories only.
	const installation = installationsQuery.data?.[0];
	const access = repositoriesQuery.data;
	const connection: GitHubConnectionAction = !installationsQuery.isSuccess
		? null
		: !installation
			? { kind: "connect" }
			: access?.connectable && !access.connected
				? { kind: "connect-account" }
				: { kind: "configure", url: githubAppSettingsUrl(installation) };

	return {
		repositories,
		repositoriesByFullName,
		connection,
		isLoading: repositoriesQuery.isLoading,
	};
}
