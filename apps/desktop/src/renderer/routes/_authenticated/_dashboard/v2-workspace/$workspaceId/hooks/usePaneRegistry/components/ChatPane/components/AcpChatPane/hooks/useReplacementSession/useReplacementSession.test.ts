import { afterEach, expect, test } from "bun:test";

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useReplacementSession } = await import("./useReplacementSession");

afterEach(cleanup);

test("unmounting mid-recovery leaves only the replacement the pane never took over", () => {
	const left: string[] = [];
	const leftMidRecovery = renderHook(() =>
		useReplacementSession((sessionId) => left.push(sessionId)),
	);
	act(() => leftMidRecovery.result.current.hold("replacement-a"));
	leftMidRecovery.unmount();

	const committed = renderHook(() =>
		useReplacementSession((sessionId) => left.push(sessionId)),
	);
	act(() => committed.result.current.hold("replacement-b"));
	act(() => committed.result.current.release());
	committed.unmount();

	expect(left).toEqual(["replacement-a"]);
});
