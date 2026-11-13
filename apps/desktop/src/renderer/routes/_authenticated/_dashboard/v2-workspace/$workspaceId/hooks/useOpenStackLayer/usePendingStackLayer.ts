import { useEffect } from "react";
import {
	type StackSwitch,
	useStackSwitchStore,
} from "./stores/stackSwitchStore";

/**
 * The layer this workspace is moving onto, until the workspace's own pull
 * request (`settledNumber`) catches up with it.
 */
export function usePendingStackLayer(
	workspaceId: string,
	settledNumber: number | null,
): StackSwitch | null {
	const pending = useStackSwitchStore(
		(state) => state.switchByWorkspace[workspaceId] ?? null,
	);
	const end = useStackSwitchStore((state) => state.end);
	const settled =
		pending !== null &&
		!pending.isCheckingOut &&
		pending.layer.number === settledNumber;
	useEffect(() => {
		if (settled && settledNumber !== null) end(workspaceId, settledNumber);
	}, [settled, settledNumber, workspaceId, end]);
	return settled ? null : pending;
}
