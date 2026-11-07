import type { OutboxEntry } from "@superset/chat/core";
import type { ComposerDraft } from "@superset/chat-ui/PromptInput";
import { useEffect, useRef } from "react";
import { prependToDraft } from "../../../Composer/hooks/useComposerDraft";

export function useRestoreUnsentPrompts(
	draftKey: string,
	outbox: OutboxEntry[],
	draftOf: (entry: OutboxEntry) => ComposerDraft,
) {
	const outboxRef = useRef(outbox);
	outboxRef.current = outbox;
	const draftOfRef = useRef(draftOf);
	draftOfRef.current = draftOf;
	useEffect(
		() => () => {
			const unsent = outboxRef.current
				.filter(
					(entry) =>
						entry.state === "failed" ||
						(entry.state === "queued" && entry.attempts === 0),
				)
				.map((entry) => draftOfRef.current(entry))
				.filter(
					(draft) => draft.segments.length > 0 || draft.attachments.length > 0,
				);
			if (unsent.length > 0) prependToDraft(draftKey, unsent);
		},
		[draftKey],
	);
}
