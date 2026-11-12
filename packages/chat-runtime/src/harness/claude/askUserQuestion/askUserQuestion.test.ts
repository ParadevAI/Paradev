import { describe, expect, test } from "bun:test";
import { answeredInput, askedQuestions } from "./askUserQuestion";

describe("answeredInput", () => {
	const input = {
		questions: [
			{
				question: "Which caches?",
				multiSelect: true,
				options: [{ label: "Redis" }, { label: "Memcached" }],
			},
			{
				question: "Which region?",
				options: [{ label: "us-east" }, { label: "eu-west" }],
			},
		],
	};
	const questions = askedQuestions(input) ?? [];

	test("quotes a typed multi-select item that contains the separator, and keeps a single-select note", () => {
		expect(
			answeredInput(input, questions, {
				question_0: ["Redis"],
				question_0_custom: "Local, in memory",
				question_1: "eu-west",
				question_1_custom: "closest to users",
			}),
		).toEqual({
			...input,
			answers: {
				"Which caches?": 'Redis, "Local, in memory"',
				"Which region?": "eu-west",
			},
			annotations: { "Which region?": { notes: "closest to users" } },
		});
	});
});
