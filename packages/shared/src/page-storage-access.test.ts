import { describe, expect, test } from "bun:test";
import { guestReadable, readable } from "./page-storage-access";

const base = {
	v: 1 as const,
	pageId: "p",
	slug: "s",
	sharedVersion: null,
	latestVersion: 1,
	versions: {},
};

describe("readable", () => {
	test("an org page opens to a member", () => {
		expect(
			readable(
				{
					...base,
					visibility: "org",
					organizationId: "o1",
					createdByUserId: "u9",
				},
				{ userId: "u1", organizationIds: ["o1"], teamIds: [] },
			),
		).toBe(true);
	});
	test("an org page is closed to a non-member", () => {
		expect(
			readable(
				{
					...base,
					visibility: "org",
					organizationId: "o1",
					createdByUserId: "u9",
				},
				{ userId: "u1", organizationIds: ["o2"], teamIds: [] },
			),
		).toBe(false);
	});
	test("just_me opens only to its author", () => {
		const m = {
			...base,
			visibility: "just_me" as const,
			organizationId: "o1",
			createdByUserId: "u9",
		};
		expect(
			readable(m, { userId: "u9", organizationIds: ["o1"], teamIds: [] }),
		).toBe(true);
		expect(
			readable(m, { userId: "u1", organizationIds: ["o1"], teamIds: [] }),
		).toBe(false);
	});
	test("just_me opens to a member it is shared with, directly or through a team", () => {
		const m = {
			...base,
			visibility: "just_me" as const,
			organizationId: "o1",
			createdByUserId: "u9",
			sharedUserIds: ["u1"],
			sharedTeamIds: ["t1"],
		};
		expect(
			readable(m, { userId: "u1", organizationIds: ["o1"], teamIds: [] }),
		).toBe(true);
		expect(
			readable(m, { userId: "u2", organizationIds: ["o1"], teamIds: ["t1"] }),
		).toBe(true);
		expect(
			readable(m, { userId: "u3", organizationIds: ["o1"], teamIds: ["t2"] }),
		).toBe(false);
	});
	test("a share stops counting once the member leaves the organization", () => {
		const m = {
			...base,
			visibility: "just_me" as const,
			organizationId: "o1",
			createdByUserId: "u9",
			sharedUserIds: ["u1"],
			sharedTeamIds: [],
		};
		expect(
			readable(m, { userId: "u1", organizationIds: [], teamIds: [] }),
		).toBe(false);
	});
	test("a manifest with no organization authorizes nobody, which is what triggers the bridge", () => {
		expect(
			readable(
				{ ...base, visibility: "everyone", createdByUserId: "u9" },
				{ userId: "u1", organizationIds: ["o1"], teamIds: [] },
			),
		).toBe(false);
	});
	test("everyone still requires membership today", () => {
		expect(
			readable(
				{
					...base,
					visibility: "everyone",
					organizationId: "o1",
					createdByUserId: "u9",
				},
				{ userId: "u1", organizationIds: [], teamIds: [] },
			),
		).toBe(false);
	});
});

describe("guestReadable", () => {
	test("opens only a page shared with everyone", () => {
		const page = { ...base, organizationId: "o1", createdByUserId: "u9" };
		expect(guestReadable({ ...page, visibility: "everyone" })).toBe(true);
		expect(guestReadable({ ...page, visibility: "org" })).toBe(false);
		expect(guestReadable({ ...page, visibility: "just_me" })).toBe(false);
	});

	test("stays closed on a manifest with no organization", () => {
		expect(guestReadable({ ...base, visibility: "everyone" })).toBe(false);
	});
});
