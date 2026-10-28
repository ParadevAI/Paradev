import { strToU8, zipSync } from "fflate";
import type { Cursor } from "../../protocol/cursor";
import type { DurableEnvelope } from "../../protocol/envelope";
import type {
	AgentMessage,
	Item,
	Notice,
	ToolCall,
	ToolContent,
	UserMessage,
} from "../../protocol/items";
import { presetForAcpHarness } from "../harness/harness";
import { emptySnapshot, reduceMany } from "../reducer/reducer";
import { userMessageText } from "../transcript/transcript";

export type ChatExportRole = "user" | "assistant" | "tool" | "notice";

export type ChatExportToolCall = {
	name: string;
	kind: string;
	title: string;
	status: string;
	summary: string;
	paths?: string[];
};

export type ChatExportMessage = {
	id: string;
	role: ChatExportRole;
	createdAt: string;
	completedAt?: string;
	text: string;
	model?: string;
	attachments?: string[];
	tool?: ChatExportToolCall;
	diffs?: { path: string; diff: string }[];
};

export type ChatExport = {
	version: 1;
	exportedAt: string;
	chat: {
		sessionId: string;
		title: string | null;
		harness: string;
		agent: string | null;
		model: string | null;
		agentSessionId: string | null;
	};
	messages: ChatExportMessage[];
};

export type ChatExportSession = {
	sessionId: string;
	title: string | null;
	harness: string;
	harnessSessionId: string | null;
};

export type ChatExportPage =
	| { ok: true; envelopes: DurableEnvelope[]; nextBefore: Cursor | null }
	| { ok: false; reset: string };

export const CHAT_EXPORT_FILES = {
	json: "chat.json",
	markdown: "transcript.md",
} as const;

const SLUG_MAX = 60;

export function slugifyChatTitle(title: string | null | undefined): string {
	const slug = (title ?? "")
		.normalize("NFKD")
		.replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
		.normalize("NFC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, SLUG_MAX)
		.replace(/-+$/g, "");
	return slug || "untitled";
}

export function chatExportFilename(
	title: string | null | undefined,
	date: Date,
	extension: "zip" | "md" | "json" = "zip",
): string {
	const day = date.toISOString().slice(0, 10);
	return `superset-chat-${slugifyChatTitle(title)}-${day}.${extension}`;
}

export async function readAllEnvelopes(
	readPage: (before: Cursor | undefined) => Promise<ChatExportPage>,
): Promise<DurableEnvelope[]> {
	const pages: DurableEnvelope[][] = [];
	let before: Cursor | undefined;
	for (;;) {
		const page = await readPage(before);
		if (!page.ok) throw new Error(`chat history unreadable: ${page.reset}`);
		pages.unshift(page.envelopes);
		if (!page.nextBefore) return pages.flat();
		before = page.nextBefore;
	}
}

function iso(ms: number | undefined): string | undefined {
	return ms === undefined ? undefined : new Date(ms).toISOString();
}

function commonPrefixLength(a: string[], b: string[]): number {
	let index = 0;
	while (index < a.length && index < b.length && a[index] === b[index])
		index += 1;
	return index;
}

export function compactDiff(content: Extract<ToolContent, { type: "diff" }>) {
	const before = content.oldText === null ? [] : content.oldText.split("\n");
	const after = content.newText.split("\n");
	const head = commonPrefixLength(before, after);
	const tail = commonPrefixLength(
		before.slice(head).reverse(),
		after.slice(head).reverse(),
	);
	const removed = before.slice(head, before.length - tail);
	const added = after.slice(head, after.length - tail);
	const start = (lines: string[]) => (lines.length > 0 ? head + 1 : head);
	return [
		`--- ${content.oldText === null ? "/dev/null" : content.path}`,
		`+++ ${content.path}`,
		`@@ -${start(removed)},${removed.length} +${start(added)},${added.length} @@`,
		...removed.map((line) => `-${line}`),
		...added.map((line) => `+${line}`),
	].join("\n");
}

function toolSummary(call: ToolCall): string {
	return `${call.title} (${call.status})`;
}

function toMessage(item: Item): ChatExportMessage | null {
	if (item.parentItemId) return null;
	const base = {
		id: item.id,
		createdAt: iso(item.startedAtMs) ?? "",
		...(item.completedAtMs !== undefined
			? { completedAt: iso(item.completedAtMs) }
			: {}),
	};
	switch (item.kind) {
		case "user_message": {
			const message = item as UserMessage;
			if (message.queued || message.discarded) return null;
			const attachments = message.content.flatMap((part) =>
				part.type === "attachment" ? [part.name] : [],
			);
			return {
				...base,
				role: "user",
				text: userMessageText(message),
				...(attachments.length > 0 ? { attachments } : {}),
			};
		}
		case "agent_message": {
			const message = item as AgentMessage;
			return {
				...base,
				role: "assistant",
				text: message.text,
				...(message.model ? { model: message.model } : {}),
			};
		}
		case "tool_call": {
			const call = item as ToolCall;
			const diffs = call.content.flatMap((content) =>
				content.type === "diff"
					? [{ path: content.path, diff: compactDiff(content) }]
					: [],
			);
			const paths = call.locations?.map((location) => location.path);
			return {
				...base,
				role: "tool",
				text: toolSummary(call),
				tool: {
					name: call.toolName,
					kind: call.toolKind,
					title: call.title,
					status: call.status,
					summary: toolSummary(call),
					...(paths && paths.length > 0 ? { paths } : {}),
				},
				...(diffs.length > 0 ? { diffs } : {}),
			};
		}
		case "notice": {
			const notice = item as Notice;
			if (!notice.text) return null;
			return { ...base, role: "notice", text: notice.text };
		}
		default:
			return null;
	}
}

export function buildChatExport(
	session: ChatExportSession,
	envelopes: readonly DurableEnvelope[],
	exportedAt: Date,
): ChatExport {
	const snapshot = reduceMany(emptySnapshot(), envelopes);
	const messages = [...snapshot.items.values()]
		.map(({ item }) => toMessage(item))
		.filter((message): message is ChatExportMessage => message !== null);
	const state = snapshot.session;
	return {
		version: 1,
		exportedAt: exportedAt.toISOString(),
		chat: {
			sessionId: session.sessionId,
			title: state?.title ?? session.title,
			harness: session.harness,
			agent: presetForAcpHarness(session.harness) ?? null,
			model:
				state?.modelId ??
				[...messages].reverse().find((message) => message.model)?.model ??
				null,
			agentSessionId: state?.harnessSessionId ?? session.harnessSessionId,
		},
		messages,
	};
}

const ROLE_HEADINGS: Record<Exclude<ChatExportRole, "tool">, string> = {
	user: "User",
	assistant: "Assistant",
	notice: "Notice",
};

function fenced(body: string, language: string): string {
	const longest = Math.max(
		2,
		...[...body.matchAll(/`+/g)].map((match) => match[0].length),
	);
	const fence = "`".repeat(longest + 1);
	return `${fence}${language}\n${body}\n${fence}`;
}

export function chatExportMarkdown(exported: ChatExport): string {
	const { chat } = exported;
	const blocks: string[] = [
		`# ${chat.title ?? "Untitled chat"}`,
		[
			`- Agent: ${chat.agent ?? chat.harness}`,
			...(chat.model ? [`- Model: ${chat.model}`] : []),
			`- Exported: \`${exported.exportedAt}\``,
		].join("\n"),
	];
	let heading: ChatExportRole | null = null;
	for (const message of exported.messages) {
		if (message.role === "tool") {
			if (heading !== "assistant" && heading !== "tool") {
				blocks.push(`## Assistant \`${message.createdAt}\``);
			}
			heading = "tool";
			blocks.push(`- Tool: ${message.text}`);
			for (const diff of message.diffs ?? []) {
				blocks.push(fenced(diff.diff, "diff"));
			}
			continue;
		}
		heading = message.role;
		blocks.push(`## ${ROLE_HEADINGS[message.role]} \`${message.createdAt}\``);
		if (message.text) blocks.push(message.text);
		if (message.attachments) {
			blocks.push(
				message.attachments.map((name) => `- Attachment: ${name}`).join("\n"),
			);
		}
	}
	return `${blocks.join("\n\n")}\n`;
}

export function chatExportJson(exported: ChatExport): string {
	return `${JSON.stringify(exported, null, 2)}\n`;
}

export function chatExportZip(exported: ChatExport): Uint8Array {
	return zipSync({
		[CHAT_EXPORT_FILES.json]: strToU8(chatExportJson(exported)),
		[CHAT_EXPORT_FILES.markdown]: strToU8(chatExportMarkdown(exported)),
	});
}
