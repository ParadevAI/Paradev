import { expect, test } from "bun:test";
import { defaultChoice, type GetChoice } from "./getChoices";

const choice = (
	key: string,
	unavailable: GetChoice["unavailable"] = null,
): GetChoice => ({
	key,
	target: key === "you" ? { kind: "you" } : { kind: "group", groupId: key },
	chat: null,
	title: null,
	unavailable,
});

test("Get starts on the group the person came from, else a Dev of their own, else the first group", () => {
	const choices = [
		choice("group:a", "in-group"),
		choice("group:b"),
		choice("you"),
	];
	expect(defaultChoice(choices)).toBe("you");
	expect(defaultChoice(choices.slice(0, 2))).toBe("group:b");
	expect(defaultChoice(choices, "b")).toBe("group:b");
	expect(defaultChoice(choices, "a")).toBe("you");
	expect(defaultChoice([choice("you", "owned")])).toBeNull();
});
