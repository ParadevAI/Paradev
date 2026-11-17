/** A trigger's own session in a chat: `<chat id>.trigger-<trigger id>` (the Dev API names it so). */
const TRIGGER_SESSION = /^(.+)\.trigger-[A-Za-z0-9_-]+$/;
/** A public page conversation's session, beside the Dev's 1:1: `<chat id>.public-<conversation id>`. */
const PUBLIC_SESSION = /^(.+)\.public-[A-Za-z0-9_-]+$/;

/**
 * The chat a session belongs to. A chat's own session is keyed by the chat id; each trigger in it has a session of its
 * own, so its events never crowd the chat's conversation, but it still speaks, asks and keeps rules in that chat, and
 * each public page conversation has one beside the Dev's 1:1. A session is opened before its first turn's meta
 * arrives, so the chat comes from the key itself.
 */
export function chatIdOf(sessionId: string): string {
	return (
		TRIGGER_SESSION.exec(sessionId)?.[1] ??
		PUBLIC_SESSION.exec(sessionId)?.[1] ??
		sessionId
	);
}

/** Whether a session is a trigger's own (its turns are `## Events` turns), not its chat's. */
export function isTriggerSession(sessionId: string): boolean {
	return TRIGGER_SESSION.test(sessionId);
}

/** Whether a session is a visitor's conversation on the Dev's public page (its replies go to the visitor). */
export function isPublicSession(sessionId: string): boolean {
	return PUBLIC_SESSION.test(sessionId);
}
