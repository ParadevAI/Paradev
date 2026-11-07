import { describe, expect, test } from "bun:test";
import {
	BUILT_IN_VIEW_ALL,
	BUILT_IN_VIEW_CLOUD,
	EMPTY_VIEW_FILTERS,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import {
	hydrateFiltersFromSearch,
	parseGroupBy,
	parseList,
	parseOrderBy,
	parseStatusList,
	resolveViewId,
} from "./parseWorkspacesSearch";

describe("parseWorkspacesSearch", () => {
	test("parseList splits a comma list and ignores empties", () => {
		expect(parseList("a,,b")).toEqual(["a", "b"]);
		expect(parseList("")).toEqual([]);
		expect(parseList(42)).toEqual([]);
	});

	test("parseStatusList keeps only known buckets", () => {
		expect(parseStatusList("working,bogus,finished")).toEqual([
			"working",
			"finished",
		]);
	});

	test("group and order fall back to undefined for unknown values", () => {
		expect(parseGroupBy("project")).toBe("project");
		expect(parseGroupBy("colour")).toBeUndefined();
		expect(parseOrderBy("name")).toBe("name");
		expect(parseOrderBy("size")).toBeUndefined();
	});

	test("resolveViewId accepts built-ins and this profile's saved views", () => {
		const saved = [{ id: "v1", name: "Mine", filters: EMPTY_VIEW_FILTERS }];
		expect(resolveViewId(BUILT_IN_VIEW_CLOUD, saved)).toBe(BUILT_IN_VIEW_CLOUD);
		expect(resolveViewId("v1", saved)).toBe("v1");
	});

	test("resolveViewId lands a deleted or foreign view on All", () => {
		expect(resolveViewId("v-gone", [])).toBe(BUILT_IN_VIEW_ALL);
		expect(resolveViewId(undefined, [])).toBe(BUILT_IN_VIEW_ALL);
	});
});

describe("hydrateFiltersFromSearch", () => {
	const saved = [
		{
			id: "v1",
			name: "Alpha",
			filters: { ...EMPTY_VIEW_FILTERS, projectFilters: ["p1"] },
		},
	];

	test("a bare navigation pins nothing", () => {
		expect(hydrateFiltersFromSearch({}, saved)).toEqual({});
	});

	test("a tab link applies that view's filters", () => {
		const result = hydrateFiltersFromSearch({ tab: "working" }, saved);
		expect(result.activeViewId).toBe("working");
		expect(result.statusFilters).toEqual(["working"]);
	});

	test("explicit params override the view's filters field by field", () => {
		const result = hydrateFiltersFromSearch(
			{ tab: "v1", status: "finished" },
			saved,
		);
		expect(result.activeViewId).toBe("v1");
		expect(result.projectFilters).toEqual(["p1"]);
		expect(result.statusFilters).toEqual(["finished"]);
	});

	test("an unknown tab lands on All and keeps the link's filters", () => {
		const result = hydrateFiltersFromSearch(
			{ tab: "constructor", projects: "p9" },
			saved,
		);
		expect(result.activeViewId).toBe(BUILT_IN_VIEW_ALL);
		expect(result.projectFilters).toEqual(["p9"]);
		expect(result.statusFilters).toEqual([]);
	});

	test("filters without a tab leave the active view alone", () => {
		const result = hydrateFiltersFromSearch({ projects: "p2" }, saved);
		expect(result.activeViewId).toBeUndefined();
		expect(result.projectFilters).toEqual(["p2"]);
	});
});
