import { describe, expect, it } from "bun:test";
import { cloudUsageQueries } from "./cloudUsageQueries";

describe("cloudUsageQueries", () => {
	it("waits for periods, asks by person only for admins, and boots only for a workspace", () => {
		const member = cloudUsageQueries({
			range: "30d",
			periodsLoaded: true,
			isAdmin: false,
			workspaceId: undefined,
		});
		expect(member.byDay.enabled).toBe(true);
		expect(member.byPerson.enabled).toBe(false);
		expect(member.boots.enabled).toBe(false);

		const loading = cloudUsageQueries({
			range: "30d",
			periodsLoaded: false,
			isAdmin: true,
			workspaceId: "w1",
		});
		expect(loading.byDay.enabled).toBe(false);
		expect(loading.byPerson.enabled).toBe(false);
		expect(loading.workspaces.enabled).toBe(false);
		expect(loading.boots).toEqual({
			input: { workspace: "w1", range: "30d", limit: 25 },
			enabled: true,
		});
	});
});
