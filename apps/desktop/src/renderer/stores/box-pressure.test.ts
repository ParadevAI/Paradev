import { beforeEach, expect, test } from "bun:test";
import type { BoxPressure } from "@superset/shared/box-pressure";
import { useBoxPressureStore } from "./box-pressure";

const busy: BoxPressure = {
	level: "busy",
	limitedBy: ["cpu"],
	reap: null,
	at: 1,
};

beforeEach(() => useBoxPressureStore.getState().clear());

test("a snapshot replaces the map and a change merges into it", () => {
	const { apply } = useBoxPressureStore.getState();
	apply({
		type: "box-pressure",
		snapshot: true,
		workspaces: { a: busy, b: busy },
	});
	apply({
		type: "box-pressure",
		snapshot: false,
		workspaces: { b: null, c: busy },
	});
	expect(Object.keys(useBoxPressureStore.getState().workspaces).sort()).toEqual(
		["a", "c"],
	);
	apply({ type: "box-pressure", snapshot: true, workspaces: {} });
	expect(useBoxPressureStore.getState().workspaces).toEqual({});
});
