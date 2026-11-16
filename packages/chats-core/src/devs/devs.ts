import type { ChatState } from "../chat-state/chat-state.ts";
import type { Chat, Dev } from "../model/model.ts";

/** The user's personal Dev; undefined until they've named it at onboarding. */
export function myDev(state: ChatState): Dev | undefined {
	return Object.values(state.devs).find(
		(m) => m.kind === "personal" && m.ownerId === state.meId,
	);
}

/** The user's own Devs: their personal Dev first, then the agents they made, by name. */
export function myDevs(state: ChatState): Dev[] {
	const mine = Object.values(state.devs).filter(
		(m) => m.ownerId === state.meId,
	);
	return mine.sort(
		(a, b) =>
			Number(b.kind === "personal") - Number(a.kind === "personal") ||
			a.name.localeCompare(b.name),
	);
}

/** The user's 1:1 with one of their Devs. */
export function devChat(state: ChatState, devId: string): Chat | undefined {
	return state.chats.find(
		(c) => c.kind === "direct" && c.devIds.includes(devId),
	);
}

/** Where new things go by default: the 1:1 with the user's own Dev, else any chat. */
export function defaultChat(state: ChatState): Chat | undefined {
	const dev = myDev(state);
	return (dev && devChat(state, dev.id)) ?? state.chats[0];
}

/** The Dev a 1:1 is with. */
export function directDev(state: ChatState, chat: Chat): Dev | undefined {
	return chat.kind === "direct" ? state.devs[chat.devIds[0] ?? ""] : undefined;
}

/** A 1:1 is named after its Dev, so renaming the Dev renames the chat. */
export function chatTitle(state: ChatState, chat: Chat): string {
	return directDev(state, chat)?.name ?? chat.title;
}

/** Whether the Dev belongs to a group (its own, or one added to it from the registry) rather than to a person. */
export const ownedByGroup = (dev: Pick<Dev, "kind">): boolean =>
	dev.kind === "group" || dev.kind === "added";

const CHAT_ORDER: Record<Dev["kind"], number> = {
	group: 0,
	added: 1,
	personal: 2,
	custom: 2,
};

/** Devs in a chat: the group's own first, then the ones added to it, then members' Devs, by name. */
export function chatDevs(state: ChatState, chat: Chat): Dev[] {
	const devs = chat.devIds.flatMap((id) => state.devs[id] ?? []);
	return devs.sort(
		(a, b) =>
			CHAT_ORDER[a.kind] - CHAT_ORDER[b.kind] || a.name.localeCompare(b.name),
	);
}

/**
 * The Devs a person can mention, and so wake, in a chat: every Dev in it. A member who adds their own Dev to a
 * group lets the group call on it.
 */
export function mentionableDevs(state: ChatState, chat: Chat): Dev[] {
	return chatDevs(state, chat);
}

/** Who a Dev belongs to, so two Devs with the same name can be told apart: "Yours", "Priya's", "This group's". */
export function devOwnerLabel(state: ChatState, dev: Dev): string {
	if (dev.kind === "group") return "This group's";
	if (dev.kind === "added") return "Added here";
	if (dev.ownerId === state.meId) return "Yours";
	const owner = dev.ownerId ? state.members[dev.ownerId]?.name : undefined;
	return owner ? `${owner}'s` : "A member's";
}

/** A group's Dev's description until its members write their own. */
export const groupDevDescription = (groupTitle: string) =>
	`The Dev of ${groupTitle}`;

/**
 * A Dev's description as one reader sees it. A personal Dev's opening is generated, "Your personal Dev" for
 * its owner and "Priya's personal Dev" for everyone else (other Devs included); its owner's own text follows.
 * Other kinds are described by their stored text alone.
 */
export function describeDev(
	dev: Pick<Dev, "kind">,
	text: string,
	reader: { isOwner: boolean; ownerName: string | null },
): string {
	if (dev.kind !== "personal") return text;
	const opening = reader.isOwner
		? "Your personal Dev"
		: `${reader.ownerName ?? "A member"}'s personal Dev`;
	return text ? `${opening} · ${text}` : opening;
}
