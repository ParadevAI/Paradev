import type { ApprovalRequest, FormField } from "@superset/chat/protocol";
import { z } from "zod";

const questionSchema = z.looseObject({
	question: z.string(),
	header: z.string().optional(),
	multiSelect: z.boolean().optional(),
	options: z
		.array(
			z.looseObject({
				label: z.string(),
				description: z.string().optional(),
			}),
		)
		.min(1),
});
export type AskedQuestion = z.infer<typeof questionSchema>;

type QuestionForm = NonNullable<ApprovalRequest["form"]>;

export function askedQuestions(
	input: Record<string, unknown>,
): AskedQuestion[] | null {
	if (!Array.isArray(input.questions)) return null;
	const questions = input.questions.flatMap((entry) => {
		const parsed = questionSchema.safeParse(entry);
		return parsed.success ? [parsed.data] : [];
	});
	return questions.length > 0 ? questions : null;
}

const fieldId = (index: number) => `question_${index}`;
const customFieldId = (index: number) => `${fieldId(index)}_custom`;

export function questionForm(questions: AskedQuestion[]): QuestionForm {
	const single = questions.length === 1;
	const fields = questions.flatMap((question, index): FormField[] => [
		{
			id: fieldId(index),
			...(question.header ? { title: question.header } : {}),
			...(single ? {} : { description: question.question }),
			input: question.multiSelect ? "multi" : "single",
			options: question.options.map((option) => ({
				value: option.label,
				label: option.label,
				...(option.description ? { description: option.description } : {}),
			})),
		},
		{
			id: customFieldId(index),
			title: "Other",
			description: question.multiSelect
				? "Type your own answer to add to your selection above (optional)."
				: "Type your own answer, or add a note to the option you chose above (optional).",
			input: "text",
		},
	]);
	return {
		message: single
			? (questions[0]?.question ?? "")
			: "Please answer the following questions.",
		fields,
	};
}

/** Claude Code splits a multi-select answer on ", ", so an item that contains it is JSON-quoted. */
function joinMultiSelect(items: string[]): string {
	return items
		.map((item) =>
			item.includes(", ") || item.includes('"') ? JSON.stringify(item) : item,
		)
		.join(", ");
}

export function answeredInput(
	input: Record<string, unknown>,
	questions: AskedQuestion[],
	values: Record<string, string | string[]>,
): Record<string, unknown> {
	const answers: Record<string, string> = {};
	const annotations: Record<string, { notes: string }> = {};
	questions.forEach((question, index) => {
		const custom = values[customFieldId(index)];
		const customText = typeof custom === "string" ? custom.trim() : "";
		const value = values[fieldId(index)];
		const picks = (Array.isArray(value) ? value : value ? [value] : []).filter(
			Boolean,
		);
		if (question.multiSelect) {
			const text = joinMultiSelect(customText ? [...picks, customText] : picks);
			if (text) answers[question.question] = text;
			return;
		}
		const picked = picks.join(", ");
		if (!picked) {
			if (customText) answers[question.question] = customText;
			return;
		}
		answers[question.question] = picked;
		if (customText) annotations[question.question] = { notes: customText };
	});
	return {
		...input,
		answers,
		...(Object.keys(annotations).length > 0 ? { annotations } : {}),
	};
}
