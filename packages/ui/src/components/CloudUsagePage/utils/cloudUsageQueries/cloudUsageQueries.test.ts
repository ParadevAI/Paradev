import { describe, expect, it } from "bun:test";
import { cloudUsageQueries } from "./cloudUsageQueries";

const range = { period: "2026-10-27" };

describe("cloudUsageQueries", () => {
	it("waits for periods, asks by person only for admins, and a workspace's data only for a workspace", () => {
		const member = cloudUsageQueries({
			range,
			periodsLoaded: true,
			isAdmin: false,
		});
		expect(member.byDay.enabled).toBe(true);
		expect(member.byPerson.enabled).toBe(false);
		expect(member.workspace.enabled).toBe(false);
		expect(member.boots.enabled).toBe(false);

		const loading = cloudUsageQueries({
			range,
			periodsLoaded: false,
			isAdmin: true,
			workspaceId: "w1",
		});
		expect(loading.byDay.enabled).toBe(false);
		expect(loading.byPerson.enabled).toBe(false);
		expect(loading.boots.enabled).toBe(false);

		const loaded = cloudUsageQueries({
			range,
			periodsLoaded: true,
			isAdmin: true,
			workspaceId: "w1",
		});
		expect(loaded.boots).toEqual({
			input: { workspace: "w1", range, limit: 25 },
			enabled: true,
		});
	});

	it("passes the Workspaces page's filters to the router, and a person only for admins", () => {
		const filters = {
			user: "u1",
			size: "large",
			status: "asleep",
			q: "fix",
			sort: "name",
		} as const;
		const admin = cloudUsageQueries({
			range,
			periodsLoaded: true,
			isAdmin: true,
			filters,
		});
		expect(admin.workspaces.input).toMatchObject({
			user: "u1",
			size: "large",
			status: ["asleep"],
			search: "fix",
			sort: "name",
			order: "asc",
		});
		const member = cloudUsageQueries({
			range,
			periodsLoaded: true,
			isAdmin: false,
			filters,
		});
		expect(member.workspaces.input.user).toBeUndefined();
		expect(member.topWorkspaces.input.limit).toBe(8);
	});
});
