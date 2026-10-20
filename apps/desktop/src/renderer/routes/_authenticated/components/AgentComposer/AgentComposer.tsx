import type {
	ComposerMentionProvider,
	PromptInputCommand,
	PromptInputProps,
} from "@superset/chat-ui/PromptInput";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { useMemo } from "react";
import { useComposerDictation } from "./hooks/useComposerDictation";
import { usePluginMentionProvider } from "./hooks/usePluginMentionProvider";

const NO_COMMANDS: PromptInputCommand[] = [];
const NO_PROVIDERS: ComposerMentionProvider[] = [];

export type AgentComposerProps = Omit<
	PromptInputProps,
	"mentionProviders" | "commands" | "findChips"
> & {
	mentionProviders?: ComposerMentionProvider[];
	commands?: PromptInputCommand[];
};

export function AgentComposer({
	commands = NO_COMMANDS,
	mentionProviders = NO_PROVIDERS,
	dictation,
	...props
}: AgentComposerProps) {
	const { provider: pluginProvider, findChips } = usePluginMentionProvider();
	const composerDictation = useComposerDictation();
	const providers = useMemo(
		() => [pluginProvider, ...mentionProviders],
		[pluginProvider, mentionProviders],
	);
	return (
		<PromptInput
			{...props}
			commands={commands}
			dictation={dictation ?? composerDictation}
			findChips={findChips}
			mentionProviders={providers}
		/>
	);
}
