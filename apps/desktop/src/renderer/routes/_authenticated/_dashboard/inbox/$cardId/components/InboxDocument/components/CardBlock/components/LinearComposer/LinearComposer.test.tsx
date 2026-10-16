import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, test } = await import(
	"bun:test"
);
mock.module("renderer/lib/clickPolicy", () => ({
	useUrlLinkAction: () => () => null,
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		external: { openUrl: { useMutation: () => ({ mutate: () => {} }) } },
	},
}));
const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	useNavigate: () => () => {},
}));
const { act, cleanup, render } = await import("@testing-library/react");
const { keydownHandler } = await import("@tiptap/pm/keymap");
const { TextSelection } = await import("@tiptap/pm/state");
const { lena, marcus, riya } = await import("../linearFixtures");
const { LinearComposer } = await import("./LinearComposer");

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/** ProseMirror decides Mod (⌘ or Ctrl) once, when its keymap module first loads, so ask it. */
const modIsMeta = keydownHandler({ "Mod-x": () => true })(
	{ state: {}, dispatch: () => {} } as never,
	new KeyboardEvent("keydown", { key: "x", metaKey: true }),
);

const KEY_CODES: Record<string, number> = {
	"&": 55,
	"*": 56,
	"(": 57,
	"|": 220,
	Enter: 13,
	Tab: 9,
	Backspace: 8,
};

function press(editor: Editor, spec: string) {
	const [key = "", ...mods] = spec.split("+");
	const event = new KeyboardEvent("keydown", {
		key,
		keyCode:
			KEY_CODES[key] ??
			(key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined),
		metaKey: mods.includes("meta") && modIsMeta,
		ctrlKey: mods.includes("meta") && !modIsMeta,
		shiftKey: mods.includes("shift"),
		bubbles: true,
		cancelable: true,
	});
	editor.view.dom.dispatchEvent(event);
	return event;
}

function typeChar(editor: Editor, ch: string) {
	const event = new KeyboardEvent("keydown", {
		key: ch,
		bubbles: true,
		cancelable: true,
	});
	editor.view.dom.dispatchEvent(event);
	if (event.defaultPrevented) return;
	const { view } = editor;
	const { from, to } = view.state.selection;
	const handled = view.someProp("handleTextInput", (f) =>
		f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
	);
	if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
}

/** The document in the notation of the Linear matrix: one block a line, marks as `*bold*`, `_italic_`, `~strike~`, `+underline+`. */
function notate(doc: ProseMirrorNode): string {
	const MARKS: Record<string, string> = {
		bold: "*",
		italic: "_",
		strike: "~",
		underline: "+",
		code: "`",
	};
	const inline = (block: ProseMirrorNode) => {
		let out = "";
		block.forEach((child) => {
			if (child.type.name === "hardBreak") return;
			let text = child.isText
				? (child.text ?? "")
				: `@${child.attrs.name ?? ""}`;
			for (const mark of [...child.marks].reverse())
				text =
					mark.type.name === "link"
						? `[${text}](link)`
						: `${MARKS[mark.type.name] ?? ""}${text}${MARKS[mark.type.name] ?? ""}`;
			out += text;
		});
		return out;
	};
	const lines: string[] = [];
	const walk = (parent: ProseMirrorNode, depth: number) =>
		parent.forEach((node) => {
			const pad = "  ".repeat(depth);
			const name = node.type.name;
			if (name === "paragraph") lines.push(`${pad}p ${inline(node)}`);
			else if (name === "heading")
				lines.push(`${pad}h${node.attrs.level} ${inline(node)}`);
			else if (name === "codeBlock")
				for (const line of node.textContent.split("\n"))
					lines.push(`${pad}pre ${line}`);
			else if (name === "horizontalRule") lines.push(`${pad}hr`);
			else if (name === "blockquote")
				node.forEach((child) => {
					lines.push(`${pad}quote ${inline(child)}`);
				});
			else {
				const kind =
					name === "orderedList" ? "ol" : name === "taskList" ? "todo" : "ul";
				node.forEach((item) => {
					item.forEach((child) => {
						if (child.type.name === "paragraph")
							lines.push(`${pad}${kind} ${inline(child)}`);
						else walk(item.copy(item.content.cut(0)).cut(0, 0), depth);
					});
					const nested = item.content.content.filter(
						(child) => child.type.name !== "paragraph",
					);
					for (const list of nested)
						walk(list.type.schema.node("doc", null, [list]), depth + 1);
				});
			}
		});
	walk(doc, 0);
	return lines.join("\n");
}

async function open(value = "") {
	const onChange = mock();
	const onSubmit = mock();
	const { container } = render(
		<LinearComposer
			kind="reply"
			value={value}
			onChange={onChange}
			onSubmit={onSubmit}
			placeholder="Leave a reply…"
			mentionable={[lena, marcus, riya]}
		/>,
	);
	const dom = container.querySelector(
		"[data-linear-composer] .ProseMirror",
	) as HTMLElement & { editor: Editor };
	const editor = dom.editor;
	await act(async () => {
		editor.commands.focus("end");
	});
	const play = async (...steps: string[]) => {
		for (const step of steps) {
			const [op = "", ...rest] = step.split(":");
			const arg = rest.join(":");
			await act(async () => {
				if (op === "type") for (const ch of arg) typeChar(editor, ch);
				else if (op === "key") {
					const [, spec = "", times = "1"] =
						/^(.+?)(?:\*(\d+))?$/.exec(arg) ?? [];
					for (let i = 0; i < Number(times); i++) press(editor, spec);
				} else if (op === "select") {
					const size = editor.state.doc.content.size;
					editor.view.dispatch(
						editor.state.tr.setSelection(
							TextSelection.create(
								editor.state.doc,
								size - 1 - Number(arg),
								size - 1,
							),
						),
					);
				} else if (op === "caret")
					editor.view.dispatch(
						editor.state.tr.setSelection(
							TextSelection.create(editor.state.doc, Number(arg)),
						),
					);
				else if (op === "wait")
					await new Promise((resolve) => setTimeout(resolve, 30));
			});
		}
		return notate(editor.state.doc);
	};
	const markdown = () => onChange.mock.calls.at(-1)?.[0] as string;
	return { container, editor, play, markdown, onSubmit };
}

describe("markdown turns into formatting as it is typed, as in Linear", () => {
	const cells: [string, string[], string, string][] = [
		["**bold**", ["type:a **bold** b"], "p a *bold* b", "a **bold** b"],
		["__bold__", ["type:a __bold__ b"], "p a *bold* b", "a **bold** b"],
		["*italic*", ["type:a *it* b"], "p a _it_ b", "a *it* b"],
		["_italic_", ["type:a _it_ b"], "p a _it_ b", "a *it* b"],
		["`code`", ["type:a `code` b"], "p a `code` b", "a `code` b"],
		["~strike~", ["type:a ~st~ b"], "p a ~st~ b", "a ~~st~~ b"],
		[
			"[text](url)",
			["type:a [docs](https://example.com) b"],
			"p a [docs](link) b",
			"a [docs](https://example.com) b",
		],
		['"- "', ["type:- item"], "ul item", "- item"],
		['"* "', ["type:* item"], "ul item", "- item"],
		['"1. "', ["type:1. item"], "ol item", "1. item"],
		['"[] "', ["type:[] item"], "todo  item", "- [ ]  item"],
		['"- [ ] "', ["type:- [ ] item"], "todo  item", "- [ ]  item"],
		['"> "', ["type:> quote"], "quote quote", "> quote"],
		['"# "', ["type:# Title"], "h1 Title\np ", "# Title"],
		['"## "', ["type:## Title"], "h2 Title\np ", "## Title"],
		['"### "', ["type:### Title"], "h3 Title\np ", "### Title"],
		[
			'"```" then Enter',
			["type:```", "key:Enter", "type:code"],
			"pre \npre code\np ",
			"```\n\ncode\n```",
		],
		['"``` "', ["type:``` ", "type:code"], "pre  code\np ", "```\n code\n```"],
	];
	for (const [label, steps, doc, markdown] of cells)
		test(label, async () => {
			const composer = await open();
			expect(await composer.play(...steps)).toBe(doc);
			expect(composer.markdown().trim()).toBe(markdown);
		});

	test("~~strike~~ stays as typed", async () => {
		const composer = await open();
		expect(await composer.play("type:a ~~st~~ b")).toBe("p a ~~st~~ b");
		expect(composer.editor.getJSON().content?.[0]?.content).toHaveLength(1);
	});

	test('"---" makes a divider', async () => {
		const composer = await open();
		expect(await composer.play("type:---", "type:x")).toBe("hr\np x");
	});

	test("a :name: typed in full stays as typed", async () => {
		const composer = await open();
		expect(await composer.play("type:ok :+1: ")).toBe("p ok :+1: ");
	});
});

describe("keys", () => {
	const cells: [string, string[], string][] = [
		["⌘B", ["type:one two", "select:3", "key:b+meta"], "p one *two*"],
		["⌘I", ["type:one two", "select:3", "key:i+meta"], "p one _two_"],
		["⌘U", ["type:one two", "select:3", "key:u+meta"], "p one +two+"],
		["⌘⇧X", ["type:one two", "select:3", "key:X+meta+shift"], "p one ~two~"],
		[
			"⌘⇧S does nothing",
			["type:one two", "select:3", "key:S+meta+shift"],
			"p one two",
		],
		["⌘E", ["type:one two", "select:3", "key:e+meta"], "p one `two`"],
		["⌘⇧7 checklist", ["type:item", "key:&+meta+shift"], "todo item"],
		["⌘⇧8 bulleted", ["type:item", "key:*+meta+shift"], "ul item"],
		["⌘⇧9 numbered", ["type:item", "key:(+meta+shift"], "ol item"],
		["⌘⇧\\ code block", ["type:item", "key:|+meta+shift"], "p item\npre \np "],
		["Enter", ["type:one", "key:Enter", "type:two"], "p one\np two"],
		["⇧Enter", ["type:one", "key:Enter+shift", "type:two"], "p onetwo"],
		[
			"Enter in a list item",
			["type:- one", "key:Enter", "type:two"],
			"ul one\nul two",
		],
		[
			"Enter on an empty list item",
			["type:- one", "key:Enter", "key:Enter", "type:out"],
			"ul one\np out",
		],
		[
			"Tab nests",
			["type:- one", "key:Enter", "type:two", "key:Tab"],
			"ul one\n  ul two",
		],
		[
			"⇧Tab lifts",
			["type:- one", "key:Enter", "type:two", "key:Tab", "key:Tab+shift"],
			"ul one\nul two",
		],
		[
			"Backspace at the start of an item",
			["type:- one", "caret:3", "key:Backspace"],
			"p one",
		],
		[
			"Enter on an empty quote line",
			["type:> one", "key:Enter", "key:Enter", "type:out"],
			"quote one\np out",
		],
		[
			"Enter in a code block",
			["type:```", "key:Enter", "type:a", "key:Enter", "type:b"],
			"pre \npre a\npre b\np ",
		],
	];
	for (const [label, steps, doc] of cells)
		test(label, async () => {
			const composer = await open();
			expect(await composer.play(...steps)).toBe(doc);
		});

	test("⌘Enter submits", async () => {
		const composer = await open();
		await composer.play("type:done", "key:Enter+meta");
		expect(composer.onSubmit).toHaveBeenCalledTimes(1);
		expect(composer.markdown()).toBe("done");
	});
});

describe("mentions and emoji", () => {
	const options = () =>
		[...document.body.querySelectorAll("[role=listbox] [role=option]")].map(
			(option) => option.textContent ?? "",
		);

	test("@ offers the people of the card, and Enter writes @handle", async () => {
		const composer = await open();
		await composer.play("type:hi @", "wait:");
		expect(options()).toEqual([
			"LLena Fischer",
			"MMarcus Oyelaran",
			"RRiya Kapoor",
		]);
		await composer.play("type:le", "wait:");
		expect(options()).toEqual(["LLena Fischer"]);
		expect(await composer.play("key:Enter")).toBe("p hi @Lena Fischer ");
		expect(composer.markdown()).toBe("hi @lena.fischer ");
		expect(
			composer.container.querySelector("[data-linear-mention]")?.textContent,
		).toBe("@Lena Fischer");
	});

	test(":name opens the emoji list, and Enter writes the emoji", async () => {
		const composer = await open();
		await composer.play("type::smile", "wait:");
		expect(options().length).toBeGreaterThan(1);
		expect(await composer.play("key:Enter")).toBe("p 😄 ");
	});
});

describe("markdown in and out", () => {
	test("the draft is the starting text", async () => {
		const composer = await open("Ship it. **Today.**");
		expect(notate(composer.editor.state.doc)).toBe("p Ship it. *Today.*");
	});

	test("a list, a checklist, a quote and a code block serialize", async () => {
		const composer = await open();
		await composer.play(
			"type:- one",
			"key:Enter",
			"key:Enter",
			"type:[] todo",
			"key:Enter",
			"key:Enter",
			"type:> said",
			"key:Enter",
			"key:Enter",
			"type:```",
			"type:x = 1",
		);
		expect(composer.markdown()).toBe(
			"- one\n\n- [ ]  todo\n\n> said\n\n```\nx = 1\n```",
		);
	});
});
