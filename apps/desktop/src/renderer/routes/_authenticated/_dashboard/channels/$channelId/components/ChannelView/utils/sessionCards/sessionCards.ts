import type { ToolCall } from "@superset/chat/protocol";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import {
	firstLine,
	quotedOption,
	toolCommand,
	toolOutput,
	uuidOption,
	wordOption,
} from "../toolText";

const CREATE_SESSION = /\bsuperset\s+sessions\s+create\b/;
const SESSION_ID = /"sessionId"\s*:\s*"([^"]+)"/;
const LABEL = /"label"\s*:\s*"([^"]+)"/;
const STARTED = /Started (\S+) chat session (\S+) in workspace (\S+)/;
const PROMPT_MAX = 160;
const TEXT_MAX = 4000;

/**
 * The chat session a tool call started in an agent's workspace, from the
 * CLI's `superset sessions create` output, with the prompt it was given.
 */
export function sessionCardsFromTool(tool: ToolCall): TranscriptCardRef[] {
	const command = toolCommand(tool);
	if (!CREATE_SESSION.test(command)) return [];
	const output = toolOutput(tool);
	const started = STARTED.exec(output);
	const sessionId = SESSION_ID.exec(output)?.[1] ?? started?.[2] ?? null;
	const workspaceId = uuidOption(command, "workspace") ?? started?.[3] ?? null;
	if (!sessionId || !workspaceId) return [];
	const prompt = spokenPrompt(quotedOption(command, "prompt"));
	return [
		{
			kind: "session",
			key: `session:${sessionId}`,
			workspaceId,
			sessionId,
			agent:
				LABEL.exec(output)?.[1] ?? started?.[1] ?? wordOption(command, "agent"),
			prompt: prompt ? firstLine(prompt, PROMPT_MAX) : null,
			text: prompt
				? prompt.length > TEXT_MAX
					? `${prompt.slice(0, TEXT_MAX - 1)}…`
					: prompt.trim()
				: null,
		},
	];
}

/** The prompt as typed; a command substitution says nothing about what the agent was told. */
function spokenPrompt(prompt: string | null): string | null {
	return prompt === null || prompt.trimStart().startsWith("$(") ? null : prompt;
}
