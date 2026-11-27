import type {
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputLocalFiles,
	PromptInputProps,
} from "@superset/chat-ui/PromptInput";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { useCallback, useMemo } from "react";
import { track } from "renderer/lib/analytics";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useSettings } from "renderer/stores/settings";
import { useAttachmentPreview } from "./hooks/useAttachmentPreview";
import { useComposerDictation } from "./hooks/useComposerDictation";
import { usePageMentionProvider } from "./hooks/usePageMentionProvider";
import { usePluginMentionProvider } from "./hooks/usePluginMentionProvider";
import { useTrackerMentionProvider } from "./hooks/useTrackerMentionProvider";

const NO_COMMANDS: PromptInputCommand[] = [];
const NO_PROVIDERS: ComposerMentionProvider[] = [];
const LOCAL_FILES: PromptInputLocalFiles = {
	pathOf: (file) => {
		try {
			return window.webUtils.getPathForFile(file) || undefined;
		} catch {
			return undefined;
		}
	},
	reveal: (path) => {
		void electronTrpcClient.external.openInFinder.mutate(path);
	},
};

export type AgentComposerProps = Omit<
	PromptInputProps,
	"mentionProviders" | "commands" | "onAttachmentClick" | "localFiles"
> & {
	mentionProviders?: ComposerMentionProvider[];
	commands?: PromptInputCommand[];
};

export function AgentComposer({
	commands = NO_COMMANDS,
	mentionProviders = NO_PROVIDERS,
	dictation,
	enterBehavior,
	onSubmit,
	...props
}: AgentComposerProps) {
	const composerEnterBehavior = useSettings(
		(state) => state.composerEnterBehavior,
	);
	const pluginProvider = usePluginMentionProvider();
	const pageProvider = usePageMentionProvider();
	const trackerProvider = useTrackerMentionProvider();
	const composerDictation = useComposerDictation();
	const attachmentPreview = useAttachmentPreview();
	const providers = useMemo(
		() => [
			pluginProvider,
			pageProvider,
			...(trackerProvider ? [trackerProvider] : []),
			...mentionProviders,
		],
		[pluginProvider, pageProvider, trackerProvider, mentionProviders],
	);
	const submit = useCallback<NonNullable<PromptInputProps["onSubmit"]>>(
		(payload) => {
			const result = onSubmit?.(payload);
			if (result !== false)
				track("composer_submitted", {
					used_dictation: payload.draft.usedDictation === true,
					attachments: payload.files.length,
					mentions: payload.mentions.length,
					quotes: payload.quotes.length,
				});
			return result;
		},
		[onSubmit],
	);
	return (
		<>
			<PromptInput
				{...props}
				onSubmit={submit}
				commands={commands}
				dictation={dictation ?? composerDictation}
				enterBehavior={enterBehavior ?? composerEnterBehavior}
				mentionProviders={providers}
				onAttachmentClick={attachmentPreview.onAttachmentClick}
				localFiles={LOCAL_FILES}
			/>
			{attachmentPreview.overlay}
		</>
	);
}
