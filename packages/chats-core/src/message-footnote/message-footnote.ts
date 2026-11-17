import type { Message } from "../model/model.ts";

/**
 * The quiet line under a text bubble: "Edited" once its author changed it, "via Claude Code" when it was sent with an
 * API key (a person's program speaking as them, which the chat should be able to tell), both joined by a dot; null for
 * neither, or a message without text (a card's own look says what it is).
 */
export function messageFootnote(
	message: Pick<Message, "editedAt" | "viaKey" | "text">,
): string | null {
	if (!message.text.trim()) return null;
	const parts = [
		message.editedAt ? "Edited" : null,
		message.viaKey ? `via ${message.viaKey}` : null,
	].filter((p) => p !== null);
	return parts.length ? parts.join(" · ") : null;
}
