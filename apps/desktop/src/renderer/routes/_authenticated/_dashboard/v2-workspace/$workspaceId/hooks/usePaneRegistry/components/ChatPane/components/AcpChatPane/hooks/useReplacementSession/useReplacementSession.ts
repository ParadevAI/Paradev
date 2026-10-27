import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The session a recovering chat moves to. One left behind at unmount stays live
 * on the pane's terminal and is adopted as a new tab once that pane closes.
 */
export function useReplacementSession(close: (sessionId: string) => void): {
	replacement: string | null;
	hold: (sessionId: string) => void;
	release: () => void;
} {
	const [replacement, setReplacement] = useState<string | null>(null);
	const held = useRef<string | null>(null);
	const latestClose = useRef(close);
	latestClose.current = close;

	const hold = useCallback((sessionId: string) => {
		held.current = sessionId;
		setReplacement(sessionId);
	}, []);
	const release = useCallback(() => {
		held.current = null;
		setReplacement(null);
	}, []);

	useEffect(
		() => () => {
			if (held.current) latestClose.current(held.current);
		},
		[],
	);

	return { replacement, hold, release };
}
