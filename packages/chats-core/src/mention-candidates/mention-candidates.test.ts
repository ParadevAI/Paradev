import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Chat, Dev } from "../model/model.ts";
import {
	composerPill,
	mentionCandidates,
	mentionPill,
} from "./mention-candidates.ts";

const ID = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;
const dev = (
	id: string,
	name: string,
	kind: Dev["kind"],
	ownerId: string | null,
): Dev => ({
	id,
	name,
	kind,
	ownerId,
	color: "#F2B23E",
	description: `About ${name}`,
});

/** Me (u1) and Priya (u2) in "Goa trip": its Dev, my Juniper, Priya's Juniper. */
function fixture() {
	const chat: Chat = {
		id: "g1",
		title: "Goa trip",
		kind: "group",
		memberIds: ["u1", "u2"],
		ownerIds: ["u1"],
		devIds: [ID(1), ID(2), ID(3)],
	};
	const state: ChatState = {
		meId: "u1",
		members: {
			u1: { id: "u1", name: "harshith" },
			u2: { id: "u2", name: "Priya" },
		},
		devs: {
			[ID(1)]: dev(ID(1), "Goa trip", "group", null),
			[ID(2)]: dev(ID(2), "Juniper", "personal", "u1"),
			[ID(3)]: dev(ID(3), "Juniper", "personal", "u2"),
		},
		chats: [chat],
		messages: [],
		tasks: [],
		apps: [],
	};
	return { state, chat };
}

describe("mention candidates", () => {
	test("in a group, its own Dev (with what it's for), then members' Devs told apart by owner, then other members", () => {
		const { state, chat } = fixture();
		expect(
			mentionCandidates(state, chat).map((c) => [
				c.kind,
				c.label,
				c.owner,
				c.description,
			]),
		).toEqual([
			["dev", "Goa trip", "This group's", "About Goa trip"],
			["dev", "Juniper (yours)", "Yours", "About Juniper"],
			["dev", "Juniper (Priya's)", "Priya's", "About Juniper"],
			["user", "Priya", "Person", undefined],
		]);
	});

	test("a person who shares the group's Dev's name gets a qualifier, so every label is unique", () => {
		const { state, chat } = fixture();
		state.members.u2 = { id: "u2", name: "Goa trip" };
		expect(mentionCandidates(state, chat).map((c) => c.label)).toEqual([
			"Goa trip (group's)",
			"Juniper (yours)",
			"Juniper (Goa trip's)",
			"Goa trip (person)",
		]);
	});

	test("a 1:1 offers its Dev", () => {
		const { state } = fixture();
		const direct: Chat = {
			id: "d1",
			title: "Juniper",
			kind: "direct",
			memberIds: ["u1"],
			ownerIds: ["u1"],
			devIds: [ID(2)],
		};
		expect(
			mentionCandidates(state, direct).map((c) => [
				c.kind,
				c.id,
				c.label,
				c.owner,
			]),
		).toEqual([["dev", ID(2), "Juniper", "Yours"]]);
	});

	test("two Devs with the same name and owner are told apart by id", () => {
		const { state } = fixture();
		state.devs[ID(4)] = dev(ID(4), "Juniper", "custom", "u1");
		const direct: Chat = {
			id: "d1",
			title: "Juniper",
			kind: "direct",
			memberIds: ["u1"],
			ownerIds: ["u1"],
			devIds: [ID(2), ID(4)],
		};
		const labels = mentionCandidates(state, direct).map((c) => c.label);
		expect(labels).toContain("Juniper (yours) 4444");
		expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(
			labels.length,
		);
	});
});

describe("composerPill", () => {
	const { state, chat } = fixture();
	const candidates = mentionCandidates(state, chat);

	test("reads like the sent message's pill: the owner only for a shared Dev name", () => {
		const direct: Chat = {
			id: "d1",
			title: "Juniper",
			kind: "direct",
			memberIds: ["u1"],
			ownerIds: ["u1"],
			devIds: [ID(2), ID(3)],
		};
		expect(
			composerPill(mentionCandidates(state, direct), {
				kind: "dev",
				id: ID(3),
			}),
		).toEqual({ label: "Juniper", owner: "Priya's" });
		expect(composerPill(candidates, { kind: "dev", id: ID(1) })).toEqual({
			label: "Goa trip",
			owner: null,
		});
		expect(composerPill(candidates, { kind: "user", id: "u2" })).toEqual({
			label: "Priya",
			owner: null,
		});
	});

	test("someone not offered in the chat still gets a pill", () => {
		expect(composerPill(candidates, { kind: "dev", id: ID(9) })).toEqual({
			label: "a Dev",
			owner: null,
		});
		expect(composerPill(candidates, { kind: "user", id: "u9" })).toEqual({
			label: "someone",
			owner: null,
		});
	});
});

describe("mentionPill", () => {
	const { state, chat } = fixture();

	test("adds the owner only when another Dev in the chat shares the name", () => {
		expect(mentionPill(state, chat, { kind: "dev", id: ID(3) })).toEqual({
			name: "Juniper",
			owner: "Priya's",
		});
		expect(mentionPill(state, chat, { kind: "dev", id: ID(1) })).toEqual({
			name: "Goa trip",
		});
		expect(
			mentionPill(
				state,
				{ ...chat, devIds: [ID(2)] },
				{ kind: "dev", id: ID(2) },
			),
		).toEqual({ name: "Juniper" });
	});

	test("people by name, you as You, and unknown ids without leaking them", () => {
		expect(mentionPill(state, chat, { kind: "user", id: "u2" })).toEqual({
			name: "Priya",
		});
		expect(mentionPill(state, chat, { kind: "user", id: "u1" })).toEqual({
			name: "You",
		});
		expect(mentionPill(state, chat, { kind: "dev", id: ID(9) })).toEqual({
			name: "a Dev",
		});
	});
});
