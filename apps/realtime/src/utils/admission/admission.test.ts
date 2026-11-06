import { describe, expect, it } from "bun:test";
import type { WorkspaceAccess } from "@superset/shared/workspace-access";
import {
	ACCESS_RETRY_MS,
	ACCESS_TTL_MS,
	admission,
	supersedes,
} from "./admission";

const access: WorkspaceAccess = {
	organizationId: "org",
	createdByUserId: "owner",
	visibility: "just_me",
	sharedUserIds: [],
	sharedTeamIds: [],
};
const owner = { userId: "owner", organizationIds: ["org"], teamIds: [] };
const stranger = { userId: "x", organizationIds: ["org"], teamIds: [] };
const now = 10 * ACCESS_TTL_MS;

describe("admission", () => {
	it("looks access up when the hub has none", () => {
		expect(admission(undefined, owner, now)).toEqual({ kind: "lookup" });
	});

	it("admits from stored access without waiting, and refreshes it once stale", () => {
		expect(admission({ access, readAt: now - 1 }, owner, now)).toEqual({
			kind: "admit",
			access,
			refresh: false,
		});
		expect(
			admission({ access, readAt: now - ACCESS_TTL_MS }, owner, now),
		).toEqual({ kind: "admit", access, refresh: true });
	});

	it("refuses from stored access, and checks again once the retry window passes", () => {
		expect(admission({ access, readAt: now - 1 }, stranger, now)).toEqual({
			kind: "refuse",
		});
		expect(
			admission({ access, readAt: now - ACCESS_RETRY_MS }, stranger, now),
		).toEqual({ kind: "lookup" });
	});

	it("treats a workspace the API said is gone like a refusal", () => {
		expect(admission({ access: null, readAt: now - 1 }, owner, now)).toEqual({
			kind: "refuse",
		});
	});
});

describe("supersedes", () => {
	it("keeps the newer read, so a slow lookup cannot undo a revoke", () => {
		const revoked = { access: null, readAt: 20 };
		expect(supersedes({ access, readAt: 10 }, revoked)).toBe(false);
		expect(supersedes({ access, readAt: 30 }, revoked)).toBe(true);
		expect(supersedes({ access, readAt: 10 }, undefined)).toBe(true);
	});
});
