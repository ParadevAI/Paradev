"use client";

import { CodeNode } from "@lexical/code";
import { ListItemNode, ListNode } from "@lexical/list";
import {
	type InitialConfigType,
	LexicalComposer as LexicalRoot,
} from "@lexical/react/LexicalComposer";
import { QuoteNode } from "@lexical/rich-text";
import { i18n } from "@superset/i18n";
import { useState } from "react";
import { ComposerBody } from "./components/ComposerBody";
import { PROMPT_INPUT_NAMESPACE } from "./constants";
import { MentionChipNode } from "./nodes/mentionChipNode";
import { ChipRenderProvider } from "./providers/ChipRenderProvider";
import { COMPOSER_THEME } from "./theme";
import type { PromptInputProps } from "./types";
import "./prompt-input.css";
import { msg } from "@lingui/core/macro";

export type {
	ComposerActionContext,
	ComposerChip,
	ComposerDraft,
	ComposerDraftSegment,
	ComposerMentionBrowse,
	ComposerMentionEntry,
	ComposerMentionProvider,
	ComposerMentionSource,
	ComposerPanelContent,
	ComposerPanelControls,
	PromptInputAttachment,
	PromptInputCommand,
	PromptInputDictation,
	PromptInputDictationError,
	PromptInputHandle,
	PromptInputLocalFiles,
	PromptInputProps,
	PromptInputSubmitPayload,
} from "./types";

export function PromptInput({
	ref,
	placeholder = i18n._(
		msg({
			message: "Do anything",
		}),
	),
	mentionProviders,
	commands,
	dictation,
	status = "ready",
	toolbar,
	toolbarEnd,
	draft,
	onDraftChange,
	onSubmit,
	onStop,
	stopOnEscape = true,
	allowEmptySubmit = false,
	disabled = false,
	pending = false,
	autoFocus = false,
	onAttachmentClick,
	chipForPaste,
	renderChip,
	localFiles,
	history,
	className,
}: PromptInputProps) {
	const [initialConfig] = useState<InitialConfigType>(() => ({
		namespace: PROMPT_INPUT_NAMESPACE,
		nodes: [MentionChipNode, ListNode, ListItemNode, QuoteNode, CodeNode],
		theme: COMPOSER_THEME,
		onError: (error: Error) => {
			throw error;
		},
	}));

	return (
		<div className={className}>
			<LexicalRoot initialConfig={initialConfig}>
				<ChipRenderProvider renderChip={renderChip}>
					<ComposerBody
						ref={ref}
						placeholder={placeholder}
						mentionProviders={mentionProviders}
						commands={commands}
						dictation={dictation}
						status={status}
						toolbar={toolbar}
						toolbarEnd={toolbarEnd}
						draft={draft}
						onDraftChange={onDraftChange}
						onSubmit={onSubmit}
						onStop={onStop}
						stopOnEscape={stopOnEscape}
						allowEmptySubmit={allowEmptySubmit}
						disabled={disabled}
						pending={pending}
						autoFocus={autoFocus}
						onAttachmentClick={onAttachmentClick}
						chipForPaste={chipForPaste}
						localFiles={localFiles}
						history={history}
					/>
				</ChipRenderProvider>
			</LexicalRoot>
		</div>
	);
}
