import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { i18n } from "@superset/i18n";
import { fileChangeOf } from "../fileChange";

const translate = (message: MessageDescriptor) => i18n._(message);

export function toolTitle(
	item: ToolCall,
	t = translate,
	pluginAvailable = false,
) {
	const change = fileChangeOf(item);
	const running = item.status === "running";
	if (change) {
		const verb = running
			? change.kind === "added"
				? msg({ message: "Creating", context: "file change" })
				: change.kind === "deleted"
					? msg({ message: "Deleting", context: "file change" })
					: msg({ message: "Editing", context: "file change" })
			: change.kind === "added"
				? msg({ message: "Created", context: "file change" })
				: change.kind === "deleted"
					? msg({ message: "Deleted", context: "file change" })
					: msg({ message: "Edited", context: "file change" });
		return { label: t(verb), change };
	}
	const mcpServer = item.mcpServer;
	const rawMcpTitle =
		!item.title ||
		item.title.startsWith("mcp__") ||
		item.title === `${mcpServer?.tool} (${mcpServer?.name})`;
	const label =
		pluginAvailable && mcpServer && rawMcpTitle
			? mcpServer.tool
			: running && item.toolKind === "execute" && item.title === "Terminal"
				? t(msg({ message: "Running" }))
				: item.title;
	return { label, change: null };
}

export function toolTitleText(
	item: ToolCall,
	t = translate,
	pluginAvailable = false,
): string {
	const { label, change } = toolTitle(item, t, pluginAvailable);
	return change ? `${label} ${change.name}` : label;
}
