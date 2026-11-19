import type { UserContent } from "@superset/chat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

const HANDOFF_WINDOW_MS = 60_000;

type Hold = { sessionId: string; at: number };

export function useSessionGoneHandoff({
	sessionId,
	checking,
	checkedAt,
	recheck,
	onQueuePrompt,
	now = Date.now,
}: {
	sessionId: string | null;
	checking: boolean;
	checkedAt: number;
	recheck: () => void;
	onQueuePrompt: (content: UserContent[]) => void;
	now?: () => number;
}): {
	holding: boolean;
	onSessionGone: (prompts: UserContent[][]) => boolean;
} {
	const [hold, setHold] = useState<Hold | null>(null);
	const [toQueue, setToQueue] = useState<UserContent[][]>([]);
	const holdRef = useRef<Hold | null>(null);
	const lastHandoff = useRef<Hold | null>(null);

	const onSessionGone = useCallback(
		(prompts: UserContent[][]) => {
			if (!sessionId) return false;
			if (holdRef.current?.sessionId === sessionId) {
				setToQueue((queued) => [...queued, ...prompts]);
				return true;
			}
			const at = now();
			const last = lastHandoff.current;
			if (last?.sessionId === sessionId && at - last.at < HANDOFF_WINDOW_MS) {
				return false;
			}
			const next = { sessionId, at };
			lastHandoff.current = next;
			holdRef.current = next;
			setHold(next);
			setToQueue(prompts);
			recheck();
			return true;
		},
		[sessionId, recheck, now],
	);

	useEffect(() => {
		if (!hold || toQueue.length === 0) return;
		for (const prompt of toQueue) onQueuePrompt(prompt);
		setToQueue([]);
	}, [hold, toQueue, onQueuePrompt]);

	useEffect(() => {
		if (!hold || toQueue.length > 0 || checking || checkedAt < hold.at) return;
		holdRef.current = null;
		setHold(null);
	}, [hold, toQueue, checking, checkedAt]);

	return { holding: hold !== null, onSessionGone };
}
