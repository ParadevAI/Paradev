import { describe, expect, test } from "bun:test";
import type { AgentMessage } from "@superset/chat/protocol";
import {
	decisionCardsFromMessage,
	decisionOptions,
	parseDecision,
} from "./decisionCards";

const ASKED = `I'm not sure what you meant, so I'd rather check than guess. Did you mean one of these?

1. **File the findings as tickets.** I'd turn the 9 proposed fixes into tickets, each sized to one PR.
2. **Post a decision card.** I'd publish a card page from the \`demo-card\` workspace.
3. **Something else.** For example, whether the agents can mention you in this channel's chat.

Which one?`;

describe("decisionOptions", () => {
	test("turns a numbered list the reply asks you to pick from into options", () => {
		expect(decisionOptions(ASKED)).toEqual([
			"File the findings as tickets",
			"Post a decision card",
			"Something else",
		]);
	});

	test("a plain question before the list is enough", () => {
		expect(
			decisionOptions(
				"The workspace is idle now. What should I do with it?\n\n1. **Keep it.** It stays in this channel.\n2. **Archive it.** Nothing in it needs saving.",
			),
		).toEqual(["Keep it", "Archive it"]);
	});

	test("splits the reply into what it asks and what each option means", () => {
		const decision = parseDecision(
			"The workspace is idle now. What should I do with it?\n\n1. **Keep it.** It stays in this channel.\n2. **Archive it.** Nothing in it needs saving.\n3. Something else",
		);
		expect(decision?.intro).toBe(
			"The workspace is idle now. What should I do with it?",
		);
		expect(decision?.options).toEqual([
			{ label: "Keep it", detail: "It stays in this channel." },
			{ label: "Archive it", detail: "Nothing in it needs saving." },
			{ label: "Something else", detail: null },
		]);
	});

	test("the question may have a sentence after it", () => {
		expect(
			decisionOptions(
				"What should I do with the `demo-card` workspace? It's empty and has no agent.\n\n1. **Publish a decision card from it.** One card page.\n2. **Leave it empty.** It stays as it is.",
			),
		).toEqual(["Publish a decision card from it", "Leave it empty"]);
	});

	test("uses the first sentence when there is no bold lead", () => {
		const text =
			"Which option?\n\n1. Keep the tabs as they are: nothing moves.\n2. Fold them into the title bar";
		expect(decisionOptions(text)).toEqual([
			"Keep the tabs as they are",
			"Fold them into the title bar",
		]);
	});

	test("leaves open questions, reports and loose lists as prose", () => {
		expect(
			decisionOptions(
				"Questions for you:\n1. Should the pane open by itself?\n2. Is 360px wide enough?",
			),
		).toEqual([]);
		expect(
			decisionOptions(
				"Done. I changed:\n1. The tab strip.\n2. The close button.\n\nWant me to continue?",
			),
		).toEqual([]);
		expect(decisionOptions("Which one?\n\n1. Only one")).toEqual([]);
		expect(decisionOptions("Pick one:\n1. First\n3. Third\n2. Second")).toEqual(
			[],
		);
	});

	test("keys the card to the message", () => {
		const message = {
			id: "m1",
			kind: "agent_message",
			startedAtMs: 0,
			text: ASKED,
		} as AgentMessage;
		expect(decisionCardsFromMessage(message)).toMatchObject([
			{
				kind: "decision",
				key: "decision:m1",
				messageId: "m1",
				options: [
					"File the findings as tickets",
					"Post a decision card",
					"Something else",
				],
			},
		]);
	});
});
