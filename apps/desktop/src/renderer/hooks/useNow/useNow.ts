import { useEffect, useState } from "react";

/**
 * A Date that re-renders on a cadence so `formatDistance`-style displays
 * keep ticking. Defaults to 1s so fresh rows never show a stale delta.
 */
export function useNow(
	intervalMs = 1000,
	enabled = true,
	read: () => number = Date.now,
): Date {
	const [now, setNow] = useState(() => new Date(read()));
	useEffect(() => {
		if (!enabled) return;
		setNow(new Date(read()));
		const id = setInterval(() => setNow(new Date(read())), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs, enabled, read]);
	return now;
}
