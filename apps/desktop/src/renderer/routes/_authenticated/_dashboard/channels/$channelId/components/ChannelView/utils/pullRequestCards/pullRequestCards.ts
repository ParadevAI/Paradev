import type { ToolCall } from "@superset/chat/protocol";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { toolCommand, toolOutput } from "../toolText";

const PR_COMMANDS =
	/\bgh\s+pr\s+(create|merge|ready|view)\b|\bsuperset\s+sessions\s+read\b/;
const PR_URL = /https:\/\/(?:www\.)?github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/g;

/**
 * The pull requests a tool call opened or an agent reported, by the GitHub
 * URLs in its output. Only commands that make or relay pull requests count,
 * so a log that mentions one in passing does not earn a card.
 */
export function pullRequestCardsFromTool(tool: ToolCall): TranscriptCardRef[] {
	if (!PR_COMMANDS.test(toolCommand(tool))) return [];
	const cards: TranscriptCardRef[] = [];
	const seen = new Set<string>();
	for (const match of toolOutput(tool).matchAll(PR_URL)) {
		const ref = pullRequestRefFromUrl(match[0]);
		if (!ref) continue;
		const key = `pr:${ref.repoFullName.toLowerCase()}#${ref.number}`;
		if (seen.has(key)) continue;
		seen.add(key);
		cards.push({
			kind: "pull_request",
			key,
			url: match[0],
			repoFullName: ref.repoFullName,
			number: ref.number,
		});
	}
	return cards;
}
