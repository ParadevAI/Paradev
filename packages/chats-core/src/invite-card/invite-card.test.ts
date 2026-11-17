import { describe, expect, test } from "bun:test";
import { inviteHeadline, invitePeopleLine } from "./invite-card.ts";

const people = (...names: string[]) => names.map((name) => ({ name }));

describe("invite card", () => {
	test("the headline names who sent the link, when they're still around", () => {
		expect(inviteHeadline({ invitedBy: "Nina" })).toBe("Nina invited you to");
		expect(inviteHeadline({ invitedBy: null })).toBe("You're invited to");
	});

	test("names up to two people and counts the rest, as Messages does", () => {
		expect(invitePeopleLine({ people: people("Nina"), peopleCount: 1 })).toBe(
			"Nina",
		);
		expect(
			invitePeopleLine({ people: people("Nina", "Priya"), peopleCount: 2 }),
		).toBe("Nina and Priya");
		expect(
			invitePeopleLine({
				people: people("Nina", "Priya", "Sam"),
				peopleCount: 3,
			}),
		).toBe("Nina, Priya and 1 other");
		expect(
			invitePeopleLine({
				people: people("Nina", "Priya", "Sam", "Ada", "Lee"),
				peopleCount: 9,
			}),
		).toBe("Nina, Priya and 7 others");
		expect(invitePeopleLine({ people: [], peopleCount: 0 })).toBe("");
	});
});
