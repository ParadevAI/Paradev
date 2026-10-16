import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import { stripeTestKit } from "./components/CardBlock/components/stripeTestKit";

const { act, fireEvent, render, TooltipProvider } = await stripeTestKit();
// The tab store reaches this library with require(); it must be loaded before that.
await import("react-dnd");
const { useHotkeyScopeStore } = await import(
	"renderer/hotkeys/stores/hotkeyScopeStore"
);
const { getDispatchChord } = await import("renderer/hotkeys/hooks/useBinding");
const { InboxDocument } = await import("./InboxDocument");
// The platform is whatever an earlier test file left it as.
const MODIFIER = getDispatchChord("INBOX_BLOCK_PRIMARY")?.includes("meta")
	? { metaKey: true }
	: { ctrlKey: true };

type Props = ComponentProps<typeof InboxDocument>;
type Doc = Props["document"];
type Block = NonNullable<Doc["blocks"]>[number];

const card = (
	id: string,
	title: string,
	actions: {
		id: string;
		label: string;
		role: "primary" | "dismiss" | "other";
		confirm?: string;
	}[],
): Block => ({
	id,
	type: "card",
	actionable: true,
	card: { type: "posthog.feature_flag", refs: { flag: id } },
	resolved: {
		type: "posthog.feature_flag",
		brand: "posthog",
		state: "ok",
		title,
		fields: [],
		actions: actions.map((action) => ({
			...action,
			style: "secondary" as const,
		})),
	},
});
const refund = card("c1", "Refund", [
	{
		id: "refund",
		label: "Refund it",
		role: "primary",
		confirm: "Refund $20.00.",
	},
	{ id: "skip", label: "Do not refund", role: "dismiss" },
]);
const flag = card("c2", "Flag", [
	{ id: "enable", label: "Turn on", role: "primary" },
	{ id: "rollout", label: "Roll out to 10%", role: "other" },
	{ id: "half", label: "Roll out to 50%", role: "other" },
	{ id: "keep", label: "Keep it off", role: "dismiss" },
]);
const ask: Block = {
	id: "q",
	type: "ask",
	ask: {
		questions: [
			{
				id: "policy",
				kind: "select",
				prompt: "Which policy?",
				options: [
					{ id: "stop", label: "On stop" },
					{ id: "ten", label: "Every 10 minutes" },
				],
			},
			{ id: "note", kind: "text", prompt: "Anything else?", optional: true },
		],
	},
};
const prose: Block = {
	id: "p",
	type: "paragraph",
	paragraph: { rich_text: [{ type: "text", text: { content: "Why I ask." } }] },
};
const doc = (
	blocks: Block[],
	settled: Partial<Doc["settled"]> = {},
	answers: Record<string, unknown> = {},
): Doc => ({
	version: 1,
	blocks,
	answers,
	settled: { blocks: {}, skipped: [], ...settled },
});
const outcome = (action: string, notice: string | null = null) => ({
	action,
	by: "recipient" as const,
	at: "2026-10-03T16:50:00.000Z",
	notice,
});

function show(document: Doc, props: Partial<Props> = {}) {
	const handlers = {
		onAnswer: mock(),
		onSkip: mock(),
		onAct: mock(),
		onConnect: mock(),
	};
	const element = (next: Doc, more: Partial<Props> = {}) => (
		<TooltipProvider>
			<InboxDocument
				document={next}
				done={false}
				pending={false}
				failure={null}
				{...handlers}
				{...props}
				{...more}
			/>
		</TooltipProvider>
	);
	const view = render(element(document));
	return {
		...view,
		...handlers,
		update: (next: Doc, more?: Partial<Props>) =>
			view.rerender(element(next, more)),
		focused: () =>
			view.container
				.querySelector('[data-focused="true"]')
				?.getAttribute("data-focus-block") ?? null,
	};
}
const key = (key: string, target: Element | Document = document) =>
	act(async () => {
		fireEvent.keyDown(target, {
			key,
			code: key.length === 1 ? `Digit${key}` : key,
			...MODIFIER,
			bubbles: true,
		});
	});

beforeEach(() => {
	useHotkeyScopeStore.getState().enter("inbox");
});

describe("one block of a card has focus", () => {
	test("opening a card focuses its first open block, and only that block draws keys", () => {
		const view = show(doc([prose, refund, flag, ask]));
		expect(view.focused()).toBe("card:c1");
		expect(
			view.container.querySelectorAll('[data-focused="true"]').length,
		).toBe(1);
		const keyed = [...view.container.querySelectorAll("[data-action-key]")];
		expect(
			keyed.map((button) => button.getAttribute("data-action-key")),
		).toEqual(["primary", "dismiss"]);
		expect(view.container.querySelectorAll("kbd").length).toBe(2);
	});

	test("a settled block folds to its outcome line and focus moves to the next open block", () => {
		const view = show(doc([refund, flag, ask]));
		view.update(
			doc([refund, flag, ask], {
				blocks: { c1: outcome("refund", "Refunded $20.00") },
			}),
		);
		expect(view.focused()).toBe("card:c2");
		expect(view.getByText("Refunded $20.00")).toBeTruthy();
		expect(view.queryByRole("button", { name: /Refund it/ })).toBeNull();
		view.update(
			doc([refund, flag, ask], {
				blocks: { c1: outcome("refund"), c2: outcome("enable") },
			}),
		);
		expect(view.focused()).toBe("question:policy");
		expect(view.getByText("Turn on")).toBeTruthy();
	});

	test("a block settled out of order sends focus back to the first open one", () => {
		const view = show(doc([refund, flag]));
		fireEvent.pointerDown(view.getByRole("button", { name: /Turn on/ }));
		expect(view.focused()).toBe("card:c2");
		view.update(doc([refund, flag], { blocks: { c2: outcome("enable") } }));
		expect(view.focused()).toBe("card:c1");
	});

	test("a settled card has no focus and draws no keys", () => {
		const view = show(
			doc(
				[refund, ask],
				{ blocks: { c1: outcome("refund") } },
				{ policy: "ten" },
			),
			{
				done: true,
			},
		);
		expect(view.focused()).toBeNull();
		expect(view.container.querySelector("[data-action-key]")).toBeNull();
		expect(view.getByText("Every 10 minutes")).toBeTruthy();
		expect(view.getByText("Not answered")).toBeTruthy();
	});

	test("a folded block opens to show what it was", () => {
		const view = show(doc([refund, flag], { blocks: { c1: outcome("skip") } }));
		expect(view.getByText("Do not refund")).toBeTruthy();
		fireEvent.click(view.getByRole("button", { name: "Show" }));
		expect(view.getByRole("button", { name: "Fold" })).toBeTruthy();
	});
});

describe("keyboard focus follows the card's focus", () => {
	const composerCard = card("c9", "Reply", [
		{ id: "send", label: "Send", role: "primary" },
	]);
	test("opening a card puts keyboard focus on its first open block when the block has no composer", () => {
		const view = show(doc([prose, refund, flag]));
		expect(document.activeElement?.getAttribute("data-focus-block")).toBe(
			"card:c1",
		);
		view.update(
			doc([prose, refund, flag], { blocks: { c1: outcome("refund") } }),
		);
		expect(document.activeElement?.getAttribute("data-focus-block")).toBe(
			"card:c2",
		);
	});

	test("a block with a text field gets the caret, also when the field mounts later than the block", async () => {
		const view = show(doc([ask], {}, { policy: "ten" }));
		expect(document.activeElement).toBe(view.getByLabelText("Anything else?"));
		view.unmount();
		const late = show(doc([composerCard]));
		const frame = late.container.querySelector('[data-focus-block="card:c9"]');
		expect(document.activeElement).toBe(frame);
		const editor = document.createElement("textarea");
		await act(async () => {
			frame?.appendChild(editor);
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(document.activeElement).toBe(editor);
	});

	test("with the caret in a terminal or another surface, nothing takes focus", () => {
		useHotkeyScopeStore.getState().leave("inbox");
		const before = document.activeElement;
		show(doc([prose, refund]));
		expect(document.activeElement).toBe(before);
	});
});

describe("keys act on the focused block only", () => {
	test("the primary key takes the focused block's primary action; a confirmation opens on its confirm button and the key confirms", async () => {
		const view = show(doc([refund, flag]));
		await key("Enter");
		expect(view.onAct).not.toHaveBeenCalled();
		const confirm = document.querySelector<HTMLElement>(
			"[role='alertdialog'] [data-slot='alert-dialog-action']",
		);
		expect(confirm).toBeTruthy();
		expect(document.activeElement).toBe(confirm);
		await key("Enter");
		expect(view.onAct).toHaveBeenCalledWith(
			"c1",
			"refund",
			undefined,
			"Refund $20.00.",
		);
	});

	test('the "no" key takes the dismiss action, and number keys take the others in the order shown', async () => {
		const view = show(doc([flag, refund]));
		await key("2");
		expect(view.onAct).toHaveBeenLastCalledWith(
			"c2",
			"half",
			undefined,
			undefined,
		);
		await key("1");
		expect(view.onAct).toHaveBeenLastCalledWith(
			"c2",
			"rollout",
			undefined,
			undefined,
		);
		await key("Backspace");
		expect(view.onAct).toHaveBeenLastCalledWith(
			"c2",
			"keep",
			undefined,
			undefined,
		);
		expect(view.onAct).toHaveBeenCalledTimes(3);
	});

	test("Tab walks the focused block's buttons, then goes to the next open block; Shift+Tab goes back; the last block wraps inside itself", async () => {
		const view = show(doc([refund, prose, flag]));
		const tab = (shiftKey = false) =>
			act(async () => {
				fireEvent.keyDown(document.activeElement ?? document.body, {
					key: "Tab",
					code: "Tab",
					shiftKey,
				});
			});
		await tab();
		expect(document.activeElement?.textContent).toContain("Refund it");
		await act(async () => {
			view.getByRole("button", { name: /Do not refund/ }).focus();
		});
		await tab();
		expect(view.focused()).toBe("card:c2");
		expect(document.activeElement?.textContent).toContain("Turn on");
		await tab(true);
		expect(view.focused()).toBe("card:c1");
		expect(document.activeElement?.textContent).toContain("Do not refund");
		await act(async () => {
			view.getByRole("button", { name: /Keep it off/ }).focus();
		});
		expect(view.focused()).toBe("card:c1");
		fireEvent.pointerDown(view.getByText("Flag"));
		await act(async () => {
			view.getByRole("button", { name: /Keep it off/ }).focus();
		});
		await tab();
		expect(view.focused()).toBe("card:c2");
		expect(document.activeElement?.textContent).toContain("Turn on");
	});

	test("a card with one block: Tab stays within it", async () => {
		const view = show(doc([prose, refund]));
		await act(async () => {
			view.getByRole("button", { name: /Do not refund/ }).focus();
		});
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? document.body, {
				key: "Tab",
				code: "Tab",
			});
		});
		expect(view.focused()).toBe("card:c1");
		expect(document.activeElement?.textContent).toContain("Refund it");
	});

	test("a click on another block gives it focus", () => {
		const view = show(doc([refund, flag]));
		fireEvent.pointerDown(view.getByText("Flag"));
		expect(view.focused()).toBe("card:c2");
	});

	test('number keys pick a question\'s option and the primary key sends it; the "no" key skips an optional question', async () => {
		const view = show(doc([ask]));
		await key("Enter");
		expect(view.onAnswer).not.toHaveBeenCalled();
		await key("2");
		await key("Enter");
		expect(view.onAnswer).toHaveBeenCalledWith("policy", "ten");
		view.update(doc([ask], {}, { policy: "ten" }));
		expect(view.focused()).toBe("question:note");
		await key("Backspace");
		expect(view.onSkip).toHaveBeenCalledWith("note");
	});

	test('in a field with text the "no" and move keys stay with the text; in an empty field the "no" key still skips', async () => {
		const view = show(doc([ask], {}, { policy: "ten" }));
		const field = view.getByLabelText("Anything else?");
		fireEvent.change(field, { target: { value: "Watch the bill" } });
		await key("Backspace", field);
		await key("ArrowDown", field);
		expect(view.onSkip).not.toHaveBeenCalled();
		await key("Enter", field);
		expect(view.onAnswer).toHaveBeenCalledWith("note", "Watch the bill");
		fireEvent.change(field, { target: { value: "" } });
		await key("Backspace", field);
		expect(view.onSkip).toHaveBeenCalledWith("note");
	});

	test("outside the inbox scope the keys do nothing", async () => {
		useHotkeyScopeStore.getState().leave("inbox");
		const view = show(doc([flag]));
		await key("Enter");
		await key("1");
		expect(view.onAct).not.toHaveBeenCalled();
	});

	test("while an action runs the keys do nothing", async () => {
		const view = show(doc([flag]), { pending: true });
		await key("Enter");
		await key("Backspace");
		expect(view.onAct).not.toHaveBeenCalled();
	});
});
