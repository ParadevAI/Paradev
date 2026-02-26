import { useEffect, useMemo, useRef, useState } from "react";
import { dedupeMessages, type MastraMessage } from "./message-dedupe";

export interface UseMessagesOptions {
	historicalMessages: MastraMessage[];
	currentMessage: MastraMessage | null;
	isRunning: boolean;
}

export function useMessages({
	historicalMessages,
	currentMessage,
	isRunning,
}: UseMessagesOptions) {
	const [optimistic, setOptimistic] = useState<MastraMessage | null>(null);
	const optimisticTextRef = useRef<string | null>(null);
	const lastDedupeLogRef = useRef<string | null>(null);

	// Clear optimistic once the real user message appears in history
	useEffect(() => {
		const optimisticText = optimisticTextRef.current;
		if (!optimisticText) return;

		const found = historicalMessages.some(
			(m) =>
				m.role === "user" &&
				m.content.some(
					(c) => c.type === "text" && "text" in c && c.text === optimisticText,
				),
		);
		if (!found) return;

		setOptimistic(null);
		optimisticTextRef.current = null;
	}, [historicalMessages]);

	const { messages, summary } = useMemo(() => {
		const candidates: MastraMessage[] = [...historicalMessages];
		if (optimistic) candidates.push(optimistic);
		if (currentMessage && isRunning) candidates.push(currentMessage);
		return dedupeMessages(candidates);
	}, [historicalMessages, optimistic, currentMessage, isRunning]);

	useEffect(() => {
		const hasDedupedMessages = summary.droppedMessageIds.length > 0;
		const hasDedupedToolParts = summary.droppedToolPartCount > 0;
		if (!hasDedupedMessages && !hasDedupedToolParts) return;

		const snapshot = JSON.stringify(summary);
		if (lastDedupeLogRef.current === snapshot) return;
		lastDedupeLogRef.current = snapshot;

		console.debug("[chat-mastra] dedupe applied", summary);
	}, [summary]);

	const addOptimisticUserMessage = (text: string) => {
		optimisticTextRef.current = text;
		setOptimistic({
			id: `optimistic-${Date.now()}`,
			role: "user",
			content: [{ type: "text", text }],
			createdAt: new Date(),
		} as MastraMessage);
	};

	const clearOptimistic = () => {
		setOptimistic(null);
		optimisticTextRef.current = null;
	};

	return { messages, addOptimisticUserMessage, clearOptimistic };
}
