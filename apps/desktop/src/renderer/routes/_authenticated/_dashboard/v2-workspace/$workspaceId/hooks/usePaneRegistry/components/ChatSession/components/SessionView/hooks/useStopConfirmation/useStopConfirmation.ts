import { useCallback, useMemo, useState } from "react";

interface UseStopConfirmationOptions {
	runningTurnId: string | null;
	stopTurn: (() => void) | null;
	subagentCount: number;
}

/** Stop asks first while subagents would also stop, and only for the turn it was opened on. */
export function useStopConfirmation({
	runningTurnId,
	stopTurn,
	subagentCount,
}: UseStopConfirmationOptions) {
	const [confirmingTurnId, setConfirmingTurnId] = useState<string | null>(null);
	const open =
		confirmingTurnId !== null &&
		confirmingTurnId === runningTurnId &&
		stopTurn !== null &&
		subagentCount > 0;
	const onCancelTurn = useMemo(
		() =>
			stopTurn && runningTurnId && subagentCount > 0
				? () => setConfirmingTurnId(runningTurnId)
				: stopTurn,
		[stopTurn, runningTurnId, subagentCount],
	);
	const onOpenChange = useCallback((next: boolean) => {
		if (!next) setConfirmingTurnId(null);
	}, []);
	const confirm = useCallback(() => {
		setConfirmingTurnId(null);
		if (open) stopTurn?.();
	}, [open, stopTurn]);
	return { onCancelTurn, open, onOpenChange, confirm };
}
