import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	type ChatUi,
	describeSelect,
	type FormAnswer,
} from "../chat-ui/chat-ui.ts";

/** The option a person picks to type their own answer. */
export const OTHER = "Other…";

/** The most questions one card asks, as the API takes them. */
const MAX_QUESTIONS = 4;

const QuestionItem = Type.Object({
	question: Type.String({
		description: "The question, as the person will read it",
	}),
	header: Type.Optional(
		Type.String({
			maxLength: 40,
			description:
				'A short label for it, like "Dates" or "Budget"; needed when asking several',
		}),
	),
	options: Type.Array(
		Type.Object({
			label: Type.String({ description: "A short answer they can pick" }),
			description: Type.Optional(
				Type.String({ description: "One line on what picking it means" }),
			),
		}),
		{ minItems: 1, maxItems: 10, description: "The answers to pick from" },
	),
	multiSelect: Type.Optional(
		Type.Boolean({
			description: "Let them pick more than one (default false)",
		}),
	),
	allowOther: Type.Optional(
		Type.Boolean({
			description:
				'Offer "Other…" so they can type their own answer (default true)',
		}),
	),
});

const QuestionParams = Type.Object({
	questions: Type.Array(QuestionItem, {
		minItems: 1,
		maxItems: MAX_QUESTIONS,
		description:
			"What to ask: one question, or up to 4 that belong together, answered at once on one card",
	}),
	who: Type.Optional(
		Type.String({
			description:
				"Who should answer: omit for the person you're working for (anyone in the chat, for a group's own Dev), \"anyone\" for anyone in the chat, or a person's name",
		}),
	),
});

/** The longest title the API takes. */
const MAX_TITLE = 2_000;

const truncate = (t: string, max: number) =>
	t.length > max ? `${t.slice(0, max - 1)}…` : t;

const text = (t: string) => ({
	content: [{ type: "text" as const, text: t }],
	details: undefined,
});

const NO_ANSWER =
	"No answer yet. The question's card stays in the chat and is your message, so end the turn now without replying: don't say you're waiting for their answer, and don't ask again. Their answer will start a new turn here (`## Answer to your question`). Reply only if you have something else to say.";

/** One answer as the tool returns it: "chose Sushi, Plov; wrote: Kebab". */
function answered(answer: FormAnswer): string {
	return [
		...(answer.picked.length ? [`chose ${answer.picked.join(", ")}`] : []),
		...(answer.typed ? [`wrote: ${answer.typed}`] : []),
	].join("; ");
}

/**
 * The `question` tool: asks the chat to pick an option, or type their own ("Other…"), and waits for the answer. Adapted
 * from pi's question example. One plain question is drawn with the extension UI's `select` and `input` (the chat's
 * cards), so it's answered with one tap; several, or one taking several answers, go on one card as a form (`askForm`),
 * answered together.
 */
export function questionExtension(askForm: ChatUi["askForm"]) {
	return (pi: ExtensionAPI) => {
		pi.registerTool({
			name: "question",
			label: "Question",
			description:
				"Ask people in this chat with options to pick from (and, by default, Other… to type an answer): one question, or up to 4 that belong together on one card, each taking one answer or several (`multiSelect`). Waits about a minute for the answers and returns them; later answers start a new turn.",
			promptSnippet:
				"Ask the chat one or more questions with options and wait for the answers",
			parameters: QuestionParams,
			executionMode: "sequential",
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				if (!ctx.hasUI) throw new Error("Nobody can answer questions here");
				const [first] = params.questions;
				if (params.questions.length === 1 && !first!.multiSelect) {
					const allowOther = first!.allowOther !== false;
					const labels = first!.options.map((o) => o.label);
					const options = describeSelect(
						allowOther ? [...labels, OTHER] : labels,
						{
							descriptions: first!.options.map((o) => o.description),
							answerer: params.who,
							other: allowOther ? OTHER : undefined,
						},
					);
					const picked = await ctx.ui.select(first!.question, options, {
						signal,
					});
					const answer =
						picked === OTHER
							? await ctx.ui.input(first!.question, "Your answer", { signal })
							: picked;
					if (answer === undefined) return text(NO_ANSWER);
					return text(
						picked === OTHER
							? `They wrote: ${answer}`
							: `They chose: ${answer}`,
					);
				}

				const headers = params.questions.map((q) => q.header?.trim() ?? "");
				if (params.questions.length > 1 && headers.some((h) => !h))
					throw new Error(
						"Give each question a short header when asking several",
					);
				const parts = params.questions.map((q, i) => ({
					header: headers[i]!,
					title: q.question,
					options: q.options,
					allowOther: q.allowOther !== false,
					multiSelect: q.multiSelect === true,
				}));
				// The card's title is what notifications and chat previews say it asks; the card itself shows each part.
				const title = truncate(
					parts.map((p) => p.title).join(" · "),
					MAX_TITLE,
				);
				const answers = await askForm(
					{ title, parts, answerer: params.who },
					signal,
				);
				if (!answers) return text(NO_ANSWER);
				if (parts.length === 1) return text(`They ${answered(answers[0]!)}`);
				return text(
					[
						"They answered:",
						...parts.map(
							(part, i) =>
								`- ${part.header} (${part.title}): ${answered(answers[i]!)}`,
						),
					].join("\n"),
				);
			},
		});
	};
}
