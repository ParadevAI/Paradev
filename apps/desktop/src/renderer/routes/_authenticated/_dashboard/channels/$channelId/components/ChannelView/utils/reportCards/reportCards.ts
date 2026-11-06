import type { ToolCall } from "@superset/chat/protocol";
import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { toolCommand, toolOutput, uuidOption, wordOption } from "../toolText";

const READ_SESSION = /\bsuperset\s+sessions\s+read\b/;
const AGENT_TEXT =
	/"kind"\s*:\s*"agent_message"\s*,\s*"text"\s*:\s*("(?:[^"\\]|\\.)*")/g;
const AGENT_LINE = "[agent] ";
const OTHER_LINE =
	/^(\[(user|tool:|turn|session|reasoning|item:)|Older events:|```)/;
const TEXT_MAX = 1200;

/**
 * The agent chat the coordinator checked on with `superset sessions read`,
 * with the newest agent message its output shows, in either the human or
 * the JSON format. The card asks the host for the message itself, so a
 * truncated output still earns one.
 */
export function reportCardsFromTool(tool: ToolCall): TranscriptCardRef[] {
	const command = toolCommand(tool);
	if (!READ_SESSION.test(command)) return [];
	const workspaceId = uuidOption(command, "workspace");
	const sessionId = wordOption(command, "session");
	if (!workspaceId || !sessionId) return [];
	const output = toolOutput(tool);
	const text =
		lastAgentMessageInJson(output) ?? lastAgentMessageInLines(output) ?? "";
	return [
		{
			kind: "report",
			key: `report:${sessionId}:${tool.id}`,
			workspaceId,
			sessionId,
			text: text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text,
		},
	];
}

/** The newest agent message in JSON output, even when the harness cut the output short. */
function lastAgentMessageInJson(output: string): string | null {
	let last: string | null = null;
	for (const match of output.matchAll(AGENT_TEXT)) {
		try {
			const text = String(JSON.parse(match[1] ?? '""')).trim();
			if (text) last = text;
		} catch {}
	}
	return last;
}

function lastAgentMessageInLines(output: string): string | null {
	let current: string[] | null = null;
	let last: string | null = null;
	const close = () => {
		const text = current?.join("\n").trim();
		if (text) last = text;
		current = null;
	};
	for (const line of output.split("\n")) {
		if (line.startsWith(AGENT_LINE)) {
			close();
			current = [line.slice(AGENT_LINE.length)];
		} else if (OTHER_LINE.test(line)) {
			close();
		} else if (current) {
			current.push(line);
		}
	}
	close();
	return last;
}
