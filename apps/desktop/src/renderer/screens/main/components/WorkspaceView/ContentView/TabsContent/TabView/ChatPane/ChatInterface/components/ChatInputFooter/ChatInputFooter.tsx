import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputAttachments,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { ThinkingToggle } from "@superset/ui/ai-elements/thinking-toggle";
import { UploadIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	getCurrentPlatform,
	HOTKEYS,
	matchesHotkeyEvent,
} from "shared/hotkeys";
import type { SlashCommand } from "../../hooks/useSlashCommands";
import type { ModelOption, PermissionMode } from "../../types";
import { IssueLinkCommand } from "../IssueLinkCommand";
import { MentionAnchor, MentionProvider } from "../MentionPopover";
import { ModelPicker } from "../ModelPicker";
import { PermissionModePicker } from "../PermissionModePicker";
import { PlusMenu } from "../PlusMenu";
import { SlashCommandInput } from "../SlashCommandInput";

interface ChatInputFooterProps {
	cwd: string;
	error: string | null;
	isStreaming: boolean;
	availableModels: ModelOption[];
	selectedModel: ModelOption | null;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption | null>>;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingEnabled: boolean;
	setThinkingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
	slashCommands: SlashCommand[];
	onSend: (message: PromptInputMessage) => void;
	onStop: (e: React.MouseEvent) => void;
	onSlashCommandSend: (command: SlashCommand) => void;
}

function useDocumentDrag() {
	const [isDragging, setIsDragging] = useState(false);
	const counter = useRef(0);

	const onEnter = useCallback((e: DragEvent) => {
		if (e.dataTransfer?.types?.includes("Files")) {
			counter.current++;
			setIsDragging(true);
		}
	}, []);

	const onLeave = useCallback(() => {
		counter.current--;
		if (counter.current === 0) setIsDragging(false);
	}, []);

	const onDrop = useCallback(() => {
		counter.current = 0;
		setIsDragging(false);
	}, []);

	useEffect(() => {
		document.addEventListener("dragenter", onEnter);
		document.addEventListener("dragleave", onLeave);
		document.addEventListener("drop", onDrop);
		return () => {
			document.removeEventListener("dragenter", onEnter);
			document.removeEventListener("dragleave", onLeave);
			document.removeEventListener("drop", onDrop);
		};
	}, [onEnter, onLeave, onDrop]);

	return isDragging;
}

function ChatShortcuts({
	setIssueLinkOpen,
}: {
	setIssueLinkOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
	const attachments = usePromptInputAttachments();
	const platform = getCurrentPlatform();
	const attachKey = HOTKEYS.CHAT_ADD_ATTACHMENT.defaults[platform];
	const linkKey = HOTKEYS.CHAT_LINK_ISSUE.defaults[platform];
	const focusKey = HOTKEYS.FOCUS_CHAT_INPUT.defaults[platform];

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (attachKey && matchesHotkeyEvent(e, attachKey)) {
				e.preventDefault();
				attachments.openFileDialog();
			}
			if (linkKey && matchesHotkeyEvent(e, linkKey)) {
				e.preventDefault();
				setIssueLinkOpen((prev) => !prev);
			}
			if (focusKey && matchesHotkeyEvent(e, focusKey)) {
				e.preventDefault();
				const textarea = document.querySelector<HTMLTextAreaElement>(
					"[data-slot=input-group-control]",
				);
				textarea?.focus();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [attachKey, linkKey, focusKey, attachments, setIssueLinkOpen]);

	return null;
}

function IssueLinkInserter({
	issueLinkOpen,
	setIssueLinkOpen,
}: {
	issueLinkOpen: boolean;
	setIssueLinkOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
	const { textInput } = usePromptInputController();

	const handleSelectTask = useCallback(
		(slug: string) => {
			const current = textInput.value;
			const needsSpace = current.length > 0 && !current.endsWith(" ");
			textInput.setInput(`${current}${needsSpace ? " " : ""}@task:${slug} `);
		},
		[textInput],
	);

	return (
		<IssueLinkCommand
			open={issueLinkOpen}
			onOpenChange={setIssueLinkOpen}
			onSelect={handleSelectTask}
		/>
	);
}

export function ChatInputFooter({
	cwd,
	error,
	isStreaming,
	availableModels,
	selectedModel,
	setSelectedModel,
	modelSelectorOpen,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingEnabled,
	setThinkingEnabled,
	slashCommands,
	onSend,
	onStop,
	onSlashCommandSend,
}: ChatInputFooterProps) {
	const isDragging = useDocumentDrag();
	const [issueLinkOpen, setIssueLinkOpen] = useState(false);

	return (
		<div className="border-t bg-background px-4 py-3">
			<div className="mx-auto w-full max-w-3xl">
				{error && (
					<div className="mb-3 select-text rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
						{error}
					</div>
				)}
				<SlashCommandInput
					onCommandSend={onSlashCommandSend}
					commands={slashCommands}
				>
					<MentionProvider cwd={cwd}>
						<MentionAnchor>
							<div className="relative">
								<span className="pointer-events-none absolute top-3 right-3 z-10 text-xs text-muted-foreground/50 [:focus-within>&]:hidden">
									⌘F to focus
								</span>
								<PromptInput
									onSubmit={onSend}
									multiple
									maxFiles={5}
									maxFileSize={10 * 1024 * 1024}
									globalDrop
								>
									<ChatShortcuts setIssueLinkOpen={setIssueLinkOpen} />
									<IssueLinkInserter
										issueLinkOpen={issueLinkOpen}
										setIssueLinkOpen={setIssueLinkOpen}
									/>
									{isDragging && (
										<div className="mx-3 mt-3 flex self-stretch flex-col items-center gap-2 bg-muted py-6">
											<div className="flex size-8 items-center justify-center rounded-full bg-muted-foreground/20">
												<UploadIcon className="size-4 text-muted-foreground" />
											</div>
											<p className="font-medium text-foreground text-sm">
												Drop files here
											</p>
											<p className="text-muted-foreground text-xs">
												Images, PDFs, text files, or folders
											</p>
										</div>
									)}
									<PromptInputAttachments>
										{(file) => <PromptInputAttachment data={file} />}
									</PromptInputAttachments>
									<PromptInputTextarea placeholder="Ask to make changes, @mention files, run /commands" />
									<PromptInputFooter>
										<PromptInputTools>
											<ModelPicker
												models={availableModels}
												selectedModel={selectedModel}
												onSelectModel={setSelectedModel}
												open={modelSelectorOpen}
												onOpenChange={setModelSelectorOpen}
											/>
											<ThinkingToggle
												enabled={thinkingEnabled}
												onToggle={setThinkingEnabled}
											/>
											<PermissionModePicker
												selectedMode={permissionMode}
												onSelectMode={setPermissionMode}
											/>
										</PromptInputTools>
										<div className="flex items-center space-x-2">
											<PlusMenu onLinkIssue={() => setIssueLinkOpen(true)} />
											<PromptInputSubmit
												status={isStreaming ? "streaming" : undefined}
												onClick={isStreaming ? onStop : undefined}
											/>
										</div>
									</PromptInputFooter>
								</PromptInput>
							</div>
						</MentionAnchor>
					</MentionProvider>
				</SlashCommandInput>
			</div>
		</div>
	);
}
