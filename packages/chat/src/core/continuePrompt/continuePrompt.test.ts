import { describe, expect, test } from "bun:test";
import type { UserContent } from "../../protocol/items";
import {
	CONTINUE_AFTER_UPDATE_PROMPT,
	CONTINUE_PROMPT,
	isContinuePrompt,
	withoutWaitingContinues,
} from "./continuePrompt";

const text = (value: string): UserContent[] => [{ type: "text", text: value }];
const PROCEED = text(CONTINUE_PROMPT);
const FOLLOW_UP = text("then run the tests");

describe("isContinuePrompt", () => {
	test("matches both wordings and nothing a person added to", () => {
		expect(isContinuePrompt(PROCEED)).toBe(true);
		expect(isContinuePrompt(text(CONTINUE_AFTER_UPDATE_PROMPT))).toBe(true);
		expect(isContinuePrompt(text(`Fix the bug. ${CONTINUE_PROMPT}`))).toBe(
			false,
		);
		expect(isContinuePrompt([...PROCEED, ...FOLLOW_UP])).toBe(false);
	});
});

describe("withoutWaitingContinues", () => {
	test("a waiting continue becomes an interruption and the rest keeps its order", () => {
		expect(
			withoutWaitingContinues({
				interrupted: false,
				prompts: [FOLLOW_UP, PROCEED, PROCEED],
				pausedPrompts: [PROCEED, text("and the docs")],
			}),
		).toEqual({
			interrupted: true,
			prompts: [FOLLOW_UP],
			pausedPrompts: [text("and the docs")],
		});
	});

	test("work with no continue waiting is left as it is", () => {
		const work = {
			interrupted: false,
			prompts: [FOLLOW_UP],
			pausedPrompts: [],
		};
		expect(withoutWaitingContinues(work)).toBe(work);
	});
});
