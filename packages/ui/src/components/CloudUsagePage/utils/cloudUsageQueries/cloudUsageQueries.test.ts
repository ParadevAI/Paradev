import { describe, expect, it } from "bun:test";
import { cloudUsageQueries } from "./cloudUsageQueries";

describe("cloudUsageQueries", () => {
	it("waits for periods, asks by person only for admins, and a workspace's data only for a workspace", () => {
		const member = cloudUsageQueries({
			range: "30d",
			periodsLoaded: true,
			isAdmin: false,
		});
		expect(member.byDay.enabled).toBe(true);
		expect(member.byPerson.enabled).toBe(false);
		expect(member.workspace.enabled).toBe(false);
		expect(member.boots.enabled).toBe(false);

		const loading = cloudUsageQueries({
			range: "30d",
			periodsLoaded: false,
			isAdmin: true,
			workspaceId: "w1",
		});
		expect(loading.byDay.enabled).toBe(false);
		expect(loading.byPerson.enabled).toBe(false);
		expect(loading.boots.enabled).toBe(false);

		const loaded = cloudUsageQueries({
			range: "30d",
			periodsLoaded: true,
			isAdmin: true,
			workspaceId: "w1",
		});
		expect(loaded.boots).toEqual({
			input: { workspace: "w1", range: "30d", limit: 25 },
			enabled: true,
		});
	});

	it("asks for large pages while it filters by person", () => {
		const queries = cloudUsageQueries({
			range: "30d",
			periodsLoaded: true,
			isAdmin: true,
			person: "u1",
		});
		expect(queries.workspaces.input.limit).toBe(100);
		expect(queries.topWorkspaces.input.limit).toBe(8);
	});
});
