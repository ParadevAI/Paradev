import { userMessageText } from "@superset/chat/core";
import type {
	ApprovalRequest,
	Decision,
	FormField,
	UserContent,
} from "@superset/chat/protocol";
import {
	isInvalidNumber,
	questionPages,
} from "../../../../utils/questionPages";

const YES = /^(yes|y|true)$/i;
const NO = /^(no|n|false)$/i;

function matchingChoice(field: FormField, text: string): string | undefined {
	if (field.input === "boolean") {
		if (YES.test(text)) return "true";
		if (NO.test(text)) return "false";
		return undefined;
	}
	const wanted = text.toLowerCase();
	return field.options?.find(
		(option) =>
			option.label.toLowerCase() === wanted ||
			option.value.toLowerCase() === wanted,
	)?.value;
}

export function composerAnswer(
	approval: ApprovalRequest,
	content: UserContent[],
): Decision | null {
	if (!approval.form) return null;
	const text = userMessageText({ content }).trim();
	if (text === "" || content.some((part) => part.type !== "text")) return null;
	const [page, ...rest] = questionPages(approval.form.fields);
	if (!page || rest.length > 0) return null;
	const { field, other } = page;
	const answer = (id: string, value: string | string[]): Decision => ({
		type: "form",
		values: { [id]: value },
	});

	const choice = matchingChoice(field, text);
	if (choice !== undefined) {
		return answer(field.id, field.input === "multi" ? [choice] : choice);
	}
	if (other) return answer(other.id, text);
	if (field.input === "text") return answer(field.id, text);
	if (
		(field.input === "number" || field.input === "integer") &&
		!isInvalidNumber(field, text)
	) {
		return answer(field.id, text);
	}
	return null;
}
