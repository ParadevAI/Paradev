import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type { ApprovalRequest } from "@superset/chat/protocol";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { QuestionForm } = await import("./QuestionForm");

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const form: NonNullable<ApprovalRequest["form"]> = {
	message: "Pick an answer",
	fields: [
		{
			id: "choice",
			input: "single",
			required: true,
			options: [{ value: "sample", label: "Sample" }],
		},
		{ id: "choice_custom", input: "text", title: "Other" },
	],
};
const item: ApprovalRequest = {
	id: "question",
	startedAtMs: 0,
	kind: "approval_request",
	targetItemId: null,
	title: "Question",
	status: "pending",
	form,
};

test.each([
	{ isComposing: true, keyCode: 13 },
	{ isComposing: false, keyCode: 229 },
])("keeps IME confirmation in Other without submitting (%j)", (ime) => {
	const onRespond = mock(() => {});
	const view = render(
		<QuestionForm form={form} item={item} onRespond={onRespond} />,
	);
	const input = view.getByRole("textbox", { name: "Other" });
	fireEvent.compositionStart(input);
	fireEvent.change(input, { target: { value: "각" } });
	fireEvent.keyDown(input, { key: "Enter", ...ime });
	expect(onRespond).not.toHaveBeenCalled();
	expect((input as HTMLInputElement).value).toBe("각");
	fireEvent.compositionEnd(input, { data: "각" });
	fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 13 });
	expect(onRespond).toHaveBeenCalledTimes(1);
	expect(onRespond).toHaveBeenCalledWith("question", {
		type: "form",
		values: { choice_custom: "각" },
	});
});
