import type { ReactNode, Ref } from "react";

export type ComposerChip = {
	label: string;
	serialized: string;
	brandColor?: string;
	// Icon as a URL string so chips stay serializable data.
	iconUrl?: string;
	description?: string;
	data?: unknown;
};

export type ComposerActionContext = {
	insertChip(chip: ComposerChip): void;
	attachFiles(): void;
	openPanel(panel: ComposerPanelContent): void;
	query: string;
};

export type ComposerPanelControls = {
	close(): void;
};

export type ComposerPanelContent = {
	title: string;
	render: (controls: ComposerPanelControls) => ReactNode;
	// Drawn without the titled frame and closed by a press outside the
	// composer; the content owns its keyboard, including Escape.
	bare?: boolean;
};

export type ComposerMentionEntry = {
	id: string;
	label: string;
	description?: string;
	icon?: ReactNode;
	keywords?: string[];
	// Drawn in place of icon, label and description; label still drives matching.
	row?: ReactNode;
	// When set, selecting rewrites the query to this value and keeps the menu
	// open (directory drilling); select() is not called.
	completionQuery?: string;
	/** Opens a provider's submenu instead of inserting; drawn with a chevron. */
	opensSubmenu?: boolean;
	select(ctx: ComposerActionContext): void | Promise<void>;
};

export type ComposerMentionFilter = { id: string; label: string };

export type ComposerMentionSearchOptions = {
	/** Ids of the provider's filters that are switched on. */
	filters: ReadonlySet<string>;
};

/**
 * A provider that can be browsed on its own: a row in the top-level menu that
 * opens a submenu with its own search box and filters.
 */
export type ComposerMentionBrowse = {
	label: string;
	placeholder: string;
	filters?: ComposerMentionFilter[];
};

export type ComposerMentionSource =
	| {
			kind: "static";
			load(
				signal: AbortSignal,
			): ComposerMentionEntry[] | Promise<ComposerMentionEntry[]>;
	  }
	| {
			kind: "search";
			search(
				query: string,
				signal: AbortSignal,
				options?: ComposerMentionSearchOptions,
			): Promise<ComposerMentionEntry[]>;
			emptyState: string;
			loadingState?: string;
	  };

export type ComposerMentionProvider = {
	id: string;
	title: string;
	priority: number;
	// The character that opens this provider's menu; "@" when unset.
	trigger?: string;
	icon?: ReactNode;
	/** When set, the top-level menu shows this provider as a submenu row. */
	browse?: ComposerMentionBrowse;
	source: ComposerMentionSource;
};

export type PromptInputCommand = {
	id: string;
	title: string;
	hint?: string;
	description?: string;
	icon?: ReactNode;
	rightIcon?: ReactNode;
	group?: string;
	searchAliases?: string[];
	// Tab inserts this chip in place of the typed command instead of selecting.
	completion?: ComposerChip;
	onSelect(ctx: ComposerActionContext): void | Promise<void>;
};

export type PromptInputAttachment = {
	id: string;
	file: File;
	// Object URL for image attachments; owned and revoked by the composer.
	previewUrl?: string;
	// A large paste held as a text file; "Show in text field" puts it back.
	pastedText?: string;
	// Where the file lives on disk, when it came from there.
	sourcePath?: string;
};

/** The host's view of the filesystem; the composer itself has none. */
export type PromptInputLocalFiles = {
	pathOf(file: File): string | undefined;
	reveal(path: string): void;
};

export type ComposerDraftSegment =
	| { type: "text"; text: string }
	| { type: "chip"; chip: ComposerChip };

/** Everything the editor holds, losslessly: what a host persists or hands back after a failed send. */
export type ComposerDraft = {
	segments: ComposerDraftSegment[];
	attachments: PromptInputAttachment[];
	// Dictation put text into this draft; for analytics.
	usedDictation?: boolean;
};

export type PromptInputSubmitPayload = {
	text: string;
	files: File[];
	mentions: ComposerChip[];
	steer: boolean;
	// What was sent, for `restoreDraft` when the send fails later.
	draft: ComposerDraft;
};

export type PromptInputDictationError = {
	message: string;
	canRetry: boolean;
};

export type PromptInputDictation = {
	// Reject with a DictationError to choose the message and whether retry
	// is offered; any other rejection is retryable. The signal aborts when
	// the user cancels or the composer unmounts.
	transcribe(
		audio: Blob,
		options: { signal: AbortSignal },
	): Promise<string> | string;
	// Surfaced for app-owned toasts; retryable failures also keep the
	// recording and show retry controls in the composer row.
	onError?(error: PromptInputDictationError): void;
	// Recording stops and transcribes on its own at this length.
	maxSeconds?: number;
	audioBitsPerSecond?: number;
};

export type PromptInputHandle = {
	isEmpty(): boolean;
	addFiles(files: File[]): void;
	/** Appends a draft to whatever is in the editor, attachments included. */
	restoreDraft(draft: ComposerDraft): void;
	insertChip(chip: ComposerChip): void;
	openFileDialog(): void;
	openPanel(panel: ComposerPanelContent): void;
	focus(): void;
	recallPreviousPrompt(): void;
	blur(): void;
};

export type PromptInputProps = {
	ref?: Ref<PromptInputHandle>;
	placeholder?: string;
	mentionProviders: ComposerMentionProvider[];
	commands: PromptInputCommand[];
	// While streaming, a submit queues behind the running turn and ⌘↩ steers it.
	status?: "ready" | "streaming";
	// Enables the mic button; the app owns speech-to-text.
	dictation?: PromptInputDictation;
	toolbar?: ReactNode;
	toolbarEnd?: ReactNode;
	// Read once on mount; the composer owns the editor state from then on.
	draft?: ComposerDraft;
	onDraftChange?: (draft: ComposerDraft) => void;
	/** Returning `false` keeps the draft in the editor. */
	onSubmit?: (
		payload: PromptInputSubmitPayload,
	) => false | void | Promise<void>;
	onStop?: () => void;
	stopOnEscape?: boolean;
	allowEmptySubmit?: boolean;
	disabled?: boolean;
	// The host is still handling the last submit: the button spins and nothing sends.
	pending?: boolean;
	autoFocus?: boolean;
	/** The clicked pill, and every pending attachment in order. */
	onAttachmentClick?: (
		attachment: PromptInputAttachment,
		attachments: readonly PromptInputAttachment[],
	) => void;
	/** A chip for pasted plain text, such as a link; null keeps the text. */
	chipForPaste?: (text: string) => ComposerChip | null;
	/**
	 * Wraps a chip as the composer draws it, for example in a hover card.
	 * `rendered` is the chip without its tooltip; null keeps the plain chip.
	 */
	renderChip?: (chip: ComposerChip, rendered: ReactNode) => ReactNode | null;
	localFiles?: PromptInputLocalFiles;
	history?: string[];
	className?: string;
};
