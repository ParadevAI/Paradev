import { expect, test } from "bun:test";
import { resolvePullRequestTarget } from "./resolvePullRequestTarget";

const projects = [
	{
		id: "project",
		projectKey: "key",
		primaryRepositoryId: "repo-1",
		repositories: [{ id: "repo-1", owner: "owner", repoName: "repo" }],
	},
];

test("repository identity does not require a project", () => {
	expect(
		resolvePullRequestTarget({
			projectId: null,
			repoFullName: "other/repo",
			projects,
		}),
	).toEqual({
		projectId: null,
		repoFullName: "other/repo",
		repositoryId: null,
	});
});
test("unrelated or removed projects cannot grant project actions", () => {
	for (const projectId of ["project", "removed"]) {
		expect(
			resolvePullRequestTarget({
				projectId,
				repoFullName: "other/repo",
				projects,
			}),
		).toEqual({
			projectId: null,
			repoFullName: "other/repo",
			repositoryId: null,
		});
	}
});
test("project-only links resolve to the primary repository through either project identifier", () => {
	for (const projectId of ["project", "key"])
		expect(resolvePullRequestTarget({ projectId, projects })).toEqual({
			projectId,
			repoFullName: "owner/repo",
			repositoryId: "repo-1",
		});
});
test("matching repositories retain project actions regardless of casing", () => {
	expect(
		resolvePullRequestTarget({
			projectId: "project",
			repoFullName: "OWNER/Repo",
			projects,
		}),
	).toEqual({
		projectId: "project",
		repoFullName: "OWNER/Repo",
		repositoryId: "repo-1",
	});
});
test("a PR number alone cannot identify a repository", () => {
	expect(resolvePullRequestTarget({ projectId: null, projects })).toEqual({
		projectId: null,
		repoFullName: null,
		repositoryId: null,
	});
});
test("project-only links preserve the host path when repository metadata is absent", () => {
	expect(
		resolvePullRequestTarget({
			projectId: "project",
			projects: [{ id: "project", projectKey: "key" }],
		}),
	).toEqual({ projectId: "project", repoFullName: null, repositoryId: null });
});
test("an explicit repository cannot inherit actions from unknown project metadata", () => {
	expect(
		resolvePullRequestTarget({
			projectId: "project",
			repoFullName: "owner/repo",
			projects: [{ id: "project", projectKey: "key" }],
		}),
	).toEqual({
		projectId: null,
		repoFullName: "owner/repo",
		repositoryId: null,
	});
});
test("a multi-repo project keeps the PRs of each of its repositories", () => {
	expect(
		resolvePullRequestTarget({
			projectId: "orbit",
			repoFullName: "owner/web",
			projects: [
				{
					id: "orbit",
					primaryRepositoryId: "api",
					repositories: [
						{ id: "api", owner: "owner", repoName: "api" },
						{ id: "web", owner: "owner", repoName: "web" },
					],
				},
			],
		}),
	).toEqual({
		projectId: "orbit",
		repoFullName: "owner/web",
		repositoryId: "web",
	});
});
