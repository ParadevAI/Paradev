import { isMissingProcedure } from "./relay-client";
import type { AgentRunResult, PreviousRunSession } from "./run";

/** One host-service, reached through the relay or directly for a sandbox. */
export type HostCaller = {
	mutation<TOutput>(procedure: string, input: object): Promise<TOutput>;
	query<TOutput>(procedure: string, input: object): Promise<TOutput>;
};

type AgentsRunOutput = {
	kind: "terminal";
	sessionId: string;
	label: string;
	/** Set by hosts that opened the launch as a chat. */
	chatSessionId?: string;
};

type SessionsCreateOutput = {
	kind: "chat";
	sessionId: string;
	terminalId: string;
	label: string;
};

type SessionsCapabilitiesOutput = { supported: boolean };

export type LaunchAgentSessionArgs = {
	workspaceId: string;
	agent: string;
	prompt: string;
	/** The caller's gate: may this run open as a chat at all. */
	chat: boolean;
	/** See {@link PreviousRunSession}. Omit when nothing may be continued. */
	previous?: PreviousRunSession;
};

/**
 * Starts the agent the way this host supports best: `sessions.create` for an
 * agent the host can chat with, `agents.run` for everything else. A host that
 * predates `sessions` gets the `agents.run` chat request it always got.
 */
export async function launchAgentSession(
	host: HostCaller,
	args: LaunchAgentSessionArgs,
): Promise<AgentRunResult> {
	const continueTerminalId = args.previous?.terminalSessionId ?? undefined;
	const agentsRun = (surface: "chat" | undefined) =>
		host
			.mutation<AgentsRunOutput>("agents.run", {
				workspaceId: args.workspaceId,
				agent: args.agent,
				prompt: args.prompt,
				// A host that predates this strips the unknown key and launches,
				// which is exactly what every host did before it existed.
				...(continueTerminalId &&
				(surface === "chat" || !args.previous?.chatSessionId)
					? { continueTerminalId }
					: {}),
				...(surface ? { surface } : {}),
			})
			.then(fromAgentsRun);

	if (!args.chat) return agentsRun(undefined);

	let capabilities: SessionsCapabilitiesOutput;
	try {
		capabilities = await host.query<SessionsCapabilitiesOutput>(
			"sessions.capabilities",
			{ agent: args.agent },
		);
	} catch (err) {
		if (!isMissingProcedure(err, "sessions.capabilities")) throw err;
		return agentsRun("chat");
	}
	if (!capabilities.supported) return agentsRun(undefined);

	const continueSessionId = args.previous?.chatSessionId ?? undefined;
	// A run recorded before chats had their own kind names only a terminal;
	// `agents.run` is what can still reach the session behind it.
	if (!continueSessionId && continueTerminalId) return agentsRun("chat");

	try {
		const created = await host.mutation<SessionsCreateOutput>(
			"sessions.create",
			{
				workspaceId: args.workspaceId,
				agent: args.agent,
				prompt: args.prompt,
				...(continueSessionId ? { continueSessionId } : {}),
			},
		);
		return {
			kind: "chat",
			sessionId: created.sessionId,
			terminalId: created.terminalId,
			label: created.label,
		};
	} catch (err) {
		if (!isMissingProcedure(err, "sessions.create")) throw err;
		return agentsRun("chat");
	}
}

/** `agents.run` reports a chat it opened as a terminal carrying the chat's id. */
export function fromAgentsRun(output: AgentsRunOutput): AgentRunResult {
	if (output.chatSessionId) {
		return {
			kind: "chat",
			sessionId: output.chatSessionId,
			terminalId: output.sessionId,
			label: output.label,
		};
	}
	return { kind: "terminal", sessionId: output.sessionId, label: output.label };
}
