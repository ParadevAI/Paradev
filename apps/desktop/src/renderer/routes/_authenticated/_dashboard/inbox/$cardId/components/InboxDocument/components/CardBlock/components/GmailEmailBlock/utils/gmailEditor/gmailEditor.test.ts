import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, test } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { default: StarterKit } = await import("@tiptap/starter-kit");
const { keydownHandler } = await import("@tiptap/pm/keymap");
const { gmailEditorExtensions } = await import("./gmailEditor");

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const modIsMeta = keydownHandler({ "Mod-x": () => true })(
	{ state: {}, dispatch: () => {} } as never,
	new KeyboardEvent("keydown", { key: "x", metaKey: true }),
);

function compose(html: string, onLink = () => {}) {
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: [StarterKit, ...gmailEditorExtensions(onLink)],
		content: html,
	});
	editor.commands.selectAll();
	return editor;
}

function press(
	editor: InstanceType<typeof Editor>,
	key: string,
	shift = false,
) {
	const digit = /^\d$/.test(key);
	const event = new KeyboardEvent("keydown", {
		key: shift && digit ? "&*(".charAt(Number(key) - 7) : key,
		code: digit ? `Digit${key}` : `Key${key.toUpperCase()}`,
		keyCode: key.toUpperCase().charCodeAt(0),
		metaKey: modIsMeta,
		ctrlKey: !modIsMeta,
		shiftKey: shift,
		bubbles: true,
		cancelable: true,
	});
	editor.view.dom.dispatchEvent(event);
	return event;
}

const html = (editor: InstanceType<typeof Editor>) =>
	editor.getHTML().replace(/<p><\/p>$/, "");

function caretAfter(editor: InstanceType<typeof Editor>, text: string) {
	editor.state.doc.descendants((node, pos) => {
		if (node.isText && node.text === text)
			editor.commands.setTextSelection(pos + text.length);
	});
}

describe("Gmail's composer keys", () => {
	test("⌘⇧7 numbers the line, ⌘⇧8 bullets it, ⌘⇧9 quotes it", () => {
		for (const [key, expected] of [
			["7", "<ol><li><p>one</p></li></ol>"],
			["8", "<ul><li><p>one</p></li></ul>"],
			["9", "<blockquote><p>one</p></blockquote>"],
		] as const) {
			const editor = compose("<p>one</p>");
			press(editor, key, true);
			expect(html(editor)).toBe(expected);
			editor.destroy();
		}
	});

	test("⌘⇧X strikes through, ⌘\\ clears every format", () => {
		const editor = compose("<p>one</p>");
		press(editor, "x", true);
		expect(html(editor)).toBe("<p><s>one</s></p>");
		editor.commands.selectAll();
		press(editor, "b");
		press(editor, "\\");
		expect(html(editor)).toBe("<p>one</p>");
		editor.destroy();
	});

	test("⌘] and ⌘[ indent and outdent a list item", () => {
		const editor = compose("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
		caretAfter(editor, "two");
		press(editor, "]");
		expect(html(editor)).toBe(
			"<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul>",
		);
		press(editor, "[");
		expect(html(editor)).toBe(
			"<ul><li><p>one</p></li><li><p>two</p></li></ul>",
		);
		editor.destroy();
	});

	test("⌘[ outside a list is still the editor's, so it never navigates back", () => {
		const editor = compose("<p>one</p>");
		expect(press(editor, "[").defaultPrevented).toBe(true);
		editor.destroy();
	});

	test("⌘⇧+ and ⌘⇧- step the size between Small and Huge", () => {
		const editor = compose("<p>one</p>");
		const sized = () => editor.getAttributes("textStyle").fontSize ?? null;
		const step = (key: "+" | "_") =>
			editor.view.dom.dispatchEvent(
				new KeyboardEvent("keydown", {
					key,
					code: key === "+" ? "Equal" : "Minus",
					metaKey: modIsMeta,
					ctrlKey: !modIsMeta,
					shiftKey: true,
					bubbles: true,
					cancelable: true,
				}),
			);
		step("+");
		expect(sized()).toBe("large");
		step("+");
		step("+");
		expect(sized()).toBe("xx-large");
		step("_");
		step("_");
		step("_");
		step("_");
		expect(sized()).toBe("x-small");
		editor.destroy();
	});

	test("⌘Y redoes, as in Gmail", () => {
		const editor = compose("<p>one</p>");
		editor.commands.setTextSelection(4);
		editor.commands.insertContent(" two");
		editor.commands.undo();
		expect(html(editor)).toBe("<p>one</p>");
		press(editor, "y");
		expect(html(editor)).toBe("<p>one two</p>");
		editor.destroy();
	});

	test("⌘] and ⌘[ move a plain line in and out by Gmail's 40px", () => {
		const editor = compose("<p>one</p>");
		press(editor, "]");
		press(editor, "]");
		expect(html(editor)).toBe('<p style="margin-left: 80px;">one</p>');
		press(editor, "[");
		press(editor, "[");
		press(editor, "[");
		expect(html(editor)).toBe("<p>one</p>");
		editor.destroy();
	});

	test("Backspace at the start of a first list item: kept at the top, joined to a line above", () => {
		const backspace = (editor: InstanceType<typeof Editor>) =>
			editor.view.dom.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Backspace",
					code: "Backspace",
					keyCode: 8,
					bubbles: true,
					cancelable: true,
				}),
			);
		const top = compose("<ul><li><p>one</p></li></ul>");
		top.commands.setTextSelection(3);
		backspace(top);
		expect(html(top)).toBe("<ul><li><p>one</p></li></ul>");
		top.destroy();
		const under = compose("<p>intro</p><ul><li><p>one</p></li></ul>");
		under.commands.setTextSelection(10);
		backspace(under);
		expect(html(under)).toBe("<p>introone</p>");
		under.destroy();
	});

	test("⌘K opens the link dialog", () => {
		let opened = 0;
		const editor = compose("<p>one</p>", () => opened++);
		press(editor, "k");
		expect(opened).toBe(1);
		editor.destroy();
	});
});
