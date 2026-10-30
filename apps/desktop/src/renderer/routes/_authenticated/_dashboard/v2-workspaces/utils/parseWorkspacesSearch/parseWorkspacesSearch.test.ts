import { describe, expect, test } from "bun:test";
import {
	BUILT_IN_VIEW_ALL,
	BUILT_IN_VIEW_CLOUD,
	EMPTY_VIEW_FILTERS,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import {
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
