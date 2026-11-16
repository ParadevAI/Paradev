import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import { canOpenFolder } from "../dev-folder/dev-folder.ts";
import {
	chatDevs,
	chatTitle,
	defaultChat,
	describeDev,
	devChat,
	devOwnerLabel,
	mentionableDevs,
	myDev,
	myDevs,
	ownedByGroup,
} from "./devs.ts";

function state(): ChatState {
	return {
		meId: "u1",
		members: {
			u1: { id: "u1", name: "Harshith" },
			u2: { id: "u2", name: "Priya" },
		},
		devs: {
			coach: {
				id: "coach",
				kind: "custom",
				name: "Coach",
				color: "#2F6F6A",
				ownerId: "u1",
				description: "Keeps me running",
			},
			mine: {
				id: "mine",
				kind: "personal",
				name: "Dev",
				color: "#F2B23E",
				ownerId: "u1",
				description: "Your personal Dev",
			},
			priyas: {
				id: "priyas",
				kind: "personal",
				name: "Dev",
				color: "#8A4B2A",
				ownerId: "u2",
				description: "Priya's personal Dev",
			},
			goa: {
				id: "goa",
				kind: "group",
				name: "Goa trip",
				color: "#9DB89A",
				ownerId: null,
				description: "The Dev of Goa trip",
			},
		},
		chats: [
			{
				id: "g",
				title: "Goa trip",
				kind: "group",
				memberIds: ["u1", "u2"],
				ownerIds: ["u1"],
				devIds: ["priyas", "goa", "mine"],
			},
			{
				id: "dm-coach",
				title: "Coach (old name)",
				kind: "direct",
				memberIds: ["u1"],
				ownerIds: ["u1"],
				devIds: ["coach"],
			},
			{
				id: "dm",
				title: "Dev",
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
}

describe("devs", () => {
	test("myDev is the personal one I own; undefined before onboarding", () => {
		expect(myDev(state())?.id).toBe("mine");
		expect(myDev({ ...state(), devs: {} })).toBeUndefined();
	});

	test("my Devs: personal first, then my agents", () => {
		expect(myDevs(state()).map((m) => m.id)).toEqual(["mine", "coach"]);
	});

	test("the default chat is the 1:1 with my Dev, not just the first chat", () => {
		expect(defaultChat(state())?.id).toBe("dm");
		expect(devChat(state(), "coach")?.id).toBe("dm-coach");
		expect(devChat(state(), "goa")).toBeUndefined();
	});

	test("a 1:1 is titled after its Dev's current name", () => {
		const s = state();
		expect(chatTitle(s, s.chats[1]!)).toBe("Coach");
		expect(chatTitle(s, s.chats[0]!)).toBe("Goa trip");
	});

	test("a chat's Devs list the group's own first", () => {
		const s = state();
		expect(chatDevs(s, s.chats[0]!).map((m) => m.id)).toEqual([
			"goa",
			"priyas",
			"mine",
		]);
	});

	test("people can mention every Dev in a group, and a 1:1's Dev", () => {
		const s = state();
		expect(mentionableDevs(s, s.chats[0]!).map((m) => m.id)).toEqual([
			"goa",
			"priyas",
			"mine",
		]);
		expect(mentionableDevs(s, s.chats[1]!).map((m) => m.id)).toEqual(["coach"]);
	});

	test("a Dev added from the registry belongs to the group: after its own Dev, mentionable, its folder open to members", () => {
		const s = state();
		s.devs.trip = {
			id: "trip",
			kind: "added",
			name: "Trip Planner",
			color: "#8EC5E8",
			ownerId: null,
			description: "Plans the trip",
			listing: { slug: "trip-planner", version: "1.0.0" },
		};
		s.chats[0]!.devIds.push("trip");
		expect(chatDevs(s, s.chats[0]!).map((m) => m.id)).toEqual([
			"goa",
			"trip",
			"priyas",
			"mine",
		]);
		expect(mentionableDevs(s, s.chats[0]!).map((m) => m.id)).toEqual([
			"goa",
			"trip",
			"priyas",
			"mine",
		]);
		expect(devOwnerLabel(s, s.devs.trip)).toBe("Added here");
		expect(ownedByGroup(s.devs.trip)).toBe(true);
		expect(ownedByGroup(s.devs.mine!)).toBe(false);
		expect(canOpenFolder(s.devs.trip, "u2")).toBe(true);
		expect(canOpenFolder(s.devs.priyas!, "u1")).toBe(false);
	});

	test("Devs with the same name are told apart by owner", () => {
		const s = state();
		expect(
			[s.devs.mine!, s.devs.priyas!, s.devs.goa!].map((m) =>
				devOwnerLabel(s, m),
			),
		).toEqual(["Yours", "Priya's", "This group's"]);
	});

	test("a personal Dev's description opens with whose it is, for each reader; other kinds are their own text", () => {
		const personal = { kind: "personal" as const };
		expect(
			describeDev(personal, "", { isOwner: true, ownerName: "Alice" }),
		).toBe("Your personal Dev");
		expect(
			describeDev(personal, "", { isOwner: false, ownerName: "Alice" }),
		).toBe("Alice's personal Dev");
		expect(
			describeDev(personal, "Runs my errands", {
				isOwner: false,
				ownerName: "Alice",
			}),
		).toBe("Alice's personal Dev · Runs my errands");
		expect(describeDev(personal, "", { isOwner: false, ownerName: null })).toBe(
			"A member's personal Dev",
		);
		expect(
			describeDev({ kind: "group" }, "The Dev of Goa trip", {
				isOwner: false,
				ownerName: null,
			}),
		).toBe("The Dev of Goa trip");
		expect(
			describeDev({ kind: "custom" }, "Plans trips", {
				isOwner: true,
				ownerName: "Alice",
			}),
		).toBe("Plans trips");
	});
});
