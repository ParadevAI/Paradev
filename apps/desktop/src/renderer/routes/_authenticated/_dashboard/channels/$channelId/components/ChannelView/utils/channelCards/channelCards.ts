import type { AgentMessage, ToolCall } from "@superset/chat/protocol";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { decisionCardsFromMessage } from "../../../../utils/decisionCards";
import { pullRequestCardsFromTool } from "../pullRequestCards";
import { reportCardsFromTool } from "../reportCards";
import { sendCardsFromTool } from "../sendCards";
import { sessionCardsFromTool } from "../sessionCards";
import { workspaceCardsFromTool } from "../workspaceCards";

const CARD_COMMANDS =
	/\bsuperset\s+(workspaces|ws|sessions)\s+(create|read|send)\b|\bgh\s+pr\s+(create|merge|ready|view)\b/;

/** Whether a tool call's command can earn a card, so its body is worth fetching. */
export function channelWantsBody(tool: ToolCall): boolean {
	return CARD_COMMANDS.test(tool.title);
}

/** Everything a coordinator's tool call made or relayed that the channel draws as a card. */
export function channelCardsFromTool(tool: ToolCall): TranscriptCardRef[] {
	return [
		...workspaceCardsFromTool(tool),
		...sessionCardsFromTool(tool),
		...pullRequestCardsFromTool(tool),
		...sendCardsFromTool(tool),
		...reportCardsFromTool(tool),
	];
}

/** What the coordinator's newest reply asks the person to decide. */
export function channelCardsFromMessage(
	message: AgentMessage,
): TranscriptCardRef[] {
	return decisionCardsFromMessage(message);
}
