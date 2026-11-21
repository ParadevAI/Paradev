import { useEffect, useRef } from "react";

/**
 * A move reaches `ready` before its agent is continued here, so the chat has
 * arrived only once its session is live, or after a grace period. Leaving the
 * move view earlier lets pane recovery start a second agent.
 */
export function useMoveArrival({
	ready,
	live,
	graceMs,
	pollMs,
	onCheck,
	onArrived,
}: {
	ready: boolean;
	live: boolean;
	graceMs: number;
	pollMs: number;
	onCheck: () => void;
	onArrived: () => void;
}): void {
	const arrived = useRef(false);
	const latest = useRef({ onCheck, onArrived });
	latest.current = { onCheck, onArrived };

	useEffect(() => {
		if (!ready || arrived.current) return;
		const arrive = () => {
			if (arrived.current) return;
			arrived.current = true;
			latest.current.onArrived();
		};
		if (live) {
			arrive();
			return;
		}
		const grace = setTimeout(arrive, graceMs);
		const poll = setInterval(() => latest.current.onCheck(), pollMs);
		return () => {
			clearTimeout(grace);
			clearInterval(poll);
		};
	}, [ready, live, graceMs, pollMs]);
}
