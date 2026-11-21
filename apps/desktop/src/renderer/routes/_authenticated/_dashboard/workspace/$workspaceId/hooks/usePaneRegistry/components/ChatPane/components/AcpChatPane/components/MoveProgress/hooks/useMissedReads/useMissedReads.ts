import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Counts reads in a row that did not find what they looked for. `readAt`
 * changes once per finished read, whether it succeeded or failed.
 */
export function useMissedReads(found: boolean, readAt: number) {
	const [missed, setMissed] = useState(0);
	const counted = useRef(readAt);
	useEffect(() => {
		if (readAt === counted.current) return;
		counted.current = readAt;
		setMissed((count) => (found ? 0 : count + 1));
	}, [found, readAt]);
	const reset = useCallback(() => setMissed(0), []);
	return { missed, reset };
}
