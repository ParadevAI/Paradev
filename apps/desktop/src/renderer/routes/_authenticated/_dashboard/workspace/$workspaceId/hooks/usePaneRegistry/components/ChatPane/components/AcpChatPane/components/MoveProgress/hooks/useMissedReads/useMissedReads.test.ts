import { afterEach, expect, test } from "bun:test";

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useMissedReads } = await import("./useMissedReads");

afterEach(cleanup);

function render() {
	return renderHook(
		(props: { found: boolean; readAt: number }) =>
			useMissedReads(props.found, props.readAt),
		{ initialProps: { found: false, readAt: 0 } },
	);
}

test("counts each finished read that misses, and only once per read", () => {
	const hook = render();
	hook.rerender({ found: false, readAt: 1 });
	hook.rerender({ found: false, readAt: 1 });
	hook.rerender({ found: false, readAt: 2 });
	expect(hook.result.current.missed).toBe(2);
});

test("a read that finds the move starts the count again", () => {
	const hook = render();
	hook.rerender({ found: false, readAt: 1 });
	hook.rerender({ found: true, readAt: 2 });
	expect(hook.result.current.missed).toBe(0);
});

test("reset clears the count", () => {
	const hook = render();
	hook.rerender({ found: false, readAt: 1 });
	act(() => hook.result.current.reset());
	expect(hook.result.current.missed).toBe(0);
});
