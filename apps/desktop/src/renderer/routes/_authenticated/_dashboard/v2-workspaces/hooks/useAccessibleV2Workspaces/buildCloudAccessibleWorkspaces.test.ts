import { describe, expect, test } from "bun:test";
import {
	type BuildCloudAccessibleWorkspacesParams,
	buildCloudAccessibleWorkspaces,
	type CloudAccessiblePullRequestInput,
	type CloudAccessibleWorkspaceInput,
} from "./buildCloudAccessibleWorkspaces";

const ME = "user-me";
const TEAMMATE = "user-teammate";
const AT = new Date("2026-10-20T10:00:00Z");

function workspace(
	overrides: Partial<CloudAccessibleWorkspaceInput> = {},
): CloudAccessibleWorkspaceInput {
	return {
		id: "ws-1",
		name: "Fix login",
		branch: "fix-login",
		status: "ready",
		agentStatus: null,
		agentStatusAt: null,
		createdBy: { userId: ME, name: "Me", image: null },
		createdAt: AT,
		updatedAt: AT,
		deletedAt: null,
		...overrides,
	};
}

function pullRequest(
	overrides: Partial<CloudAccessiblePullRequestInput> = {},
): CloudAccessiblePullRequestInput {
	return {
		url: "https://github.com/acme/app/pull/7",
		number: 7,
		title: "Fix login",
		state: "open",
		isDraft: false,
		reviewDecision: null,
		checksStatus: "pending",
		checks: [{ name: "ci", status: "pending", url: null }],
		mergedAt: null,
		...overrides,
	};
}

function build(overrides: Partial<BuildCloudAccessibleWorkspacesParams> = {}) {
	return buildCloudAccessibleWorkspaces({
		cloudWorkspaces: [workspace()],
		userId: ME,
		projects: [
			{
				id: "project-app",
				name: "App",
				iconUrl: "https://icons/app.png",
				githubOwner: "acme",
				githubRepoName: "app",
			},
		],
		repoFullNameById: new Map([["ws-1", "acme/app"]]),
		pullRequestsById: new Map(),
		sidebarEntries: {},
		workspaceSeenAt: {},
		manualUnread: {},
		unknownRepoProjectName: "Cloud",
		cloudHostName: "Cloud",
		...overrides,
	});
}

describe("buildCloudAccessibleWorkspaces", () => {
	test("files a row under the project that has its repo", () => {
		const [row] = build();
		expect(row?.projectId).toBe("project-app");
		expect(row?.projectName).toBe("App");
		expect(row?.projectIconUrl).toBe("https://icons/app.png");
		expect(row?.hostType).toBe("cloud");
		expect(row?.hostId).toBe("ws-1");
		expect(row?.isCreatedByCurrentUser).toBe(true);
	});

	test("a repo no host serves gets the sidebar's stand-in project", () => {
		const [row] = build({
			repoFullNameById: new Map([["ws-1", "acme/other"]]),
		});
		expect(row?.projectId).not.toBe("project-app");
		expect(row?.projectName).toBe("other");
	});

	test("the first PR drives the row, with draft folded into its state", () => {
		const [row] = build({
			pullRequestsById: new Map([
				["ws-1", [pullRequest({ isDraft: true }), pullRequest({ number: 8 })]],
			]),
		});
		expect(row?.pr).toMatchObject({
			prNumber: 7,
			state: "draft",
			reviewDecision: "pending",
			mergedAt: null,
		});
		expect(row?.pr?.checks).toEqual([{ name: "ci", status: "pending" }]);
	});

	test("a finished agent is unread until the reported time has been seen", () => {
		const reportedAt = new Date("2026-10-20T11:00:00Z");
		const finished = workspace({
			agentStatus: "review",
			agentStatusAt: reportedAt,
		});
		const [unread] = build({ cloudWorkspaces: [finished] });
		expect(unread?.agentStatus).toBe("review");
		expect(unread?.lastAgentEventAt).toBe(reportedAt.getTime());
		expect(unread?.seenMarks).toEqual({
			terminals: [],
			reportedAt: reportedAt.getTime(),
		});

		const [seen] = build({
			cloudWorkspaces: [finished],
			workspaceSeenAt: { "ws-1": reportedAt.getTime() },
		});
		expect(seen?.agentStatus).toBe("idle");
	});

	test("a manual unread mark reads as finished, but never hides live work", () => {
		const [marked] = build({ manualUnread: { "ws-1": true } });
		expect(marked?.agentStatus).toBe("review");

		const [working] = build({
			cloudWorkspaces: [workspace({ agentStatus: "working" })],
			manualUnread: { "ws-1": true },
		});
		expect(working?.agentStatus).toBe("working");
	});

	test("sandbox state rides on the row; an archived box is a tombstone", () => {
		const [provisioning] = build({
			cloudWorkspaces: [workspace({ status: "provisioning" })],
		});
		expect(provisioning?.sandboxStatus).toBe("provisioning");
		expect(provisioning?.archivedAt).toBeNull();

		const deletedAt = new Date("2026-10-21T00:00:00Z");
		const [archived] = build({
			cloudWorkspaces: [workspace({ status: "deleted", deletedAt })],
			pullRequestsById: new Map([
				["ws-1", [pullRequest({ state: "merged", mergedAt: deletedAt })]],
			]),
		});
		expect(archived?.sandboxStatus).toBeNull();
		expect(archived?.archivedAt).toBe(deletedAt.getTime());
		expect(archived?.archiveReason).toBe("merged");
	});

	test("a teammate's row is in the sidebar only once opted in", () => {
		const theirs = workspace({
			createdBy: { userId: TEAMMATE, name: "Them", image: null },
		});
		const [out] = build({ cloudWorkspaces: [theirs] });
		expect(out?.isInSidebar).toBe(false);
		expect(out?.isCreatedByCurrentUser).toBe(false);

		const [pinned] = build({
			cloudWorkspaces: [theirs],
			sidebarEntries: { "ws-1": { inSidebar: true } },
		});
		expect(pinned?.isInSidebar).toBe(true);
	});
});
