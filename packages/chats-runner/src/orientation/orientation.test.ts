import { describe, expect, test } from "bun:test";
import {
	identityFromEnv,
	identityLine,
	orientationPrompt,
} from "./orientation.ts";

describe("the Dev's orientation", () => {
	test("the kind, names and description come from the wake env; without them there's no orientation", () => {
		expect(
			identityFromEnv({
				DEV_NAME: "Wren",
				DEV_KIND: "group",
				DEV_GROUP_NAME: "Goa trip",
			}),
		).toEqual({ kind: "group", name: "Wren", groupName: "Goa trip" });
		expect(
			identityFromEnv({
				DEV_NAME: "Juniper",
				DEV_KIND: "personal",
				DEV_OWNER_NAME: "alice",
				DEV_DESCRIPTION: "alice's personal Dev",
			}),
		).toEqual({
			kind: "personal",
			name: "Juniper",
			ownerName: "alice",
			description: "alice's personal Dev",
		});
		expect(
			identityFromEnv({
				DEV_NAME: "Chef",
				DEV_KIND: "custom",
				DEV_OWNER_NAME: "alice",
			}),
		).toMatchObject({ kind: "custom" });
		expect(identityFromEnv({ DEV_NAME: "Juniper" })).toBeNull();
		expect(identityFromEnv({ DEV_KIND: "group" })).toBeNull();
	});

	test("the identity line says who the Dev is and whom it serves, per kind", () => {
		expect(
			identityLine({
				kind: "personal",
				name: "Juniper",
				ownerName: "alice",
				description: "alice's personal Dev",
			}),
		).toBe("You are Juniper, alice's Dev: their personal assistant.");
		expect(
			identityLine({
				kind: "custom",
				name: "Chef",
				ownerName: "alice",
				description: "Plans our weekly meals",
			}),
		).toBe("You are Chef, a Dev alice made for: Plans our weekly meals.");
		expect(
			identityLine({
				kind: "custom",
				name: "Chef",
				ownerName: "alice",
				description: "Meal plans.",
			}),
		).toBe("You are Chef, a Dev alice made for: Meal plans.");
		expect(
			identityLine({ kind: "custom", name: "Chef", ownerName: "alice" }),
		).toBe("You are Chef, a Dev alice made.");
		expect(
			identityLine({ kind: "group", name: "Wren", groupName: "Goa trip" }),
		).toBe(
			'You are Wren, the Dev of the group "Goa trip": its guide and helper for everyone in it.',
		);
		expect(identityLine(null)).toBe(
			"You are a Dev: an agent that is a member of chats in the Dev messenger.",
		);
	});

	test("a group's Dev: its folder is the group's, then its rules, no connected apps and no you.md; members' Devs answer about members", () => {
		const text = orientationPrompt(
			{
				kind: "group",
				name: "Wren",
				groupName: "Goa trip",
				description: "The Dev of Goa trip",
			},
			"/agent",
		);
		expect(text.split("\n")[1]).toBe(
			"You belong to the group, not to any one person, and /agent is the group's.",
		);
		expect(text.split("\n")[2]).toBe(
			"People see you described as: The Dev of Goa trip",
		);
		expect(text).toContain("rules/<chat id>.md: what the group has taught you");
		expect(text).toContain("You have no owner, so no you.md.");
		expect(text).toContain(
			"For anything about a member (preferences, how they like things done, availability), ask their Dev (`dev members` shows who's whose).",
		);
		expect(text).not.toContain("memory/you.md");
		expect(text).not.toContain("You are Wren");
	});

	test("a Dev added to a group from the registry: the group's, its listing's instructions read-only, the group's wishes in its rules", () => {
		const identity = identityFromEnv({
			DEV_NAME: "Trip Planner",
			DEV_KIND: "added",
			DEV_GROUP_NAME: "Goa trip",
			DEV_DESCRIPTION: "Plans the trip with the group",
		});
		expect(identity).toEqual({
			kind: "added",
			name: "Trip Planner",
			groupName: "Goa trip",
			description: "Plans the trip with the group",
		});
		expect(identityLine(identity)).toBe(
			'You are Trip Planner, a Dev a member added to the group "Goa trip" from the Dev registry, for everyone in it. Plans the trip with the group.',
		);
		const text = orientationPrompt(identity!, "/agent");
		expect(text).toContain(
			"You belong to the group, not to any one person, and /agent is the group's.",
		);
		expect(text).toContain(
			"AGENTS.md: your instructions, from your registry listing",
		);
		expect(text).toContain("rules/<chat id>.md: what the group wants from you");
		expect(text).toContain("You have no owner, so no you.md.");
		expect(text).not.toContain("described as");
	});

	test("a person's Dev: belongs to its owner, in several chats, rules per chat and you.md in the 1:1 and for asks", () => {
		for (const kind of ["personal", "custom"] as const) {
			const text = orientationPrompt(
				{ kind, name: "Juniper", ownerName: "alice" },
				"/agent",
			);
			expect(text).toContain("You belong to alice and are in several chats");
			expect(text).not.toContain("described as");
			expect(text).toContain("rules/<chat id>.md: one per chat");
			expect(text).toContain(
				"memory/you.md: alice's preferences, loaded only in their 1:1 with you and when another Dev asks you something.",
			);
			expect(text).not.toContain("apps/");
		}
		expect(
			orientationPrompt(
				{
					kind: "personal",
					name: "Juniper",
					ownerName: "alice",
					description: "alice's personal Dev · Knows her week",
				},
				"/agent",
			),
		).toContain(
			"groups they brought you into.\nPeople see you described as: alice's personal Dev · Knows her week\n/agent is yours",
		);
		// A custom Dev's description is in its identity line already.
		expect(
			orientationPrompt(
				{
					kind: "custom",
					name: "Chef",
					ownerName: "alice",
					description: "Plans our meals",
				},
				"/agent",
			),
		).not.toContain("Plans our meals");
	});
});
