import type { ToolCall } from "@superset/chat/protocol";
import { changedPaths } from "../fileChange";
import {
	effectiveToolKind,
	intentLocation,
	toolCallIntent,
} from "../shellIntent";

/**
 * What a run of tool calls amounted to, by the concept a reader cares about
 * rather than by tool name: the agent explored, ran things, changed files,
 * went to the web, or used something else.
 */
export type StepCounts = {
	commands: number;
	edits: number;
	reads: number;
	searches: number;
	fetches: number;
	tools: number;
};

export function stepCounts(items: readonly ToolCall[]): StepCounts {
	const counts: StepCounts = {
		commands: 0,
		edits: 0,
		reads: 0,
		searches: 0,
		fetches: 0,
		tools: 0,
	};
	const editedPaths = new Set<string>();
	for (const item of items) {
		switch (effectiveToolKind(item)) {
			case "execute":
				counts.commands += 1;
				break;
			case "edit":
			case "delete":
			case "move": {
				const paths = changedPaths(item);
				for (const path of paths) editedPaths.add(path);
				if (paths.length > 0) break;
				const intent = toolCallIntent(item);
				const location = intent ? intentLocation(intent) : undefined;
				if (location) editedPaths.add(location);
				else counts.edits += 1;
				break;
			}
			case "read":
				counts.reads += 1;
				break;
			case "search":
				counts.searches += 1;
				break;
			case "fetch":
				counts.fetches += 1;
				break;
			default:
				counts.tools += 1;
		}
	}
	counts.edits += editedPaths.size;
	return counts;
}
