import { afterEach, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, renderHook } = await import("@testing-library/react");
const { useLatch } = await import("./useLatch");

afterEach(cleanup);

test("stays true once the condition has held", () => {
	const { result, rerender } = renderHook(
		({ condition }) => useLatch(condition),
		{ initialProps: { condition: false } },
	);
	expect(result.current).toBe(false);
	rerender({ condition: true });
	expect(result.current).toBe(true);
	rerender({ condition: false });
	expect(result.current).toBe(true);
});

test("starts true when the condition holds on the first render", () => {
	const { result, rerender } = renderHook(
		({ condition }) => useLatch(condition),
		{ initialProps: { condition: true } },
	);
	expect(result.current).toBe(true);
	rerender({ condition: false });
	expect(result.current).toBe(true);
});
