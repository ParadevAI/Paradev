import { beforeEach, describe, expect, it } from "bun:test";
import { useUndoStack } from "./undo-stack";

describe("useUndoStack", () => {
	beforeEach(() => useUndoStack.setState({ entries: [] }));

	it("undoes only the newest entry per call", () => {
		const undone: string[] = [];
		const { push, undoLatest } = useUndoStack.getState();
		push({ id: "archive", undo: () => undone.push("archive") });
		push({ id: "chats", undo: () => undone.push("chats") });
		undoLatest();
		expect(undone).toEqual(["chats"]);
		undoLatest();
		expect(undone).toEqual(["chats", "archive"]);
		undoLatest();
		expect(undone).toEqual(["chats", "archive"]);
	});

	it("drops a removed entry", () => {
		const undone: string[] = [];
		const { push, remove, undoLatest } = useUndoStack.getState();
		push({ id: "archive", undo: () => undone.push("archive") });
		push({ id: "chats", undo: () => undone.push("chats") });
		remove("chats");
		undoLatest();
		expect(undone).toEqual(["archive"]);
	});
});
