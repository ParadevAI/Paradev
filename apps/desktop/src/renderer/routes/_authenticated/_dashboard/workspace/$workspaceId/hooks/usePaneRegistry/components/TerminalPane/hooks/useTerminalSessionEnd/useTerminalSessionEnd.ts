import { useCallback, useSyncExternalStore } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";

export function useTerminalSessionEnd(
	terminalId: string,
	terminalInstanceId: string,
): { ended: boolean; endedCleanly: boolean } {
	const subscribe = useCallback(
		(callback: () => void) =>
			terminalRuntimeRegistry.onStateChange(
				terminalId,
				callback,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const ended = useSyncExternalStore(subscribe, () =>
		terminalRuntimeRegistry.isSessionEnded(terminalId, terminalInstanceId),
	);
	const endedCleanly = useSyncExternalStore(subscribe, () =>
		terminalRuntimeRegistry.endedCleanly(terminalId, terminalInstanceId),
	);
	return { ended, endedCleanly };
}
