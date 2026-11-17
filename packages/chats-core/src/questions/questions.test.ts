import { describe, expect, test } from "bun:test";
import { type ChatState, reduce } from "../chat-state/chat-state.ts";
import type { Question, QuestionPart } from "../model/model.ts";
import {
	answeredSummary,
	answerLine,
	awaitingQuestionsByChat,
	checkFormAnswers,
	emptyFormAnswers,
	formAnswerLines,
	formAnswerText,
	mayAnswer,
	openTaskQuestions,
	questionCardState,
	questionsAwaiting,
	setTyped,
	taskWaitingLabel,
	taskWaitingLabels,
	togglePick,
	withQuestion,
} from "./questions.ts";

const question = (fields: Partial<Question> = {}): Question => ({
	id: "q1",
	devId: "sol",
	taskId: null,
	kind: "select",
	title: "Which cuisine?",
	body: "",
	options: [{ label: "Italian" }, { label: "Thai", description: "Spicy" }],
	allowOther: true,
	placeholder: "",
	forUserId: null,
	status: "open",
	answer: null,
	typed: false,
	answeredBy: null,
	answeredAt: null,
	expiresAt: "2026-10-12T09:10:00.000Z",
	...fields,
});

function state(q: Question, meId = "alice"): ChatState {
	return {
		meId,
		members: {
			alice: { id: "alice", name: "Alice" },
			bob: { id: "bob", name: "Bob" },
			carol: { id: "carol", name: "Carol" },
		},
		devs: {
			sol: {
				id: "sol",
				kind: "group",
				name: "Sol",
				color: "#2F6F6A",
				ownerId: null,
				description: "",
			},
		},
		chats: [
			{
				id: "g",
				title: "Dinner",
				kind: "group",
				memberIds: ["alice", "bob"],
				ownerIds: ["alice"],
				devIds: ["sol"],
			},
		],
		messages: [
			{
				id: "m1",
				chatId: "g",
				authorId: null,
				authorDevId: "sol",
				text: q.title,
				at: "2026-10-12T09:00:00.000Z",
				question: q,
			},
		],
		tasks: [],
		apps: [],
	};
}

describe("who may answer", () => {
	test("a question for one person is theirs alone; one for anyone, any member's", () => {
		const forBob = question({ forUserId: "bob" });
		expect(mayAnswer(state(forBob, "alice"), "g", forBob)).toBe(false);
		expect(mayAnswer(state(forBob, "bob"), "g", forBob)).toBe(true);
		expect(mayAnswer(state(question(), "bob"), "g", question())).toBe(true);
		expect(mayAnswer(state(question(), "carol"), "g", question())).toBe(false);
	});
});

describe("the card", () => {
	test("open: the person it's for answers; everyone else sees who it's waiting on", () => {
		const forBob = question({ forUserId: "bob" });
		expect(questionCardState(state(forBob, "bob"), "g", forBob)).toEqual({
			kind: "ask",
		});
		expect(questionCardState(state(forBob, "alice"), "g", forBob)).toEqual({
			kind: "waiting",
			line: "Waiting for Bob",
		});
	});

	test("answered: collapses to the choice, by name for others", () => {
		const picked = question({
			status: "answered",
			answer: "Italian",
			answeredBy: "alice",
		});
		expect(questionCardState(state(picked, "alice"), "g", picked)).toEqual({
			kind: "answered",
			line: "You chose Italian",
		});
		expect(questionCardState(state(picked, "bob"), "g", picked)).toEqual({
			kind: "answered",
			line: "Alice chose Italian",
		});
		expect(
			answerLine(
				state(picked),
				question({ answer: "Thai, but mild", typed: true, answeredBy: "bob" }),
			),
		).toBe("Bob answered “Thai, but mild”");
		expect(
			answerLine(
				state(picked),
				question({ kind: "confirm", answer: "no", answeredBy: "alice" }),
			),
		).toBe("You said no");
	});

	test("expired: the Dev moved on; it can still be answered, once", () => {
		const expired = question({ status: "expired" });
		expect(questionCardState(state(expired), "g", expired)).toEqual({
			kind: "expired",
			line: "No answer — Sol moved on",
			late: null,
			canAnswer: true,
		});
		const late = question({
			status: "expired",
			answer: "Thai",
			answeredBy: "bob",
		});
		expect(questionCardState(state(late), "g", late)).toEqual({
			kind: "expired",
			line: "No answer — Sol moved on",
			late: "Bob chose Thai",
			canAnswer: false,
		});
	});

	test("cancelled: a newer message stopped the turn", () => {
		const cancelled = question({ status: "cancelled" });
		expect(questionCardState(state(cancelled), "g", cancelled)).toEqual({
			kind: "cancelled",
			line: "Sol stopped asking",
		});
	});
});

describe("attention", () => {
	test("a chat is flagged while a question there waits on the viewer", () => {
		const forBob = question({ forUserId: "bob" });
		expect(
			questionsAwaiting(state(forBob, "bob"), "g").map((m) => m.id),
		).toEqual(["m1"]);
		expect(questionsAwaiting(state(forBob, "alice"), "g")).toEqual([]);
		const answered = question({
			status: "answered",
			answer: "Thai",
			answeredBy: "bob",
		});
		expect(questionsAwaiting(state(answered, "bob"), "g")).toEqual([]);
	});

	test("a task waits on its Dev's open question", () => {
		const asked = question({ taskId: "t1" });
		expect(taskWaitingLabel(state(asked), "t1")).toBe(
			"Waiting for your answer",
		);
		expect(
			taskWaitingLabel(
				state(question({ taskId: "t1", forUserId: "bob" })),
				"t1",
			),
		).toBe("Waiting for Bob's answer");
		expect(
			taskWaitingLabel(
				state(question({ taskId: "t1", status: "answered" })),
				"t1",
			),
		).toBeNull();
		expect(taskWaitingLabel(state(asked), "t2")).toBeNull();
	});

	test("the indexes agree with the per-chat and per-task lookups, in one pass", () => {
		const base = state(question({ id: "q1", taskId: "t1" }));
		const asked = (id: string, chatId: string, q: Partial<Question>) => ({
			id,
			chatId,
			authorId: null,
			authorDevId: "sol",
			text: "?",
			at: "2026-10-12T09:01:00.000Z",
			question: question({ id, ...q }),
		});
		const s: ChatState = {
			...base,
			chats: [
				...base.chats,
				{
					id: "h",
					title: "Trip",
					kind: "group",
					memberIds: ["alice"],
					ownerIds: ["alice"],
					devIds: ["sol"],
				},
			],
			messages: [
				...base.messages,
				asked("m2", "g", { taskId: "t1", forUserId: "bob" }),
				asked("m3", "h", {}),
				asked("m4", "h", { status: "answered", taskId: "t2" }),
				{
					id: "m5",
					chatId: "h",
					authorId: "alice",
					text: "hi",
					at: "2026-10-12T09:02:00.000Z",
				},
			],
		};
		const awaiting = awaitingQuestionsByChat(s);
		for (const chat of s.chats)
			expect(awaiting.get(chat.id) ?? []).toEqual(
				questionsAwaiting(s, chat.id),
			);
		expect([...awaiting.keys()]).toEqual(["g", "h"]);
		// The newest open question is the one a task waits on.
		expect(openTaskQuestions(s).get("t1")?.id).toBe("m2");
		expect(openTaskQuestions(s).has("t2")).toBe(false);
		expect(taskWaitingLabels(s)).toEqual(
			new Map([["t1", "Waiting for Bob's answer"]]),
		);
		for (const taskId of ["t1", "t2"])
			expect(taskWaitingLabels(s).get(taskId) ?? null).toBe(
				taskWaitingLabel(s, taskId),
			);
	});

	test("answering shows at once: open collapses, expired keeps saying so with the late answer, others stay", () => {
		const env = {
			now: () => new Date("2026-10-12T09:05:00.000Z"),
			id: () => "x",
		};
		const answer = {
			type: "answer-question" as const,
			questionId: "q1",
			answer: "Thai",
			typed: false,
		};
		expect(
			reduce(state(question()), answer, env).messages[0]!.question,
		).toMatchObject({
			status: "answered",
			answer: "Thai",
			answeredBy: "alice",
			answeredAt: "2026-10-12T09:05:00.000Z",
		});
		expect(
			reduce(state(question({ status: "expired" })), answer, env).messages[0]!
				.question,
		).toMatchObject({ status: "expired", answer: "Thai" });
		const cancelled = state(question({ status: "cancelled" }));
		expect(reduce(cancelled, answer, env)).toBe(cancelled);
	});

	test("an update replaces the question on its message", () => {
		const s = state(question());
		const answered = question({
			status: "answered",
			answer: "Italian",
			answeredBy: "bob",
		});
		expect(withQuestion(s, answered).messages[0]!.question).toEqual(answered);
		expect(withQuestion(s, question({ id: "other" }))).toBe(s);
	});
});

const dates: QuestionPart = {
	header: "Dates",
	title: "When do you go?",
	options: [{ label: "October" }, { label: "November" }],
	allowOther: true,
	multiSelect: false,
};
const food: QuestionPart = {
	header: "Food",
	title: "What do you want to eat?",
	options: [{ label: "Sushi" }, { label: "Ramen" }, { label: "Plov" }],
	allowOther: true,
	multiSelect: true,
};
const form = (fields: Partial<Question> = {}) =>
	question({
		kind: "form",
		title: "Dates · Food",
		options: [],
		allowOther: false,
		parts: [dates, food],
		...fields,
	});

describe("forms: several questions, and several answers to one", () => {
	test("a single-choice part keeps one pick, typing replacing it; a multi-choice part toggles and adds what's typed", () => {
		const [d, f] = emptyFormAnswers([dates, food]);
		expect(
			togglePick(dates, togglePick(dates, d!, "October"), "November"),
		).toEqual({ picked: ["November"], typed: null });
		expect(
			setTyped(dates, { picked: ["October"], typed: null }, "December"),
		).toEqual({ picked: [], typed: "December" });
		const both = togglePick(food, togglePick(food, f!, "Ramen"), "Sushi");
		expect(both).toEqual({ picked: ["Ramen", "Sushi"], typed: null });
		expect(togglePick(food, both, "Ramen")).toEqual({
			picked: ["Sushi"],
			typed: null,
		});
		expect(setTyped(food, both, "Kebab")).toEqual({
			picked: ["Ramen", "Sushi"],
			typed: "Kebab",
		});
		expect(setTyped(food, { picked: [], typed: "Kebab" }, "")).toEqual({
			picked: [],
			typed: null,
		});
		expect(setTyped(dates, { picked: ["October"], typed: null }, " ")).toEqual({
			picked: ["October"],
			typed: null,
		});
	});

	test("answers are checked against their parts and come back in the options' order", () => {
		expect(
			checkFormAnswers(
				[dates, food],
				[
					{ picked: ["October"], typed: null },
					{ picked: ["Plov", "Sushi"], typed: " Kebab " },
				],
			),
		).toEqual({
			answers: [
				{ picked: ["October"], typed: null },
				{ picked: ["Sushi", "Plov"], typed: "Kebab" },
			],
		});
		expect(
			checkFormAnswers([dates, food], [{ picked: ["October"], typed: null }]),
		).toEqual({ problem: "Answer all 2 questions" });
		expect(
			checkFormAnswers(
				[dates, food],
				[
					{ picked: ["October"], typed: null },
					{ picked: [], typed: "  " },
				],
			),
		).toEqual({ problem: "Answer “Food”" });
		expect(
			checkFormAnswers(
				[dates],
				[{ picked: ["October", "November"], typed: null }],
			),
		).toEqual({ problem: "Pick only one answer for “Dates”" });
		expect(
			checkFormAnswers([dates], [{ picked: ["October"], typed: "Soon" }]),
		).toEqual({ problem: "Pick only one answer for “Dates”" });
		expect(
			checkFormAnswers([dates], [{ picked: ["March"], typed: null }]),
		).toEqual({ problem: "That isn't one of the options for “Dates”" });
		expect(
			checkFormAnswers(
				[{ ...dates, allowOther: false }],
				[{ picked: [], typed: "Soon" }],
			),
		).toEqual({ problem: "Pick one of the options for “Dates”" });
	});

	test("the answer reads as one line for one part, a line per part for several", () => {
		const answers = [
			{ picked: ["October"], typed: null },
			{ picked: ["Sushi", "Plov"], typed: "Kebab" },
		];
		expect(formAnswerText([dates, food], answers)).toBe(
			"Dates: October\nFood: Sushi, Plov, Kebab",
		);
		expect(formAnswerText([food], [answers[1]!])).toBe("Sushi, Plov, Kebab");
		const answered = form({
			status: "answered",
			answers,
			answer: formAnswerText([dates, food], answers),
			answeredBy: "bob",
		});
		expect(questionCardState(state(answered), "g", answered)).toEqual({
			kind: "answered",
			line: "Bob answered",
		});
		expect(formAnswerLines(answered)).toEqual([
			{ header: "Dates", answer: "October" },
			{ header: "Food", answer: "Sushi, Plov, Kebab" },
		]);
		const one = form({
			parts: [food],
			status: "answered",
			answers: [answers[1]!],
			answeredBy: "alice",
		});
		expect(answerLine(state(one), one)).toBe("You chose Sushi, Plov, Kebab");
		expect(
			answerLine(state(one), {
				...one,
				answers: [{ picked: [], typed: "Kebab" }],
			}),
		).toBe("You answered “Kebab”");
		expect(formAnswerLines(form())).toEqual([]);
	});

	test("answering a form shows at once, its answers and their text", () => {
		const env = {
			now: () => new Date("2026-10-12T09:05:00.000Z"),
			id: () => "x",
		};
		const answers = [
			{ picked: ["November"], typed: null },
			{ picked: ["Ramen"], typed: null },
		];
		expect(
			reduce(
				state(form()),
				{ type: "answer-form", questionId: "q1", answers },
				env,
			).messages[0]!.question,
		).toMatchObject({
			status: "answered",
			answers,
			answer: "Dates: November\nFood: Ramen",
			typed: false,
			answeredBy: "alice",
		});
	});
});

describe("an answered question folded to a line", () => {
	test("a single question keeps what was asked and the answer; a form of several counts its questions", () => {
		const picked = question({
			status: "answered",
			answer: "Italian",
			answeredBy: "alice",
		});
		expect(answeredSummary(state(picked), picked)).toEqual({
			asked: "Which cuisine?",
			line: "You chose Italian",
		});
		const answers = [
			{ picked: ["October"], typed: null },
			{ picked: ["Sushi"], typed: null },
		];
		const several = form({ status: "answered", answers, answeredBy: "bob" });
		expect(answeredSummary(state(several), several)).toEqual({
			asked: null,
			line: "Bob answered 2 questions",
		});
	});
});
