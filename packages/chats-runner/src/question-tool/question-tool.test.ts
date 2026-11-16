import { describe, expect, test } from "bun:test";
import type {
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
	createChatUi,
	type QuestionCard,
	type QuestionStatus,
} from "../chat-ui/chat-ui.ts";
import { OTHER, questionExtension } from "./question-tool.ts";

/** The registered tool, run against a chat UI whose questions get `answers`, in order. */
function questionTool(answers: QuestionStatus[]) {
	let tool: ToolDefinition | undefined;
	const asked: QuestionCard[] = [];
	const ui = createChatUi({
		api: {
			ask: async (card) => (asked.push(card), { id: `q${asked.length}` }),
			wait: async () => answers.shift() ?? { status: "expired" },
			release: async () => ({ status: "open" }),
			cancel: async () => {},
			notify: async () => {},
		},
		turnSignal: () => undefined,
		onUpdate: () => {},
	});
	questionExtension(ui.askForm)({
		registerTool: (t: ToolDefinition) => void (tool = t),
	} as unknown as ExtensionAPI);
	const ctx = { hasUI: true, ui } as unknown as Parameters<
		ToolDefinition["execute"]
	>[4];
	const run = async (params: Record<string, unknown>) => {
		const result = await tool!.execute(
			"call-1",
			params as never,
			undefined,
			undefined,
			ctx,
		);
		return (result.content[0] as { text: string }).text;
	};
	return { tool: tool!, run, asked };
}

const cuisine = {
	question: "Which cuisine?",
	options: [{ label: "Italian" }, { label: "Thai", description: "Spicy" }],
};
const params = { questions: [cuisine] };

describe("the question tool", () => {
	test("asks with the options, Other… and who should answer, and returns the pick", async () => {
		const { tool, run, asked } = questionTool([
			{ status: "answered", answer: "Thai", typed: false },
		]);
		expect(tool.name).toBe("question");
		expect(await run({ ...params, who: "bob" })).toBe("They chose: Thai");
		expect(asked).toEqual([
			{
				kind: "select",
				title: "Which cuisine?",
				options: [
					{ label: "Italian" },
					{ label: "Thai", description: "Spicy" },
				],
				allowOther: true,
				answerer: "bob",
			},
		]);
	});

	test("a typed answer comes back as what they wrote", async () => {
		const { run } = questionTool([
			{ status: "answered", answer: "Ethiopian", typed: true },
		]);
		expect(await run(params)).toBe("They wrote: Ethiopian");
	});

	test("without Other… the card offers only the options", async () => {
		const { run, asked } = questionTool([
			{ status: "answered", answer: "Italian", typed: false },
		]);
		await run({ questions: [{ ...cuisine, allowOther: false }] });
		expect(asked[0]).toMatchObject({ allowOther: false });
		expect(OTHER).toBe("Other…");
	});

	test("no answer yet: the card is the Dev's message, so it ends the turn without saying it's waiting", async () => {
		const { run } = questionTool([{ status: "expired" }]);
		const told = await run(params);
		expect(told).toMatch(
			/^No answer yet\. The question's card stays in the chat and is your message, so end the turn now without replying: don't say you're waiting/,
		);
		expect(told).toContain(
			"Their answer will start a new turn here (`## Answer to your question`)",
		);
	});

	test("several questions go on one card as a form, each with its answers", async () => {
		const answers = [
			{ picked: ["Thai"], typed: null },
			{ picked: ["Mon", "Wed"], typed: "Fri after 6" },
		];
		const { run, asked } = questionTool([
			{ status: "answered", answer: "…", typed: true, answers },
		]);
		const days = {
			question: "Which days work?",
			header: "Days",
			options: [{ label: "Mon" }, { label: "Wed" }],
			multiSelect: true,
		};
		const told = await run({
			questions: [{ ...cuisine, header: "Food" }, days],
			who: "anyone",
		});
		expect(asked).toEqual([
			{
				kind: "form",
				title: "Which cuisine? · Which days work?",
				parts: [
					{
						header: "Food",
						title: "Which cuisine?",
						options: cuisine.options,
						allowOther: true,
						multiSelect: false,
					},
					{
						header: "Days",
						title: "Which days work?",
						options: days.options,
						allowOther: true,
						multiSelect: true,
					},
				],
				answerer: "anyone",
			},
		]);
		expect(told).toBe(
			"They answered:\n- Food (Which cuisine?): chose Thai\n- Days (Which days work?): chose Mon, Wed; wrote: Fri after 6",
		);
	});

	test("one question taking several answers is a form of one, titled by its question", async () => {
		const { run, asked } = questionTool([
			{
				status: "answered",
				answer: "Italian, Thai",
				typed: false,
				answers: [{ picked: ["Italian", "Thai"], typed: null }],
			},
		]);
		expect(await run({ questions: [{ ...cuisine, multiSelect: true }] })).toBe(
			"They chose Italian, Thai",
		);
		expect(asked[0]).toMatchObject({
			kind: "form",
			title: "Which cuisine?",
			parts: [{ header: "", multiSelect: true }],
		});
	});

	test("several questions need headers; a form nobody answered yet ends the turn the same way", async () => {
		const { run, asked } = questionTool([]);
		await expect(run({ questions: [cuisine, cuisine] })).rejects.toThrow(
			"Give each question a short header when asking several",
		);
		expect(asked).toEqual([]);
		expect(
			await run({
				questions: [
					{ ...cuisine, header: "A" },
					{ ...cuisine, header: "B" },
				],
			}),
		).toStartWith("No answer yet.");
	});
});
