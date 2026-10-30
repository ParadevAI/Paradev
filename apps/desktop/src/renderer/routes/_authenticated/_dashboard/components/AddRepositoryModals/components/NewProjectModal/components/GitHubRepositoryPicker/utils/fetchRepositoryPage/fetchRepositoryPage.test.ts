import { describe, expect, test } from "bun:test";
import {
	fetchRepositoryPage,
	type RepositoryPagesClient,
} from "./fetchRepositoryPage";

function repository(index: number) {
	return {
		fullName: `owner/repo-${index}`,
		cloneUrl: `https://github.com/owner/repo-${index}.git`,
	};
}

function client(
	listPage: RepositoryPagesClient["project"]["listGitHubRepositoriesPage"]["query"],
	listAll: RepositoryPagesClient["project"]["listGitHubRepositories"]["query"],
): RepositoryPagesClient {
	return {
		project: {
			listGitHubRepositoriesPage: { query: listPage },
			listGitHubRepositories: { query: listAll },
		},
	};
}

function missingProcedure() {
	return new Error(
		'No procedure found on path "project.listGitHubRepositoriesPage"',
	);
}

describe("fetchRepositoryPage", () => {
	test("reads the requested page from a host that has the page procedure", async () => {
		const requested: number[] = [];
		const result = await fetchRepositoryPage(
			client(
				async ({ page }) => {
					requested.push(page);
					return { repositories: [repository(page)], hasMore: true };
				},
				async () => [repository(0)],
			),
			2,
		);

		expect(result).toEqual({ repositories: [repository(2)], hasMore: true });
		expect(requested).toEqual([2]);
	});

	test("reads the whole list from a host without the page procedure", async () => {
		const result = await fetchRepositoryPage(
			client(
				async () => {
					throw missingProcedure();
				},
				async () => [repository(0), repository(1)],
			),
			1,
		);

		expect(result).toEqual({
			repositories: [repository(0), repository(1)],
			hasMore: false,
		});
	});

	test("does not fall back after the first page", async () => {
		await expect(
			fetchRepositoryPage(
				client(
					async () => {
						throw missingProcedure();
					},
					async () => [repository(0)],
				),
				2,
			),
		).rejects.toThrow("No procedure found");
	});

	test("rethrows a failure that is not a missing procedure", async () => {
		const failure = new Error("Could not list GitHub repositories.");
		await expect(
			fetchRepositoryPage(
				client(
					async () => {
						throw failure;
					},
					async () => [repository(0)],
				),
				1,
			),
		).rejects.toBe(failure);
	});
});
