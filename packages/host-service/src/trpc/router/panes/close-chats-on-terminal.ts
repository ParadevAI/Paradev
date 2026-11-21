import type { HostServiceContext } from "../../../types";

/** A chat with no terminal of its own is shown under its session id, as `newTab` does. */
export async function closeChatsOnTerminal(
	ctx: Pick<HostServiceContext, "runtime">,
	workspaceId: string,
	terminalId: string,
): Promise<void> {
	const chat = ctx.runtime.chat?.();
	if (!chat) return;
	const onTerminal = chat.commands
		.listSessions({ scopeId: workspaceId, limit: 200 })
		.filter(
			(session) =>
				session.live &&
				(session.terminalId ?? session.sessionId) === terminalId,
		);
	await Promise.all(
		onTerminal.map((session) =>
			chat.commands.closeSession({
				sessionId: session.sessionId,
				userClosed: true,
			}),
		),
	);
}
