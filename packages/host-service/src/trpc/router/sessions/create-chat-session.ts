import type { ChatRuntime } from "@superset/chat-runtime";
import { scopedCommandId } from "./scoped-command-id";
import type {
	ChatSessionResult,
	CreateChatSessionInput,
} from "./session-service";

type ChatTarget = {
	harness: string;
	label: string;
	attachments: Array<{ attachmentId: string; name: string; mimeType: string }>;
};

export function createChatSession(
	chat: ChatRuntime,
	target: ChatTarget,
	input: CreateChatSessionInput,
	cwd: string,
): ChatSessionResult {
	const commandId = input.commandId ?? crypto.randomUUID();
	const created = chat.commands.createSession({
		commandId: scopedCommandId(
			`create:${input.workspaceId}:${input.agent}:${target.harness}`,
			commandId,
		),
		scopeId: input.workspaceId,
		cwd,
		harness: target.harness,
		terminalId: crypto.randomUUID(),
		...(input.model ? { modelId: input.model } : {}),
		...(input.mode ? { modeId: input.mode } : {}),
		...(input.resumeSessionId
			? { resume: { harnessSessionId: input.resumeSessionId } }
			: {}),
	});
	const content = [
		...(input.prompt?.trim()
			? [{ type: "text" as const, text: input.prompt }]
			: []),
		...target.attachments.map((attachment) => ({
			type: "attachment" as const,
			...attachment,
		})),
	];
	if (content.length)
		chat.commands.prompt({
			commandId: scopedCommandId(`prompt:${created.sessionId}`, commandId),
			sessionId: created.sessionId,
			clientId: "superset-sessions",
			content,
		});
	return {
		kind: "chat",
		sessionId: created.sessionId,
		terminalId:
			chat.live.get(created.sessionId)?.terminalId ?? created.sessionId,
		label: target.label,
	};
}
