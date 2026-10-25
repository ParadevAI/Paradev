import type {
	ItemAttachment,
	Plan,
	ToolCall,
	ToolContent,
	ToolKind,
} from "@superset/chat/protocol";
import type { AcpContentBlock, AcpToolCallContent } from "./wire";

const TOOL_KIND_BY_ACP: Record<string, ToolKind> = {
	read: "read",
	edit: "edit",
	delete: "delete",
	move: "move",
	search: "search",
	execute: "execute",
	think: "think",
	fetch: "fetch",
	switch_mode: "other",
	other: "other",
};

export function toolKind(kind: string | undefined): ToolKind {
	return (kind && TOOL_KIND_BY_ACP[kind]) || "other";
}

export function toolStatus(status: string | undefined): ToolCall["status"] {
	switch (status) {
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		case "cancelled":
			return "canceled";
		default:
			return "running";
	}
}

export function toolCallSettled(status: string | null | undefined): boolean {
	return (
		status === "completed" || status === "failed" || status === "cancelled"
	);
}

function planEntryStatus(status: string): Plan["entries"][number]["status"] {
	if (status === "in_progress" || status === "completed") return status;
	return "pending";
}

export function planEntryItems(
	entries: ReadonlyArray<{ content: string; status: string }>,
): Plan["entries"] {
	return entries.map((entry) => ({
		text: entry.content,
		status: planEntryStatus(entry.status),
	}));
}

export function messageText(content: readonly AcpContentBlock[]): string {
	return content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("");
}

export type ToolBody = {
	content: ToolContent[];
	attachments: ItemAttachment[];
};

export type AttachmentOf = (
	block: AcpContentBlock | undefined,
	referenceId?: string,
) => ItemAttachment | null;

export function mapToolBody(
	content: AcpToolCallContent[],
	toolCallId: string,
	attachmentOf: AttachmentOf,
): ToolBody {
	const mapped: ToolContent[] = [];
	const attachments: ItemAttachment[] = [];
	for (const entry of content) {
		if (entry.type === "content" && entry.content?.type === "text") {
			mapped.push({ type: "text", text: entry.content.text ?? "" });
		} else if (entry.type === "content") {
			const attachment = attachmentOf(entry.content, `tool:${toolCallId}`);
			if (attachment) attachments.push(attachment);
		} else if (
			entry.type === "diff" &&
			entry.path &&
			entry.newText !== undefined
		) {
			mapped.push({
				type: "diff",
				path: entry.path,
				oldText: entry.oldText ?? null,
				newText: entry.newText,
			});
		} else if (entry.type === "diff") {
			const patch =
				entry.patch?.text ??
				(entry.changes ?? [])
					.map((change) => `${change.operation ?? "modify"} ${change.path}`)
					.join("\n");
			if (patch) mapped.push({ type: "text", text: patch });
		} else if (entry.type === "terminal" && entry.terminalId) {
			mapped.push({ type: "text", text: `[terminal ${entry.terminalId}]` });
		}
	}
	return { content: mapped, attachments };
}

export function mcpServerOf(
	meta: unknown,
	prior: ToolCall["mcpServer"],
): ToolCall["mcpServer"] {
	const claudeCode = (
		meta as {
			claudeCode?: { toolName?: string; mcpServer?: { source?: string } };
		}
	)?.claudeCode;
	const match = claudeCode?.toolName?.match(/^mcp__(.+?)__(.+)$/);
	if (!match) return prior;
	const source = claudeCode?.mcpServer?.source ?? prior?.source;
	return {
		name: match[1] as string,
		tool: match[2] as string,
		...(source ? { source } : {}),
	};
}
