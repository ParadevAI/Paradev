import { buildChatSessionHandoffPrompt } from "@superset/shared/session-handoff";

export function handoffPromptFor(
	transcript: string,
	sourceAgentLabel: string,
): string | null {
	if (!transcript.trim()) return null;
	return buildChatSessionHandoffPrompt({ transcript, sourceAgentLabel });
}
