import { describe, expect, test } from "bun:test";
import {
	cloudWorkingWorkspace,
	cloudWorkspace,
	LOCAL_HOST_ID,
	localNoPullRequestWorkspace,
	localWorkspace,
	remoteWorkspace,
} from "../../../supersetFixtures";
import { toSidebarWorkspace } from "./toSidebarWorkspace";

describe("toSidebarWorkspace", () => {
	test("a workspace on this machine is a local device", () => {
		const row = toSidebarWorkspace(localWorkspace, LOCAL_HOST_ID);
		expect(row.hostType).toBe("local-device");
		expect(row.hostId).toBe(LOCAL_HOST_ID);
		expect(row.repoUrl).toBe("https://github.com/lumen-labs/app");
		expect(row.branchExistsOnRemote).toBe(true);
	});

	test("a workspace on another machine, or with this machine unknown, is a remote device", () => {
		expect(toSidebarWorkspace(remoteWorkspace, LOCAL_HOST_ID).hostType).toBe(
			"remote-device",
		);
		expect(toSidebarWorkspace(localWorkspace, null).hostType).toBe(
			"remote-device",
		);
	});

	test("a cloud workspace has the cloud host", () => {
		const row = toSidebarWorkspace(cloudWorkspace, LOCAL_HOST_ID);
		expect(row.hostType).toBe("cloud");
		expect(row.hostId).toBe("cloud");
	});

	test("GitHub's review decisions become the sidebar's", () => {
		const decision = (reviewDecision: string | null) =>
			toSidebarWorkspace(
				{
					...cloudWorkspace,
					pullRequest: cloudWorkspace.pullRequest && {
						...cloudWorkspace.pullRequest,
						reviewDecision,
					},
				},
				null,
			).pullRequest?.reviewDecision;
		expect(decision("APPROVED")).toBe("approved");
		expect(decision("CHANGES_REQUESTED")).toBe("changes_requested");
		expect(decision("REVIEW_REQUIRED")).toBe("pending");
		expect(decision("SOMETHING_NEW")).toBeNull();
		expect(decision(null)).toBeNull();
	});

	test("an open draft is a draft; a merged draft is merged", () => {
		expect(
			toSidebarWorkspace(cloudWorkingWorkspace, null).pullRequest?.state,
		).toBe("draft");
		expect(
			toSidebarWorkspace(
				{
					...cloudWorkspace,
					pullRequest: cloudWorkspace.pullRequest && {
						...cloudWorkspace.pullRequest,
						isDraft: true,
						state: "merged",
					},
				},
				null,
			).pullRequest?.state,
		).toBe("merged");
	});

	test("no pull request and no repository", () => {
		const row = toSidebarWorkspace(
			{ ...localNoPullRequestWorkspace, repo: null, branch: null },
			LOCAL_HOST_ID,
		);
		expect(row.pullRequest).toBeNull();
		expect(row.repoUrl).toBeNull();
		expect(row.branch).toBe("");
		expect(row.branchExistsOnRemote).toBe(false);
	});
});
