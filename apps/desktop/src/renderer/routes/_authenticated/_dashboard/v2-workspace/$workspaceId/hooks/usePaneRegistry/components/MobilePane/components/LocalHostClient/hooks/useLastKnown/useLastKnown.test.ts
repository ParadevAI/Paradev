import { afterEach, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, renderHook } = await import("@testing-library/react");
const { useLastKnown } = await import("./useLastKnown");

afterEach(cleanup);

test("keeps the last value while the current one is null", () => {
	const { result, rerender } = renderHook(
		({ value }: { value: string | null }) => useLastKnown(value),
		{ initialProps: { value: null as string | null } },
	);
	expect(result.current).toBeNull();
	rerender({ value: "http://127.0.0.1:4879" });
	expect(result.current).toBe("http://127.0.0.1:4879");
	rerender({ value: null });
	expect(result.current).toBe("http://127.0.0.1:4879");
	rerender({ value: "http://127.0.0.1:5120" });
	expect(result.current).toBe("http://127.0.0.1:5120");
});
