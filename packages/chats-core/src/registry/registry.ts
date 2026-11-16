import type { ChatState } from "../chat-state/chat-state.ts";
import { devChat } from "../devs/devs.ts";
import { describeRepeat } from "../repeat-rule/repeat-rule.ts";

/** A Dev in the registry, as the directory lists it (`GET /registry`). */
export interface RegistryCard {
	slug: string;
	name: string;
	version: string;
	summary: string;
	category: string;
	/** Where it can be installed: a Dev of your own, and/or added to a group. */
	for: ("you" | "group")[];
	look: string;
	/** Its voice by name ("charlie"), as the registry writes it. */
	voice: string;
	color: string;
	/** The apps it needs, and the ones it uses when they're there, by slug. */
	needs: { apps: string[]; optional: string[] };
}

/** A listing's page (`GET /registry/:slug`): everything to read before getting it. */
export interface RegistryListing extends Omit<RegistryCard, "needs"> {
	needs: {
		apps: { app: string; why: string }[];
		optional: { app: string; why: string }[];
		mcp: { name: string; why: string }[];
	};
	examples: string[];
	triggers: {
		app: string;
		type: string;
		title: string;
		instructions: string;
	}[];
	sketches: { name: string }[];
	tasks: {
		title: string;
		repeat: string | null;
		time: string | null;
		assignee: "dev" | "owner";
	}[];
	skills: string[];
	/** Markdown. */
	readme: string;
	/** Its AGENTS.md, in full. */
	instructions: string;
	changelog: string;
}

/** The directory's two shelves: Devs of your own, and Devs a group shares. */
export type RegistryShelf = "you" | "groups";

/** Whether a Dev is on a shelf: a Dev that can be both yours and a group's is on both. */
export const onShelf = (
	card: Pick<RegistryCard, "for">,
	shelf: RegistryShelf,
): boolean => card.for.includes(shelf === "groups" ? "group" : "you");

/** The shelf the directory opens on: a group's "Add a Dev" opens on groups, anywhere else on yours. */
export const defaultShelf = (fromGroup: boolean): RegistryShelf =>
	fromGroup ? "groups" : "you";

const FEATURED: Record<RegistryShelf, string> = {
	you: "chief-of-staff",
	groups: "trip-planner",
};

/** The Dev a shelf leads with, while it's listed and nothing is searched. */
export function featuredListing(
	cards: RegistryCard[],
	shelf: RegistryShelf,
	query: string,
): RegistryCard | null {
	if (query.trim()) return null;
	return (
		cards.find((c) => c.slug === FEATURED[shelf] && onShelf(c, shelf)) ?? null
	);
}

/**
 * The Devs on a shelf, or with a search, those on any shelf that match it (every word, in the name, summary or
 * category). The one you named comes first: a name that starts with the search, then one with every word in it, then
 * the rest, each in the registry's order. `shelfOnly` (browsing to add a Dev to a group) keeps a search on the shelf.
 */
export function findListings(
	cards: RegistryCard[],
	shelf: RegistryShelf,
	query: string,
	opts: { shelfOnly?: boolean } = {},
): RegistryCard[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length || opts.shelfOnly)
		cards = cards.filter((c) => onShelf(c, shelf));
	if (!words.length) return cards;
	const whole = words.join(" ");
	const rank = (c: RegistryCard) => {
		const name = c.name.toLowerCase();
		if (name.startsWith(whole)) return 0;
		return words.every((w) => name.includes(w)) ? 1 : 2;
	};
	return cards
		.filter((c) => {
			const text = `${c.name} ${c.summary} ${c.category}`.toLowerCase();
			return words.every((w) => text.includes(w));
		})
		.map((c, i) => ({ c, i, r: rank(c) }))
		.sort((a, b) => a.r - b.r || a.i - b.i)
		.map((x) => x.c);
}

/** A starter task's time in words: its repeat ("Every Sunday at 18:00", core's `describeRepeat`), or "At 10:00". */
export function starterTaskRepeat(
	rrule: string | null,
	time: string | null,
): string | null {
	const [hour, minute] = (time ?? "").split(":").map(Number);
	const at =
		time && Number.isInteger(hour) && Number.isInteger(minute)
			? { hour: hour!, minute: minute! }
			: null;
	if (rrule) return describeRepeat(rrule, at);
	return time ? `At ${time}` : null;
}

/** The apps a listing needs that the person hasn't connected, from their connected apps' slugs. */
export function missingApps(
	needs: { apps: string[] } | { apps: { app: string }[] },
	connected: Iterable<string>,
): string[] {
	const have = new Set(connected);
	return needs.apps
		.map((a) => (typeof a === "string" ? a : a.app))
		.filter((app) => !have.has(app));
}

/** A thematic break or a setext heading's underline (`---`, `===`, `***`): never joined to its neighbours. */
const RULE = /^\s*([-=*_])(\s*\1){2,}\s*$/;
const BLOCK_START = /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|\||```|~~~)/;

/**
 * A document's hard-wrapped lines joined into their paragraphs, for renderers that show every line break (the chat's
 * markdown). Lists, headings, quotes, tables and code keep their lines; a list item's wrapped continuation joins its item.
 */
export function unwrapSoftBreaks(markdown: string): string {
	const out: string[] = [];
	let fenced = false;
	for (const line of markdown.split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) {
			fenced = !fenced;
			out.push(line);
			continue;
		}
		const prev = out.at(-1);
		const joins =
			!fenced &&
			prev !== undefined &&
			prev.trim() !== "" &&
			line.trim() !== "" &&
			!BLOCK_START.test(line) &&
			!RULE.test(line) &&
			!RULE.test(prev) &&
			// Two trailing spaces are markdown's own line break: kept.
			!/ {2,}$/.test(prev) &&
			!/^\s*(#{1,6}\s|\||```|~~~)/.test(prev);
		if (joins) out[out.length - 1] = `${prev.trimEnd()} ${line.trim()}`;
		else out.push(line);
	}
	return out.join("\n");
}

/**
 * The 1:1 of the viewer's own Dev from this listing, when they have one: a Dev for one person is opened, not got
 * again (a second would share its name).
 */
export function ownedChatId(state: ChatState, slug: string): string | null {
	const mine = Object.values(state.devs).find(
		(m) => m.ownerId === state.meId && m.listing?.slug === slug,
	);
	return (mine && devChat(state, mine.id)?.id) ?? null;
}

/** The 1:1 of each of the viewer's own Devs from the registry, by listing: what "Open" opens instead of "Get". */
export function ownedListingChats(state: ChatState): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of Object.values(state.devs)) {
		if (m.ownerId !== state.meId || !m.listing) continue;
		const chat = devChat(state, m.id);
		if (chat) out[m.listing.slug] = chat.id;
	}
	return out;
}

/** Whether semver `a` is newer than `b` ("1.10.0" > "1.9.2"); anything that isn't `x.y.z` is never newer. */
function newerVersion(a: string, b: string): boolean {
	const parse = (v: string) =>
		/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null;
	const [x, y] = [parse(a), parse(b)];
	if (!x || !y) return false;
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
	return false;
}

/**
 * The registry's newer version of an installed Dev's listing, or null when it's up to date, not from the registry,
 * or no longer listed. Only shown for now: the Dev keeps what it was installed with.
 */
export function listingUpdate(
	dev: { listing?: { slug: string; version: string } | null },
	cards: Pick<RegistryCard, "slug" | "version">[],
): string | null {
	if (!dev.listing) return null;
	const listed = cards.find((c) => c.slug === dev.listing!.slug);
	return listed && newerVersion(listed.version, dev.listing.version)
		? listed.version
		: null;
}
