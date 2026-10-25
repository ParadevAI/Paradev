import { describe, expect, it } from "bun:test";
import { createPasteUndo } from "./pasteUndo";

const log = { id: "log", text: "log" };
const returned = { id: "returned", text: "returned" };

describe("createPasteUndo", () => {
	it("undoes a card only while the text is as it was after the paste", () => {
		const history = createPasteUndo();
		history.record({
			added: [log],
			removed: [],
			textBefore: "hi",
			textAfter: "hi",
		});
		expect(history.undo("hi there", [log])).toBeNull();
		expect(history.undo("hi", [log])).toEqual({
			cards: [],
			editorChanged: false,
		});
		expect(history.undo("hi", [])).toBeNull();
		expect(history.redo("hi", [])).toEqual({
			cards: [log],
			editorChanged: false,
		});
	});

	it("leaves cards it did not add or remove", () => {
		const history = createPasteUndo();
		history.record({
			added: [log],
			removed: [],
			textBefore: "",
			textAfter: "",
		});
		expect(history.undo("", [log, returned])?.cards).toEqual([returned]);
		expect(history.redo("", [returned])?.cards).toEqual([returned, log]);
	});

	it("puts a removed card back where it was and marks an editor change", () => {
		const history = createPasteUndo();
		history.record({
			added: [],
			removed: [{ entry: log, index: 0 }],
			textBefore: "hi",
			textAfter: "hilog",
		});
		expect(history.undo("hilog", [returned])).toEqual({
			cards: [log, returned],
			editorChanged: true,
		});
		expect(history.redo("hilog", [log, returned])).toBeNull();
		expect(history.redo("hi", [log, returned])).toEqual({
			cards: [returned],
			editorChanged: true,
		});
	});

	it("drops redo on a new step or a new edit", () => {
		const history = createPasteUndo();
		const step = { added: [log], removed: [], textBefore: "", textAfter: "" };
		history.record(step);
		history.undo("", [log]);
		history.record(step);
		expect(history.redo("", [log])).toBeNull();

		history.undo("", [log]);
		history.clearRedo();
		expect(history.redo("", [])).toBeNull();
	});
});
