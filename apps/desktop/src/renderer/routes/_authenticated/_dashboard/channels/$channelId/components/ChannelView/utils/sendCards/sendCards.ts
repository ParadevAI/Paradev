import type { ToolCall } from "@superset/chat/protocol";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { quotedOption, toolCommand, uuidOption, wordOption } from "../toolText";

const SEND = /\bsuperset\s+sessions\s+send\b/;
const TEXT_MAX = 4000;

/** What the coordinator told an agent's chat with `superset sessions send`. */
export function sendCardsFromTool(tool: ToolCall): TranscriptCardRef[] {
	const command = toolCommand(tool);
	if (!SEND.test(command)) return [];
	const workspaceId = uuidOption(command, "workspace");
	const sessionId = wordOption(command, "session");
	const text = quotedOption(command, "prompt")?.trim();
	if (!workspaceId || !sessionId || !text || text.startsWith("$(")) return [];
	return [
		{
			kind: "sent",
			key: `sent:${tool.id}`,
			workspaceId,
			sessionId,
			text: text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text,
		},
	];
}
