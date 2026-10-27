"use client";

import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { LexicalTypeaheadMenuPlugin } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { Trans, useLingui } from "@lingui/react/macro";
import { getClipboardFiles } from "@superset/ui/lib/clipboard-files";
import { cn } from "@superset/ui/utils";
import {
	$createNodeSelection,
	$createTextNode,
	$getNearestNodeFromDOMNode,
	$getRoot,
	$getSelection,
	$isNodeSelection,
	$isRangeSelection,
	$setSelection,
	CLICK_COMMAND,
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	DROP_COMMAND,
	INSERT_PARAGRAPH_COMMAND,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_ESCAPE_COMMAND,
	type LexicalNode,
	PASTE_COMMAND,
} from "lexical";
import {
	ArrowUpIcon,
	MicIcon,
	PaperclipIcon,
	RefreshCcwIcon,
	SquareIcon,
	XIcon,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { isDropHandled, markDropHandled } from "../../../../utils/handledDrops";
import { AttachmentPills } from "../../../PromptInput/components/AttachmentPills";
import { ContextButton } from "../../../PromptInput/components/ContextButton";
import { DictationBar } from "../../../PromptInput/components/DictationBar";
import { MentionMenu } from "../../../PromptInput/components/MentionMenu";
import { useDictation } from "../../../PromptInput/hooks/useDictation";
import { useMentionSources } from "../../../PromptInput/hooks/useMentionSources";
import { useMentionTrigger } from "../../../PromptInput/hooks/useMentionTrigger";
import { MentionChipNode } from "../../../PromptInput/nodes/mentionChipNode";
import type {
	ComposerActionContext,
	ComposerChip,
	ComposerMentionEntry,
} from "../../../PromptInput/types";
import { $insertTranscript } from "../../../PromptInput/utils/insertTranscript";
import { MentionTypeaheadOption } from "../../../PromptInput/utils/typeaheadOptions";
import { useMessageAttachments } from "../../hooks/useMessageAttachments";
import type { MessageComposerProps } from "../../types";
import { $isInCode } from "../../utils/isInCode";
import {
	$messageMarkdown,
	MESSAGE_SHORTCUTS,
} from "../../utils/messageMarkdown";
import { CodeFencePlugin } from "../CodeFencePlugin";
import { EmojiTypeahead } from "../EmojiTypeahead";
import { FormatToolbar } from "../FormatToolbar";

const FOOTER_BUTTON_CLASS =
	"flex size-[26px] shrink-0 items-center justify-center rounded-md transition-colors";
const GHOST_FOOTER_BUTTON_CLASS = cn(
	FOOTER_BUTTON_CLASS,
	"cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground",
);
const FILLED_FOOTER_BUTTON_CLASS = cn(
	FOOTER_BUTTON_CLASS,
	"cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80",
);
const INACTIVE_SEND_BUTTON_CLASS = cn(
	FOOTER_BUTTON_CLASS,
	"cursor-not-allowed bg-secondary text-muted-foreground",
);

function $insertChipAtSelection(chip: ComposerChip) {
	let selection = $getSelection();
	if (!$isRangeSelection(selection)) {
		$getRoot().selectEnd();
		selection = $getSelection();
	}
	if (!$isRangeSelection(selection)) return;
	selection.insertNodes([MentionChipNode.fromChip(chip), $createTextNode(" ")]);
}

function $collectChips(): ComposerChip[] {
	const chips: ComposerChip[] = [];
	const visit = (node: LexicalNode) => {
		if (node instanceof MentionChipNode) chips.push(node.toChip());
		if ("getChildren" in node) {
			for (const child of (
				node as unknown as { getChildren(): LexicalNode[] }
			).getChildren()) {
				visit(child);
			}
		}
	};
	visit($getRoot());
	return chips;
}

type MessageComposerBodyProps = Omit<
	MessageComposerProps,
	"className" | "initialMarkdown" | "renderChip"
>;

/**
 * A channel message composer, copied from PromptInput's body and cut down to
 * what a channel needs: @ mentions, dictation and send.
 */
export function MessageComposerBody({
	ref,
	placeholder,
	mentionProviders,
	onSubmit,
	dictation,
	allowAttachments = false,
	getEmojiSuggestions,
	onCancel,
	autoFocus,
}: MessageComposerBodyProps) {
	const { t } = useLingui();
	const [editor] = useLexicalComposerContext();
	const [isEmpty, setIsEmpty] = useState(() =>
		editor
			.getEditorState()
			.read(() => $getRoot().getTextContent().trim().length === 0),
	);
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [menuSlot, setMenuSlot] = useState<HTMLDivElement | null>(null);
	const [browseOpen, setBrowseOpen] = useState(false);
	const [browseIndex, setBrowseIndex] = useState(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const files = useMessageAttachments(allowAttachments);
	const addFilesRef = useRef(files.add);
	addFilesRef.current = files.add;
	const allowAttachmentsRef = useRef(allowAttachments);
	allowAttachmentsRef.current = allowAttachments;
	const onSubmitRef = useRef(onSubmit);
	onSubmitRef.current = onSubmit;
	const onCancelRef = useRef(onCancel);
	onCancelRef.current = onCancel;

	const focusAtEnd = useCallback(() => {
		editor.update(() => $getRoot().selectEnd());
		editor.focus();
	}, [editor]);
	useImperativeHandle(ref, () => ({ focus: focusAtEnd }), [focusAtEnd]);

	const actionContext: ComposerActionContext = {
		insertChip: (chip) => editor.update(() => $insertChipAtSelection(chip)),
		attachFiles: () => fileInputRef.current?.click(),
		openPanel: () => {},
		query: mentionQuery ?? "",
	};
	const actionContextRef = useRef(actionContext);
	actionContextRef.current = actionContext;

	const { matchTrigger, activeProviders } = useMentionTrigger(
		mentionProviders,
		mentionQuery,
	);
	const sections = useMentionSources(
		activeProviders,
		mentionQuery != null || browseOpen,
		mentionQuery ?? "",
	);
	const browseSections = useMemo(
		() => sections.filter((section) => section.entries.length > 0),
		[sections],
	);
	const browseEntries = useMemo(
		() => browseSections.flatMap((section) => section.entries),
		[browseSections],
	);
	const options = useMemo(
		() =>
			sections.flatMap((section) =>
				section.entries.map((entry) => new MentionTypeaheadOption(entry)),
			),
		[sections],
	);

	const selectEntry = (
		entry: ComposerMentionEntry,
		nodeToReplace: LexicalNode | null,
		closeMenu: () => void,
	) => {
		editor.update(() => {
			nodeToReplace?.remove();
			closeMenu();
		});
		void entry.select(actionContextRef.current);
	};

	const selectBrowseEntry = (entry: ComposerMentionEntry) => {
		setBrowseOpen(false);
		editor.focus();
		void entry.select(actionContextRef.current);
	};

	// Typing "@" replaces browsing; the two menus never show together.
	useEffect(() => {
		if (mentionQuery != null) setBrowseOpen(false);
	}, [mentionQuery]);

	// Browse keys: the editor may not have focus, so listen on the window.
	useEffect(() => {
		if (!browseOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const delta = event.key === "ArrowDown" ? 1 : -1;
				const count = browseEntries.length;
				setBrowseIndex((previous) =>
					count === 0 ? 0 : (previous + delta + count) % count,
				);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				const entry = browseEntries[browseIndex];
				if (entry) selectBrowseEntry(entry);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setBrowseOpen(false);
			}
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () =>
			window.removeEventListener("keydown", onKeyDown, { capture: true });
	});

	useEffect(() => {
		if (!browseOpen) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (target && rootRef.current?.contains(target)) return;
			setBrowseOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [browseOpen]);

	const submit = () => {
		const { text, mentions } = editor.getEditorState().read(() => ({
			text: $messageMarkdown(),
			mentions: $collectChips(),
		}));
		const pending = files.attachments.map((attachment) => attachment.file);
		if (!text && pending.length === 0) return;
		if (onSubmitRef.current({ text, mentions, files: pending }) === false) {
			return;
		}
		editor.update(() => $getRoot().clear());
		files.clear();
	};
	const submitRef = useRef(submit);
	submitRef.current = submit;

	const isFocusUnclaimed = () => {
		const active = document.activeElement;
		return (
			active == null ||
			active === document.body ||
			Boolean(rootRef.current?.contains(active))
		);
	};

	const dictationSession = useDictation({
		transcribe: (audio, options) => dictation?.transcribe(audio, options) ?? "",
		onError: (dictationError) => dictation?.onError?.(dictationError),
		maxSeconds: dictation?.maxSeconds,
		audioBitsPerSecond: dictation?.audioBitsPerSecond,
		onTranscript: (text) => {
			editor.update(() => $insertTranscript(text));
			if (isFocusUnclaimed()) editor.focus();
		},
	});

	useEffect(() => {
		const unregisterText = editor.registerTextContentListener((text) => {
			setIsEmpty(text.trim().length === 0);
			setBrowseOpen(false);
		});
		const unregisterEnter = editor.registerCommand<KeyboardEvent | null>(
			KEY_ENTER_COMMAND,
			(event) => {
				if (event?.isComposing || event?.keyCode === 229) return false;
				// Shift+Enter starts a new line, list item or quote line; inside
				// a code block Enter adds a line, as in Slack.
				if (event?.shiftKey) {
					event.preventDefault();
					editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
					return true;
				}
				const selection = $getSelection();
				if (
					$isRangeSelection(selection) &&
					$isCodeNode(selection.anchor.getNode().getTopLevelElement())
				) {
					return false;
				}
				event?.preventDefault();
				submitRef.current();
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		// Chips are decorator nodes: a click selects one, Backspace/Delete removes it.
		const unregisterClick = editor.registerCommand<MouseEvent>(
			CLICK_COMMAND,
			(event) => {
				const target = event.target;
				if (!(target instanceof Element)) return false;
				const chipElement = target.closest("[data-mention-chip]");
				if (!chipElement) return false;
				const node = $getNearestNodeFromDOMNode(chipElement);
				if (!(node instanceof MentionChipNode)) return false;
				const selection = $createNodeSelection();
				selection.add(node.getKey());
				$setSelection(selection);
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const removeSelectedChips = (event: KeyboardEvent | null) => {
			const selection = $getSelection();
			if (!$isNodeSelection(selection)) return false;
			const nodes = selection.getNodes();
			if (
				nodes.length === 0 ||
				!nodes.every((node) => node instanceof MentionChipNode)
			)
				return false;
			event?.preventDefault();
			for (const node of nodes) node.remove();
			return true;
		};
		const unregisterEscape = editor.registerCommand<KeyboardEvent | null>(
			KEY_ESCAPE_COMMAND,
			(event) => {
				if (!onCancelRef.current) return false;
				event?.preventDefault();
				onCancelRef.current();
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const unregisterPaste = editor.registerCommand<ClipboardEvent>(
			PASTE_COMMAND,
			(event) => {
				if (!(event instanceof ClipboardEvent)) return false;
				if (!allowAttachmentsRef.current) return false;
				const pasted = getClipboardFiles(event.clipboardData);
				if (pasted.length === 0) return false;
				event.preventDefault();
				addFilesRef.current(pasted);
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterDrop = editor.registerCommand<DragEvent>(
			DROP_COMMAND,
			(event) => {
				const dropped = event.dataTransfer?.files;
				if (!allowAttachmentsRef.current) return false;
				if (!dropped || dropped.length === 0) return false;
				event.preventDefault();
				markDropHandled(event);
				addFilesRef.current(dropped);
				setDragging(false);
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterBackspace = editor.registerCommand<KeyboardEvent | null>(
			KEY_BACKSPACE_COMMAND,
			removeSelectedChips,
			COMMAND_PRIORITY_LOW,
		);
		const unregisterDelete = editor.registerCommand<KeyboardEvent | null>(
			KEY_DELETE_COMMAND,
			removeSelectedChips,
			COMMAND_PRIORITY_LOW,
		);
		return () => {
			unregisterText();
			unregisterEnter();
			unregisterClick();
			unregisterBackspace();
			unregisterDelete();
			unregisterEscape();
			unregisterPaste();
			unregisterDrop();
		};
	}, [editor]);

	// While dictating, Escape cancels and Enter stops or retries, never sends.
	useEffect(() => {
		if (dictationSession.status === "idle") return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.isComposing || !isFocusUnclaimed()) return;
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				dictationSession.cancel();
				return;
			}
			if (event.key !== "Enter" || event.shiftKey) return;
			event.preventDefault();
			event.stopPropagation();
			if (dictationSession.status === "recording")
				void dictationSession.finish();
			else if (dictationSession.status === "error")
				void dictationSession.retry();
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () =>
			window.removeEventListener("keydown", onKeyDown, { capture: true });
	});

	useEffect(() => {
		if (autoFocus) focusAtEnd();
	}, [autoFocus, focusAtEnd]);

	const canSend = !isEmpty || files.attachments.length > 0;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; keyboard users attach with the paperclip
		<div
			ref={rootRef}
			className="relative flex flex-col rounded-2xl bg-card ring-1 ring-border transition-shadow focus-within:ring-ring/40"
			onDragOver={(event) => {
				if (allowAttachments && event.dataTransfer.types.includes("Files")) {
					event.preventDefault();
					setDragging(true);
				}
			}}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null))
					setDragging(false);
			}}
			onDrop={(event) => {
				if (
					allowAttachments &&
					!isDropHandled(event.nativeEvent) &&
					event.dataTransfer.files.length > 0
				) {
					event.preventDefault();
					markDropHandled(event.nativeEvent);
					files.add(event.dataTransfer.files);
				}
				setDragging(false);
			}}
		>
			<div
				aria-hidden={!dragging}
				className={cn(
					"pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/10 transition-opacity duration-150 motion-reduce:transition-none",
					dragging ? "opacity-100" : "opacity-0",
				)}
			>
				<span className="inline-flex items-center rounded-md border border-border/50 bg-secondary px-3 py-1 text-sm text-foreground shadow">
					<Trans>Drop to attach</Trans>
				</span>
			</div>
			<div
				ref={setMenuSlot}
				className="pointer-events-none absolute inset-x-0 bottom-full pb-2 [&>*]:pointer-events-auto"
			>
				{browseOpen && mentionQuery == null && (
					<MentionMenu
						sections={browseSections}
						selectedIndex={browseIndex}
						onHighlight={setBrowseIndex}
						onSelect={selectBrowseEntry}
					/>
				)}
			</div>
			<FormatToolbar />
			<AttachmentPills
				attachments={files.attachments}
				onRemove={files.remove}
				onPreviewError={files.dropPreview}
			/>
			<div className="relative px-4 pt-3.5 pb-1">
				<RichTextPlugin
					contentEditable={
						<ContentEditable className="prompt-input-editor" spellCheck />
					}
					placeholder={
						<span className="pointer-events-none absolute top-3.5 left-4 text-sm leading-[1.625] text-muted-foreground/70">
							{placeholder}
						</span>
					}
					ErrorBoundary={LexicalErrorBoundary}
				/>
				<HistoryPlugin />
				<ListPlugin />
				<LinkPlugin />
				<MarkdownShortcutPlugin transformers={MESSAGE_SHORTCUTS} />
				<CodeFencePlugin />
				<LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
					onQueryChange={setMentionQuery}
					onSelectOption={(option, nodeToReplace, closeMenu) =>
						selectEntry(option.entry, nodeToReplace, closeMenu)
					}
					options={options}
					triggerFn={(text) => ($isInCode() ? null : matchTrigger(text))}
					commandPriority={COMMAND_PRIORITY_HIGH}
					onClose={() => setMentionQuery(null)}
					menuRenderFn={(
						anchorElementRef,
						{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
					) =>
						anchorElementRef.current && menuSlot
							? createPortal(
									<MentionMenu
										sections={sections}
										selectedIndex={selectedIndex}
										onHighlight={setHighlightedIndex}
										onSelect={(entry) => {
											const option = options.find(
												(candidate) => candidate.entry.id === entry.id,
											);
											if (option) selectOptionAndCleanUp(option);
										}}
									/>,
									menuSlot,
								)
							: null
					}
				/>
				{getEmojiSuggestions && (
					<EmojiTypeahead
						getSuggestions={getEmojiSuggestions}
						menuSlot={menuSlot}
					/>
				)}
			</div>
			{onCancel ? (
				<div className="flex items-center justify-end gap-2 px-3 pb-2.5">
					<button
						type="button"
						onClick={onCancel}
						className="h-7 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<Trans>Cancel</Trans>
					</button>
					<button
						type="button"
						disabled={!canSend}
						onClick={submit}
						className="h-7 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Trans>Save</Trans>
					</button>
				</div>
			) : (
				<div className="flex min-h-12 items-center gap-1 px-3 pb-2.5">
					{dictationSession.status === "error" ? (
						<>
							<span className="min-w-0 flex-1 truncate pl-1 text-sm text-muted-foreground">
								{dictationSession.error?.message}
							</span>
							<button
								type="button"
								aria-label={t({ message: "Retry dictation" })}
								onClick={() => void dictationSession.retry()}
								className={FILLED_FOOTER_BUTTON_CLASS}
							>
								<RefreshCcwIcon className="size-3.5" />
							</button>
							<button
								type="button"
								aria-label={t({ message: "Discard recording" })}
								onClick={dictationSession.cancel}
								className={GHOST_FOOTER_BUTTON_CLASS}
							>
								<XIcon className="size-3.5" />
							</button>
						</>
					) : dictationSession.status !== "idle" ? (
						<>
							<DictationBar
								canvasRef={dictationSession.canvasRef}
								seconds={dictationSession.seconds}
								status={
									dictationSession.status === "transcribing"
										? "transcribing"
										: "recording"
								}
							/>
							<button
								type="button"
								aria-label={t({ message: "Stop dictation" })}
								disabled={dictationSession.status === "transcribing"}
								onClick={() => void dictationSession.finish()}
								className={cn(
									FILLED_FOOTER_BUTTON_CLASS,
									"disabled:cursor-default disabled:opacity-50",
								)}
							>
								<SquareIcon className="size-3 fill-current" />
							</button>
						</>
					) : (
						<>
							<ContextButton
								onClick={() => {
									setBrowseIndex(0);
									setBrowseOpen((open) => !open);
								}}
							/>
							{allowAttachments && (
								<>
									<button
										type="button"
										aria-label={t({ message: "Attach files" })}
										onClick={() => fileInputRef.current?.click()}
										className={GHOST_FOOTER_BUTTON_CLASS}
									>
										<PaperclipIcon className="size-4" />
									</button>
									<input
										ref={fileInputRef}
										type="file"
										multiple
										className="hidden"
										onChange={(event) => {
											if (event.target.files) files.add(event.target.files);
											event.target.value = "";
										}}
									/>
								</>
							)}
							<div className="flex-1" />
							{dictation && (
								<button
									type="button"
									aria-label={t({ message: "Dictate" })}
									onClick={async () => {
										await dictationSession.start();
										editor.focus();
									}}
									className={GHOST_FOOTER_BUTTON_CLASS}
								>
									<MicIcon className="size-4" />
								</button>
							)}
						</>
					)}
					<button
						type="button"
						aria-label={t({ message: "Send message" })}
						disabled={!canSend || dictationSession.status !== "idle"}
						onClick={submit}
						className={
							canSend && dictationSession.status === "idle"
								? cn(
										FOOTER_BUTTON_CLASS,
										"cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90",
									)
								: INACTIVE_SEND_BUTTON_CLASS
						}
					>
						<ArrowUpIcon className="size-4" />
					</button>
				</div>
			)}
		</div>
	);
}
