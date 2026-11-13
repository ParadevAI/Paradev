import type { CreateNewAgentSessionInput } from "../../useAgentSessionLauncher";

export type TerminalFallbackLaunch =
	| { kind: "chat-unavailable" }
	| {
			kind: "terminal";
			launch: {
				agent: string;
				prompt: string;
				attachmentIds?: string[];
				model?: string;
				forkSessionId?: string;
			};
	  };

/**
 * `modeId` is a Chat permission mode, not a terminal launch mode, so a request
 * that carries one cannot fall back to a terminal.
 */
export function terminalFallbackLaunch(
	input: CreateNewAgentSessionInput,
): TerminalFallbackLaunch {
	if (input.modeId && !input.forkSessionId) return { kind: "chat-unavailable" };
	return {
		kind: "terminal",
		launch: {
			agent: input.configId,
			prompt: input.prompt,
			...(input.attachments?.length
				? {
						attachmentIds: input.attachments.map(
							(attachment) => attachment.attachmentId,
						),
					}
				: {}),
			...(input.modelId ? { model: input.modelId } : {}),
			...(input.forkSessionId ? { forkSessionId: input.forkSessionId } : {}),
		},
	};
}
