import { describe, expect, test } from "bun:test";
import { migrateWorkspacesFilter } from "./migrateWorkspacesFilter";

describe("migrateWorkspacesFilter", () => {
	test("a saved machine becomes that machine alone", () => {
		expect(
			migrateWorkspacesFilter({ hostFilter: "m1", scope: "host" }, 1).selection,
		).toEqual({ hosts: ["m1"], cloud: false });
		expect(
			migrateWorkspacesFilter({ hostFilter: "m1", scope: "host" }, 2).selection,
		).toEqual({ hosts: ["m1"], cloud: false });
	});

	test("a saved Cloud pick becomes Cloud alone", () => {
		expect(
			migrateWorkspacesFilter({ hostFilter: "m1", scope: "cloud" }, 2)
				.selection,
		).toEqual({ hosts: [], cloud: true });
	});

	test("All hosts and the old default become no choice, and old fields go", () => {
		const all = migrateWorkspacesFilter({ hostFilter: "m1", scope: "all" }, 2);
		expect(all.selection).toBeNull();
		expect("scope" in all || "hostFilter" in all).toBe(false);
		expect(
			migrateWorkspacesFilter({ hostFilter: null, scope: "host" }, 1).selection,
		).toBeNull();
	});

	test("maps the version 0 sort default", () => {
		expect(
			migrateWorkspacesFilter({ sort: "updatedAt", scope: "host" }, 0).sort,
		).toBe("manual");
	});
});
