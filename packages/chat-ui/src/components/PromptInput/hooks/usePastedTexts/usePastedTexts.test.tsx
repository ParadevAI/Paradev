import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { LexicalComposer } = await import("@lexical/react/LexicalComposer");
const { useLexicalComposerContext } = await import(
	"@lexical/react/LexicalComposerContext"
);
const { ContentEditable } = await import(
	"@lexical/react/LexicalContentEditable"
);
const { LexicalErrorBoundary } = await import(
	"@lexical/react/LexicalErrorBoundary"
);
const { HistoryPlugin } = await import("@lexical/react/LexicalHistoryPlugin");
const { PlainTextPlugin } = await import(
	"@lexical/react/LexicalPlainTextPlugin"
);
const lexical = await import("lexical");
const { usePastedTexts } = await import("./usePastedTexts");

type Hook = ReturnType<typeof usePastedTexts>;
type LexicalEditor = import("lexical").LexicalEditor;

const LOG = Array.from({ length: 30 }, (_, index) => `at frame ${index}`).join(
	"\n",
);

function Probe({
	onReady,
	drafts,
}: {
	onReady: (hook: Hook, editor: LexicalEditor) => void;
	drafts: string[][];
}) {
	const [editor] = useLexicalComposerContext();
	const hook = usePastedTexts(editor, {
		enabled: true,
		onCardsChange: (cards) => drafts.push(cards.map((card) => card.text)),
	});
	onReady(hook, editor);
	return null;
}

function setup() {
	let hook: Hook | undefined;
	let editor: LexicalEditor | undefined;
	const drafts: string[][] = [];
	render(
		<LexicalComposer
			initialConfig={{
				namespace: "test",
				onError: (error: Error) => {
					throw error;
				},
			}}
		>
			<PlainTextPlugin
				contentEditable={<ContentEditable />}
				placeholder={null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<HistoryPlugin />
			<Probe
				drafts={drafts}
				onReady={(next, nextEditor) => {
					hook = next;
					editor = nextEditor;
				}}
			/>
		</LexicalComposer>,
	);
	const current = () => {
		if (!hook || !editor) throw new Error("not mounted");
		return { hook, editor };
	};
	const text = () =>
		current()
			.editor.getEditorState()
			.read(() => lexical.$getRoot().getTextContent());
	const type = async (value: string) => {
		await act(async () => {
			current().editor.update(
				() => {
					lexical.$getRoot().selectEnd();
					lexical.$getSelection()?.insertText(value);
				},
				{ tag: lexical.HISTORY_PUSH_TAG },
			);
		});
	};
	const backspace = async () => {
		await act(async () => {
			current().editor.update(() => {
				const last = lexical.$getRoot().getLastDescendant();
				if (!lexical.$isTextNode(last)) return;
				const rest = last.getTextContent().slice(0, -1);
				if (rest) last.setTextContent(rest);
				else last.remove();
			});
		});
	};
	const paste = async (value: string) => {
		const data = new DataTransfer();
		data.setData("text/plain", value);
		const event = new ClipboardEvent("paste", {
			clipboardData: data,
			cancelable: true,
		});
		let handled = false;
		await act(async () => {
			handled = current().editor.dispatchCommand(lexical.PASTE_COMMAND, event);
		});
		return handled;
	};
	const dispatch = async (command: "undo" | "redo") => {
		await act(async () => {
			current().editor.dispatchCommand(
				command === "undo" ? lexical.UNDO_COMMAND : lexical.REDO_COMMAND,
				undefined,
			);
		});
	};
	const cards = () => current().hook.cards.map((card) => card.text);
	return { current, text, type, backspace, paste, dispatch, cards, drafts };
}

afterEach(cleanup);
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

describe("usePastedTexts", () => {
	test("a large paste becomes a card; a small one is left to the editor", async () => {
		const view = setup();
		expect(await view.paste("short\ntext")).toBe(false);
		expect(await view.paste(`${LOG}\r\n`)).toBe(true);
		expect(view.cards()).toEqual([LOG]);
		expect(view.drafts.at(-1)).toEqual([LOG]);
		expect(await view.paste(LOG)).toBe(true);
		expect(view.cards()).toEqual([LOG, LOG]);
	});

	test("undo takes back the paste after the typing that followed it", async () => {
		const view = setup();
		await view.type("Why?");
		await view.paste(LOG);
		await view.type(" now");
		await view.dispatch("undo");
		expect(view.text()).toBe("Why?");
		expect(view.cards()).toEqual([LOG]);
		await view.dispatch("undo");
		expect(view.text()).toBe("Why?");
		expect(view.cards()).toEqual([]);
		await view.dispatch("redo");
		expect(view.cards()).toEqual([LOG]);
	});

	test("Show in text field moves the text onto its own line, and undo moves it back", async () => {
		const view = setup();
		await view.type("Why?");
		await view.paste(LOG);
		const [card] = view.current().hook.cards;
		await act(async () => view.current().hook.showInTextField(card?.id ?? ""));
		expect(view.text()).toBe(`Why?\n${LOG}`);
		expect(view.cards()).toEqual([]);
		await view.dispatch("undo");
		expect(view.text()).toBe("Why?");
		expect(view.cards()).toEqual([LOG]);
		await view.dispatch("redo");
		expect(view.text()).toBe(`Why?\n${LOG}`);
		expect(view.cards()).toEqual([]);
	});

	test("Show in text field adds no line break in an empty editor", async () => {
		const view = setup();
		await view.paste(LOG);
		const [card] = view.current().hook.cards;
		await act(async () => view.current().hook.showInTextField(card?.id ?? ""));
		expect(view.text()).toBe(LOG);
	});

	test("undoing a paste keeps a card returned after it", async () => {
		const view = setup();
		await view.paste(LOG);
		await act(async () => view.current().hook.restore(["returned"]));
		await view.dispatch("undo");
		expect(view.cards()).toEqual(["returned"]);
		await view.dispatch("redo");
		expect(view.cards()).toEqual(["returned", LOG]);
	});

	test("a new edit after undo drops the card redo", async () => {
		const view = setup();
		await view.paste(LOG);
		await view.dispatch("undo");
		await view.type("x");
		await view.backspace();
		expect(view.text()).toBe("");
		await view.dispatch("redo");
		expect(view.cards()).toEqual([]);
	});

	test("removing a card can be undone; restored cards are not a step", async () => {
		const view = setup();
		await act(async () => view.current().hook.restore(["kept"]));
		await view.paste(LOG);
		const card = view.current().hook.cards[1];
		await act(async () => view.current().hook.remove(card?.id ?? ""));
		expect(view.cards()).toEqual(["kept"]);
		await view.dispatch("undo");
		expect(view.cards()).toEqual(["kept", LOG]);
		await view.dispatch("undo");
		expect(view.cards()).toEqual(["kept"]);
		await view.dispatch("undo");
		expect(view.cards()).toEqual(["kept"]);
	});
});
