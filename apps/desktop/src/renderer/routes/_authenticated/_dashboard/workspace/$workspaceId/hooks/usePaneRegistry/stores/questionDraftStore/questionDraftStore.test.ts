import { expect, test } from "bun:test";
import { useQuestionDraftStore } from "./questionDraftStore";

test("forgetting a closed chat drops only its question drafts", () => {
	const { save, forget } = useQuestionDraftStore.getState();
	save("chat-closed", "question", { values: { a: "1" }, pageIndex: 0 });
	save("chat-kept", "question", { values: { a: "2" }, pageIndex: 1 });

	forget("chat-closed");

	const { drafts } = useQuestionDraftStore.getState();
	expect(drafts["chat-closed"]).toBeUndefined();
	expect(drafts["chat-kept"]?.question).toEqual({
		values: { a: "2" },
		pageIndex: 1,
	});
});
