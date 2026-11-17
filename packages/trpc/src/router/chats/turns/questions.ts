import {
	checkFormAnswers,
	formAnswerText,
	ownedByGroup,
	type QuestionPartAnswer,
} from "@superset/chats-core";
import { db, dbWs } from "@superset/db/client";
import {
	chatsAgents,
	chatsGroupAgents,
	chatsGroupMembers,
	chatsMessages,
	chatsQuestions,
	chatsTurns,
	users,
} from "@superset/db/schema";
import { chatsGroupChannel } from "@superset/shared/chats-realtime";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { publishChats } from "../publish";
import { toMessage, toQuestion, toUser } from "../views";
import type { BoxClaims } from "./box-auth";
import { enqueueAnswerTurn, type TurnDeps } from "./engine";

type QuestionRow = typeof chatsQuestions.$inferSelect;

/** Why a question call was refused, with the status its caller hears. */
export class QuestionError extends Error {
	constructor(
		readonly status: 400 | 403 | 404 | 409,
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

interface QuestionOptions {
	now?: () => Date;
	/** How long a question waits unless its caller says; lowered by tests. */
	timeoutMs?: number;
	/** How often a waiting box's request looks for an answer; lowered by tests. */
	pollMs?: number;
}

/** How long the card asks before it says the Dev moved on; an answer after that still reaches the Dev. */
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MAX_TIMEOUT_MS = 20 * 60_000;
const POLL_MS = 1_000;
/** How long one box request waits before answering "still open"; the box asks again. */
export const MAX_WAIT_S = 25;

const nowOf = (options: QuestionOptions) => options.now?.() ?? new Date();

const optionsSchema = z
	.array(
		z.object({
			label: z.string().trim().min(1).max(200),
			description: z.string().trim().max(500).optional(),
		}),
	)
	.max(20)
	.refine(
		(options) =>
			new Set(options.map((option) => option.label.toLowerCase())).size ===
			options.length,
		{ message: "Options must differ" },
	);

const partSchema = z.object({
	header: z.string().trim().max(40).default(""),
	title: z.string().trim().min(1).max(2_000),
	options: optionsSchema.refine((options) => options.length > 0, {
		message: "A question needs at least one option",
	}),
	allowOther: z.boolean().default(false),
	multiSelect: z.boolean().default(false),
});

const MAX_PARTS = 4;

/** A question as the runner posts it: one dialog, or a form of several, with who should answer. */
export const askSchema = z
	.object({
		kind: z.enum(["select", "confirm", "input", "form"]),
		title: z.string().trim().min(1).max(2_000),
		body: z.string().trim().max(4_000).default(""),
		options: optionsSchema.default([]),
		parts: z.array(partSchema).max(MAX_PARTS).default([]),
		allowOther: z.boolean().default(false),
		placeholder: z.string().trim().max(200).default(""),
		/** `asker`, `anyone` in the chat, or a person's name or id. Omitted: the asker, but anyone for a group's own Dev. */
		answerer: z.string().trim().min(1).max(200).optional(),
		timeoutMs: z.number().int().positive().optional(),
	})
	.refine((q) => q.kind !== "select" || q.options.length > 0, {
		message: "A select needs at least one option",
		path: ["options"],
	})
	.refine((q) => q.kind !== "form" || q.parts.length > 0, {
		message: "A form needs at least one question",
		path: ["parts"],
	});

/** One answer (an option's label, typed text, `yes` / `no`), or a form's answers, one per question. */
export const answerSchema = z.union([
	z.object({
		answer: z.string().trim().min(1).max(10_000),
		typed: z.boolean().default(false),
	}),
	z.object({
		answers: z
			.array(
				z.object({
					picked: z.array(z.string().max(200)).max(20),
					typed: z.string().max(2_000).nullable().default(null),
				}),
			)
			.min(1)
			.max(MAX_PARTS),
	}),
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function peopleIn(groupId: string) {
	const rows = await db
		.select({ user: users })
		.from(chatsGroupMembers)
		.innerJoin(users, eq(users.id, chatsGroupMembers.userId))
		.where(eq(chatsGroupMembers.groupId, groupId));
	return rows.map(({ user }) => ({
		id: user.id,
		name: toUser(user).displayName,
	}));
}

/** The person `ref` names in the chat: an id, `@name` or a name only one person here has. Never guesses. */
async function findPerson(groupId: string, ref: string) {
	const people = await peopleIn(groupId);
	const wanted = ref.replace(/^@/, "").trim().toLowerCase();
	const matches = UUID.test(wanted)
		? people.filter((person) => person.id === wanted)
		: people.filter((person) => person.name.toLowerCase() === wanted);
	if (matches.length === 1 && matches[0]) return matches[0];
	const listed = people
		.map((person) => `- ${person.name} (${person.id})`)
		.join("\n");
	if (matches.length > 1) {
		throw new QuestionError(
			409,
			"ambiguous",
			`Several people here are called "${ref}"; name one by id:\n${listed}`,
		);
	}
	throw new QuestionError(
		404,
		"not_found",
		`Nobody called "${ref}" is in this chat. People here:\n${listed}`,
	);
}

/** Who may answer: one person, or null for anyone in the chat. */
async function answererOf(
	claims: BoxClaims,
	answerer: string | undefined,
): Promise<string | null> {
	if (answerer?.toLowerCase() === "anyone") return null;
	if (answerer && answerer.toLowerCase() !== "asker") {
		return (await findPerson(claims.groupId, answerer)).id;
	}
	if (!answerer) {
		const [agent] = await db
			.select({ kind: chatsAgents.kind })
			.from(chatsAgents)
			.where(eq(chatsAgents.id, claims.agentId));
		if (agent && ownedByGroup(agent)) return null;
	}
	return claims.userId;
}

function publishQuestion(
	type: "question.answered" | "question.closed",
	question: QuestionRow,
) {
	publishChats(chatsGroupChannel(question.groupId), {
		type,
		groupId: question.groupId,
		question: toQuestion(question),
	});
}

/**
 * A question from a Dev's running turn, posted in its chat as the
 * question's card: a message that carries it. The turn waits on it.
 */
export async function askQuestion(
	claims: BoxClaims,
	input: z.output<typeof askSchema>,
	options: QuestionOptions = {},
) {
	const forUserId = await answererOf(claims, input.answerer);
	const timeout = Math.min(
		input.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		MAX_TIMEOUT_MS,
	);
	const isForm = input.kind === "form";
	const { question, message } = await dbWs.transaction(async (tx) => {
		const [turn] = await tx
			.select({ status: chatsTurns.status, parent: chatsTurns.parentTurnId })
			.from(chatsTurns)
			.where(eq(chatsTurns.id, claims.turnId));
		if (turn?.status !== "running" || turn.parent) {
			throw new QuestionError(
				409,
				"not_a_reply",
				"This turn can't ask the chat",
			);
		}
		const [question] = await tx
			.insert(chatsQuestions)
			.values({
				groupId: claims.groupId,
				agentId: claims.agentId,
				turnId: claims.turnId,
				kind: input.kind,
				title: input.title,
				body: isForm ? "" : input.body,
				options: input.kind === "select" ? input.options : [],
				allowOther: input.kind === "select" && input.allowOther,
				parts: isForm ? input.parts : [],
				placeholder: input.placeholder,
				forUserId,
				expiresAt: new Date(nowOf(options).getTime() + timeout),
			})
			.returning();
		if (!question) throw new Error("The question was not stored");
		const [message] = await tx
			.insert(chatsMessages)
			.values({
				groupId: claims.groupId,
				authorAgentId: claims.agentId,
				turnId: claims.turnId,
				text: input.title,
				questionId: question.id,
			})
			.returning();
		if (!message) throw new Error("The question's message was not stored");
		return { question, message };
	});
	publishChats(chatsGroupChannel(claims.groupId), {
		type: "question.asked",
		message: toMessage(message, question),
	});
	return toQuestion(question);
}

/** Marks an open question past its time as expired; returns the row as it now stands. */
async function expireIfDue(
	question: QuestionRow,
	options: QuestionOptions,
): Promise<QuestionRow> {
	if (question.status !== "open" || nowOf(options) < question.expiresAt) {
		return question;
	}
	const [expired] = await db
		.update(chatsQuestions)
		.set({ status: "expired" })
		.where(
			and(
				eq(chatsQuestions.id, question.id),
				eq(chatsQuestions.status, "open"),
			),
		)
		.returning();
	if (!expired) {
		const [current] = await db
			.select()
			.from(chatsQuestions)
			.where(eq(chatsQuestions.id, question.id));
		return current ?? question;
	}
	publishQuestion("question.closed", expired);
	return expired;
}

/**
 * The box's long poll for an answer to its turn's question: up to `waitS`
 * seconds, then `open` and the box asks again.
 */
export async function waitForAnswer(
	claims: BoxClaims,
	questionId: string,
	waitS: number,
	options: QuestionOptions = {},
) {
	const deadline = Date.now() + waitS * 1_000;
	for (;;) {
		const [row] = await db
			.select()
			.from(chatsQuestions)
			.where(
				and(
					eq(chatsQuestions.id, questionId),
					eq(chatsQuestions.agentId, claims.agentId),
					eq(chatsQuestions.groupId, claims.groupId),
				),
			);
		if (!row) {
			throw new QuestionError(
				404,
				"not_found",
				"No such question from this Dev here",
			);
		}
		const question = await expireIfDue(row, options);
		if (question.status !== "open" || Date.now() >= deadline) {
			const answered = question.status === "answered";
			return {
				status: question.status,
				answer: answered ? question.answer : null,
				typed: answered && question.typed,
				...(answered && question.kind === "form"
					? { answers: question.answers }
					: {}),
			};
		}
		await new Promise((resolve) =>
			setTimeout(
				resolve,
				Math.min(options.pollMs ?? POLL_MS, deadline - Date.now()),
			),
		);
	}
}

const ownOpenQuestion = (claims: BoxClaims, questionId: string) =>
	and(
		eq(chatsQuestions.id, questionId),
		eq(chatsQuestions.agentId, claims.agentId),
		eq(chatsQuestions.turnId, claims.turnId),
		eq(chatsQuestions.status, "open"),
	);

/**
 * The box stops waiting on its turn's question, so the turn can end: the
 * card stays open, and its answer starts a new turn. Returns `open` once let
 * go, or the answer or expiry that settled it first.
 */
export async function releaseQuestion(
	claims: BoxClaims,
	questionId: string,
	options: QuestionOptions = {},
) {
	const [released] = await db
		.update(chatsQuestions)
		.set({ turnWaiting: false })
		.where(ownOpenQuestion(claims, questionId))
		.returning({ id: chatsQuestions.id });
	if (released) return { status: "open" as const, answer: null, typed: false };
	return waitForAnswer(claims, questionId, 0, options);
}

/** The box stopped asking: the card says so. */
export async function cancelQuestion(claims: BoxClaims, questionId: string) {
	const [cancelled] = await db
		.update(chatsQuestions)
		.set({ status: "cancelled" })
		.where(ownOpenQuestion(claims, questionId))
		.returning();
	if (cancelled) publishQuestion("question.closed", cancelled);
}

function checkOne(question: QuestionRow, answer: string, typed: boolean) {
	if (question.kind === "confirm") {
		if (answer !== "yes" && answer !== "no") {
			throw new QuestionError(400, "invalid", "Answer yes or no");
		}
		return { answer, typed: false };
	}
	if (question.kind === "input") return { answer, typed: true };
	if (typed) {
		if (!question.allowOther) {
			throw new QuestionError(400, "invalid", "Pick one of the options");
		}
		return { answer, typed: true };
	}
	const option = question.options.find((o) => o.label === answer);
	if (!option) {
		throw new QuestionError(400, "invalid", "That isn't one of the options");
	}
	return { answer: option.label, typed: false };
}

/** Checks an answer fits the question; a form's answers are also kept as one text. */
function checkAnswer(
	question: QuestionRow,
	input: z.output<typeof answerSchema>,
): { answer: string; typed: boolean; answers: QuestionPartAnswer[] | null } {
	if (question.kind === "form") {
		if (!("answers" in input)) {
			throw new QuestionError(400, "invalid", "Answer each of the questions");
		}
		const checked = checkFormAnswers(question.parts, input.answers);
		if ("problem" in checked) {
			throw new QuestionError(400, "invalid", checked.problem);
		}
		return {
			answer: formAnswerText(question.parts, checked.answers),
			typed: checked.answers.some((answer) => answer.typed !== null),
			answers: checked.answers,
		};
	}
	if (!("answer" in input)) {
		throw new QuestionError(400, "invalid", "This question takes one answer");
	}
	return { ...checkOne(question, input.answer, input.typed), answers: null };
}

/**
 * A person's answer. Only the person it is for (or, for anyone, a member)
 * may answer, and the first answer wins. A turn still waiting reads it from
 * its poll; once the turn let go or the question expired, the answer starts
 * a new turn in the chat. The caller checks the person is in the chat.
 */
export async function answerQuestion(
	deps: TurnDeps | null,
	user: { id: string; name: string },
	row: QuestionRow,
	input: z.output<typeof answerSchema>,
	options: QuestionOptions = {},
) {
	if (row.forUserId && row.forUserId !== user.id) {
		const people = await peopleIn(row.groupId);
		throw new QuestionError(
			403,
			"forbidden",
			`This question is for ${people.find((person) => person.id === row.forUserId)?.name ?? "someone else"}`,
		);
	}
	const { answer, typed, answers } = checkAnswer(row, input);
	const question = await expireIfDue(row, options);
	const fields = {
		answer,
		typed,
		answers,
		answeredBy: user.id,
		answeredAt: nowOf(options),
	};
	const [answered] =
		question.status === "open"
			? await db
					.update(chatsQuestions)
					.set({ ...fields, status: "answered" })
					.where(
						and(
							eq(chatsQuestions.id, row.id),
							eq(chatsQuestions.status, "open"),
						),
					)
					.returning()
			: question.status === "expired"
				? await db
						.update(chatsQuestions)
						.set(fields)
						.where(
							and(
								eq(chatsQuestions.id, row.id),
								eq(chatsQuestions.status, "expired"),
								isNull(chatsQuestions.answer),
							),
						)
						.returning()
				: [];
	if (!answered) {
		throw new QuestionError(
			409,
			"already_answered",
			"This question was already answered",
		);
	}
	publishQuestion("question.answered", answered);
	const turnHasIt = answered.status === "answered" && answered.turnWaiting;
	if (deps && !turnHasIt && answered.agentId) {
		const [link] = await db
			.select({ agentId: chatsGroupAgents.agentId })
			.from(chatsGroupAgents)
			.where(
				and(
					eq(chatsGroupAgents.groupId, answered.groupId),
					eq(chatsGroupAgents.agentId, answered.agentId),
				),
			);
		if (link) await enqueueAnswerTurn(deps, answered, user);
	}
	return toQuestion(answered);
}
