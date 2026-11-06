interface SessionRow {
	sessionId: string;
	harnessSessionId: string | null;
	title: string | null;
	live: boolean;
	status: string;
	updatedAt: number;
}

/**
 * The session that stands for the agent in its workspace: a live one first,
 * then one with a title (a session gets one after its first real turn), then
 * the newest that got past starting, never a channel's coordinator. A
 * workspace can host another channel's coordinator, and each time that chat
 * is resumed the host mints a new session over the same harness conversation,
 * so every session sharing a coordinator's conversation is left out.
 */
export function pickAgentSession<Session extends SessionRow>(
	sessions: readonly Session[],
	coordinatorSessionIds: ReadonlySet<string>,
): Session | null {
	const coordinatorChats = new Set(
		sessions.flatMap((session) =>
			coordinatorSessionIds.has(session.sessionId) && session.harnessSessionId
				? [session.harnessSessionId]
				: [],
		),
	);
	const rank = (session: Session) =>
		session.live
			? 3
			: session.title
				? 2
				: session.status === "starting"
					? 0
					: 1;
	const [best] = sessions
		.filter(
			(session) =>
				!coordinatorSessionIds.has(session.sessionId) &&
				!(
					session.harnessSessionId &&
					coordinatorChats.has(session.harnessSessionId)
				),
		)
		.sort((a, b) => rank(b) - rank(a) || b.updatedAt - a.updatedAt);
	return best ?? null;
}
