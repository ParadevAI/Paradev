import { describe, expect, test } from "bun:test";
import type { ComposerDraft } from "@superset/chat-ui/PromptInput";
import { restoreCommand } from "./restoreCommand";

function composer(text: string) {
	const input = {
		text,
		isEmpty: () => input.text.trim() === "",
		restoreDraft: (draft: ComposerDraft) => {
			const added = draft.segments
				.map((segment) => (segment.type === "text" ? segment.text : ""))
				.join("");
			input.text = input.text ? `${input.text}\n${added}` : added;
		},
	};
	return input;
}

describe("restoreCommand", () => {
	test("puts the command back in an empty composer", () => {
		const input = composer("");
		let offered = false;
		restoreCommand({ current: input }, "/automation check CI", () => {
			offered = true;
		});
		expect(input.text).toBe("/automation check CI");
		expect(offered).toBe(false);
	});

	test("leaves a new message alone and adds the command only on request", () => {
		const input = composer("a new message");
		let restore: (() => void) | undefined;
		restoreCommand({ current: input }, "/automation check CI", (callback) => {
			restore = callback;
		});
		expect(input.text).toBe("a new message");
		restore?.();
		expect(input.text).toBe("a new message\n/automation check CI");
	});
});
