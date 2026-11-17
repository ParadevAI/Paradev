import {
	ownedByGroup,
	parseMentionTokens,
	splitMentions,
} from "@superset/chats-core";
import { db } from "@superset/db/client";
import { chatsAgents, chatsGroupAgents } from "@superset/db/schema";
import { eq } from "drizzle-orm";

export interface RosterDev {
	id: string;
	name: string;
	kind: (typeof chatsAgents.$inferSelect)["kind"];
	ownerUserId: string | null;
	paradevAccess: boolean;
	plugins: string[];
}

/** The group's own Dev first, then the ones added to it, then members'. */
const ORDER: Record<RosterDev["kind"], number> = {
	group: 0,
	added: 1,
	personal: 2,
	custom: 2,
};

/** The Devs in a group. */
export async function loadRoster(groupId: string): Promise<RosterDev[]> {
	const rows = await db
		.select({
			id: chatsAgents.id,
			name: chatsAgents.name,
			kind: chatsAgents.kind,
			ownerUserId: chatsAgents.ownerUserId,
			paradevAccess: chatsAgents.paradevAccess,
			plugins: chatsAgents.plugins,
		})
		.from(chatsGroupAgents)
		.innerJoin(chatsAgents, eq(chatsAgents.id, chatsGroupAgents.agentId))
		.where(eq(chatsGroupAgents.groupId, groupId));
	return rows.sort(
		(a, b) =>
			ORDER[a.kind] - ORDER[b.kind] ||
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
			a.id.localeCompare(b.id),
	);
}

/**
 * The Devs a person can wake in a group: its own, the ones added to it, and
 * the person's own. Another member's Dev acts with its owner's access, so
 * only its owner wakes it; everyone else asks through the group's Dev.
 */
export const mentionableDevs = (
	roster: RosterDev[],
	senderId: string | null = null,
) =>
	roster.filter(
		(dev) =>
			ownedByGroup(dev) || (senderId !== null && dev.ownerUserId === senderId),
	);

export interface Mentions {
	/** Devs to wake: every token for a Dev in the list, and a plain `@Name` only one of them has. */
	ids: string[];
	/** Plain `@Name`s several Devs share. Nobody is woken for them. */
	ambiguous: string[];
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const atName = (name: string) =>
	new RegExp(
		`(?<![\\p{L}\\p{N}_])@(${escaped(name)})(?![\\p{L}\\p{N}_])`,
		"giu",
	);

/**
 * The Devs a message mentions. A token carries the id the sender picked. A
 * typed `@Name` counts only when one candidate has that name, longest name
 * first so "@Goa trip" is not also "@Goa".
 */
export function resolveMentions(
	text: string,
	candidates: { id: string; name: string }[],
): Mentions {
	const known = new Set(candidates.map((dev) => dev.id));
	const ids = parseMentionTokens(text).flatMap((ref) =>
		ref.kind === "dev" && known.has(ref.id) ? [ref.id] : [],
	);
	const byName = new Map<string, { name: string; ids: string[] }>();
	for (const dev of candidates) {
		const key = dev.name.toLowerCase();
		const entry = byName.get(key) ?? { name: dev.name, ids: [] };
		entry.ids.push(dev.id);
		byName.set(key, entry);
	}
	let rest = splitMentions(text)
		.map((segment) => (segment.type === "text" ? segment.text : " "))
		.join("");
	const ambiguous: string[] = [];
	const names = [...byName.keys()].sort((a, b) => b.length - a.length);
	for (const key of names) {
		if (!atName(key).test(rest)) continue;
		const named = byName.get(key);
		if (!named) continue;
		const [only] = named.ids;
		if (named.ids.length === 1 && only) ids.push(only);
		else ambiguous.push(named.name);
		rest = rest.replace(atName(key), " ");
	}
	return { ids: [...new Set(ids)], ambiguous };
}
