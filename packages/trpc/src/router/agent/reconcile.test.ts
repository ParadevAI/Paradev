import { describe, expect, test } from "bun:test";
import { promptAgain } from "./reconcile";

const agent = {
	id: "agent-1",
	organizationId: "org-1",
	mainSessionId: "main-1",
};

const lost = (turn: Partial<Parameters<typeof promptAgain>[0]> = {}) => ({
	id: "turn-1",
	sessionId: "main-1",
	agentId: "agent-1",
	reason: "routine" as const,
	actingUserId: "user-1",
	triggerMessageId: null,
	routineId: "routine-1",
	promptId: "routine:routine-1:2026-11-08T15:00",
	prompt:
		'<routine id="routine-1">\n<instructions>\nPost the standup.\n</instructions>\n</routine>',
	steerPromptIds: [],
	recent: true,
	...turn,
});

describe("promptAgain", () => {
	test("a lost main-session turn is asked again with the prompt it stored", () => {
		expect(promptAgain(lost(), agent)).toEqual({
			agent,
			sessionId: "main-1",
			actingUserId: "user-1",
			promptId: "again:routine:routine-1:2026-11-08T15:00",
			text: '<routine id="routine-1">\n<instructions>\nPost the standup.\n</instructions>\n</routine>',
			reason: "routine",
			triggerMessageId: undefined,
			routineId: "routine-1",
		});
	});

	test("a turn already sent again, a task turn, one with no stored prompt, or a deleted routine's is not", () => {
		expect(promptAgain(lost({ promptId: "again:m-1" }), agent)).toBeNull();
		expect(promptAgain(lost({ sessionId: "task-1" }), agent)).toBeNull();
		expect(promptAgain(lost({ prompt: null }), agent)).toBeNull();
		expect(promptAgain(lost({ actingUserId: null }), agent)).toBeNull();
		expect(promptAgain(lost({ routineId: null }), agent)).toBeNull();
	});
});
