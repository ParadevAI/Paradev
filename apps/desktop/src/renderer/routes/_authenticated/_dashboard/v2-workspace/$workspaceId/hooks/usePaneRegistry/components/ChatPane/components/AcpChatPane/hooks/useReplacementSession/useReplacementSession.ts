import { useCallback, useEffect, useRef, useState } from "react";

/** The session a recovering chat moves to. One still held at unmount goes to `leave`. */
export function useReplacementSession(leave: (sessionId: string) => void): {
	replacement: string | null;
	hold: (sessionId: string) => void;
	release: () => void;
} {
	const [replacement, setReplacement] = useState<string | null>(null);
	const held = useRef<string | null>(null);
	const latestLeave = useRef(leave);
	latestLeave.current = leave;

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
			if (held.current) latestLeave.current(held.current);
		},
		[],
	);

	return { replacement, hold, release };
}
