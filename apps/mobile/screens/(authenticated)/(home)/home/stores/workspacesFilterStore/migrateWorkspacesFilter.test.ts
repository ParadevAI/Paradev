import { describe, expect, test } from "bun:test";
import { migrateWorkspacesFilter } from "./migrateWorkspacesFilter";

describe("migrateWorkspacesFilter", () => {
	test("keeps a saved machine selected", () => {
		expect(
			migrateWorkspacesFilter({ hostFilter: "m1", scope: "host" }, 1),
		).toMatchObject({ hostFilter: "m1", scope: "host" });
	});

	test("keeps a saved Cloud pick", () => {
		expect(
			migrateWorkspacesFilter({ hostFilter: null, scope: "cloud" }, 1).scope,
		).toBe("cloud");
	});

	test("treats the old host default without a machine as no choice", () => {
		expect(
			migrateWorkspacesFilter({ hostFilter: null, scope: "host" }, 1).scope,
		).toBeNull();
	});

	test("maps the version 0 sort default", () => {
		expect(
			migrateWorkspacesFilter({ sort: "updatedAt", scope: "host" }, 0).sort,
		).toBe("manual");
	});
});
