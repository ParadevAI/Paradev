import { createContext, useContext } from "react";
import type { PluginMentionOption } from "renderer/components/PluginMention";

const TranscriptPluginsContext = createContext<readonly PluginMentionOption[]>(
	[],
);

export const TranscriptPluginsProvider = TranscriptPluginsContext.Provider;

export function useTranscriptPlugins(): readonly PluginMentionOption[] {
	return useContext(TranscriptPluginsContext);
}
