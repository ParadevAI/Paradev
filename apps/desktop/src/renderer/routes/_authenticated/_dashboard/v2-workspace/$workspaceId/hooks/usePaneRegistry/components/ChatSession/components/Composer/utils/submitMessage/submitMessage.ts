import { appendPastedText } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import type { PromptInputSubmitPayload } from "@superset/chat-ui/PromptInput";
import { elementsForChips } from "../../../../utils/messageElements";

export async function submitMessage(
	{ text, files, mentions, pastedTexts, steer }: PromptInputSubmitPayload,
	{
		uploadAttachments,
		onSend,
		mcpContext,
	}: {
		uploadAttachments: (files: File[]) => Promise<string[] | null>;
		onSend: (content: UserContent[], options: { steer: boolean }) => unknown;
		mcpContext?: string | null;
	},
) {
	const tags = await uploadAttachments(files);
	if (!tags) return false;
	const message = text.trim();
	const elements = elementsForChips(message, mentions);
	const result = await onSend(
		[
			{
				type: "text",
				text: appendPastedText(
					[message, ...tags].filter(Boolean).join("\n"),
					pastedTexts,
				),
				...(elements.length > 0 ? { elements } : {}),
			},
			...(mcpContext
				? [{ type: "text" as const, text: mcpContext, hidden: true }]
				: []),
		],
		{ steer },
	);
	if (result === false) return false;
}
