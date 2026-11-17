import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readReplySelection } from "./replySelection";

let container: HTMLElement;

beforeEach(() => {
	container = document.createElement("div");
	container.innerHTML = [
		'<div data-reply-id="r1">',
		"<p>Run <code>bun test</code> first.</p>",
		'<ul><li>open <span data-source-text="src/a.ts">a.ts</span></li><li>then commit</li></ul>',
		"</div>",
		"<div data-user-message><p>my question</p></div>",
		'<div data-reply-id="r2"><p>Second reply</p></div>',
	].join("");
	document.body.append(container);
});

afterEach(() => {
	document.getSelection()?.removeAllRanges();
	container.remove();
});

function select(
	anchor: Node,
	anchorOffset: number,
	focus: Node,
	focusOffset: number,
) {
	const selection = document.getSelection();
	selection?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
	return selection;
}

function textOf(selector: string): Node {
	const node = container.querySelector(selector)?.firstChild;
	if (!node) throw new Error(`no text in ${selector}`);
	return node;
}

describe("readReplySelection", () => {
	test("reads text across inline code within one reply", () => {
		const paragraph = textOf("[data-reply-id=r1] p");
		const after = container.querySelector("[data-reply-id=r1] p")?.lastChild;
		if (!after) throw new Error("no trailing text");
		const read = readReplySelection(select(paragraph, 0, after, 6), container);
		expect(read?.replyId).toBe("r1");
		expect(read?.text).toBe("Run bun test first");
	});

	test("gives chips back as their source text across list items", () => {
		const read = readReplySelection(
			select(textOf("li"), 0, textOf("li:last-child"), 4),
			container,
		);
		expect(read?.text).toBe("open src/a.ts\nthen");
	});

	test("ignores a selection that reaches another message", () => {
		const reply = textOf("[data-reply-id=r1] p");
		expect(
			readReplySelection(
				select(reply, 0, textOf("[data-user-message] p"), 3),
				container,
			),
		).toBeNull();
		expect(
			readReplySelection(
				select(reply, 0, textOf("[data-reply-id=r2] p"), 3),
				container,
			),
		).toBeNull();
	});

	test("ignores a user message, a caret, and a reply outside the transcript", () => {
		const user = textOf("[data-user-message] p");
		expect(readReplySelection(select(user, 0, user, 5), container)).toBeNull();
		const reply = textOf("[data-reply-id=r2] p");
		expect(
			readReplySelection(select(reply, 2, reply, 2), container),
		).toBeNull();
		expect(
			readReplySelection(
				select(reply, 0, reply, 6),
				document.createElement("div"),
			),
		).toBeNull();
	});

	test("reads a selection inside a code block's shadow root", () => {
		const reply = container.querySelector("[data-reply-id=r2]");
		if (!reply) throw new Error("no reply");
		const host = document.createElement("div");
		reply.append(host);
		const root = host.attachShadow({ mode: "open" });
		root.innerHTML = "<pre>const a = 1;\nconst b = 2;</pre>";
		const code = root.querySelector("pre")?.firstChild;
		if (!code) throw new Error("no code");
		const caret = document.createRange();
		caret.setStart(reply, reply.childNodes.length - 1);
		caret.collapse(true);
		const selection = {
			rangeCount: 1,
			anchorNode: reply,
			focusNode: reply,
			isCollapsed: true,
			getRangeAt: () => caret,
			getComposedRanges: ({ shadowRoots }: { shadowRoots: ShadowRoot[] }) =>
				shadowRoots[0] === root
					? [
							{
								startContainer: code,
								startOffset: 0,
								endContainer: code,
								endOffset: 12,
								collapsed: false,
							},
						]
					: [],
			toString: () => "const a = 1;",
		} as unknown as Selection;

		const read = readReplySelection(selection, container);
		expect(read?.replyId).toBe("r2");
		expect(read?.text).toBe("const a = 1;");
	});
});
