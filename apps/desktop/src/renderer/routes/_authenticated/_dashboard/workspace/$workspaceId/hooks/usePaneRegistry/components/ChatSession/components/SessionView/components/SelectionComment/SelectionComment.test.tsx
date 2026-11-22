import { afterEach, expect, mock, test } from "bun:test";
import {
	type ComposerDraft,
	PromptInput,
	type PromptInputHandle,
} from "@superset/chat-ui/PromptInput";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import { SelectionComment } from "./SelectionComment";

afterEach(() => {
	cleanup();
	window.getSelection()?.removeAllRanges();
});

function select(start: Node | null, end = start) {
	if (!start || !end) throw new Error("Missing selection text");
	const selection = window.getSelection();
	act(() => {
		selection?.setBaseAndExtent(start, 0, end, end.textContent?.length ?? 0);
		document.dispatchEvent(new Event("selectionchange"));
	});
}

function fixture(enabled = true) {
	const add = mock((_prompt: string) => {});
	const view = render(
		<SelectionComment enabled={enabled} onAddToPrompt={add}>
			<p data-chat-response>{"First line\nSecond line"}</p>
			<p data-chat-response>Another response</p>
			<p>User message</p>
		</SelectionComment>,
	);
	return { ...view, add, paragraphs: view.container.querySelectorAll("p") };
}

test("adds the captured quote and comment to the prompt only on submit", async () => {
	const view = fixture();
	select(view.paragraphs[0].firstChild);
	fireEvent.click(view.getByRole("button", { name: "Add comment" }));
	const comment = view.getByRole("textbox", { name: "Comment" });
	expect(
		(view.getByRole("button", { name: "Add to prompt" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	fireEvent.change(comment, { target: { value: "  Please explain this  " } });
	act(() => window.getSelection()?.removeAllRanges());
	expect(view.add).not.toHaveBeenCalled();
	fireEvent.click(view.getByRole("button", { name: "Add to prompt" }));
	await waitFor(() =>
		expect(view.add).toHaveBeenCalledWith(
			"> First line\n> Second line\n\nPlease explain this\n\n",
		),
	);
});

test("cancel leaves the prompt unchanged", () => {
	const view = fixture();
	select(view.paragraphs[0].firstChild);
	fireEvent.click(view.getByRole("button", { name: "Add comment" }));
	fireEvent.change(view.getByRole("textbox"), { target: { value: "Discard" } });
	fireEvent.click(view.getByRole("button", { name: "Cancel" }));
	expect(view.add).not.toHaveBeenCalled();
	expect(view.queryByRole("textbox")).toBeNull();
});

test("ignores user messages, cross-response selections, and text outside this pane", () => {
	const view = fixture();
	for (const [start, end] of [
		[view.paragraphs[2].firstChild, view.paragraphs[2].firstChild],
		[view.paragraphs[0].firstChild, view.paragraphs[1].firstChild],
	]) {
		select(start, end);
		expect(view.queryByRole("button", { name: "Add comment" })).toBeNull();
	}
	const outside = document.createElement("p");
	outside.setAttribute("data-chat-response", "");
	outside.textContent = "Other pane";
	document.body.append(outside);
	try {
		select(outside.firstChild);
		expect(view.queryByRole("button", { name: "Add comment" })).toBeNull();
	} finally {
		outside.remove();
	}
});

test("does not offer comments for a read-only composer", () => {
	const view = fixture(false);
	select(view.paragraphs[0].firstChild);
	expect(view.queryByRole("button", { name: "Add comment" })).toBeNull();
});

test("the quote reaches the real prompt while preserving its draft and attachment", async () => {
	const input = createRef<PromptInputHandle>();
	const file = new File(["log"], "debug.log", { type: "text/plain" });
	let draft: ComposerDraft = {
		segments: [{ type: "text", text: "Existing prompt" }],
		attachments: [{ id: "log", file }],
	};
	const view = render(
		<>
			<SelectionComment
				enabled
				onAddToPrompt={(prompt) => {
					input.current?.restoreDraft({
						segments: [{ type: "text", text: prompt }],
						attachments: [],
					});
				}}
			>
				<p data-chat-response>Selected response</p>
			</SelectionComment>
			<PromptInput
				ref={input}
				commands={[]}
				mentionProviders={[]}
				draft={draft}
				onDraftChange={(next) => {
					draft = next;
				}}
			/>
		</>,
	);
	select(view.getByText("Selected response").firstChild);
	fireEvent.click(view.getByRole("button", { name: "Add comment" }));
	fireEvent.change(view.getByRole("textbox", { name: "Comment" }), {
		target: { value: "Explain" },
	});
	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Add to prompt" }));
	});
	await waitFor(() =>
		expect(
			view.container.querySelector("[contenteditable]")?.textContent,
		).toContain("Explain"),
	);
	const editor = view.container.querySelector("[contenteditable]");
	expect(editor?.textContent).toContain("Existing prompt");
	expect(editor?.textContent).toContain("Selected response");
	expect(editor?.textContent).toContain("Explain");
	expect(draft.attachments[0]?.file).toBe(file);
	expect(editor?.contains(window.getSelection()?.anchorNode ?? null)).toBe(
		true,
	);
});

test("cmd/ctrl+enter submits the comment", async () => {
	const view = fixture();
	select(view.paragraphs[0].firstChild);
	fireEvent.click(view.getByRole("button", { name: "Add comment" }));
	const comment = view.getByRole("textbox", { name: "Comment" });
	fireEvent.change(comment, { target: { value: "Why?" } });
	fireEvent.keyDown(comment, { key: "Enter", metaKey: true });
	await waitFor(() =>
		expect(view.add).toHaveBeenCalledWith(
			"> First line\n> Second line\n\nWhy?\n\n",
		),
	);
});

test("keeps the commented text highlighted and its response framed while the popover is open", () => {
	const registry = new Map<string, unknown>();
	const previous = {
		CSS: Object.getOwnPropertyDescriptor(globalThis, "CSS"),
		Highlight: Object.getOwnPropertyDescriptor(globalThis, "Highlight"),
	};
	const define = (name: string, value: unknown) =>
		Object.defineProperty(globalThis, name, {
			value,
			configurable: true,
			writable: true,
		});
	define("CSS", { highlights: registry });
	define(
		"Highlight",
		class {
			constructor(readonly range: Range) {}
		},
	);
	try {
		const view = fixture();
		select(view.paragraphs[0].firstChild);
		fireEvent.click(view.getByRole("button", { name: "Add comment" }));
		expect(registry.has("chat-comment")).toBe(true);
		expect(view.paragraphs[0].hasAttribute("data-commenting")).toBe(true);
		act(() => window.getSelection()?.removeAllRanges());
		expect(registry.has("chat-comment")).toBe(true);
		fireEvent.click(view.getByRole("button", { name: "Cancel" }));
		expect(registry.has("chat-comment")).toBe(false);
		expect(view.paragraphs[0].hasAttribute("data-commenting")).toBe(false);
	} finally {
		for (const [name, descriptor] of Object.entries(previous))
			descriptor
				? Object.defineProperty(globalThis, name, descriptor)
				: Reflect.deleteProperty(globalThis, name);
	}
});
