import {
	emptySnapshot,
	reduceMany,
	userMessageText,
} from "@superset/chat/core";
import type {
	AgentMessage,
	DurableEnvelope,
	UserMessage,
} from "@superset/chat/protocol";
import type { HostDb } from "../../../db";
import {
	generateWorkspaceNamesFromPrompt,
	trimTitle,
} from "../workspace-creation/utils/ai-workspace-names";

const PROMPTS_FOR_TITLE = 3;
const SOURCE_CHARS = 2_000;
const FALLBACK_TITLE_CHARS = 60;

export type ChatTitleSource = {
	firstPrompt: string;
	prompts: string;
	agentReply?: string;
};

export function chatTitleSource(
	envelopes: readonly DurableEnvelope[],
): ChatTitleSource | null {
	const items = [...reduceMany(emptySnapshot(), envelopes).items.values()]
		.map(({ item }) => item)
		.filter((item) => !item.parentItemId);
	const prompts = items
		.filter(
			(item): item is UserMessage =>
				item.kind === "user_message" &&
				!(item as UserMessage).queued &&
				!(item as UserMessage).discarded,
		)
		.map((message) => userMessageText(message).trim())
		.filter(Boolean)
		.slice(0, PROMPTS_FOR_TITLE);
	if (prompts.length === 0) return null;
	const agentReply = items
		.find(
			(item): item is AgentMessage =>
				item.kind === "agent_message" && !!(item as AgentMessage).text.trim(),
		)
		?.text.trim();
	return {
		firstPrompt: prompts[0] ?? "",
		prompts: prompts.join("\n\n").slice(0, SOURCE_CHARS),
		...(agentReply ? { agentReply: agentReply.slice(0, SOURCE_CHARS) } : {}),
	};
}

export function asNamingData(text: string): string {
	return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fallbackChatTitle(prompt: string): string {
	const line =
		prompt
			.split(/\r?\n/)
			.map((candidate) => candidate.replace(/^[\s#>*\-+`]+/, "").trim())
			.find(Boolean) ?? "";
	if (line.length <= FALLBACK_TITLE_CHARS) return trimTitle(line);
	const cut = line.slice(0, FALLBACK_TITLE_CHARS + 1);
	const space = cut.lastIndexOf(" ");
	return trimTitle(space > 0 ? cut.slice(0, space) : cut);
}

export async function generateChatTitle({
	envelopes,
	agent,
	db,
	env,
	signal,
	name = generateWorkspaceNamesFromPrompt,
}: {
	envelopes: readonly DurableEnvelope[];
	agent: string | undefined;
	db: HostDb;
	env?: () => Promise<Record<string, string>>;
	signal?: AbortSignal;
	name?: typeof generateWorkspaceNamesFromPrompt;
}): Promise<string | null> {
	const source = chatTitleSource(envelopes);
	if (!source) return null;
	const launchEnv = await env?.().catch((error: unknown) => {
		console.warn("[generateChatTitle] agent env unavailable", error);
		return undefined;
	});
	const names = agent
		? await name(
				asNamingData(source.prompts),
				{ db, agent, ...(launchEnv ? { env: launchEnv } : {}) },
				null,
				signal,
				false,
				source.agentReply
					? { agentReply: asNamingData(source.agentReply) }
					: undefined,
			)
		: null;
	return names?.title || fallbackChatTitle(source.firstPrompt) || null;
}
