import { describe, expect, test } from "bun:test";
import { withMentionTokens } from "./withMentionTokens";

const al = {
	kind: "user" as const,
	id: "11111111-1111-4111-8111-111111111111",
	label: "Al",
};
const alice = {
	kind: "dev" as const,
	id: "22222222-2222-4222-8222-222222222222",
	label: "Alice (QA)",
};

describe("withMentionTokens", () => {
	test("replaces each picked name with its id token", () => {
		expect(withMentionTokens("@Alice (QA) and @Al, look", [al, alice])).toBe(
			`<@dev:${alice.id}> and <@user:${al.id}>, look`,
		);
	});

	test("leaves a longer name that was typed, not picked", () => {
		expect(withMentionTokens("@Alfred and @Al", [al])).toBe(
			`@Alfred and <@user:${al.id}>`,
		);
	});
});
