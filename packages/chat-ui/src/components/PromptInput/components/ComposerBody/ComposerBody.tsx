"use client";

import {
	$insertDataTransferForRichText,
	setLexicalClipboardDataTransfer,
} from "@lexical/clipboard";
import { $isCodeNode } from "@lexical/code";
import { ListItemNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { LexicalTypeaheadMenuPlugin } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $getNearestNodeOfType } from "@lexical/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { isLargePaste, normalizePastedText } from "@superset/chat/core";
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
	$isTextNode,
	$setSelection,
	CLICK_COMMAND,
	COMMAND_PRIORITY_CRITICAL,
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	COPY_COMMAND,
	CUT_COMMAND,
	DROP_COMMAND,
	FORMAT_TEXT_COMMAND,
	INDENT_CONTENT_COMMAND,
	INSERT_PARAGRAPH_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
	KEY_DOWN_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_ESCAPE_COMMAND,
	KEY_TAB_COMMAND,
	type LexicalNode,
	OUTDENT_CONTENT_COMMAND,
	PASTE_COMMAND,
} from "lexical";
import {
	ArrowUpIcon,
	LoaderCircleIcon,
	MicIcon,
	PaperclipIcon,
	RefreshCcwIcon,
	SquareIcon,
	XIcon,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { isDropHandled, markDropHandled } from "../../../../utils/handledDrops";
import { useComposerDropZone } from "../../../ComposerDropZone";
import { useDictation } from "../../hooks/useDictation";
import {
	type MentionSection,
	useMentionSources,
} from "../../hooks/useMentionSources";
import { useMentionTrigger } from "../../hooks/useMentionTrigger";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import {
	ChipRenderProvider,
	useRenderChip,
} from "../../providers/ChipRenderProvider";
import type {
	ComposerActionContext,
	ComposerChip,
	ComposerDraft,
	ComposerMentionBrowse,
	ComposerMentionEntry,
	ComposerMentionProvider,
	ComposerPanelContent,
	PromptInputAttachment,
	PromptInputProps,
} from "../../types";
import { browseRows } from "../../utils/browseRows";
import { $clipboardData } from "../../utils/clipboardData";
import {
	$appendDraftSegments,
	$readPromptText,
	draftOf,
	TYPED_SHORTCUTS,
} from "../../utils/draftSegments";
import { registerHistoryNavigation } from "../../utils/historyNavigation";
import { $insertTranscript } from "../../utils/insertTranscript";
import { $isInCode } from "../../utils/isInCode";
import { rankCommands } from "../../utils/rankCommands";
import { tablesToMarkdown } from "../../utils/tablesToMarkdown";
import {
	CommandTypeaheadOption,
	MentionTypeaheadOption,
} from "../../utils/typeaheadOptions";
import { AttachmentPills } from "../AttachmentPills";
import { CodeFencePlugin } from "../CodeFencePlugin";
import { CommandMenu } from "../CommandMenu";
import { ComposerPanel } from "../ComposerPanel";
import { ContextButton } from "../ContextButton";
import { DictationBar } from "../DictationBar";
import { MentionMenu } from "../MentionMenu";
import { MentionSubmenu } from "../MentionSubmenu";

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

// Slash commands only trigger while the "/token" is the entire message.
function matchCommandToken(text: string) {
	const match = /^\/([^/\r\n]*)$/.exec(text);
	if (!match) return null;
	return {
		leadOffset: 0,
		matchingString: match[1] ?? "",
		replaceableString: match[0],
	};
}

export type ComposerBodyProps = Required<
	Pick<PromptInputProps, "placeholder" | "status">
> &
	Pick<
		PromptInputProps,
		| "mentionProviders"
		| "commands"
		| "dictation"
		| "toolbar"
		| "toolbarEnd"
		| "draft"
		| "onDraftChange"
		| "onSubmit"
		| "onStop"
		| "stopOnEscape"
		| "onAttachmentClick"
		| "chipForPaste"
		| "localFiles"
		| "ref"
		| "allowEmptySubmit"
		| "disabled"
		| "pending"
		| "autoFocus"
		| "history"
	>;

function withoutTooltip(_chip: ComposerChip, rendered: ReactNode): ReactNode {
	return rendered;
}

function $insertChipAtSelection(chip: ComposerChip) {
	let selection = $getSelection();
	if (!$isRangeSelection(selection)) {
		$getRoot().selectEnd();
		selection = $getSelection();
	}
	if (!$isRangeSelection(selection)) return;
	const chipNode = MentionChipNode.fromChip(chip);
	selection.insertNodes([chipNode, $createTextNode(" ")]);
}

function $collectChips(): ComposerChip[] {
	const chips: ComposerChip[] = [];
	const visit = (node: LexicalNode) => {
		if (node instanceof MentionChipNode) {
			chips.push(node.toChip());
		}
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

export function ComposerBody({
	placeholder,
	mentionProviders,
	commands,
	dictation,
	status,
	toolbar,
	toolbarEnd,
	draft,
	onDraftChange,
	onSubmit,
	onStop,
	stopOnEscape = true,
	onAttachmentClick,
	chipForPaste,
	localFiles,
	ref,
	allowEmptySubmit,
	disabled,
	pending,
	autoFocus,
	history,
}: ComposerBodyProps) {
	const { t } = useLingui();
	const [editor] = useLexicalComposerContext();
	const onDraftChangeRef = useRef(onDraftChange);
	onDraftChangeRef.current = onDraftChange;
	const focusAtEnd = useCallback(() => {
		editor.update(() => $getRoot().selectEnd());
		editor.focus();
	}, [editor]);
	const [attachments, setAttachments] = useState<PromptInputAttachment[]>([]);
	const attachmentsRef = useRef(attachments);
	attachmentsRef.current = attachments;
	const usedDictationRef = useRef(false);
	const addAttachments = useCallback(
		(incoming: readonly Omit<PromptInputAttachment, "previewUrl">[]) => {
			if (incoming.length === 0) return;
			setAttachments((previous) => [
				...previous,
				...incoming.map(({ file, ...rest }) => ({
					...rest,
					file,
					previewUrl:
						file.type.startsWith("image/") || file.type.startsWith("video/")
							? URL.createObjectURL(file)
							: undefined,
				})),
			]);
		},
		[],
	);
	useImperativeHandle(
		ref,
		() => ({
			restoreDraft(restored: ComposerDraft) {
				editor.update(() => $appendDraftSegments(restored.segments));
				addAttachments(restored.attachments);
				if (restored.usedDictation) usedDictationRef.current = true;
				editor.focus();
			},
			isEmpty() {
				return (
					editor
						.getEditorState()
						.read(() => $getRoot().getTextContent().trim() === "") &&
					attachmentsRef.current.length === 0
				);
			},
			addFiles(files: File[]) {
				addFilesRef.current(files);
				focusAtEnd();
			},
			insertChip(chip: ComposerChip) {
				editor.update(() => $insertChipAtSelection(chip));
			},
			openFileDialog() {
				fileInputRef.current?.click();
			},
			openPanel(next: ComposerPanelContent) {
				setPanel(next);
			},
			focus() {
				focusAtEnd();
			},
			recallPreviousPrompt() {
				editor.focus();
				historyNavigationRef.current?.recallOlder();
			},
			blur() {
				editor.update(() => $setSelection(null), { discrete: true });
				editor.blur();
			},
		}),
		[addAttachments, editor, focusAtEnd],
	);
	const [isEmpty, setIsEmpty] = useState(true);
	const [dragging, setDragging] = useState(false);
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [commandQuery, setCommandQuery] = useState<string | null>(null);
	const [commandDismissed, setCommandDismissed] = useState(false);
	const [panel, setPanel] = useState<ComposerPanelContent | null>(null);
	const [menuSlot, setMenuSlot] = useState<HTMLDivElement | null>(null);
	const [browseOpen, setBrowseOpen] = useState(false);
	const [browseIndex, setBrowseIndex] = useState(0);
	const [submenu, setSubmenu] = useState<
		(ComposerMentionProvider & { browse: ComposerMentionBrowse }) | null
	>(null);
	const [typeaheadDismissed, setTypeaheadDismissed] = useState(false);
	const renderChip = useRenderChip();
	const rootRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	// Lexical command listeners register once; this ref bridges them to live React state.
	const stateRef = useRef({
		attachments,
		onStop,
		stopOnEscape,
		onSubmit,
		status,
		allowEmptySubmit,
		disabled,
		pending,
		history,
	});
	stateRef.current = {
		attachments,
		onStop,
		stopOnEscape,
		onSubmit,
		status,
		allowEmptySubmit,
		disabled,
		pending,
		history,
	};
	const historyNavigationRef = useRef<{
		recallOlder: () => void;
		reset: () => void;
	} | null>(null);

	const seeded = useRef(false);
	useEffect(() => {
		if (seeded.current) return;
		seeded.current = true;
		if (!draft) return;
		if (draft.segments.length > 0) {
			editor.update(() => {
				if ($getRoot().getTextContent() !== "") return;
				$appendDraftSegments(draft.segments);
			});
		}
		addAttachments(draft.attachments);
		if (draft.usedDictation) usedDictationRef.current = true;
	}, [addAttachments, draft, editor]);

	useEffect(
		() =>
			editor.registerUpdateListener(({ editorState }) => {
				onDraftChangeRef.current?.({
					segments: draftOf(editorState),
					attachments: attachmentsRef.current,
					...(usedDictationRef.current ? { usedDictation: true } : {}),
				});
			}),
		[editor],
	);
	useEffect(() => {
		onDraftChangeRef.current?.({
			segments: draftOf(editor.getEditorState()),
			attachments,
			...(usedDictationRef.current ? { usedDictation: true } : {}),
		});
	}, [attachments, editor]);

	const addFiles = (files: FileList | File[]) => {
		const incoming = Array.from(files);
		if (incoming.length === 0) return;
		addAttachments(
			incoming.map((file) => {
				const sourcePath = localFiles?.pathOf(file);
				return {
					id: crypto.randomUUID(),
					file,
					...(sourcePath ? { sourcePath } : {}),
				};
			}),
		);
	};
	const addPastedText = (text: string) => {
		const ordinal =
			attachmentsRef.current.filter((entry) => entry.pastedText).length + 1;
		addAttachments([
			{
				id: crypto.randomUUID(),
				file: new File([text], `pasted-${ordinal}.txt`, {
					type: "text/plain",
				}),
				pastedText: text,
			},
		]);
	};
	const addFilesRef = useRef(addFiles);
	addFilesRef.current = addFiles;
	const addPastedTextRef = useRef(addPastedText);
	addPastedTextRef.current = addPastedText;
	const chipForPasteRef = useRef(chipForPaste);
	chipForPasteRef.current = chipForPaste;
	// Cmd/Ctrl+Shift+V pastes as text; the paste event itself carries no keys.
	const pasteAsTextRef = useRef(false);

	const dropZone = useComposerDropZone();
	useEffect(() => {
		return dropZone?.register((files) => addFilesRef.current(files));
	}, [dropZone]);

	const closePanel = useCallback(() => {
		setPanel(null);
		editor.focus();
	}, [editor]);

	const actionContext: ComposerActionContext = {
		insertChip: (chip) => {
			editor.update(() => $insertChipAtSelection(chip));
		},
		attachFiles: () => fileInputRef.current?.click(),
		openPanel: setPanel,
		query: mentionQuery ?? "",
	};
	const actionContextRef = useRef(actionContext);
	actionContextRef.current = actionContext;

	const { matchTrigger, activeProviders } = useMentionTrigger(
		mentionProviders ?? [],
		mentionQuery,
	);
	const sections = useMentionSources(
		activeProviders,
		mentionQuery != null || browseOpen,
		mentionQuery ?? "",
	);
	const openSubmenu = useCallback((provider: ComposerMentionProvider) => {
		const { browse } = provider;
		if (!browse) return;
		setBrowseOpen(false);
		setSubmenu({ ...provider, browse });
	}, []);
	const links = useMemo(
		() => browseRows(activeProviders, openSubmenu),
		[activeProviders, openSubmenu],
	);
	const browseSections = useMemo<MentionSection[]>(
		() => [
			{
				providerId: "add",
				title: t({ message: "Add" }),
				isLoading: false,
				entries: [
					{
						id: "attach-files",
						label: t({ message: "Attach files" }),
						icon: <PaperclipIcon className="size-4" />,
						select: (ctx) => ctx.attachFiles(),
					},
				],
			},
			...(links.rows.length > 0
				? [
						{
							providerId: "link",
							title: t({ message: "Link" }),
							isLoading: false,
							entries: links.rows,
						},
					]
				: []),
			...sections.filter(
				(section) =>
					section.entries.length > 0 && !links.browsed.has(section.providerId),
			),
		],
		[links, sections, t],
	);
	const browseEntries = useMemo(
		() => browseSections.flatMap((section) => section.entries),
		[browseSections],
	);

	useEffect(() => {
		setTypeaheadDismissed(false);
		// The two menu modes are mutually exclusive: typing "@" replaces browse.
		if (mentionQuery != null) setBrowseOpen(false);
	}, [mentionQuery]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset dismissal whenever the token changes
	useEffect(() => {
		setCommandDismissed(false);
	}, [commandQuery]);
	const typeaheadSections = mentionQuery === "" ? browseSections : sections;
	const mentionOptions = useMemo(
		() =>
			typeaheadSections.flatMap((section) =>
				section.entries.map((entry) => new MentionTypeaheadOption(entry)),
			),
		[typeaheadSections],
	);

	const rankedCommands = useMemo(
		() => rankCommands(commands ?? [], commandQuery ?? ""),
		[commands, commandQuery],
	);
	const commandOptions = useMemo(
		() => rankedCommands.map((command) => new CommandTypeaheadOption(command)),
		[rankedCommands],
	);
	const commandMenuRef = useRef<{
		option: CommandTypeaheadOption | undefined;
		select: (option: CommandTypeaheadOption) => void;
	} | null>(null);
	const completingRef = useRef(false);
	const mentionMenuRef = useRef<{
		option: MentionTypeaheadOption | undefined;
		select: (option: MentionTypeaheadOption) => void;
	} | null>(null);
	useEffect(
		() =>
			editor.registerCommand<KeyboardEvent>(
				KEY_ARROW_RIGHT_COMMAND,
				(event) => {
					const menu = mentionMenuRef.current;
					if (!menu?.option?.entry.opensSubmenu) return false;
					event.preventDefault();
					menu.select(menu.option);
					return true;
				},
				COMMAND_PRIORITY_CRITICAL,
			),
		[editor],
	);
	useEffect(
		() =>
			editor.registerCommand<KeyboardEvent | null>(
				KEY_TAB_COMMAND,
				(event) => {
					const menu = commandMenuRef.current;
					if (event?.shiftKey || !menu?.option?.command.completion)
						return false;
					event?.preventDefault();
					completingRef.current = true;
					menu.select(menu.option);
					return true;
				},
				COMMAND_PRIORITY_CRITICAL,
			),
		[editor],
	);

	const selectMentionEntry = (
		entry: ComposerMentionEntry,
		nodeToReplace: LexicalNode | null,
		closeMenu: () => void,
	) => {
		if (entry.completionQuery != null) {
			const completion = entry.completionQuery;
			editor.update(() => {
				if (nodeToReplace && "setTextContent" in nodeToReplace) {
					const textNode = nodeToReplace as unknown as {
						setTextContent(text: string): void;
						select(anchor: number, focus: number): void;
					};
					const text = `@${completion}`;
					textNode.setTextContent(text);
					textNode.select(text.length, text.length);
				}
			});
			return;
		}
		editor.update(() => {
			nodeToReplace?.remove();
			closeMenu();
		});
		void entry.select(actionContextRef.current);
	};

	const releaseAttachment = (attachment: PromptInputAttachment) => {
		if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
	};

	const submit = ({ steer = false }: { steer?: boolean } = {}) => {
		if (stateRef.current.disabled || stateRef.current.pending) return;
		const editorState = editor.getEditorState();
		const { mentions, text } = editorState.read(() => ({
			mentions: $collectChips(),
			text: $readPromptText(),
		}));
		const segments = draftOf(editorState);
		const sent = stateRef.current.attachments;
		const files = sent.map((attachment) => attachment.file);
		if (!text && files.length === 0 && !stateRef.current.allowEmptySubmit) {
			return;
		}
		if (
			stateRef.current.onSubmit?.({
				text,
				files,
				mentions,
				steer,
				draft: {
					segments,
					attachments: sent,
					...(usedDictationRef.current ? { usedDictation: true } : {}),
				},
			}) === false
		)
			return;
		historyNavigationRef.current?.reset();
		usedDictationRef.current = false;
		editor.update(() => $getRoot().clear());
		setAttachments((previous) => {
			for (const attachment of previous) releaseAttachment(attachment);
			return [];
		});
		setPanel(null);
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
			if (text.trim()) usedDictationRef.current = true;
			editor.update(() => $insertTranscript(text));
			if (isFocusUnclaimed()) editor.focus();
		},
	});

	useEffect(() => {
		const unregisterText = editor.registerTextContentListener((text) =>
			setIsEmpty(text.trim().length === 0),
		);
		const unregisterEnter = editor.registerCommand<KeyboardEvent | null>(
			KEY_ENTER_COMMAND,
			(event) => {
				if (event?.isComposing || event?.keyCode === 229) return false;
				if (event?.shiftKey) {
					event.preventDefault();
					editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
					return true;
				}
				const steer = Boolean(event?.metaKey || event?.ctrlKey);
				const selection = $getSelection();
				if (
					!steer &&
					$isRangeSelection(selection) &&
					$isCodeNode(selection.anchor.getNode().getTopLevelElement())
				)
					return false;
				event?.preventDefault();
				submitRef.current({ steer });
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const historyNavigation = registerHistoryNavigation(
			editor,
			() => stateRef.current.history ?? [],
		);
		historyNavigationRef.current = historyNavigation;
		const unregisterEscape = editor.registerCommand<KeyboardEvent | null>(
			KEY_ESCAPE_COMMAND,
			(event) => {
				const { status, onStop, stopOnEscape } = stateRef.current;
				if (status === "streaming" && onStop && stopOnEscape) {
					event?.preventDefault();
					onStop();
				}
				// Rich text would blur on Escape; the composer keeps focus.
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const unregisterDrop = editor.registerCommand<DragEvent>(
			DROP_COMMAND,
			(event) => {
				const files = event.dataTransfer?.files;
				if (files && files.length > 0) {
					event.preventDefault();
					markDropHandled(event);
					addFilesRef.current(files);
					setDragging(false);
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterKeyDown = editor.registerCommand<KeyboardEvent>(
			KEY_DOWN_COMMAND,
			(event) => {
				const key = event.key.toLowerCase();
				const mod = event.metaKey || event.ctrlKey;
				pasteAsTextRef.current = event.shiftKey && mod && key === "v";
				// ⌘B and ⌘I format here; app hotkeys on the same keys must not also fire.
				if (
					mod &&
					!event.shiftKey &&
					!event.altKey &&
					(key === "b" || key === "i")
				)
					event.stopPropagation();
				return false;
			},
			COMMAND_PRIORITY_LOW,
		);
		const unregisterUnderline = editor.registerCommand(
			FORMAT_TEXT_COMMAND,
			(format) => format === "underline",
			COMMAND_PRIORITY_HIGH,
		);
		const unregisterTab = editor.registerCommand<KeyboardEvent | null>(
			KEY_TAB_COMMAND,
			(event) => {
				const selection = $getSelection();
				if (
					!$isRangeSelection(selection) ||
					!$getNearestNodeOfType(selection.anchor.getNode(), ListItemNode)
				)
					return false;
				event?.preventDefault();
				editor.dispatchCommand(
					event?.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
					undefined,
				);
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const unregisterPaste = editor.registerCommand<ClipboardEvent>(
			PASTE_COMMAND,
			(event) => {
				if (!(event instanceof ClipboardEvent)) return false;
				const files = getClipboardFiles(event.clipboardData);
				if (files.length > 0) {
					event.preventDefault();
					addFilesRef.current(files);
					return true;
				}
				const asText = pasteAsTextRef.current;
				pasteAsTextRef.current = false;
				const raw = event.clipboardData?.getData("text/plain") ?? "";
				const trimmed = raw.trim();
				const chip =
					trimmed && !asText ? chipForPasteRef.current?.(trimmed) : null;
				if (chip) {
					event.preventDefault();
					editor.update(() => $insertChipAtSelection(chip));
					return true;
				}
				const text = normalizePastedText(raw);
				if (isLargePaste(text)) {
					event.preventDefault();
					addPastedTextRef.current(text);
					return true;
				}
				const types = event.clipboardData?.types ?? [];
				if (
					!asText &&
					(types.includes("text/html") ||
						types.includes("application/x-lexical-editor"))
				) {
					const html = event.clipboardData?.getData("text/html") ?? "";
					const withTables = html ? tablesToMarkdown(html) : null;
					if (withTables === null) return false;
					event.preventDefault();
					const transfer = new DataTransfer();
					transfer.setData("text/html", withTables);
					transfer.setData("text/plain", raw);
					const selection = $getSelection();
					if (selection)
						$insertDataTransferForRichText(transfer, selection, editor);
					return true;
				}
				event.preventDefault();
				const selection = $getSelection();
				if ($isRangeSelection(selection)) selection.insertRawText(text);
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
		const $writeClipboard = (event: ClipboardEvent | KeyboardEvent | null) => {
			const selection = $getSelection();
			if (
				!(event instanceof ClipboardEvent) ||
				!event.clipboardData ||
				!selection ||
				selection.isCollapsed()
			)
				return false;
			event.preventDefault();
			setLexicalClipboardDataTransfer(event.clipboardData, $clipboardData());
			return true;
		};
		const unregisterCopy = editor.registerCommand(
			COPY_COMMAND,
			$writeClipboard,
			COMMAND_PRIORITY_LOW,
		);
		const unregisterCut = editor.registerCommand(
			CUT_COMMAND,
			(event) => {
				if (!$writeClipboard(event)) return false;
				const selection = $getSelection();
				if ($isRangeSelection(selection)) selection.removeText();
				else if ($isNodeSelection(selection))
					for (const node of selection.getNodes()) node.remove();
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
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
			historyNavigation.unregister();
			unregisterEscape();
			unregisterDrop();
			unregisterPaste();
			unregisterCopy();
			unregisterCut();
			unregisterKeyDown();
			unregisterUnderline();
			unregisterTab();
			unregisterClick();
			unregisterBackspace();
			unregisterDelete();
		};
	}, [editor]);

	const toggleBrowseMenu = () => {
		setSubmenu(null);
		setTypeaheadDismissed(true);
		setBrowseIndex(0);
		setBrowseOpen((previous) => !previous);
	};

	const selectBrowseEntry = (entry: ComposerMentionEntry) => {
		setBrowseOpen(false);
		if (entry.completionQuery != null) {
			const completion = entry.completionQuery;
			editor.focus();
			editor.update(() => {
				let selection = $getSelection();
				if (!$isRangeSelection(selection)) {
					$getRoot().selectEnd();
					selection = $getSelection();
				}
				if (!$isRangeSelection(selection)) return;
				const anchorNode = selection.anchor.getNode();
				const offset = selection.anchor.offset;
				const previousChar = $isTextNode(anchorNode)
					? anchorNode.getTextContent()[offset - 1]
					: undefined;
				const needsSpace =
					(previousChar != null && !/\s/.test(previousChar)) ||
					(!$isTextNode(anchorNode) && offset > 0);
				selection.insertText(needsSpace ? ` @${completion}` : `@${completion}`);
			});
			return;
		}
		void entry.select(actionContextRef.current);
	};

	// While dictating, Escape cancels and Enter stops or retries, never sends;
	// both win over the composer's own Escape/Enter (stopping the agent, send).
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

	// Browse-mode keyboard: the editor may not be focused, so listen globally.
	useEffect(() => {
		if (!browseOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const delta = event.key === "ArrowDown" ? 1 : -1;
				setBrowseIndex((previous) => {
					const count = browseEntries.length;
					return count === 0 ? 0 : (previous + delta + count) % count;
				});
				return;
			}
			if (event.key === "Enter" || event.key === "ArrowRight") {
				const entry = browseEntries[browseIndex];
				if (event.key === "ArrowRight" && !entry?.opensSubmenu) return;
				event.preventDefault();
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

	// Any pointer press outside the composer and its menus dismisses both
	// modes; a press on the editor itself closes browse (typing intent).
	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (target && rootRef.current?.contains(target)) {
				if (
					target instanceof Element &&
					target.closest(".prompt-input-editor")
				) {
					setBrowseOpen(false);
					setSubmenu(null);
				}
				return;
			}
			setBrowseOpen(false);
			setSubmenu(null);
			setTypeaheadDismissed(true);
			setCommandDismissed(true);
			setPanel((current) => (current?.bare ? null : current));
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, []);

	const canSend = allowEmptySubmit || !isEmpty || attachments.length > 0;

	useEffect(() => {
		if (autoFocus) focusAtEnd();
	}, [autoFocus, focusAtEnd]);

	// A chip's hover card or tooltip opens above the composer, where these
	// menus open, and would catch a click meant for the menu.
	const chipMenuOpen =
		mentionQuery !== null ||
		commandQuery !== null ||
		browseOpen ||
		submenu !== null;
	return (
		<ChipRenderProvider renderChip={chipMenuOpen ? withoutTooltip : renderChip}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; keyboard users attach via the file picker button */}
			<div
				ref={rootRef}
				className={cn(
					"relative flex flex-col rounded-2xl bg-card ring-1 ring-border transition-shadow focus-within:ring-ring/40",
				)}
				onDragOver={(event) => {
					if (dropZone == null && event.dataTransfer.types.includes("Files")) {
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
						dropZone == null &&
						!isDropHandled(event.nativeEvent) &&
						event.dataTransfer.files.length > 0
					) {
						event.preventDefault();
						markDropHandled(event.nativeEvent);
						addFiles(event.dataTransfer.files);
					}
					setDragging(false);
				}}
			>
				<div
					ref={setMenuSlot}
					className="pointer-events-none absolute inset-x-0 bottom-full pb-2 [&>*]:pointer-events-auto"
				>
					{browseOpen && (
						<MentionMenu
							sections={browseSections}
							selectedIndex={browseIndex}
							onHighlight={setBrowseIndex}
							onSelect={selectBrowseEntry}
						/>
					)}
					{submenu && (
						<MentionSubmenu
							key={submenu.id}
							provider={submenu}
							onSelect={(entry) => {
								setSubmenu(null);
								editor.focus();
								void entry.select(actionContextRef.current);
							}}
							onBack={() => {
								const row = browseEntries.findIndex(
									(entry) => entry.id === `browse:${submenu.id}`,
								);
								setSubmenu(null);
								setBrowseIndex(Math.max(row, 0));
								setBrowseOpen(true);
							}}
							onClose={() => {
								setSubmenu(null);
								editor.focus();
							}}
						/>
					)}
				</div>
				{panel?.bare ? (
					<div
						role="dialog"
						aria-label={panel.title}
						className="absolute inset-x-0 bottom-full z-30 pb-2"
					>
						{panel.render({ close: closePanel })}
					</div>
				) : (
					panel && (
						<ComposerPanel title={panel.title} onClose={() => setPanel(null)}>
							{panel.render({ close: closePanel })}
						</ComposerPanel>
					)
				)}
				<div
					aria-hidden={!dragging}
					className={cn(
						"pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/10 transition-opacity duration-150 motion-reduce:transition-none",
						dragging ? "opacity-100" : "opacity-0",
					)}
				>
					<span
						className={cn(
							"inline-flex items-center rounded-md border border-border/50 bg-secondary px-3 py-1 text-sm text-foreground shadow transition-transform duration-150 motion-reduce:transition-none",
							dragging ? "scale-100" : "scale-95",
						)}
					>
						<Trans>Drop to attach</Trans>
					</span>
				</div>
				<AttachmentPills
					attachments={attachments}
					onAttachmentClick={onAttachmentClick}
					onReveal={
						localFiles
							? (attachment) =>
									attachment.sourcePath &&
									localFiles.reveal(attachment.sourcePath)
							: undefined
					}
					onPreviewError={(id) =>
						setAttachments((previous) =>
							previous.map((entry) => {
								if (entry.id !== id || !entry.previewUrl) return entry;
								URL.revokeObjectURL(entry.previewUrl);
								return { ...entry, previewUrl: undefined };
							}),
						)
					}
					onRemove={(id) =>
						setAttachments((previous) =>
							previous.filter((entry) => {
								if (entry.id !== id) return true;
								releaseAttachment(entry);
								return false;
							}),
						)
					}
				/>
				<div className="relative px-4 pt-3.5 pb-1">
					<RichTextPlugin
						contentEditable={
							<ContentEditable
								className="prompt-input-editor"
								spellCheck={false}
							/>
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
					<MarkdownShortcutPlugin transformers={TYPED_SHORTCUTS} />
					<CodeFencePlugin />
					<LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
						onQueryChange={setMentionQuery}
						onSelectOption={(option, nodeToReplace, closeMenu) =>
							selectMentionEntry(option.entry, nodeToReplace, closeMenu)
						}
						options={mentionOptions}
						triggerFn={(text) => ($isInCode() ? null : matchTrigger(text))}
						commandPriority={COMMAND_PRIORITY_HIGH}
						onClose={() => {
							mentionMenuRef.current = null;
							setMentionQuery(null);
						}}
						menuRenderFn={(
							anchorElementRef,
							{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
						) => {
							const shown = Boolean(
								anchorElementRef.current && menuSlot && !typeaheadDismissed,
							);
							mentionMenuRef.current = shown
								? {
										option:
											selectedIndex === null
												? undefined
												: mentionOptions[selectedIndex],
										select: selectOptionAndCleanUp,
									}
								: null;
							return shown && menuSlot
								? createPortal(
										<MentionMenu
											sections={typeaheadSections}
											selectedIndex={selectedIndex}
											onHighlight={setHighlightedIndex}
											onSelect={(entry) => {
												const option = mentionOptions.find(
													(candidate) => candidate.entry.id === entry.id,
												);
												if (option) selectOptionAndCleanUp(option);
											}}
										/>,
										menuSlot,
									)
								: null;
						}}
					/>
					<LexicalTypeaheadMenuPlugin<CommandTypeaheadOption>
						onQueryChange={setCommandQuery}
						onClose={() => {
							commandMenuRef.current = null;
						}}
						onSelectOption={(option, nodeToReplace, closeMenu) => {
							editor.update(() => {
								nodeToReplace?.remove();
								closeMenu();
							});
							const completion = completingRef.current
								? option.command.completion
								: undefined;
							completingRef.current = false;
							if (completion) actionContextRef.current.insertChip(completion);
							else void option.command.onSelect(actionContextRef.current);
						}}
						options={commandOptions}
						triggerFn={(text) => ($isInCode() ? null : matchCommandToken(text))}
						commandPriority={COMMAND_PRIORITY_HIGH}
						menuRenderFn={(
							anchorElementRef,
							{ selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
						) => {
							const shown =
								anchorElementRef.current &&
								menuSlot &&
								!commandDismissed &&
								rankedCommands.length > 0;
							commandMenuRef.current = shown
								? {
										option:
											selectedIndex === null
												? undefined
												: commandOptions[selectedIndex],
										select: selectOptionAndCleanUp,
									}
								: null;
							return shown
								? createPortal(
										<CommandMenu
											commands={rankedCommands}
											selectedIndex={selectedIndex}
											onHighlight={setHighlightedIndex}
											onSelect={(command) => {
												const option = commandOptions.find(
													(candidate) => candidate.command.id === command.id,
												);
												if (option) selectOptionAndCleanUp(option);
											}}
										/>,
										menuSlot,
									)
								: null;
						}}
					/>
				</div>
				<div
					className="flex min-h-12 items-center gap-2 px-3 pb-2.5"
					data-composer-footer
				>
					<ContextButton
						onClick={toggleBrowseMenu}
						disabled={dictationSession.status !== "idle"}
					/>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						className="hidden"
						onChange={(event) => {
							if (event.target.files) addFiles(event.target.files);
							event.target.value = "";
						}}
					/>
					{dictationSession.status === "error" ? (
						<>
							<span className="min-w-0 flex-1 truncate pl-1 text-sm text-muted-foreground">
								{dictationSession.error?.message}
							</span>
							<button
								type="button"
								aria-label={t({
									message: "Retry dictation",
								})}
								onClick={() => void dictationSession.retry()}
								className={FILLED_FOOTER_BUTTON_CLASS}
							>
								<RefreshCcwIcon className="size-3.5" />
							</button>
							<button
								type="button"
								aria-label={t({
									message: "Discard recording",
								})}
								onClick={dictationSession.cancel}
								className={GHOST_FOOTER_BUTTON_CLASS}
							>
								<XIcon className="size-3.5" />
							</button>
							<button
								type="button"
								aria-label={t({
									message: "Send message",
								})}
								disabled
								className={INACTIVE_SEND_BUTTON_CLASS}
							>
								<ArrowUpIcon className="size-4" />
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
								aria-label={t({
									message: "Stop dictation",
								})}
								disabled={dictationSession.status === "transcribing"}
								onClick={() => void dictationSession.finish()}
								className={cn(
									FILLED_FOOTER_BUTTON_CLASS,
									"disabled:cursor-default disabled:opacity-50",
								)}
							>
								<SquareIcon className="size-3 fill-current" />
							</button>
							<button
								type="button"
								aria-label={t({
									message: "Send message",
								})}
								disabled
								className={INACTIVE_SEND_BUTTON_CLASS}
							>
								<ArrowUpIcon className="size-4" />
							</button>
						</>
					) : (
						<>
							{toolbar}
							<div className="flex-1" />
							{toolbarEnd}
							{dictation && (
								<button
									type="button"
									aria-label={t({
										message: "Dictate",
									})}
									onClick={async () => {
										setBrowseOpen(false);
										await dictationSession.start();
										editor.focus();
									}}
									className={GHOST_FOOTER_BUTTON_CLASS}
								>
									<MicIcon className="size-4" />
								</button>
							)}
							{status === "streaming" && !canSend ? (
								<button
									type="button"
									aria-label={t({
										message: "Stop response",
									})}
									onClick={onStop}
									className={FILLED_FOOTER_BUTTON_CLASS}
								>
									<SquareIcon className="size-3 fill-current" />
								</button>
							) : (
								<button
									type="button"
									aria-label={
										status === "streaming"
											? t({ message: "Queue message" })
											: t({ message: "Send message" })
									}
									title={
										status === "streaming"
											? t({ message: "Queue; ⌘↩ to steer the running turn" })
											: undefined
									}
									disabled={!canSend || disabled || pending}
									onClick={() => submit()}
									className={
										canSend && !disabled && !pending
											? cn(
													FOOTER_BUTTON_CLASS,
													"cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90",
												)
											: INACTIVE_SEND_BUTTON_CLASS
									}
								>
									{pending ? (
										<LoaderCircleIcon className="size-4 animate-spin" />
									) : (
										<ArrowUpIcon className="size-4" />
									)}
								</button>
							)}
						</>
					)}
				</div>
			</div>
		</ChipRenderProvider>
	);
}
