import { useEffect, useRef } from "react";

interface UseStallTimeoutOptions {
	active: boolean;
	/** Restarts the timer whenever it changes, e.g. on each progress event. */
	resetKey: unknown;
	timeoutMs: number;
	onTimeout: () => void;
}

export function useStallTimeout({
	active,
	resetKey,
	timeoutMs,
	onTimeout,
}: UseStallTimeoutOptions) {
	const onTimeoutRef = useRef(onTimeout);
	onTimeoutRef.current = onTimeout;

	// biome-ignore lint/correctness/useExhaustiveDependencies: resetKey restarts the timer
	useEffect(() => {
		if (!active) return;
		const timer = setTimeout(() => onTimeoutRef.current(), timeoutMs);
		return () => clearTimeout(timer);
	}, [active, resetKey, timeoutMs]);
}
