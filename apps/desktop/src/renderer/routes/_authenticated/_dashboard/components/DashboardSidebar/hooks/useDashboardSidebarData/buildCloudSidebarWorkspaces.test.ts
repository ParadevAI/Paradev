import { describe, expect, it } from "bun:test";
import { cloudPullRequestRefKey } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import {
	type BuildCloudSidebarWorkspacesParams,
	buildCloudSidebarWorkspaces,
	type CloudSidebarPullRequestInput,
	type CloudSidebarWorkspaceInput,
	cloudRepoProjectId,
} from "./buildCloudSidebarWorkspaces";

const ME = "user-me";
const DATE = new Date("2026-01-01T00:00:00.000Z");

function makeCloudWorkspace(
	overrides: Partial<CloudSidebarWorkspaceInput> & { id: string },
): CloudSidebarWorkspaceInput {
	return {
		name: overrides.id,
		branch: `branch/${overrides.id}`,
		createdAt: DATE,
		updatedAt: DATE,
		agentStatusAt: null,
		createdBy: { userId: ME },
		...overrides,
	};
}

function makePullRequest(
	overrides: Partial<CloudSidebarPullRequestInput> = {},
): CloudSidebarPullRequestInput {
	return {
		url: "https://github.com/acme/app/pull/7",
		number: 7,
		title: "PR",
		state: "open",
		isDraft: false,
		reviewDecision: null,
		checksStatus: "none",
		checks: [],
		...overrides,
	};
}

function build(overrides: Partial<BuildCloudSidebarWorkspacesParams> = {}) {
	return buildCloudSidebarWorkspaces({
		cloudWorkspaces: [],
		userId: ME,
		projects: [],
		repoFullNameById: new Map(),
		branchById: new Map(),
		pullRequestsByRef: new Map(),
		unknownRepoProjectName: "Cloud",
		...overrides,
	});
}

describe("buildCloudSidebarWorkspaces", () => {
	it("files a workspace under the project with the same GitHub repo", () => {
		const layout = build({
			cloudWorkspaces: [makeCloudWorkspace({ id: "ws-1" })],
			projects: [
				{ id: "project-1", githubOwner: "Acme", githubRepoName: "App" },
			],
			repoFullNameById: new Map([["ws-1", "acme/app"]]),
		});

		const rows = layout.byProjectId.get("project-1");
		expect(rows?.map((row) => row.id)).toEqual(["ws-1"]);
		expect(rows?.[0]).toMatchObject({
			projectId: "project-1",
			hostId: "ws-1",
			hostType: "cloud",
			type: "worktree",
			repoUrl: "https://github.com/acme/app",
			branchExistsOnRemote: true,
			isMine: true,
		});
		expect(layout.repoProjects).toEqual([]);
	});

	it("creates one stand-in project per repo that no project has", () => {
		const layout = build({
			cloudWorkspaces: [
				makeCloudWorkspace({
					id: "ws-1",
					createdAt: new Date("2026-01-02T00:00:00.000Z"),
				}),
				makeCloudWorkspace({ id: "ws-2" }),
				makeCloudWorkspace({ id: "ws-3" }),
			],
			repoFullNameById: new Map([
				["ws-1", "acme/app"],
				["ws-2", "acme/app"],
				["ws-3", "acme/other"],
			]),
		});

		expect(layout.byProjectId.size).toBe(0);
		expect(layout.repoProjects.map((project) => project.name)).toEqual([
			"app",
			"other",
		]);
		const [app] = layout.repoProjects;
		expect(app).toMatchObject({
			id: cloudRepoProjectId("acme/app"),
			githubOwner: "acme",
			githubRepoName: "app",
			iconUrl: "https://github.com/acme.png?size=64",
			createdAt: DATE,
		});
		expect(app?.cloudWorkspaces.map((row) => row.id)).toEqual(["ws-1", "ws-2"]);
		expect(app?.cloudWorkspaces[0]?.projectId).toBe(app?.id);
	});

	it("derives the same stand-in id for a repo however it is cased", () => {
		expect(cloudRepoProjectId("Acme/App")).toBe(cloudRepoProjectId("acme/app"));
		expect(cloudRepoProjectId("acme/app")).not.toBe(
			cloudRepoProjectId("acme/other"),
		);
	});

	it("parks rows with no known repo under the unknown-repo project", () => {
		const layout = build({
			cloudWorkspaces: [makeCloudWorkspace({ id: "ws-1" })],
			unknownRepoProjectName: "Cloud",
		});

		expect(layout.repoProjects).toHaveLength(1);
		expect(layout.repoProjects[0]).toMatchObject({
			id: cloudRepoProjectId(null),
			name: "Cloud",
			githubOwner: null,
			iconUrl: null,
		});
		expect(layout.repoProjects[0]?.cloudWorkspaces[0]).toMatchObject({
			repoUrl: null,
			branchExistsOnRemote: false,
		});
	});

	it("marks the viewer's own rows", () => {
		const layout = build({
			cloudWorkspaces: [
				makeCloudWorkspace({ id: "mine" }),
				makeCloudWorkspace({
					id: "theirs-opted-in",
					createdBy: { userId: "user-other" },
				}),
			],
		});

		const rows = layout.repoProjects[0]?.cloudWorkspaces ?? [];
		expect(rows.map((row) => row.isMine)).toEqual([true, false]);
	});

	it("orders rows by latest agent message first", () => {
		const layout = build({
			cloudWorkspaces: [
				makeCloudWorkspace({
					id: "quiet",
					agentStatusAt: new Date("2026-01-01T00:00:00.000Z"),
				}),
				makeCloudWorkspace({
					id: "recent",
					agentStatusAt: new Date("2026-01-03T00:00:00.000Z"),
				}),
			],
		});

		const rows = layout.repoProjects[0]?.cloudWorkspaces ?? [];
		expect(rows.map((row) => row.id)).toEqual(["recent", "quiet"]);
		expect(rows[0]?.lastActivityAt).toBe(
			new Date("2026-01-03T00:00:00.000Z").getTime(),
		);
	});

	it("ranks a row with no agent message by creation, not by updatedAt", () => {
		const layout = build({
			cloudWorkspaces: [
				makeCloudWorkspace({
					id: "restarted",
					updatedAt: new Date("2026-01-05T00:00:00.000Z"),
				}),
			],
		});

		const rows = layout.repoProjects[0]?.cloudWorkspaces ?? [];
		expect(rows[0]?.lastActivityAt).toBe(DATE.getTime());
	});

	it("looks the pull request up by repo and the live branch", () => {
		const pullRequest = makePullRequest({ isDraft: true });
		const layout = build({
			cloudWorkspaces: [makeCloudWorkspace({ id: "ws-1", branch: "stale" })],
			repoFullNameById: new Map([["ws-1", "acme/app"]]),
			branchById: new Map([["ws-1", "live"]]),
			pullRequestsByRef: new Map([
				[
					cloudPullRequestRefKey({
						repoFullName: "acme/app",
						headBranch: "live",
					}),
					pullRequest,
				],
			]),
		});

		const row = layout.repoProjects[0]?.cloudWorkspaces[0];
		expect(row?.branch).toBe("live");
		expect(row?.pullRequest).toEqual({
			url: pullRequest.url,
			number: 7,
			title: "PR",
			state: "draft",
			reviewDecision: null,
			checksStatus: "none",
			checks: [],
		});
	});
});
