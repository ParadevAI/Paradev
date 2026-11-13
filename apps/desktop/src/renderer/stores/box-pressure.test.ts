import { beforeEach, expect, test } from "bun:test";
import type { BoxPressure } from "@superset/shared/box-pressure";
import { useBoxPressureStore } from "./box-pressure";

const busy: BoxPressure = {
	level: "busy",
	limitedBy: ["cpu"],
	reap: null,
	at: 1,
};

beforeEach(() =>
	useBoxPressureStore.setState({ workspaces: {}, dismissed: {} }),
);

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

test("a dismissal lasts while the episode is critical and is forgotten when it ends", () => {
	const { apply, dismiss } = useBoxPressureStore.getState();
	const critical: BoxPressure = {
		level: "critical",
		limitedBy: ["memory"],
		reap: null,
		at: 1,
	};
	apply({ type: "box-pressure", snapshot: false, workspaces: { a: critical } });
	dismiss("a", "stall");
	apply({
		type: "box-pressure",
		snapshot: false,
		workspaces: { a: { ...critical, at: 2 } },
	});
	expect(useBoxPressureStore.getState().dismissed).toEqual({ a: "stall" });
	apply({ type: "box-pressure", snapshot: false, workspaces: { a: null } });
	expect(useBoxPressureStore.getState().dismissed).toEqual({});
});
