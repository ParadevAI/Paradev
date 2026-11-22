import { describe, expect, it } from "bun:test";
import {
	canOpenWorkspace,
	parseVersionedWorkspaceAccess,
	parseWorkspaceAccess,
	type WorkspaceAccess,
} from "./workspace-access";

const privateAccess: WorkspaceAccess = {
	organizationId: "org",
	createdByUserId: "owner",
	visibility: "just_me",
	sharedUserIds: ["friend"],
	sharedTeamIds: ["team"],
};

const actor = (userId: string, teamIds: string[] = []) => ({
	userId,
	organizationIds: ["org"],
	teamIds,
});

describe("canOpenWorkspace", () => {
	it("lets any member into an org workspace", () => {
		expect(
			canOpenWorkspace({ ...privateAccess, visibility: "org" }, actor("x")),
		).toBe(true);
	});

	it("keeps a private workspace to its owner and the people and teams it is shared with", () => {
		expect(canOpenWorkspace(privateAccess, actor("owner"))).toBe(true);
		expect(canOpenWorkspace(privateAccess, actor("friend"))).toBe(true);
		expect(canOpenWorkspace(privateAccess, actor("x", ["team"]))).toBe(true);
		expect(canOpenWorkspace(privateAccess, actor("x", ["other"]))).toBe(false);
	});

	it("refuses someone outside the organization, even the owner", () => {
		expect(
			canOpenWorkspace(
				{ ...privateAccess, visibility: "org" },
				{ userId: "owner", organizationIds: ["elsewhere"], teamIds: [] },
			),
		).toBe(false);
	});
});

describe("parseWorkspaceAccess", () => {
	it("round-trips valid access and rejects a malformed one", () => {
		expect(parseWorkspaceAccess(privateAccess)).toEqual(privateAccess);
		expect(
			parseWorkspaceAccess({ ...privateAccess, visibility: "everyone" }),
		).toBeNull();
		expect(
			parseWorkspaceAccess({ ...privateAccess, sharedTeamIds: [1] }),
		).toBeNull();
	});
});

describe("parseVersionedWorkspaceAccess", () => {
	it("needs a read time, and allows a workspace that is gone", () => {
		expect(
			parseVersionedWorkspaceAccess({ access: privateAccess, readAt: 5 }),
		).toEqual({ access: privateAccess, readAt: 5 });
		expect(parseVersionedWorkspaceAccess({ access: null, readAt: 5 })).toEqual({
			access: null,
			readAt: 5,
		});
		expect(parseVersionedWorkspaceAccess({ access: privateAccess })).toBeNull();
		expect(
			parseVersionedWorkspaceAccess({ access: { bogus: 1 }, readAt: 5 }),
		).toBeNull();
	});
});
