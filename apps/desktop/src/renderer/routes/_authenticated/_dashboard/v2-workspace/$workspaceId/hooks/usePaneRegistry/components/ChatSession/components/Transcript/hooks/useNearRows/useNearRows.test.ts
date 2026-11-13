import { afterEach, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useNearRows } = await import("./useNearRows");

afterEach(cleanup);

test("a row detached and attached again keeps its ref", () => {
	const { result } = renderHook(() => useNearRows([], null, () => {}));
	const element = document.createElement("div");
	const ref = result.current.observeRow("row-1");
	act(() => {
		ref(element);
		ref(null);
		ref(element);
	});
	expect(result.current.observeRow("row-1")).toBe(ref);
});
