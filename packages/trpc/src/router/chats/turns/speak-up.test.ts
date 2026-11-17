import { expect, test } from "bun:test";
import { speakUpDecision } from "./speak-up";

const input = {
	group: "Launch",
	sender: "Ana",
	text: "how do I reset it",
	recent: [],
	devs: [
		{ id: "a", name: "Launch", description: "" },
		{ id: "b", name: "Notes", description: "" },
	],
};
const answers = (yes: number, first: number, second: number) => ({
	answers: {
		respond: { probabilities: { yes, no: 1 - yes } },
		agent: { probabilities: { dev_0: first, dev_1: second } },
	},
});

test("a Dev speaks up only on a confident yes and a confident pick", () => {
	expect(speakUpDecision(answers(0.95, 0.1, 0.9), input)).toBe("b");
	expect(speakUpDecision(answers(0.6, 0.1, 0.9), input)).toBeNull();
	expect(speakUpDecision(answers(0.95, 0.5, 0.5), input)).toBeNull();
	expect(speakUpDecision({}, input)).toBeNull();
});
