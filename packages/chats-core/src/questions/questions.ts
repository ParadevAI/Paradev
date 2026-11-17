import type { ChatState } from "../chat-state/chat-state.ts";
import { lastMatch } from "../last-match/last-match.ts";
import type {
	Message,
	Question,
	QuestionPart,
	QuestionPartAnswer,
} from "../model/model.ts";

/** What a question's card shows the viewer. */
export type QuestionCardState =
	/** Open, and the viewer may answer it. */
	| { kind: "ask" }
	/** Open, for someone else: "Waiting for Bob". */
	| { kind: "waiting"; line: string }
	/** "You chose Italian", "Bob said yes". */
	| { kind: "answered"; line: string }
	/** "No answer — Sol moved on"; `late` once someone answered after all, `canAnswer` while the viewer still may. */
	| { kind: "expired"; line: string; late: string | null; canAnswer: boolean }
	| { kind: "cancelled"; line: string };

/** Whether the viewer may answer: the person it's for, or, for anyone, any member of the chat. */
export function mayAnswer(
	state: ChatState,
	chatId: string,
	question: Question,
): boolean {
	if (question.forUserId) return question.forUserId === state.meId;
	return (
		state.chats.find((c) => c.id === chatId)?.memberIds.includes(state.meId) ??
		false
	);
}

const personName = (state: ChatState, userId: string | null) =>
	userId === state.meId
		? "You"
		: ((userId && state.members[userId]?.name) ?? "Someone");
const devName = (state: ChatState, question: Question) =>
	(question.devId && state.devs[question.devId]?.name) || "The Dev";

/** A part's answer as one line: the picks, then what was typed ("Food, Hiking, Onsen"). */
export function partAnswerText(answer: QuestionPartAnswer): string {
	return [...answer.picked, ...(answer.typed ? [answer.typed] : [])].join(", ");
}

/** A form's answers as one text, for the Dev and for clients that only read `answer`: the line, or a line per part. */
export function formAnswerText(
	parts: QuestionPart[],
	answers: QuestionPartAnswer[],
): string {
	const answerOf = (i: number) =>
		partAnswerText(answers[i] ?? { picked: [], typed: null });
	if (parts.length === 1) return answerOf(0);
	return parts
		.map((part, i) => `${part.header || part.title}: ${answerOf(i)}`)
		.join("\n");
}

/** Each part of an answered form with its answer, for the card: `[{ header: "Dates", answer: "Oct 3–10" }]`. */
export function formAnswerLines(
	question: Question,
): { header: string; answer: string }[] {
	const parts = question.parts ?? [];
	if (!question.answers || question.answers.length !== parts.length) return [];
	return parts.map((part, i) => ({
		header: part.header || part.title,
		answer: partAnswerText(question.answers![i]!),
	}));
}

/** An empty answer per part, for a form being filled in. */
export const emptyFormAnswers = (parts: QuestionPart[]): QuestionPartAnswer[] =>
	parts.map(() => ({ picked: [], typed: null }));

/**
 * Picking `label` in a part being answered: the only pick of a single-choice part (dropping what was typed), or a
 * toggle in a multi-choice one.
 */
export function togglePick(
	part: QuestionPart,
	answer: QuestionPartAnswer,
	label: string,
): QuestionPartAnswer {
	if (!part.multiSelect) return { picked: [label], typed: null };
	const picked = answer.picked.includes(label)
		? answer.picked.filter((l) => l !== label)
		: [...answer.picked, label];
	return { ...answer, picked };
}

/**
 * Typing under "Other…": in a single-choice part it replaces the pick; in a multi-choice one it's one more. Only
 * spaces is no answer, so a stray space doesn't take the pick away.
 */
export function setTyped(
	part: QuestionPart,
	answer: QuestionPartAnswer,
	text: string,
): QuestionPartAnswer {
	const typed = text.trim().length > 0 ? text : null;
	if (!part.multiSelect && typed !== null) return { picked: [], typed };
	return { ...answer, typed };
}

/**
 * Checks a form's answers against its parts: one answer per part, each with at least one pick or a typed answer
 * (exactly one in a single-choice part), picks among its options, typing only where it takes "Other…". Returns the
 * answers trimmed, with picks in the options' order, or what's wrong.
 */
export function checkFormAnswers(
	parts: QuestionPart[],
	answers: QuestionPartAnswer[],
): { answers: QuestionPartAnswer[] } | { problem: string } {
	if (answers.length !== parts.length)
		return { problem: `Answer all ${parts.length} questions` };
	const checked: QuestionPartAnswer[] = [];
	for (const [i, part] of parts.entries()) {
		const name = `“${part.header || part.title}”`;
		const typed = answers[i]!.typed?.trim() || null;
		const picked = new Set(answers[i]!.picked);
		if (
			[...picked].some((label) => !part.options.some((o) => o.label === label))
		)
			return { problem: `That isn't one of the options for ${name}` };
		if (typed !== null && !part.allowOther)
			return { problem: `Pick one of the options for ${name}` };
		const count = picked.size + (typed === null ? 0 : 1);
		if (count === 0) return { problem: `Answer ${name}` };
		if (count > 1 && !part.multiSelect)
			return { problem: `Pick only one answer for ${name}` };
		checked.push({
			picked: part.options
				.map((o) => o.label)
				.filter((label) => picked.has(label)),
			typed,
		});
	}
	return { answers: checked };
}

/** How an answer reads: "You chose Italian", "Bob said no", "You answered “Thai, but mild”"; a form's "You answered". */
export function answerLine(state: ChatState, question: Question): string {
	const who = personName(state, question.answeredBy);
	if (question.kind === "form") {
		const answers = question.answers ?? [];
		if (question.parts?.length !== 1 || answers.length !== 1)
			return `${who} answered`;
		return answers[0]!.picked.length
			? `${who} chose ${partAnswerText(answers[0]!)}`
			: `${who} answered “${answers[0]!.typed ?? ""}”`;
	}
	if (question.kind === "confirm")
		return `${who} said ${question.answer === "yes" ? "yes" : "no"}`;
	if (question.typed || question.kind === "input")
		return `${who} answered “${question.answer ?? ""}”`;
	return `${who} chose ${question.answer ?? ""}`;
}

/**
 * An answered question folded to one line: what was asked (null for a form of several, whose title is its questions
 * joined) and how it was answered. "3 questions answered" stands in for the answer lines of a form of several.
 */
export function answeredSummary(
	state: ChatState,
	question: Question,
): { asked: string | null; line: string } {
	const count = question.parts?.length ?? 0;
	if (question.kind === "form" && count > 1)
		return {
			asked: null,
			line: `${personName(state, question.answeredBy)} answered ${count} questions`,
		};
	return { asked: question.title, line: answerLine(state, question) };
}

/** The card for a question message, as this viewer sees it. */
export function questionCardState(
	state: ChatState,
	chatId: string,
	question: Question,
): QuestionCardState {
	switch (question.status) {
		case "open":
			if (mayAnswer(state, chatId, question)) return { kind: "ask" };
			return {
				kind: "waiting",
				line: question.forUserId
					? `Waiting for ${personName(state, question.forUserId)}`
					: "Waiting for an answer",
			};
		case "answered":
			return { kind: "answered", line: answerLine(state, question) };
		case "expired":
			return {
				kind: "expired",
				line: `No answer — ${devName(state, question)} moved on`,
				late: question.answer === null ? null : answerLine(state, question),
				canAnswer:
					question.answer === null && mayAnswer(state, chatId, question),
			};
		case "cancelled":
			return {
				kind: "cancelled",
				line: `${devName(state, question)} stopped asking`,
			};
	}
}

/** Open questions in a chat that the viewer may answer, oldest first: the chat list flags the chat until they do. */
export function questionsAwaiting(state: ChatState, chatId: string): Message[] {
	return state.messages.filter(
		(m) =>
			m.chatId === chatId &&
			m.question?.status === "open" &&
			mayAnswer(state, chatId, m.question),
	);
}

/**
 * `questionsAwaiting` for every chat in one pass over the messages, so a list of chats doesn't scan them per row.
 * Chats with nothing awaiting the viewer are absent.
 */
export function awaitingQuestionsByChat(
	state: ChatState,
): ReadonlyMap<string, Message[]> {
	const byChat = new Map<string, Message[]>();
	for (const m of state.messages) {
		if (
			m.question?.status !== "open" ||
			!mayAnswer(state, m.chatId, m.question)
		)
			continue;
		const list = byChat.get(m.chatId);
		if (list) list.push(m);
		else byChat.set(m.chatId, [m]);
	}
	return byChat;
}

/** Each task's newest open question (the message carrying it), in one pass: a task waits while its Dev asks. */
export function openTaskQuestions(
	state: ChatState,
): ReadonlyMap<string, Message> {
	const byTask = new Map<string, Message>();
	for (const m of state.messages)
		if (m.question?.taskId && m.question.status === "open")
			byTask.set(m.question.taskId, m);
	return byTask;
}

/** "Waiting for your answer", "Waiting for Bob's answer": what a task says while `asked`, its open question, waits. */
function waitingLabel(
	state: ChatState,
	asked: Message | undefined,
): string | null {
	if (!asked?.question) return null;
	if (mayAnswer(state, asked.chatId, asked.question))
		return "Waiting for your answer";
	return asked.question.forUserId
		? `Waiting for ${personName(state, asked.question.forUserId)}'s answer`
		: "Waiting for an answer";
}

/** "Waiting for your answer" while a task's Dev waits on a question it asked; null otherwise. */
export function taskWaitingLabel(
	state: ChatState,
	taskId: string,
): string | null {
	return waitingLabel(
		state,
		lastMatch(
			state.messages,
			(m) => m.question?.taskId === taskId && m.question.status === "open",
		),
	);
}

/** `taskWaitingLabel` for every waiting task at once (task id → label), for lists of tasks. */
export function taskWaitingLabels(
	state: ChatState,
): ReadonlyMap<string, string> {
	const labels = new Map<string, string>();
	for (const [taskId, asked] of openTaskQuestions(state))
		labels.set(taskId, waitingLabel(state, asked)!);
	return labels;
}

/** Replaces the question on its message (an answer, an expiry); messages without it are left alone. */
export function withQuestion(state: ChatState, question: Question): ChatState {
	if (!state.messages.some((m) => m.question?.id === question.id)) return state;
	return {
		...state,
		messages: state.messages.map((m) =>
			m.question?.id === question.id ? { ...m, question } : m,
		),
	};
}
