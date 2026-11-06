import type { ToolCall } from "@superset/chat/protocol";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { balancedObject, toolCommand, toolOutput } from "../toolText";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREATE_COMMAND = /\bsuperset\s+(workspaces|ws)\s+create\b/;
const WORKSPACE_KEY = /"workspace"\s*:\s*\{/g;

/**
 * The workspaces a tool call created, read from the CLI's JSON output. The
 * coordinator runs `superset workspaces create --json`, whose output carries
 * the new workspace under `"workspace"`; a listing never does.
 */
export function workspaceCardsFromTool(tool: ToolCall): TranscriptCardRef[] {
	if (!CREATE_COMMAND.test(toolCommand(tool))) return [];
	const cards: TranscriptCardRef[] = [];
	const output = toolOutput(tool);
	for (const match of output.matchAll(WORKSPACE_KEY)) {
		const start = match.index + match[0].length - 1;
		const object = balancedObject(output, start);
		const workspace = object ? parseWorkspace(object) : null;
		if (workspace && !cards.some((card) => card.key === workspace.key)) {
			cards.push(workspace);
		}
	}
	return cards;
}

function parseWorkspace(json: string): TranscriptCardRef | null {
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== "object" || parsed === null) return null;
		const record = parsed as Record<string, unknown>;
		const id = typeof record.id === "string" ? record.id : null;
		if (!id || !UUID.test(id)) return null;
		return {
			kind: "workspace",
			key: `workspace:${id}`,
			workspaceId: id,
			name: typeof record.name === "string" ? record.name : null,
			branch: typeof record.branch === "string" ? record.branch : null,
		};
	} catch {
		return null;
	}
}
