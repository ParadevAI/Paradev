import type { OutboxEntry } from "@superset/chat/core";
import { userMessageText } from "@superset/chat/core";
import { useEffect, useRef } from "react";
import { prependToDraft } from "../../../Composer/hooks/useComposerDraft";

export function useRestoreUnsentPrompts(
	draftKey: string,
	outbox: OutboxEntry[],
) {
	const outboxRef = useRef(outbox);
	outboxRef.current = outbox;
	useEffect(
		() => () => {
			const unsent = outboxRef.current
				.filter(
					(entry) =>
						entry.state === "failed" ||
						(entry.state === "queued" && entry.attempts === 0),
				)
				.map((entry) => userMessageText({ content: entry.content }))
				.filter(Boolean);
			if (unsent.length > 0) prependToDraft(draftKey, unsent);
		},
		[draftKey],
	);
}
