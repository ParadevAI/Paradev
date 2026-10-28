"use client";

import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { $convertFromMarkdownString } from "@lexical/markdown";
import {
	type InitialConfigType,
	LexicalComposer as LexicalRoot,
} from "@lexical/react/LexicalComposer";
import { QuoteNode } from "@lexical/rich-text";
import { useState } from "react";
import {
	ChipRendererContext,
	MentionChipNode,
} from "../PromptInput/nodes/mentionChipNode";
import { MessageComposerBody } from "./components/MessageComposerBody";
import { MESSAGE_COMPOSER_THEME } from "./theme";
import type { MessageComposerProps } from "./types";
import { MESSAGE_IMPORT } from "./utils/messageMarkdown";
import "../PromptInput/prompt-input.css";

export type {
	MessageComposerHandle,
	MessageComposerProps,
	MessageComposerSubmitPayload,
	MessageEmojiSuggestion,
} from "./types";

export function MessageComposer({
	className,
	initialMarkdown,
	renderChip,
	...props
}: MessageComposerProps) {
	const [initialConfig] = useState<InitialConfigType>(() => ({
		namespace: "message-composer",
		nodes: [
			MentionChipNode,
			ListNode,
			ListItemNode,
			QuoteNode,
			CodeNode,
			LinkNode,
		],
		theme: MESSAGE_COMPOSER_THEME,
		editorState: initialMarkdown
			? () =>
					$convertFromMarkdownString(
						initialMarkdown,
						MESSAGE_IMPORT,
						undefined,
						true,
					)
			: undefined,
		onError: (error: Error) => {
			throw error;
		},
	}));
	return (
		<div className={className}>
			<ChipRendererContext.Provider value={renderChip}>
				<LexicalRoot initialConfig={initialConfig}>
					<MessageComposerBody {...props} />
				</LexicalRoot>
			</ChipRendererContext.Provider>
		</div>
	);
}
