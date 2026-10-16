import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
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
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { emojis } = await import("@tiptap/extension-emoji");
const { TextSelection } = await import("@tiptap/pm/state");
const { keydownHandler } = await import("@tiptap/pm/keymap");
const { customEmoji, people } = await import("../SlackThreadBlock/fixtures");
const { SlackComposer } = await import("./SlackComposer");
const { default: cells } = await import("./slackComposerMatrix.json");
const { default: payloads } = await import("./slackComposerPayloads.json");
const { docToRichText, emojiCharLookup, richTextToMrkdwn } = await import(
	"./utils/richText"
);

import type { Editor } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

afterEach(cleanup);
afterAll(async () => {
	Date.now = realNow;
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const MARK_CHARS: Record<string, string> = {
	bold: "*",
	italic: "_",
	strike: "~",
	underline: "+",
	code: "`",
};

const emojiChar = new Map<string, string>();
for (const e of emojis)
	if (e.emoji)
		for (const name of [e.name, ...e.shortcodes])
			if (!emojiChar.has(name)) emojiChar.set(name, e.emoji);

/** The matrix's notation, so a cell compares with what the live harness read from Slack. */
function canonical(doc: string): string {
	return doc
		.replace(/⟨:([^⟩]+):⟩/g, (m, name) =>
			emojiChar.has(name) ? `⟨:${emojiChar.get(name)}:⟩` : m,
		)
		.replace(/([\]|])([*_~+`]+)/g, "$2$1")
		.replace(/([\]|])\]\(link\)/g, "](link)$1");
}

function notate(state: EditorState): string {
	const { from, to, empty } = state.selection;
	const caret = (pos: number) =>
		empty
			? pos === from
				? "|"
				: ""
			: `${pos === to ? "]" : ""}${pos === from ? "[" : ""}`;
	const wrap = (text: string, marks: readonly Mark[]) => {
		let out = text;
		for (const mark of [...marks].reverse()) {
			if (mark.type.name === "link") out = `[${out}](link)`;
			const ch = MARK_CHARS[mark.type.name];
			if (ch) out = `${ch}${out}${ch}`;
		}
		return out;
	};
	const inline = (block: ProseMirrorNode, start: number) => {
		let out = "";
		block.forEach((child, offset) => {
			const pos = start + offset;
			if (child.isText) {
				const chars = child.text ?? "";
				let text = "";
				for (let i = 0; i < chars.length; i++)
					text += (i > 0 ? caret(pos + i) : "") + chars[i];
				out += caret(pos) + wrap(text, child.marks);
				return;
			}
			out += caret(pos);
			const label = child.attrs.label ?? child.attrs.name ?? "";
			if (child.type.name === "hardBreak") out += "\n";
			else if (child.type.name === "slackChannel") out += `⟨@#${label}⟩`;
			else if (child.type.name === "emoji") out += `⟨:${child.attrs.name}:⟩`;
			else out += `⟨@${label}⟩`;
		});
		return (out + caret(start + block.content.size)).replace(
			/([*_~+`])\1/g,
			"",
		);
	};
	const lines: string[] = [];
	const blocks = (parent: ProseMirrorNode, start: number, depth: number) => {
		parent.forEach((node, offset) => {
			const pos = start + offset;
			const pad = "  ".repeat(depth);
			if (node.type.name === "paragraph")
				lines.push(`${pad}p ${JSON.stringify(inline(node, pos + 1))}`);
			else if (node.type.name === "codeBlock")
				for (const line of inline(node, pos + 1).split("\n"))
					lines.push(`${pad}pre ${JSON.stringify(line)}`);
			else if (node.type.name === "blockquote")
				node.forEach((p, o) => {
					lines.push(
						`${pad}quote ${JSON.stringify(inline(p, pos + 1 + o + 1))}`,
					);
				});
			else if (
				node.type.name === "bulletList" ||
				node.type.name === "orderedList"
			) {
				const kind = node.type.name === "bulletList" ? "ul" : "ol";
				node.forEach((item, itemOffset) => {
					const itemPos = pos + 1 + itemOffset;
					let text = "";
					item.forEach((child, o) => {
						if (child.type.name === "paragraph")
							text += inline(child, itemPos + 1 + o + 1);
					});
					lines.push(`${pad}${kind} ${JSON.stringify(text)}`);
					item.forEach((child, o) => {
						if (child.type.name !== "paragraph")
							blocks(
								{ forEach: (f) => f(child, 0, 0) } as ProseMirrorNode,
								itemPos + 1 + o,
								depth + 1,
							);
					});
				});
			}
		});
	};
	blocks(state.doc, 0, 0);
	return lines.join("\n");
}

const satya = { ...people.avery, id: "U0SATYA2P7D", name: "Satya Patel" };

async function mount() {
	const onReply = mock();
	const { container } = render(
		<SlackComposer
			channelName="#test-agents"
			draft={null}
			members={[satya, ...Object.values(people)]}
			emoji={{
				...customEmoji,
				glitch_crab: "https://emoji.slack-edge.com/glitch_crab.png",
			}}
			channels={{
				C0TESTAGNT1: "test-agents",
				C0TESTING: "testing",
				C0ZEST: "zest-superset",
			}}
			pending={false}
			failure={null}
			onReply={onReply}
			onCommand={mock()}
		/>,
	);
	const dom = container.querySelector(".ProseMirror") as HTMLElement & {
		editor: Editor;
	};
	return { container, editor: dom.editor, onReply };
}

/** ProseMirror decides Mod (⌘ or Ctrl) once, when its keymap module first loads, so ask it. */
const modIsMeta = keydownHandler({ "Mod-x": () => true })(
	{ state: {}, dispatch: () => {} } as never,
	new KeyboardEvent("keydown", { key: "x", metaKey: true }),
);

const SHIFTED_DIGITS: Record<string, string> = {
	"!": "1",
	"@": "2",
	"#": "3",
	$: "4",
	"%": "5",
	"^": "6",
	"&": "7",
	"*": "8",
	"(": "9",
	")": "0",
};

const NAMED_CODES: Record<string, string> = {
	Enter: "Enter",
	Tab: "Tab",
	Backspace: "Backspace",
	Escape: "Escape",
};

/** What the browser does for a key the editor leaves alone. */
function nativeKey(editor: Editor, key: string, shift: boolean) {
	const { state } = editor.view;
	const { $head, anchor, head, from, to, empty } = state.selection;
	const select = (nextHead: number) =>
		editor.view.dispatch(
			state.tr.setSelection(
				TextSelection.create(state.doc, shift ? anchor : nextHead, nextHead),
			),
		);
	if ((key === "ArrowLeft" || key === "ArrowRight") && !shift && !empty) {
		editor.view.dispatch(
			state.tr.setSelection(
				TextSelection.create(state.doc, key === "ArrowLeft" ? from : to),
			),
		);
	} else if (key === "Backspace") {
		if (!empty) editor.view.dispatch(state.tr.deleteSelection());
		else if ($head.parentOffset > 0)
			editor.view.dispatch(state.tr.delete(from - 1, from));
	} else if (key === "ArrowLeft") select(Math.max(head - 1, 0));
	else if (key === "ArrowRight")
		select(Math.min(head + 1, state.doc.content.size));
	else if (key === "ArrowUp") {
		const before = state.doc.resolve($head.before());
		const target = TextSelection.near(before, -1);
		const $t = target.$head;
		select(Math.min($t.start() + $head.parentOffset, $t.end()));
	} else if (key === "a" && !shift) {
		editor.view.dispatch(
			state.tr.setSelection(
				TextSelection.create(state.doc, 1, state.doc.content.size - 1),
			),
		);
	}
}

function press(editor: Editor, spec: string) {
	const [key = "", ...mods] = spec.split("+");
	const digit = SHIFTED_DIGITS[key];
	const letter = key === "Ç" ? "C" : key.toUpperCase();
	const event = new KeyboardEvent("keydown", {
		key,
		keyCode: digit
			? digit.charCodeAt(0)
			: key.length === 1
				? letter.charCodeAt(0)
				: undefined,
		code:
			NAMED_CODES[key] ??
			(digit ? `Digit${digit}` : key.length === 1 ? `Key${letter}` : key),
		metaKey: mods.includes("meta") && modIsMeta,
		shiftKey: mods.includes("shift"),
		altKey: mods.includes("alt"),
		ctrlKey: mods.includes("ctrl") || (mods.includes("meta") && !modIsMeta),
		bubbles: true,
		cancelable: true,
	});
	editor.view.dom.dispatchEvent(event);
	if (
		!event.defaultPrevented &&
		(mods.length === 0 || spec === "a+meta" || mods.join() === "shift")
	)
		nativeKey(editor, key, mods.includes("shift"));
}

function typeChar(editor: Editor, ch: string) {
	if (ch === "\n") return press(editor, "Enter+shift");
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

function paste(editor: Editor, text: string, html?: string) {
	const data = new DataTransfer();
	data.setData("text/plain", text);
	if (html) data.setData("text/html", html);
	const event = new ClipboardEvent("paste", {
		clipboardData: data,
		bubbles: true,
		cancelable: true,
	});
	editor.view.dom.dispatchEvent(event);
}

async function run(steps: string[]) {
	const { editor, play } = await open();
	await play(steps);
	return notate(editor.state);
}

async function open() {
	const { container, editor, onReply } = await mount();
	await act(async () => {
		editor.commands.focus("end");
	});
	return {
		container,
		editor,
		onReply,
		play: (steps: string[]) => play(container, editor, steps),
	};
}

async function play(container: HTMLElement, editor: Editor, steps: string[]) {
	for (const step of steps) {
		const [op = "", ...rest] = step.split(":");
		const raw = rest.join(":");
		const arg = op === "cliphtml" ? raw : raw.replace(/\\n/g, "\n");
		await act(async () => {
			if (op === "type") for (const ch of arg) typeChar(editor, ch);
			else if (op === "key" || op === "pagekey") {
				const [spec = "", times = "1"] = arg.split("*");
				for (let i = 0; i < Number(times); i++) press(editor, spec);
			} else if (op === "clip" || op === "paste") paste(editor, arg);
			else if (op === "cliphtml") {
				const [html = "", text = ""] = arg.split("|||");
				paste(editor, text, html);
			} else if (op === "btn")
				(
					container.querySelector(
						`button[aria-label="${arg}"]`,
					) as HTMLElement | null
				)?.click();
			else if (op === "pick") press(editor, "Enter");
			else if (op === "hover") {
				const boxes = document.body.querySelectorAll("[role=listbox]");
				const option =
					boxes[boxes.length - 1]?.querySelectorAll("[role=option]")[
						Number(arg)
					];
				if (option) fireEvent.mouseEnter(option);
			} else if (op === "wait") {
				clockOffset += Number(arg);
				await new Promise((r) => setTimeout(r, 20));
			}
		});
	}
}

function menuLabels(): string[] {
	const boxes = document.body.querySelectorAll("[role=listbox]");
	return [
		...(boxes[boxes.length - 1]?.querySelectorAll("[role=option]") ?? []),
	].map((option) => option.textContent ?? "");
}

const PICKERS = [
	{ menu: "emoji", query: ":thumbs", token: /⟨:([^⟩]+):⟩/ },
	{ menu: "people", query: "@a", token: /⟨@([^#⟩][^⟩]*)⟩/ },
	{ menu: "channel", query: "#t", token: /⟨@#([^⟩]+)⟩/ },
	{ menu: "command", query: "/s", token: /\/(\w+) / },
];

function highlighted(): number {
	const boxes = document.body.querySelectorAll("[role=listbox]");
	return [
		...(boxes[boxes.length - 1]?.querySelectorAll("[role=option]") ?? []),
	].findIndex((option) => option.getAttribute("aria-selected") === "true");
}

describe("every picker moves and picks the way Slack's do", () => {
	for (const { menu, query, token } of PICKERS) {
		const cases: [string, string[], (n: number) => number][] = [
			["rests on the first row", [], () => 0],
			["the first ↓ lands on the first row", ["key:ArrowDown"], () => 0],
			["↓↓ moves to the second row", ["key:ArrowDown*2"], () => 1],
			["↑ goes to the last row", ["key:ArrowUp"], (n) => n - 1],
			[
				"↓ past the end rests on the first row again",
				["key:ArrowDown*99"],
				(n) => (99 % (n + 1) === 0 ? 0 : (99 % (n + 1)) - 1),
			],
			["hover moves to the hovered row", ["hover:1"], () => 1],
		];
		for (const [label, steps, expected] of cases)
			test(`${menu}: ${label}`, async () => {
				const { editor, play } = await open();
				await play([`type:${query}`, "wait:50"]);
				const labels = menuLabels();
				expect(labels.length).toBeGreaterThan(1);
				await play(steps);
				const index = expected(labels.length);
				expect(highlighted()).toBe(index);
				if (menu === "command") return;
				await play(["key:Enter"]);
				const picked = token.exec(canonical(notate(editor.state)))?.[1] ?? "";
				expect(picked).not.toBe("");
				const char =
					menu === "emoji" ? (emojiChar.get(picked) ?? picked) : picked;
				expect(canonical(labels[index] ?? "")).toContain(char);
			});
		for (const key of ["Enter", "Tab"])
			test(`${menu}: ${key} picks the first row`, async () => {
				const { editor, play } = await open();
				await play([`type:${query}`, "wait:50"]);
				const first = canonical(menuLabels()[0] ?? "");
				await play([`key:${key}`]);
				const picked = token.exec(canonical(notate(editor.state)))?.[1] ?? "";
				const char =
					menu === "emoji" ? (emojiChar.get(picked) ?? picked) : picked;
				expect(picked).not.toBe("");
				expect(first).toContain(char);
			});
		test(`${menu}: Esc closes the menu and keeps the text`, async () => {
			const { editor, play } = await open();
			await play([`type:${query}`, "wait:50", "key:Escape"]);
			expect(menuLabels()).toEqual([]);
			expect(canonical(notate(editor.state))).toBe(`p "${query}|"`);
		});
	}
});

describe("the composer matches what Slack's composer did for each matrix cell", () => {
	for (const [cell, { steps, slack }] of Object.entries(cells)) {
		test(cell, async () => {
			const ours = await run(steps);
			const slackHasCaret = /[|[\]]/.test(slack.replace(/\(link\)/g, ""));
			const strip = (doc: string) =>
				slackHasCaret ? doc : doc.replace(/[|[\]]/g, "");
			expect(strip(canonical(ours))).toBe(strip(canonical(slack)));
		});
	}
});

type Inline = Record<string, unknown> & { type: string };

/** Slack's composer sends a standard emoji as an element with its code point; we send the character. */
function canonicalInlines(elements: Inline[]): Inline[] {
	const out: Inline[] = [];
	for (const el of elements) {
		const unicode =
			el.type === "emoji" ? (el.unicode as string | undefined) : undefined;
		const next: Inline = unicode
			? {
					type: "text",
					text: String.fromCodePoint(
						...unicode.split("-").map((hex) => Number.parseInt(hex, 16)),
					),
					...(el.style ? { style: el.style } : {}),
				}
			: { ...el, truncated: undefined };
		const last = out[out.length - 1];
		if (
			last?.type === "text" &&
			next.type === "text" &&
			JSON.stringify(last.style ?? {}) === JSON.stringify(next.style ?? {})
		) {
			last.text = String(last.text) + String(next.text);
			continue;
		}
		out.push({ ...next });
	}
	return out;
}

function canonicalBlock(block: unknown): unknown {
	const { elements } = block as {
		elements: (Inline & { elements: Inline[] })[];
	};
	return elements.map((el) =>
		el.type === "rich_text_list"
			? {
					...el,
					elements: el.elements.map((section) => ({
						...section,
						elements: canonicalInlines(
							(section as unknown as { elements: Inline[] }).elements,
						),
					})),
				}
			: { ...el, elements: canonicalInlines(el.elements) },
	);
}

describe("what the composer sends matches what Slack's composer sent", () => {
	for (const { label, steps, slack } of payloads) {
		if (!slack) continue;
		test(label, async () => {
			const { editor, play } = await open();
			await play(steps);
			const block = docToRichText(
				editor.getJSON(),
				emojiCharLookup(editor.storage.emoji.emojis),
			);
			expect(canonicalBlock(block)).toEqual(canonicalBlock(slack.blocks[0]));
			expect(richTextToMrkdwn(block)).toBe(
				slack.text.replace(/:([a-z0-9_+-]+):/g, (m, name) => {
					const char = emojiChar.get(name);
					return char ?? m;
				}),
			);
		});
	}
});

describe("Enter sends the way Slack's does", () => {
	for (const [label, steps] of [
		["from a list item", ["type:- item"]],
		["from a code block", ["type:```", "type:code"]],
		["from a quote", ["type:>", "type:quote"]],
	] as const)
		test(label, async () => {
			const { onReply, play } = await open();
			await play([...steps, "key:Enter"]);
			expect(onReply).toHaveBeenCalledTimes(1);
		});

	test("an empty list item leaves the list instead of sending", async () => {
		const { editor, onReply, play } = await open();
		await play(["type:- item\\n", "key:Enter"]);
		expect(onReply).not.toHaveBeenCalled();
		expect(canonical(notate(editor.state))).toBe('ul "item"\np "|"');
	});

	test("a plain reply stays in the thread, and Also send to the channel clears after a send", async () => {
		const { container, onReply, play } = await open();
		const box = () =>
			container.querySelector('[role="checkbox"]') as HTMLElement;
		await play(["type:first", "key:Enter"]);
		expect(onReply.mock.calls[0]?.[1]).toBe(false);
		await act(async () => box().click());
		expect(box().getAttribute("aria-checked")).toBe("true");
		await play(["type:second", "key:Enter"]);
		expect(onReply.mock.calls[1]?.[1]).toBe(true);
		expect(box().getAttribute("aria-checked")).toBe("false");
	});
});
