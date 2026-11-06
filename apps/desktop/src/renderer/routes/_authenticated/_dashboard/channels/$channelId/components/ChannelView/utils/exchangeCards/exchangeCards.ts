import type { TranscriptCardRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";

type Exchange = Extract<TranscriptCardRef, { kind: "exchange" }>;
type Message = Exchange["messages"][number];

const TITLE_MAX = 64;

function titleOf(text: string): string {
	const line =
		text
			.split("\n")
			.find((part) => part.trim())
			?.trim() ?? "";
	const sentence = /^(.+?[.!?:])(?:\s|$)/.exec(line)?.[1] ?? line;
	const plain = sentence.replace(/[*_`]/g, "").replace(/[.:]$/, "").trim();
	return plain.length > TITLE_MAX
		? `${plain.slice(0, TITLE_MAX - 1).trimEnd()}…`
		: plain;
}

function messageOf(card: TranscriptCardRef): Message | null {
	switch (card.kind) {
		case "session": {
			const text = card.text ?? card.prompt;
			return text ? { from: "self", text, sessionId: card.sessionId } : null;
		}
		case "sent":
			return { from: "self", text: card.text, sessionId: card.sessionId };
		case "report":
			return { from: "peer", text: card.text, sessionId: card.sessionId };
		default:
			return null;
	}
}

/**
 * One turn's talk with each agent as one exchange: what this chat's agent
 * told it and what it answered, in order, placed where the talk began.
 * Reading the same chat twice in a row keeps the newer answer.
 */
export function combineExchanges(
	cards: readonly TranscriptCardRef[],
): { card: TranscriptCardRef; at: string }[] {
	const results: { card: TranscriptCardRef; at: string }[] = [];
	const byWorkspace = new Map<string, { at: string; messages: Message[] }>();
	for (const card of cards) {
		const message = messageOf(card);
		if (!message || !("workspaceId" in card)) {
			results.push({ card, at: card.key });
			continue;
		}
		const talk = byWorkspace.get(card.workspaceId);
		if (!talk) {
			const fresh = { at: card.key, messages: [message] };
			byWorkspace.set(card.workspaceId, fresh);
			results.push({
				card: {
					kind: "exchange",
					key: `exchange:${card.workspaceId}`,
					workspaceId: card.workspaceId,
					title: "",
					messages: fresh.messages,
				},
				at: card.key,
			});
			continue;
		}
		const last = talk.messages.at(-1);
		if (last?.from === "peer" && message.from === "peer") {
			talk.messages[talk.messages.length - 1] = message.text ? message : last;
		} else {
			talk.messages.push(message);
		}
	}
	return results.map((result) => {
		if (result.card.kind !== "exchange") return result;
		const opener =
			result.card.messages.find((message) => message.from === "self") ??
			result.card.messages[0];
		return {
			...result,
			card: { ...result.card, title: opener ? titleOf(opener.text) : "" },
		};
	});
}
