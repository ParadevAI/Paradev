import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { TextFormatType } from "lexical";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { IS_APPLE } = await import("@lexical/utils");
const {
	$getRoot,
	$getSelection,
	$isRangeSelection,
	getNearestEditorFromDOMNode,
} = await import("lexical");
const { PromptInput } = await import("../../PromptInput");

afterEach(cleanup);
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

const SHORTCUTS: [key: string, format: TextFormatType][] = [
	["b", "bold"],
	["i", "italic"],
];

async function pressFormatShortcut(key: string, selection: "word" | "caret") {
	const view = render(
		<PromptInput
			commands={[]}
			draft={{ segments: [{ type: "text", text: "hello" }], attachments: [] }}
			mentionProviders={[]}
		/>,
	);
	const editable = view.container.querySelector(
		"[contenteditable]",
	) as HTMLElement;
	const editor = getNearestEditorFromDOMNode(editable);
	if (!editor) throw new Error("composer has no Lexical editor");
	const text = editable.querySelector("[data-lexical-text]")?.firstChild;
	if (!text) throw new Error("draft text did not load");
	await act(async () => {
		editable.focus();
		document
			.getSelection()
			?.setBaseAndExtent(text, selection === "word" ? 0 : 5, text, 5);
	});

	const reachedDocument: Event[] = [];
	const onDocumentKeyDown = (event: Event) => reachedDocument.push(event);
	document.addEventListener("keydown", onDocumentKeyDown);
	const event = new KeyboardEvent("keydown", {
		key,
		code: `Key${key.toUpperCase()}`,
		...(IS_APPLE ? { metaKey: true } : { ctrlKey: true }),
		bubbles: true,
		cancelable: true,
	});
	await act(async () => {
		editable.dispatchEvent(event);
	});
	document.removeEventListener("keydown", onDocumentKeyDown);

	const formatted = (format: TextFormatType) =>
		editor.getEditorState().read(() => {
			const current = $getSelection();
			return (
				$getRoot()
					.getAllTextNodes()
					.some((node) => node.hasFormat(format)) ||
				($isRangeSelection(current) && current.hasFormat(format))
			);
		});
	return {
		event,
		reachedDocument: reachedDocument.includes(event),
		formatted,
	};
}

test.each(
	SHORTCUTS,
)("mod+%s formats selected text and keeps the key from app hotkeys", async (key, format) => {
	const result = await pressFormatShortcut(key, "word");
	expect(result.formatted(format)).toBe(true);
	expect(result.reachedDocument).toBe(false);
});

test.each(
	SHORTCUTS,
)("mod+%s with nothing selected formats nothing and reaches app hotkeys", async (key, format) => {
	const result = await pressFormatShortcut(key, "caret");
	expect(result.formatted(format)).toBe(false);
	expect(result.reachedDocument).toBe(true);
	expect(result.event.defaultPrevented).toBe(true);
});
