import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import {
	defaultShelf,
	featuredListing,
	findListings,
	listingUpdate,
	missingApps,
	onShelf,
	ownedChatId,
	ownedListingChats,
	type RegistryCard,
	starterTaskRepeat,
	unwrapSoftBreaks,
} from "./registry.ts";

const card = (
	slug: string,
	category: string,
	where: ("you" | "group")[],
	summary = "",
): RegistryCard => ({
	slug,
	name: slug.replace(/-/g, " "),
	version: "1.0.0",
	summary,
	category,
	for: where,
	look: "plain",
	voice: "sarah",
	color: "#F2B23E",
	needs: { apps: [], optional: [] },
});

const cards = [
	card("trip-planner", "travel", ["group", "you"], "Plans the trip"),
	card("money", "money", ["you"], "Your budget"),
	card("reflect", "wellbeing", ["you"], "Someone to talk to"),
	card("couples", "wellbeing", ["group"], "A weekly check-in"),
	card("mentor", "mentors", ["you"]),
];

describe("the registry's shelves", () => {
	test("two shelves: yours and groups'; one made for both is on both; wellbeing Devs are yours", () => {
		expect(cards.map((c) => [onShelf(c, "you"), onShelf(c, "groups")])).toEqual(
			[
				[true, true],
				[true, false],
				[true, false],
				[false, true],
				[true, false],
			],
		);
		expect(findListings(cards, "you", "").map((c) => c.slug)).toEqual([
			"trip-planner",
			"money",
			"reflect",
			"mentor",
		]);
		expect(findListings(cards, "groups", "").map((c) => c.slug)).toEqual([
			"trip-planner",
			"couples",
		]);
	});

	test("a search looks on both shelves, every word; the directory opens on groups from a group, else on yours", () => {
		expect(findListings(cards, "you", "plans trip").map((c) => c.slug)).toEqual(
			["trip-planner"],
		);
		expect(
			findListings(cards, "groups", "WELLBEING").map((c) => c.slug),
		).toEqual(["reflect", "couples"]);
		// Adding a Dev to a group, a search finds only Devs for groups.
		expect(
			findListings(cards, "groups", "WELLBEING", { shelfOnly: true }).map(
				(c) => c.slug,
			),
		).toEqual(["couples"]);
		expect(defaultShelf(true)).toBe("groups");
		expect(defaultShelf(false)).toBe("you");
	});

	test("each shelf leads with its featured Dev, unless something's searched", () => {
		expect(featuredListing(cards, "groups", "")?.slug).toBe("trip-planner");
		expect(featuredListing(cards, "groups", "trip")).toBeNull();
		expect(
			featuredListing(
				[...cards, card("chief-of-staff", "productivity", ["you"])],
				"you",
				"",
			)?.slug,
		).toBe("chief-of-staff");
	});

	test("the Dev you named comes before ones that only mention it", () => {
		const named = [
			card("eng-lead", "work", ["you"], "A morning standup from Linear"),
			card("standup", "work", ["group"], "Asks each morning"),
			card("founder", "business", ["you"], "Numbers from Stripe"),
		];
		expect(findListings(named, "you", "standup").map((c) => c.slug)).toEqual([
			"standup",
			"eng-lead",
		]);
		expect(
			findListings(
				[...named, card("trip-planner", "travel", ["group"])],
				"you",
				"trip",
			).map((c) => c.slug),
		).toEqual(["trip-planner", "founder"]);
	});

	test("a starter task's repeat reads as words", () => {
		expect(starterTaskRepeat("FREQ=WEEKLY;BYDAY=SU", "18:00")).toBe(
			"Every Sunday at 18:00",
		);
		expect(starterTaskRepeat("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "09:30")).toBe(
			"Every weekday at 09:30",
		);
		expect(starterTaskRepeat("FREQ=DAILY", null)).toBe("Every day");
		expect(starterTaskRepeat(null, "10:00")).toBe("At 10:00");
		expect(starterTaskRepeat(null, null)).toBeNull();
	});

	test("the apps it needs that you haven't connected", () => {
		expect(missingApps({ apps: ["gmail", "linear"] }, ["linear"])).toEqual([
			"gmail",
		]);
		expect(missingApps({ apps: [{ app: "ynab" }] }, new Set(["ynab"]))).toEqual(
			[],
		);
	});
});

describe("unwrapSoftBreaks", () => {
	test("joins a paragraph's wrapped lines and a list item's continuation; keeps headings, lists, tables and code", () => {
		const doc = [
			"# Reflect",
			"",
			"You listen more than you",
			"talk, and ask questions.",
			"",
			"- **Listen first.** Let them",
			"  say it their way.",
			"- Don't fix.",
			"",
			"```",
			"keep",
			"this",
			"```",
			"| a |",
			"| b |",
		].join("\n");
		expect(unwrapSoftBreaks(doc)).toBe(
			[
				"# Reflect",
				"",
				"You listen more than you talk, and ask questions.",
				"",
				"- **Listen first.** Let them say it their way.",
				"- Don't fix.",
				"",
				"```",
				"keep",
				"this",
				"```",
				"| a |",
				"| b |",
			].join("\n"),
		);
	});

	test("leaves setext headings, rules and two-space line breaks alone", () => {
		expect(unwrapSoftBreaks("Title\n---\nText")).toBe("Title\n---\nText");
		expect(unwrapSoftBreaks("Title\n===\nmore\nwords")).toBe(
			"Title\n===\nmore words",
		);
		expect(unwrapSoftBreaks("one  \ntwo")).toBe("one  \ntwo");
	});
});

describe("ownedChatId", () => {
	test("the 1:1 of my own Dev from a listing; someone else's or a group's doesn't count", () => {
		const state: ChatState = {
			meId: "u1",
			members: {},
			devs: {
				mine: {
					id: "mine",
					kind: "custom",
					name: "Reflect",
					color: "#9DB89A",
					ownerId: "u1",
					description: "",
					listing: { slug: "reflect", version: "1.0.0" },
				},
				theirs: {
					id: "theirs",
					kind: "custom",
					name: "Money",
					color: "#3E5C3A",
					ownerId: "u2",
					description: "",
					listing: { slug: "money", version: "1.0.0" },
				},
			},
			chats: [
				{
					id: "dm",
					title: "Reflect",
					kind: "direct",
					memberIds: ["u1"],
					ownerIds: ["u1"],
					devIds: ["mine"],
				},
			],
			messages: [],
			tasks: [],
			apps: [],
		};
		expect(ownedChatId(state, "reflect")).toBe("dm");
		expect(ownedChatId(state, "money")).toBeNull();
		expect(ownedChatId(state, "calm")).toBeNull();
		expect(ownedListingChats(state)).toEqual({ reflect: "dm" });
	});
});

describe("listingUpdate", () => {
	test("the registry's newer version of what a Dev was installed with, by semver", () => {
		const cards = [
			{ slug: "reflect", version: "1.10.0" },
			{ slug: "money", version: "1.0.0" },
		];
		expect(
			listingUpdate({ listing: { slug: "reflect", version: "1.9.2" } }, cards),
		).toBe("1.10.0");
		expect(
			listingUpdate({ listing: { slug: "money", version: "1.0.0" } }, cards),
		).toBeNull();
		expect(
			listingUpdate({ listing: { slug: "gone", version: "1.0.0" } }, cards),
		).toBeNull();
		expect(listingUpdate({ listing: null }, cards)).toBeNull();
		expect(
			listingUpdate({ listing: { slug: "money", version: "2.0.0" } }, cards),
		).toBeNull();
	});
});
