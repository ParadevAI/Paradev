import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type { ApprovalRequest } from "@superset/chat/protocol";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { QuestionForm } = await import("./QuestionForm");
const { ChatKeyProvider } = await import(
	"../../../../providers/ChatKeyProvider"
);
const { useQuestionDraftStore } = await import(
	"../../../../../../../../stores/questionDraftStore"
);

afterEach(() => {
	cleanup();
	useQuestionDraftStore.setState({ drafts: {} });
});
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

function renderInChat(chatKey: string, question: ApprovalRequest = item) {
	return render(
		<ChatKeyProvider value={chatKey}>
			<QuestionForm form={form} item={question} onRespond={() => {}} />
		</ChatKeyProvider>,
	);
}

const otherValue = (view: ReturnType<typeof render>) =>
	(view.getByRole("textbox", { name: "Other" }) as HTMLInputElement).value;

test("keeps a draft answer per chat when the chat unmounts and mounts again", () => {
	const first = renderInChat("chat-a");
	fireEvent.change(first.getByRole("textbox", { name: "Other" }), {
		target: { value: "draft" },
	});
	first.unmount();

	const otherChat = renderInChat("chat-b");
	expect(otherValue(otherChat)).toBe("");
	otherChat.unmount();

	expect(otherValue(renderInChat("chat-a"))).toBe("draft");
});

test("drops the draft once the question is no longer pending", () => {
	const view = renderInChat("chat-a");
	fireEvent.change(view.getByRole("textbox", { name: "Other" }), {
		target: { value: "draft" },
	});
	view.rerender(
		<ChatKeyProvider value="chat-a">
			<QuestionForm
				form={form}
				item={{ ...item, status: "answered" }}
				onRespond={() => {}}
			/>
		</ChatKeyProvider>,
	);
	expect(useQuestionDraftStore.getState().drafts["chat-a"]).toBeUndefined();
});
