import { requireNativeModule, requireNativeView } from "expo";
import { forwardRef, type Ref, useImperativeHandle, useRef } from "react";
import type {
	ComposerAttachment,
	ComposerBackdrop,
	ComposerComponent,
	ComposerHandle,
	ComposerMenuOption,
	ComposerModeOption,
	ComposerPastedItem,
	ComposerProps,
	ComposerQuickKey,
	ComposerQuickKeysAction,
	ComposerSessionTab,
	ComposerSessionTabLabels,
	ComposerSlashCommand,
	FileThumbnail,
	PresentImage,
} from "./Composer.types";

/** The imperative surface the native view exposes through its ref. */
interface NativeComposerRef {
	clear: () => void;
	appendDraft: (text: string) => void;
	focus: () => void;
	blur: () => void;
}

interface NativeComposerViewProps {
	ref?: Ref<NativeComposerRef>;
	placeholder?: string;
	initialDraft?: string;
	backdrop?: ComposerBackdrop;
	attachments?: ComposerAttachment[];
	selectedModel?: ComposerMenuOption;
	launchOptions?: ComposerMenuOption[];
	modeOptions?: ComposerModeOption[];
	selectedModeId?: string | null;
	canStop?: boolean;
	headerChips?: ComposerMenuOption[];
	quickKeys?: ComposerQuickKey[];
	sessionTabs?: ComposerSessionTab[];
	sessionTabLabels?: ComposerSessionTabLabels;
	/** Null, never undefined — see the pass-through below. */
	quickKeysAction?: ComposerQuickKeysAction | null;
	slashCommands?: ComposerSlashCommand[];
	showAttachments?: boolean;
	autocapitalization?: "sentences" | "never";
	compactEditor?: boolean;
	isSending?: boolean;
	onSubmit?: (event: { nativeEvent: { text: string } }) => void;
	onAttachmentsPress?: () => void;
	onDictationError?: (event: { nativeEvent: { message: string } }) => void;
	onModelPress?: () => void;
	onLaunchOptionPress?: (event: { nativeEvent: { id: string } }) => void;
	onModeSelect?: (event: { nativeEvent: { id: string } }) => void;
	onStop?: () => void;
	onChipPress?: (event: { nativeEvent: { id: string } }) => void;
	onQuickKeyPress?: (event: { nativeEvent: { id: string } }) => void;
	onSessionTabPress?: (event: { nativeEvent: { id: string } }) => void;
	onSessionTabClose?: (event: { nativeEvent: { id: string } }) => void;
	onSessionTabRename?: (event: { nativeEvent: { id: string } }) => void;
	onSessionTabCopyId?: (event: { nativeEvent: { id: string } }) => void;
	onNewSessionPress?: () => void;
	onAllSessionsPress?: () => void;
	onQuickKeysActionPress?: () => void;
	onHeightChange?: (event: { nativeEvent: { height: number } }) => void;
	onPaste?: (event: { nativeEvent: { items: ComposerPastedItem[] } }) => void;
	onDraftChange?: (event: { nativeEvent: { text: string } }) => void;
	onRemoveAttachment?: (event: { nativeEvent: { id: string } }) => void;
	onAttachmentPress?: (event: { nativeEvent: { id: string } }) => void;
	onExpandedChange?: (event: { nativeEvent: { expanded: boolean } }) => void;
}

const NativeComposerView =
	requireNativeView<NativeComposerViewProps>("Composer");

const NativeComposerModule = requireNativeModule<{
	presentImage: (uri: string) => Promise<void>;
	fileThumbnail: (uri: string, side: number) => Promise<string | null>;
}>("Composer");

export const presentImage: PresentImage = (uri) =>
	NativeComposerModule.presentImage(uri);

export const fileThumbnail: FileThumbnail = (uri, side) =>
	NativeComposerModule.fileThumbnail(uri, side);

export const Composer: ComposerComponent = forwardRef<
	ComposerHandle,
	ComposerProps
>(function Composer(
	{
		placeholder = "",
		initialDraft = "",
		backdrop = "dim",
		attachments,
		selectedModel,
		launchOptions,
		modeOptions,
		selectedModeId,
		canStop = false,
		headerChips,
		quickKeys,
		sessionTabs,
		sessionTabLabels,
		quickKeysAction,
		slashCommands,
		showAttachments = true,
		autocapitalization = "sentences",
		compactEditor = false,
		isSending = false,
		onSubmit,
		onAttachmentsPress,
		onDictationError,
		onModelPress,
		onLaunchOptionPress,
		onModeSelect,
		onStop,
		onChipPress,
		onQuickKeyPress,
		onSessionTabPress,
		onSessionTabClose,
		onSessionTabRename,
		onSessionTabCopyId,
		onNewSessionPress,
		onAllSessionsPress,
		onQuickKeysActionPress,
		onHeightChange,
		onPaste,
		onDraftChange,
		onRemoveAttachment,
		onAttachmentPress,
		onExpandedChange,
	},
	ref,
) {
	const nativeRef = useRef<NativeComposerRef>(null);

	useImperativeHandle(ref, () => ({
		clear: () => nativeRef.current?.clear(),
		appendDraft: (text: string) => nativeRef.current?.appendDraft(text),
		focus: () => nativeRef.current?.focus(),
		blur: () => nativeRef.current?.blur(),
	}));

	return (
		<NativeComposerView
			ref={nativeRef}
			placeholder={placeholder}
			initialDraft={initialDraft}
			backdrop={backdrop}
			attachments={attachments}
			selectedModel={selectedModel}
			launchOptions={launchOptions}
			modeOptions={modeOptions ?? []}
			selectedModeId={selectedModeId ?? null}
			canStop={canStop}
			headerChips={headerChips}
			quickKeys={quickKeys}
			sessionTabs={sessionTabs}
			sessionTabLabels={sessionTabLabels}
			// Null rather than undefined: React Native drops undefined props
			// before they reach the view, so the native setter is never called
			// and a chip that has gone away stays on screen.
			quickKeysAction={quickKeysAction ?? null}
			slashCommands={slashCommands}
			showAttachments={showAttachments}
			autocapitalization={autocapitalization}
			compactEditor={compactEditor}
			isSending={isSending}
			onSubmit={(event) => onSubmit?.(event.nativeEvent.text)}
			onAttachmentsPress={onAttachmentsPress}
			onDictationError={(event) =>
				onDictationError?.(event.nativeEvent.message)
			}
			onModelPress={onModelPress}
			onLaunchOptionPress={(event) =>
				onLaunchOptionPress?.(event.nativeEvent.id)
			}
			onModeSelect={(event) => onModeSelect?.(event.nativeEvent.id)}
			onStop={() => onStop?.()}
			onChipPress={(event) => onChipPress?.(event.nativeEvent.id)}
			onQuickKeyPress={(event) => onQuickKeyPress?.(event.nativeEvent.id)}
			onSessionTabPress={(event) => onSessionTabPress?.(event.nativeEvent.id)}
			onSessionTabClose={(event) => onSessionTabClose?.(event.nativeEvent.id)}
			onSessionTabRename={(event) => onSessionTabRename?.(event.nativeEvent.id)}
			onSessionTabCopyId={(event) => onSessionTabCopyId?.(event.nativeEvent.id)}
			onNewSessionPress={onNewSessionPress}
			onAllSessionsPress={onAllSessionsPress}
			onQuickKeysActionPress={onQuickKeysActionPress}
			onHeightChange={(event) => onHeightChange?.(event.nativeEvent.height)}
			onPaste={(event) => onPaste?.(event.nativeEvent.items)}
			onDraftChange={(event) => onDraftChange?.(event.nativeEvent.text)}
			onRemoveAttachment={(event) => onRemoveAttachment?.(event.nativeEvent.id)}
			onAttachmentPress={(event) => onAttachmentPress?.(event.nativeEvent.id)}
			onExpandedChange={(event) =>
				onExpandedChange?.(event.nativeEvent.expanded)
			}
		/>
	);
});
