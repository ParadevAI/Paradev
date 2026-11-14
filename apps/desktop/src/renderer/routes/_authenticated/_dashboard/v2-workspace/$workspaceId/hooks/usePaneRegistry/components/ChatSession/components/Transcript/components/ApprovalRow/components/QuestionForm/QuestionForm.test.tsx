import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { QuestionForm } from "./QuestionForm";

afterEach(cleanup);

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
	fireEvent.change(view.getByRole("textbox"), {
		target: { value: "Use the side entrance" },
	});
	fireEvent.click(view.getByRole("button", { name: /^Courier/ }));
	fireEvent.click(view.getByRole("button", { name: "Submit" }));
	expect(respond).toHaveBeenCalledWith("question", {
		type: "form",
		values: { delivery: "courier", delivery_note: "Use the side entrance" },
	});
});
