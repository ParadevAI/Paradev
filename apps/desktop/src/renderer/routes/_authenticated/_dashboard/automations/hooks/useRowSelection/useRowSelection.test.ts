import { afterEach, describe, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useRowSelection } = await import("./useRowSelection");

afterEach(cleanup);

describe("useRowSelection", () => {
	test("a row that leaves the screen stays unselected when it comes back", () => {
		const { result, rerender } = renderHook(
			({ order }: { order: string[] }) => useRowSelection(order),
			{ initialProps: { order: ["a", "b", "c"] } },
		);

		act(() => result.current.toggle("a", { shiftKey: false }));
		// Filtered out or collapsed.
		rerender({ order: ["b", "c"] });
		act(() => result.current.toggle("b", { shiftKey: false }));
		rerender({ order: ["a", "b", "c"] });

		expect([...result.current.selected]).toEqual(["b"]);
	});
});
