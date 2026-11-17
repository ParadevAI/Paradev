import {
	type Chat,
	type ChatState,
	chatRows,
	ownedChatId,
	type RegistryCard,
} from "@superset/chats-core";
import type { InstallTarget } from "@superset/chats-sync";

/** As many Devs from the directory as a group holds (the server's limit). */
export const MAX_ADDED = 5;

/** One place Get can put a listing: a group the person is in, or a Dev of their own. */
export interface GetChoice {
	key: string;
	target: InstallTarget;
	/** The group, or null for a Dev of the person's own. */
	chat: Chat | null;
	title: string | null;
	/** Why it can't be picked. */
	unavailable: "in-group" | "group-full" | "owned" | null;
}

const groupKey = (groupId: string) => `group:${groupId}`;

/**
 * Where Get offers to put a listing: the person's groups (the one they came
 * from first) when it is for groups, and themselves when it is for one
 * person.
 */
export function getChoices(
	listing: Pick<RegistryCard, "for" | "slug">,
	state: ChatState,
	fromGroupId?: string,
): GetChoice[] {
	const choices: GetChoice[] = [];
	if (listing.for.includes("you")) {
		choices.push({
			key: "you",
			target: { kind: "you" },
			chat: null,
			title: null,
			unavailable: ownedChatId(state, listing.slug) !== null ? "owned" : null,
		});
	}
	if (listing.for.includes("group")) {
		const rows = chatRows(state, "groups");
		const ordered = [
			...rows.filter((row) => row.chat.id === fromGroupId),
			...rows.filter((row) => row.chat.id !== fromGroupId),
		];
		for (const row of ordered) {
			const added = row.chat.devIds.flatMap((id) => {
				const dev = state.devs[id];
				return dev?.kind === "added" ? [dev] : [];
			});
			choices.push({
				key: groupKey(row.chat.id),
				target: { kind: "group", groupId: row.chat.id },
				chat: row.chat,
				title: row.title,
				unavailable: added.some((dev) => dev.listing?.slug === listing.slug)
					? "in-group"
					: added.length >= MAX_ADDED
						? "group-full"
						: null,
			});
		}
	}
	return choices;
}

/** The choice Get starts on: the group the person came from, else a Dev of their own, else the first group that can take it. */
export function defaultChoice(
	choices: GetChoice[],
	fromGroupId?: string,
): string | null {
	const open = choices.filter((choice) => !choice.unavailable);
	const from = fromGroupId
		? open.find((choice) => choice.key === groupKey(fromGroupId))
		: undefined;
	const own = open.find((choice) => choice.target.kind === "you");
	return (from ?? own ?? open[0])?.key ?? null;
}
