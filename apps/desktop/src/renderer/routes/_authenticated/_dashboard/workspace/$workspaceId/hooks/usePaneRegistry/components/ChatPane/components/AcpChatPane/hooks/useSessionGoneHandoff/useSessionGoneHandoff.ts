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
	const [appended, setAppended] = useState(0);
	const holdRef = useRef<Hold | null>(null);
	// A ref, not state: the child SessionView's effects call onSessionGone before this hook's effects run.
	const pending = useRef<UserContent[][]>([]);
	const lastHandoff = useRef<Hold | null>(null);

	const onSessionGone = useCallback(
		(prompts: UserContent[][]) => {
			if (!sessionId) return false;
			if (holdRef.current?.sessionId === sessionId) {
				pending.current.push(...prompts);
				setAppended((count) => count + 1);
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
			pending.current.push(...prompts);
			setHold(next);
			recheck();
			return true;
		},
		[sessionId, recheck, now],
	);

	useEffect(() => {
		if (!hold) return;
		for (const prompt of pending.current.splice(0)) onQueuePrompt(prompt);
		const answered = !checking && checkedAt >= hold.at;
		if (hold.sessionId === sessionId && !answered) return;
		holdRef.current = null;
		setHold(null);
	}, [hold, appended, checking, checkedAt, sessionId, onQueuePrompt]);

	return { holding: hold?.sessionId === sessionId, onSessionGone };
}
