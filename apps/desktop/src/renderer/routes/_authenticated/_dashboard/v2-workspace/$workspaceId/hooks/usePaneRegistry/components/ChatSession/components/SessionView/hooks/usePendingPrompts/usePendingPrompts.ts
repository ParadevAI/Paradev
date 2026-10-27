import type { UserContent } from "@superset/chat/protocol";
import { useEffect, useRef } from "react";

export function usePendingPrompts({
	held,
	onSent,
	prompts,
	ready,
	sendPrompt,
}: {
	held: boolean;
	onSent: () => void;
	prompts: UserContent[][];
	ready: boolean;
	sendPrompt: (content: UserContent[]) => unknown;
}) {
	const sent = useRef(false);
	useEffect(() => {
		if (prompts.length === 0) {
			sent.current = false;
			return;
		}
		if (held || !ready || sent.current) return;
		sent.current = true;
		for (const prompt of prompts) sendPrompt(prompt);
		onSent();
	}, [held, onSent, prompts, ready, sendPrompt]);
}
