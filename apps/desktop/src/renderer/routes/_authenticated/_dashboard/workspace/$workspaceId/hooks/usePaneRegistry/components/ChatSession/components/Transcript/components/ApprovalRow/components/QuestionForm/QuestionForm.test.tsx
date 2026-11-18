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
])("keeps IME confirmation in a written answer without submitting (%j)", (ime) => {
	const onRespond = mock(() => {});
	const view = render(
		<QuestionForm form={form} item={item} onRespond={onRespond} />,
	);
	fireEvent.click(view.getByRole("button", { name: "Write my own answer" }));
	const input = view.getByRole("textbox", { name: "Write my own answer" });
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

test("changing the suggested choice keeps its note in the submitted answer", () => {
	const respond = mock();
	const view = render(
		<QuestionForm
			item={{
				id: "question",
				kind: "approval_request",
				status: "pending",
				targetItemId: null,
				startedAtMs: 0,
				title: "Delivery",
			}}
			form={{
				message: "Delivery",
				fields: [
					{
						id: "delivery",
						input: "single",
						required: true,
						options: [
							{ label: "Mail", value: "mail" },
							{ label: "Courier", value: "courier" },
						],
					},
					{ id: "delivery_note", input: "text", answerFor: "delivery" },
				],
			}}
			onRespond={respond}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: /^Mail/ }));
	fireEvent.change(view.getByRole("textbox", { name: "Add a note" }), {
		target: { value: "Use the side entrance" },
	});
	fireEvent.click(view.getByRole("button", { name: /^Courier/ }));
	fireEvent.click(view.getByRole("button", { name: "Submit" }));
	expect(respond).toHaveBeenCalledWith("question", {
		type: "form",
		values: { delivery: "courier", delivery_note: "Use the side entrance" },
	});
});
