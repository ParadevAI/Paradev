import type { FormField } from "../../protocol";

export type FormValues = Record<string, string | string[]>;

export type QuestionPage = {
	field: FormField;
	other?: FormField;
};

export function questionPages(fields: readonly FormField[]): QuestionPage[] {
	const pages: QuestionPage[] = fields.map((field) => ({ field }));
	const choices = new Map(
		pages
			.filter(({ field }) => field.input === "single")
			.map((page) => [page.field.id, page]),
	);
	// Reserve the first explicitly linked note before applying the legacy adjacency rule.
	const linked = new Set<QuestionPage>();
	for (const page of pages) {
		const { field } = page;
		if (field.input !== "text" || field.answerFor === undefined) continue;
		const choice = choices.get(field.answerFor);
		if (choice && !choice.other) {
			choice.other = field;
			linked.add(page);
		}
	}

	const questions: QuestionPage[] = [];
	for (const page of pages) {
		if (linked.has(page)) continue;
		const { field } = page;
		const previous = questions.at(-1);
		if (
			(previous?.field.input === "single" ||
				previous?.field.input === "multi") &&
			!previous.other &&
			field.input === "text" &&
			field.answerFor === undefined &&
			field.id === `${previous.field.id}_custom`
		) {
			previous.other = field;
		} else {
			questions.push(page);
		}
	}
	return questions;
}

export function answerText(value: string | string[] | undefined): string {
	if (Array.isArray(value)) return value.join(", ");
	return value?.trim() ?? "";
}

export function isInvalidNumber(
	field: FormField,
	value: string | string[] | undefined,
): boolean {
	if (field.input !== "number" && field.input !== "integer") return false;
	if (Array.isArray(value)) return value.length > 0;
	const text = answerText(value);
	if (text === "") return false;
	const parsed = Number(text);
	return (
		!Number.isFinite(parsed) ||
		(field.input === "integer" && !Number.isInteger(parsed))
	);
}

function hasWrittenAnswer(page: QuestionPage, values: FormValues): boolean {
	const written = page.other && values[page.other.id];
	return typeof written === "string" && written.trim() !== "";
}

export function isPageAnswered(
	page: QuestionPage,
	values: FormValues,
): boolean {
	return (
		answerText(values[page.field.id]) !== "" || hasWrittenAnswer(page, values)
	);
}

export function isPageComplete(
	page: QuestionPage,
	values: FormValues,
): boolean {
	const { field, other } = page;
	const answered =
		field.input === "single"
			? isPageAnswered(page, values)
			: answerText(values[field.id]) !== "";
	return (
		(!field.required || answered) &&
		(!other?.required || hasWrittenAnswer(page, values)) &&
		!isInvalidNumber(field, values[field.id])
	);
}
