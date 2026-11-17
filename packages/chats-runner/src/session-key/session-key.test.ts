import { describe, expect, test } from "bun:test";
import { chatIdOf, isPublicSession, isTriggerSession } from "./session-key.ts";

const GROUP = "6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b";

describe("chatIdOf", () => {
	test("a chat's own session is the chat", () => {
		expect(chatIdOf(GROUP)).toBe(GROUP);
	});

	test("a trigger's session belongs to its chat", () => {
		expect(
			chatIdOf(`${GROUP}.trigger-7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d`),
		).toBe(GROUP);
		expect(chatIdOf("group-1.trigger-trg_42")).toBe("group-1");
	});

	test("a public page conversation's session belongs to the Dev's 1:1", () => {
		expect(
			chatIdOf(`${GROUP}.public-7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d`),
		).toBe(GROUP);
	});

	test("anything else is left as it is", () => {
		expect(chatIdOf(`${GROUP}.trigger-`)).toBe(`${GROUP}.trigger-`);
		expect(chatIdOf(`${GROUP}.trigger-a/b`)).toBe(`${GROUP}.trigger-a/b`);
		expect(chatIdOf(`${GROUP}.other-1`)).toBe(`${GROUP}.other-1`);
	});
});

test("isTriggerSession tells a trigger's session from its chat's", () => {
	expect(isTriggerSession(`${GROUP}.trigger-trg_42`)).toBe(true);
	expect(isTriggerSession(GROUP)).toBe(false);
	expect(isTriggerSession(`${GROUP}.trigger-`)).toBe(false);
});

test("isPublicSession tells a visitor's conversation from the chat's and a trigger's", () => {
	expect(isPublicSession(`${GROUP}.public-7a8b9c0d`)).toBe(true);
	expect(isPublicSession(GROUP)).toBe(false);
	expect(isPublicSession(`${GROUP}.trigger-trg_42`)).toBe(false);
	expect(isTriggerSession(`${GROUP}.public-7a8b9c0d`)).toBe(false);
});
