import type { ChatState } from "../chat-state/chat-state.ts";
import { chatDevs, devOwnerLabel, mentionableDevs } from "../devs/devs.ts";
import type { MentionRef } from "../mentions/mentions.ts";
import type { Chat } from "../model/model.ts";

/** How a mention reads in a composer: the name, and the owner only when another Dev in the chat shares the name. */
export interface MentionPillText {
	label: string;
	owner: string | null;
}

/** Someone the composer's @ picker offers: a Dev in the chat or another member. */
export interface MentionCandidate extends MentionRef {
	name: string;
	/** The name, qualified by its owner when another candidate shares it ("Juniper (Priya's)"); typing matches it too. */
	label: string;
	/** Shown on the right of the picker: "Yours", "Priya's", "This group's" for Devs, "Person" for people. */
	owner: string;
	/** A Dev's avatar colour. */
	color?: string;
	/** What a Dev is for, under its name in the picker. */
	description?: string;
}

const key = (s: string) => s.toLowerCase();

function qualifier(state: ChatState, c: MentionCandidate): string {
	if (c.kind === "user") return "person";
	const dev = state.devs[c.id]!;
	if (dev.kind === "group") return "group's";
	if (dev.kind === "added") return "added";
	if (dev.ownerId === state.meId) return "yours";
	return `${(dev.ownerId && state.members[dev.ownerId]?.name) || "a member"}'s`;
}

/** Labels whose lower-cased text more than one candidate has. */
function repeated(labels: string[]): Set<string> {
	const seen = new Map<string, number>();
	for (const l of labels) seen.set(key(l), (seen.get(key(l)) ?? 0) + 1);
	return new Set([...seen].filter(([, n]) => n > 1).map(([l]) => l));
}

/** The Devs one can mention here (in a group, its own and the ones added to it) and the chat's other members, each with a label unique in the chat. */
export function mentionCandidates(
	state: ChatState,
	chat: Chat,
): MentionCandidate[] {
	const devs: MentionCandidate[] = mentionableDevs(state, chat).map((m) => ({
		kind: "dev",
		id: m.id,
		name: m.name,
		label: m.name,
		owner: devOwnerLabel(state, m),
		color: m.color,
		description: m.description,
	}));
	const people: MentionCandidate[] = chat.memberIds
		.filter((id) => id !== state.meId)
		.flatMap((id) => {
			const member = state.members[id];
			return member
				? [
						{
							kind: "user" as const,
							id,
							name: member.name,
							label: member.name,
							owner: "Person",
						},
					]
				: [];
		});
	let all = [...devs, ...people];
	const shared = repeated(all.map((c) => c.label));
	all = all.map((c) =>
		shared.has(key(c.label))
			? { ...c, label: `${c.name} (${qualifier(state, c)})` }
			: c,
	);
	// Two of one person's Devs with the same name: only the id tells them apart.
	const still = repeated(all.map((c) => c.label));
	return all.map((c) =>
		still.has(key(c.label))
			? { ...c, label: `${c.label} ${c.id.slice(0, 4)}` }
			: c,
	);
}

/**
 * How a mention reads in the composer: the name, with its owner when another Dev in the chat has that name (as
 * `mentionPill` shows it in sent messages). Someone no longer in the chat still gets a pill.
 */
export function composerPill(
	candidates: MentionCandidate[],
	ref: MentionRef,
): MentionPillText {
	const c = candidates.find((x) => x.kind === ref.kind && x.id === ref.id);
	if (!c)
		return { label: ref.kind === "user" ? "someone" : "a Dev", owner: null };
	const namesake =
		c.kind === "dev" &&
		candidates.some(
			(x) => x.kind === "dev" && x.id !== c.id && key(x.name) === key(c.name),
		);
	return { label: c.name, owner: namesake ? c.owner : null };
}

/** How a mention token reads in a message: the name, plus its owner when another Dev in the chat has that name. */
export function mentionPill(
	state: ChatState,
	chat: Chat | undefined,
	ref: MentionRef,
): { name: string; owner?: string } {
	if (ref.kind === "user")
		return {
			name:
				ref.id === state.meId
					? "You"
					: (state.members[ref.id]?.name ?? "someone"),
		};
	const dev = state.devs[ref.id];
	if (!dev) return { name: "a Dev" };
	const namesake = chat
		? chatDevs(state, chat).some(
				(m) => m.id !== dev.id && key(m.name) === key(dev.name),
			)
		: false;
	return namesake
		? { name: dev.name, owner: devOwnerLabel(state, dev) }
		: { name: dev.name };
}
