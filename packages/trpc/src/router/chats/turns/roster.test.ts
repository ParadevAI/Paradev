import { expect, test } from "bun:test";
import { resolveMentions } from "./roster";

const goa = { id: "11111111-1111-4111-8111-111111111111", name: "Goa" };
const trip = { id: "22222222-2222-4222-8222-222222222222", name: "Goa trip" };
const twin = { id: "33333333-3333-4333-8333-333333333333", name: "Goa" };

test("a token wakes the Dev it names, and an unknown id wakes nobody", () => {
	expect(
		resolveMentions(`<@dev:${goa.id}> and <@dev:${twin.id}>`, [goa]),
	).toEqual({ ids: [goa.id], ambiguous: [] });
});

test("a typed name wakes the one Dev that has it, the longest name first", () => {
	expect(resolveMentions("hey @goa trip, look", [goa, trip])).toEqual({
		ids: [trip.id],
		ambiguous: [],
	});
});

test("a name two Devs share wakes neither", () => {
	expect(resolveMentions("@Goa?", [goa, twin])).toEqual({
		ids: [],
		ambiguous: ["Goa"],
	});
});

test("an @ inside a word is not a mention", () => {
	expect(resolveMentions("mail me@goa.com", [goa]).ids).toEqual([]);
});
