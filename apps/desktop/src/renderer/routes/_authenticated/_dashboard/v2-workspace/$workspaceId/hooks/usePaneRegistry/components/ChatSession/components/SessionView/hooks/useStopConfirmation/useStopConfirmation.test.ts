import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useStopConfirmation } from "./useStopConfirmation";

afterEach(cleanup);

type Props = { runningTurnId: string | null; subagentCount: number };

function setup(stopTurn: () => void) {
	return renderHook(
		({ runningTurnId, subagentCount }: Props) =>
			useStopConfirmation({ runningTurnId, stopTurn, subagentCount }),
		{ initialProps: { runningTurnId: "t1", subagentCount: 1 } },
	);
}

test("asks before stopping a turn that would also stop subagents", () => {
	const stopTurn = mock(() => {});
	const { result } = setup(stopTurn);

	act(() => result.current.onCancelTurn?.());
	expect(result.current.open).toBe(true);
	expect(stopTurn).not.toHaveBeenCalled();

	act(() => result.current.confirm());
	expect(stopTurn).toHaveBeenCalledTimes(1);
	expect(result.current.open).toBe(false);
});

test("closes without stopping when the next turn replaces the one it was opened for", () => {
	const stopTurn = mock(() => {});
	const { result, rerender } = setup(stopTurn);
	act(() => result.current.onCancelTurn?.());

	rerender({ runningTurnId: "t2", subagentCount: 1 });
	expect(result.current.open).toBe(false);

	act(() => result.current.confirm());
	expect(stopTurn).not.toHaveBeenCalled();
});

test("stops at once when no subagent would stop with the turn", () => {
	const stopTurn = mock(() => {});
	const { result } = renderHook(() =>
		useStopConfirmation({ runningTurnId: "t1", stopTurn, subagentCount: 0 }),
	);

	act(() => result.current.onCancelTurn?.());
	expect(stopTurn).toHaveBeenCalledTimes(1);
	expect(result.current.open).toBe(false);
});
