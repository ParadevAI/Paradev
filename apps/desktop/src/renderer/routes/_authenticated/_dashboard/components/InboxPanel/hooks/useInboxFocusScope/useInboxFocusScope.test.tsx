import { describe, expect, test } from "bun:test";
import { useRef } from "react";
import { stripeTestKit } from "renderer/routes/_authenticated/_dashboard/inbox/$cardId/components/InboxDocument/components/CardBlock/components/stripeTestKit";

const { act, fireEvent, render } = await stripeTestKit();
const { useHotkeyScopeStore } = await import("renderer/hotkeys");
const { getDispatchChord } = await import("renderer/hotkeys/hooks/useBinding");
const { useInboxFocusScope } = await import("./useInboxFocusScope");
const MODIFIER = getDispatchChord("INBOX_PREVIOUS")?.includes("meta")
	? { metaKey: true }
	: { ctrlKey: true };

function Scene({
	isOpen,
	showsCard = false,
}: {
	isOpen: boolean;
	showsCard?: boolean;
}) {
	const panel = useRef<HTMLElement>(null);
	useInboxFocusScope(panel, isOpen, showsCard);
	return (
		<>
			<button type="button">Toolbar</button>
			<aside ref={panel} tabIndex={-1}>
				<button type="button">Row</button>
			</aside>
			<main data-inbox-scope>
				<p>Card page</p>
				<textarea aria-label="Composer" />
			</main>
			<textarea aria-label="Terminal" />
		</>
	);
}
const settle = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 30));
	});
const scope = () => useHotkeyScopeStore.getState().active;

describe("when the inbox's keys act", () => {
	test("opening the panel is enough: no click in the list is needed, and closing it ends the scope", async () => {
		const view = render(<Scene isOpen={false} />);
		expect(scope()).toBeNull();
		await act(async () => {
			view.getByRole("button", { name: "Toolbar" }).focus();
		});
		view.rerender(<Scene isOpen />);
		expect(scope()).toBe("inbox");
		view.rerender(<Scene isOpen={false} />);
		expect(scope()).toBeNull();
	});

	test("with a card shown, a click in the card page or anywhere that is not a text field keeps the scope", async () => {
		const view = render(<Scene isOpen showsCard />);
		await settle();
		await act(async () => {
			fireEvent.pointerDown(view.getByText("Card page"));
		});
		expect(scope()).toBe("inbox");
		await act(async () => {
			fireEvent.pointerDown(view.getByRole("button", { name: "Toolbar" }));
			view.getByRole("button", { name: "Toolbar" }).focus();
		});
		expect(scope()).toBe("inbox");
	});

	test("a caret in the card's own composer keeps the inbox keys; a caret in a terminal takes them", async () => {
		const view = render(<Scene isOpen showsCard />);
		await settle();
		await act(async () => {
			view.getByLabelText("Composer").focus();
		});
		expect(scope()).toBe("inbox");
		await act(async () => {
			view.getByLabelText("Terminal").focus();
		});
		expect(scope()).toBeNull();
		await act(async () => {
			view.getByLabelText("Terminal").blur();
		});
		await settle();
		expect(scope()).toBe("inbox");
	});

	test("with no card shown, a click outside the panel ends the scope and a click in the panel takes it back", async () => {
		const view = render(<Scene isOpen />);
		await settle();
		expect(scope()).toBe("inbox");
		await act(async () => {
			fireEvent.pointerDown(view.getByText("Card page"));
		});
		expect(scope()).toBeNull();
		await act(async () => {
			fireEvent.pointerDown(view.getByRole("button", { name: "Row" }));
		});
		expect(scope()).toBe("inbox");
	});

	test("the panel takes keyboard focus when it opens, so a terminal that had the caret gives up the keys", async () => {
		const view = render(<Scene isOpen={false} />);
		await act(async () => {
			view.getByLabelText("Terminal").focus();
		});
		view.rerender(<Scene isOpen />);
		await settle();
		expect(document.activeElement).toBe(view.container.querySelector("aside"));
		expect(scope()).toBe("inbox");
	});

	test("in a card's composer the inbox's list key wins: the editor does not see it, and the key reaches the app", async () => {
		const view = render(<Scene isOpen showsCard />);
		await settle();
		const composer = view.getByLabelText("Composer");
		await act(async () => {
			composer.focus();
		});
		const editor: string[] = [];
		const app: string[] = [];
		composer.addEventListener("keydown", (event) => editor.push(event.key));
		const onApp = (event: KeyboardEvent) => {
			if (event.target === document) app.push(event.key);
		};
		document.addEventListener("keydown", onApp);
		fireEvent.keyDown(composer, {
			key: "ArrowUp",
			code: "ArrowUp",
			...MODIFIER,
		});
		fireEvent.keyDown(composer, { key: "b", code: "KeyB", ...MODIFIER });
		document.removeEventListener("keydown", onApp);
		expect(editor).toEqual(["b"]);
		expect(app).toEqual(["ArrowUp"]);
	});

	test("in a terminal the same key stays with the terminal", async () => {
		const view = render(<Scene isOpen showsCard />);
		await settle();
		const terminal = view.getByLabelText("Terminal");
		await act(async () => {
			terminal.focus();
		});
		const seen: string[] = [];
		terminal.addEventListener("keydown", (event) => seen.push(event.key));
		fireEvent.keyDown(terminal, {
			key: "ArrowUp",
			code: "ArrowUp",
			...MODIFIER,
		});
		expect(seen).toEqual(["ArrowUp"]);
	});
});
