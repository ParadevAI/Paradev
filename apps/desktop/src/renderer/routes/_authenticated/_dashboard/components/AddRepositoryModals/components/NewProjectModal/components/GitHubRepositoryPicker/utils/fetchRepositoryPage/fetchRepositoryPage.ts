import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";

export interface GitHubRepository {
	fullName: string;
	cloneUrl: string;
}

export interface GitHubRepositoryPage {
	repositories: GitHubRepository[];
	hasMore: boolean;
}

export interface RepositoryPagesClient {
	project: {
		listGitHubRepositoriesPage: {
			query: (input: { page: number }) => Promise<GitHubRepositoryPage>;
		};
		listGitHubRepositories: {
			query: () => Promise<GitHubRepository[]>;
		};
	};
}

export async function fetchRepositoryPage(
	client: RepositoryPagesClient,
	page: number,
): Promise<GitHubRepositoryPage> {
	try {
		return await client.project.listGitHubRepositoriesPage.query({ page });
	} catch (error) {
		// A host older than this build has only the full-list procedure; read it
		// as the one and only page so the picker still fills.
		if (page > 1 || !isMissingProcedureError(error)) throw error;
		return {
			repositories: await client.project.listGitHubRepositories.query(),
			hasMore: false,
		};
	}
}
