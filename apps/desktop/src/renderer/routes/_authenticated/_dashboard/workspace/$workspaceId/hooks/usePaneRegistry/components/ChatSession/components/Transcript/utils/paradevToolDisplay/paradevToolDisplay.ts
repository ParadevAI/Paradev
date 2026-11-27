import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ToolCall } from "@superset/chat/protocol";

const PARADEV_SERVERS: ReadonlySet<string> = new Set(["superset", "paradev"]);

type ToolLabel = { running: MessageDescriptor; settled: MessageDescriptor };

export const PARADEV_TOOL_LABELS: Record<string, ToolLabel> = {
	tasks_list: {
		running: msg({ message: "Listing tasks", context: "Paradev tool" }),
		settled: msg({ message: "Listed tasks", context: "Paradev tool" }),
	},
	tasks_get: {
		running: msg({ message: "Reading task", context: "Paradev tool" }),
		settled: msg({ message: "Read task", context: "Paradev tool" }),
	},
	tasks_create: {
		running: msg({ message: "Creating task", context: "Paradev tool" }),
		settled: msg({ message: "Created task", context: "Paradev tool" }),
	},
	tasks_update: {
		running: msg({ message: "Updating task", context: "Paradev tool" }),
		settled: msg({ message: "Updated task", context: "Paradev tool" }),
	},
	tasks_delete: {
		running: msg({ message: "Deleting task", context: "Paradev tool" }),
		settled: msg({ message: "Deleted task", context: "Paradev tool" }),
	},
	tasks_statuses_list: {
		running: msg({ message: "Listing task statuses", context: "Paradev tool" }),
		settled: msg({ message: "Listed task statuses", context: "Paradev tool" }),
	},
	organization_members_list: {
		running: msg({ message: "Listing members", context: "Paradev tool" }),
		settled: msg({ message: "Listed members", context: "Paradev tool" }),
	},
	automations_list: {
		running: msg({ message: "Listing automations", context: "Paradev tool" }),
		settled: msg({ message: "Listed automations", context: "Paradev tool" }),
	},
	automations_get: {
		running: msg({ message: "Reading automation", context: "Paradev tool" }),
		settled: msg({ message: "Read automation", context: "Paradev tool" }),
	},
	automations_get_prompt: {
		running: msg({
			message: "Reading automation prompt",
			context: "Paradev tool",
		}),
		settled: msg({
			message: "Read automation prompt",
			context: "Paradev tool",
		}),
	},
	automations_create: {
		running: msg({ message: "Creating automation", context: "Paradev tool" }),
		settled: msg({ message: "Created automation", context: "Paradev tool" }),
	},
	automations_update: {
		running: msg({ message: "Updating automation", context: "Paradev tool" }),
		settled: msg({ message: "Updated automation", context: "Paradev tool" }),
	},
	automations_set_prompt: {
		running: msg({
			message: "Setting automation prompt",
			context: "Paradev tool",
		}),
		settled: msg({ message: "Set automation prompt", context: "Paradev tool" }),
	},
	automations_archive: {
		running: msg({ message: "Archiving automation", context: "Paradev tool" }),
		settled: msg({ message: "Archived automation", context: "Paradev tool" }),
	},
	automations_unarchive: {
		running: msg({ message: "Restoring automation", context: "Paradev tool" }),
		settled: msg({ message: "Restored automation", context: "Paradev tool" }),
	},
	automations_delete: {
		running: msg({ message: "Deleting automation", context: "Paradev tool" }),
		settled: msg({ message: "Deleted automation", context: "Paradev tool" }),
	},
	automations_pause: {
		running: msg({ message: "Pausing automation", context: "Paradev tool" }),
		settled: msg({ message: "Paused automation", context: "Paradev tool" }),
	},
	automations_resume: {
		running: msg({ message: "Resuming automation", context: "Paradev tool" }),
		settled: msg({ message: "Resumed automation", context: "Paradev tool" }),
	},
	automations_trigger_options: {
		running: msg({
			message: "Listing trigger options",
			context: "Paradev tool",
		}),
		settled: msg({
			message: "Listed trigger options",
			context: "Paradev tool",
		}),
	},
	automations_run: {
		running: msg({ message: "Running automation", context: "Paradev tool" }),
		settled: msg({ message: "Ran automation", context: "Paradev tool" }),
	},
	automations_logs: {
		running: msg({
			message: "Listing automation runs",
			context: "Paradev tool",
		}),
		settled: msg({
			message: "Listed automation runs",
			context: "Paradev tool",
		}),
	},
	workspaces_list: {
		running: msg({ message: "Listing workspaces", context: "Paradev tool" }),
		settled: msg({ message: "Listed workspaces", context: "Paradev tool" }),
	},
	workspaces_create: {
		running: msg({ message: "Creating workspace", context: "Paradev tool" }),
		settled: msg({ message: "Created workspace", context: "Paradev tool" }),
	},
	workspaces_update: {
		running: msg({ message: "Updating workspace", context: "Paradev tool" }),
		settled: msg({ message: "Updated workspace", context: "Paradev tool" }),
	},
	workspaces_delete: {
		running: msg({ message: "Deleting workspace", context: "Paradev tool" }),
		settled: msg({ message: "Deleted workspace", context: "Paradev tool" }),
	},
	agents_create: {
		running: msg({ message: "Launching agent", context: "Paradev tool" }),
		settled: msg({ message: "Launched agent", context: "Paradev tool" }),
	},
	agents_list: {
		running: msg({ message: "Listing agents", context: "Paradev tool" }),
		settled: msg({ message: "Listed agents", context: "Paradev tool" }),
	},
	terminals_create: {
		running: msg({ message: "Opening terminal", context: "Paradev tool" }),
		settled: msg({ message: "Opened terminal", context: "Paradev tool" }),
	},
	terminals_list: {
		running: msg({ message: "Listing terminals", context: "Paradev tool" }),
		settled: msg({ message: "Listed terminals", context: "Paradev tool" }),
	},
	terminals_send: {
		running: msg({ message: "Sending to terminal", context: "Paradev tool" }),
		settled: msg({ message: "Sent to terminal", context: "Paradev tool" }),
	},
	terminals_read: {
		running: msg({ message: "Reading terminal", context: "Paradev tool" }),
		settled: msg({ message: "Read terminal", context: "Paradev tool" }),
	},
	terminals_close: {
		running: msg({ message: "Closing terminal", context: "Paradev tool" }),
		settled: msg({ message: "Closed terminal", context: "Paradev tool" }),
	},
	pages_list: {
		running: msg({ message: "Listing pages", context: "Paradev tool" }),
		settled: msg({ message: "Listed pages", context: "Paradev tool" }),
	},
	pages_get: {
		running: msg({ message: "Reading page", context: "Paradev tool" }),
		settled: msg({ message: "Read page", context: "Paradev tool" }),
	},
	pages_versions: {
		running: msg({ message: "Listing page versions", context: "Paradev tool" }),
		settled: msg({ message: "Listed page versions", context: "Paradev tool" }),
	},
	pages_pull: {
		running: msg({ message: "Downloading page", context: "Paradev tool" }),
		settled: msg({ message: "Downloaded page", context: "Paradev tool" }),
	},
	pages_storage: {
		running: msg({ message: "Reading page storage", context: "Paradev tool" }),
		settled: msg({ message: "Read page storage", context: "Paradev tool" }),
	},
	pages_storage_set: {
		running: msg({ message: "Saving page storage", context: "Paradev tool" }),
		settled: msg({ message: "Saved page storage", context: "Paradev tool" }),
	},
	pages_storage_remove: {
		running: msg({ message: "Removing page storage", context: "Paradev tool" }),
		settled: msg({ message: "Removed page storage", context: "Paradev tool" }),
	},
	pages_publish: {
		running: msg({ message: "Publishing page", context: "Paradev tool" }),
		settled: msg({ message: "Published page", context: "Paradev tool" }),
	},
	pages_comments_list: {
		running: msg({ message: "Listing page comments", context: "Paradev tool" }),
		settled: msg({ message: "Listed page comments", context: "Paradev tool" }),
	},
	pages_comments_reply: {
		running: msg({ message: "Replying to comment", context: "Paradev tool" }),
		settled: msg({ message: "Replied to comment", context: "Paradev tool" }),
	},
	pages_comments_resolve: {
		running: msg({ message: "Resolving comment", context: "Paradev tool" }),
		settled: msg({ message: "Resolved comment", context: "Paradev tool" }),
	},
	projects_list: {
		running: msg({ message: "Listing projects", context: "Paradev tool" }),
		settled: msg({ message: "Listed projects", context: "Paradev tool" }),
	},
	hosts_list: {
		running: msg({ message: "Listing hosts", context: "Paradev tool" }),
		settled: msg({ message: "Listed hosts", context: "Paradev tool" }),
	},
};

export type ParadevToolChip = {
	kind: "task" | "workspace" | "page";
	label: string;
};

function paradevToolName(item: ToolCall): string | null {
	const server = item.mcpServer;
	if (!server || !PARADEV_SERVERS.has(server.name)) return null;
	return Object.hasOwn(PARADEV_TOOL_LABELS, server.tool) ? server.tool : null;
}

export function paradevToolLabel(item: ToolCall): MessageDescriptor | null {
	const name = paradevToolName(item);
	if (!name) return null;
	const label = PARADEV_TOOL_LABELS[name] as ToolLabel;
	return item.status === "running" ? label.running : label.settled;
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function parsedText(item: ToolCall): Record<string, unknown> | null {
	const [content, ...rest] = item.content;
	if (rest.length > 0 || content?.type !== "text") return null;
	try {
		return record(JSON.parse(content.text));
	} catch {
		return null;
	}
}

/** The tool's result object: `structuredContent`, or the JSON text Paradev tools return beside it. */
function structuredResult(item: ToolCall): Record<string, unknown> | null {
	const structured = record(record(item.rawOutput)?.structuredContent);
	return structured ?? parsedText(item);
}

function stringField(value: unknown, field: string): string | null {
	const text = record(value)?.[field];
	return typeof text === "string" && text.length > 0 ? text : null;
}

export function paradevToolChips(item: ToolCall): ParadevToolChip[] {
	const name = paradevToolName(item);
	if (!name || item.status !== "completed") return [];
	const result = structuredResult(item);
	if (!result) return [];
	let chip: ParadevToolChip | null = null;
	if (name === "tasks_create" || name === "tasks_update") {
		const label = stringField(result.task, "title");
		if (label) chip = { kind: "task", label };
	} else if (name === "workspaces_create") {
		const label = stringField(result.workspace, "name");
		if (label) chip = { kind: "workspace", label };
	} else if (name === "pages_publish") {
		const label = stringField(result, "title");
		if (label) chip = { kind: "page", label };
	}
	return chip ? [chip] : [];
}
