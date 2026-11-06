import { decisionOptions } from "../decisionCards";

const QUESTION_SENTENCE = /\?(?:\s|$)/;

/** Whether a reply ends on something for the person: a choice to pick, or a question in its last paragraph. */
export function asksYou(text: string): boolean {
	if (decisionOptions(text).length > 0) return true;
	const last = text
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.at(-1);
	return last ? QUESTION_SENTENCE.test(last) : false;
}
