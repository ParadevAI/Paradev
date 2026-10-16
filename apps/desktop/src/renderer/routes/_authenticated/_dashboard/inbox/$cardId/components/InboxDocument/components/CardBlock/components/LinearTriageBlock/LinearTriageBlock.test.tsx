import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { afterAll, afterEach, describe, expect, mock, setSystemTime, test } =
	await import("bun:test");
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
setSystemTime(new Date("2026-09-30T19:00:00Z"));
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { TooltipProvider } = await import("@superset/ui/tooltip");
const fx = await import("../linearFixtures");
const { LinearTriageBlock } = await import("./LinearTriageBlock");

import type { Editor } from "@tiptap/core";

afterEach(cleanup);
afterAll(async () => {
	setSystemTime();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof LinearTriageBlock>[0];

function mount(overrides: Partial<Props> = {}) {
	const onAct = mock();
	const view = render(
		<TooltipProvider>
			<LinearTriageBlock
				view={fx.triageView}
				actions={fx.triageActions}
				done={false}
				pending={false}
				failure={null}
				onAct={onAct}
				{...overrides}
			/>
		</TooltipProvider>,
	);
	const button = (name: string | RegExp) =>
		view.getByRole("button", { name }) as HTMLButtonElement;
	const click = (name: string | RegExp) =>
		act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(button(name));
		});
	const editor = () =>
		(
			view.container.querySelector(
				"[data-linear-composer] .ProseMirror",
			) as HTMLElement & { editor: Editor }
		).editor;
	const write = (text: string) =>
		act(async () => {
			editor().commands.insertContent(text);
		});
	const chip = (key: string) =>
		view.container.querySelector(`[data-field="${key}"]`) as HTMLButtonElement;
	const pick = async (key: string, digit: string) => {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(chip(key));
		});
		await act(async () => {
			fireEvent.keyDown(
				document.body.querySelector(
					"[data-slot=popover-content] input",
				) as Element,
				{ key: digit },
			);
		});
	};
	return { ...view, onAct, button, click, editor, write, chip, pick };
}

const VERSION = fx.triageIssue.version;

describe("the issue", () => {
	test("reads as Linear's triage view", () => {
		const block = mount();
		expect(block.getByText("AGT-2")).toBeTruthy();
		expect(
			block.getByText("Sidebar flashes white when I change workspace"),
		).toBeTruthy();
		expect(block.getByText("Marcus Oyelaran")).toBeTruthy();
		expect(
			(block.getByRole("link", { name: "Open in Linear" }) as HTMLAnchorElement)
				.href,
		).toBe(fx.triageIssue.url);
	});

	test("the description's markdown is drawn", () => {
		const block = mount();
		expect(block.container.querySelector("strong")?.textContent).toBe("Steps");
		expect(block.container.querySelectorAll("ol > li")).toHaveLength(2);
		expect(
			block.container.querySelectorAll("input[type=checkbox]"),
		).toHaveLength(2);
		expect(block.container.textContent).not.toContain("**");
	});
});

describe("Accept", () => {
	test("presets the team's default status, as Linear presets Backlog", async () => {
		const block = mount();
		expect(block.chip("state").textContent).toBe("Backlog");
		await block.click("Accept");
		expect(block.onAct.mock.calls).toEqual([
			["accept", { state: fx.backlog.id, version: VERSION }],
		]);
	});

	test("without a default status it takes the first backlog one", () => {
		const block = mount({
			view: { ...fx.triageView, defaultState: null },
		});
		expect(block.chip("state").textContent).toBe("Backlog");
	});

	test("sends the properties that differ, the status and the comment", async () => {
		const block = mount({ view: fx.suggestedTriageView });
		await act(async () => {
			fireEvent.click(
				block.container.querySelector(
					'[data-suggestion="priority"]',
				) as Element,
			);
		});
		await act(async () => {
			fireEvent.click(
				block.container.querySelector(
					`[data-suggestion="labels:${fx.bug.id}"]`,
				) as Element,
			);
		});
		await block.pick("state", "2");
		await block.pick("assignee", "2");
		await block.click("Accept");
		expect(block.onAct.mock.calls).toEqual([
			[
				"accept",
				{
					state: fx.todo.id,
					priority: 2,
					assignee: fx.marcus.id,
					labels: [fx.bug.id],
					comment:
						"Looks like the same flicker as AGT-1. @lena.fischer can you confirm?",
					version: VERSION,
				},
			],
		]);
	});

	test("⌘Enter in the comment submits", async () => {
		const block = mount();
		await block.write("Taking this one.");
		await act(async () => {
			block.editor().view.dom.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					metaKey: true,
					bubbles: true,
					cancelable: true,
				}),
			);
		});
		expect(block.onAct.mock.calls).toEqual([
			[
				"accept",
				{ state: fx.backlog.id, comment: "Taking this one.", version: VERSION },
			],
		]);
	});

	test("a team that requires a priority keeps Accept off until one is set", async () => {
		const block = mount({
			view: { ...fx.triageView, priorityRequired: true },
		});
		expect(block.button("Accept").disabled).toBe(true);
		await block.pick("priority", "1");
		expect(block.button("Accept").disabled).toBe(false);
		await block.click("Accept");
		expect(block.onAct.mock.calls[0]?.[1]).toEqual({
			state: fx.backlog.id,
			priority: 1,
			version: VERSION,
		});
	});
});

describe("Decline", () => {
	test("opens the reason editor, then declines with the reason", async () => {
		const block = mount();
		await block.click("Decline");
		expect(
			block.container
				.querySelector("[data-placeholder]")
				?.getAttribute("data-placeholder"),
		).toBe("Add a reason for declining…");
		expect(block.onAct).not.toHaveBeenCalled();
		await block.write("Not something we plan to build.");
		await block.click("Decline");
		expect(block.onAct.mock.calls).toEqual([
			["decline", { comment: "Not something we plan to build." }],
		]);
	});

	test("declines with no reason, and Cancel goes back", async () => {
		const block = mount();
		await block.click("Decline");
		await block.click("Cancel");
		expect(block.button("Accept")).toBeTruthy();
		await block.click("Decline");
		await block.click("Decline");
		expect(block.onAct.mock.calls).toEqual([["decline", {}]]);
	});
});

describe("Mark as duplicate", () => {
	test("is offered only when the agent named an original", () => {
		const block = mount();
		expect(
			block.queryByRole("button", { name: "Mark as duplicate" }),
		).toBeNull();
	});

	test("shows Linear's confirmation, then marks it", async () => {
		const block = mount({ view: fx.suggestedTriageView });
		await block.click("Mark as duplicate");
		expect(block.getByText("Currently viewing")).toBeTruthy();
		expect(block.getByText("Duplicate of")).toBeTruthy();
		const cards = [...block.container.querySelectorAll("[data-issue]")].map(
			(card) => card.textContent,
		);
		expect(cards).toEqual([
			"AGT-2Sidebar flashes white when I change workspaceTriageUnassignedCreated 3 hours ago",
			"AGT-1Sidebar flickers on workspace switchTodoLLena FischerCreated yesterday",
		]);
		expect(block.onAct).not.toHaveBeenCalled();
		await block.click("Mark as duplicate");
		expect(block.onAct.mock.calls).toEqual([
			[
				"duplicate",
				{
					of: fx.flickerIssue.id,
					comment:
						"Looks like the same flicker as AGT-1. @lena.fischer can you confirm?",
				},
			],
		]);
	});

	test("Cancel goes back to the accept panel", async () => {
		const block = mount({ view: fx.suggestedTriageView });
		await block.click("Mark as duplicate");
		await block.click("Cancel");
		expect(block.button("Accept")).toBeTruthy();
		expect(block.onAct).not.toHaveBeenCalled();
	});
});

describe("Snooze", () => {
	const row = (id: string) =>
		document.body.querySelector(`[data-snooze="${id}"]`) as HTMLElement;
	const now = new Date();
	const tomorrow = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() + 1,
		9,
	);

	test("offers Linear's times", async () => {
		const block = mount();
		await block.click("Snooze");
		expect(
			[...document.body.querySelectorAll("[data-snooze]")].map(
				(item) => item.firstChild?.textContent,
			),
		).toEqual([
			"An hour from now",
			"Tomorrow",
			"Next week",
			"A month from now",
			"Next cycle",
			"Custom…",
		]);
	});

	test("Tomorrow is 9:00 the next day", async () => {
		const block = mount();
		await block.click("Snooze");
		await act(async () => {
			fireEvent.click(row("tomorrow"));
		});
		expect(block.onAct.mock.calls).toEqual([
			["snooze", { until: tomorrow.toISOString() }],
		]);
	});

	test("Next cycle is the start of the next cycle; a team with none has no row", async () => {
		const block = mount();
		await block.click("Snooze");
		await act(async () => {
			fireEvent.click(row("cycle"));
		});
		expect(block.onAct.mock.calls).toEqual([
			["snooze", { until: fx.cycle1.startsAt }],
		]);
		cleanup();
		const bare = mount({
			view: {
				...fx.triageView,
				options: { ...fx.options, cycles: [] },
			},
		});
		await bare.click("Snooze");
		expect(row("cycle")).toBeNull();
	});

	test("Custom… starts at 9:00 tomorrow and takes a date and a time", async () => {
		const block = mount();
		await block.click("Snooze");
		await act(async () => {
			fireEvent.click(row("custom"));
		});
		const send = () =>
			[
				...document.body.querySelectorAll("[data-slot=popover-content] button"),
			].find((item) => item.textContent === "Snooze") as HTMLButtonElement;
		const field = (name: string) =>
			document.body.querySelector(`button[aria-label="${name}"]`) as Element;
		expect(field("Snooze time").textContent).toMatch(/^9:00\sAM$/);
		expect(send().disabled).toBe(false);
		await act(async () => {
			fireEvent.click(field("Snooze time"));
		});
		await act(async () => {
			fireEvent.click(
				[...document.body.querySelectorAll("[role=option]")].find((item) =>
					/^3:30\sPM$/.test(item.textContent ?? ""),
				) as Element,
			);
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(send());
		});
		expect(block.onAct.mock.calls).toEqual([
			[
				"snooze",
				{
					until: new Date(
						tomorrow.getFullYear(),
						tomorrow.getMonth(),
						tomorrow.getDate(),
						15,
						30,
					).toISOString(),
				},
			],
		]);
	});

	test("a custom time that has passed cannot be sent", async () => {
		const block = mount();
		await block.click("Snooze");
		await act(async () => {
			fireEvent.click(row("custom"));
		});
		setSystemTime(new Date("2026-10-05T19:00:00Z"));
		await act(async () => {
			fireEvent.click(
				document.body.querySelector(
					'button[aria-label="Snooze time"]',
				) as Element,
			);
		});
		await act(async () => {
			fireEvent.click(
				[...document.body.querySelectorAll("[role=option]")].find((item) =>
					/^3:30\sPM$/.test(item.textContent ?? ""),
				) as Element,
			);
		});
		const disabled = (
			[
				...document.body.querySelectorAll("[data-slot=popover-content] button"),
			].find((item) => item.textContent === "Snooze") as HTMLButtonElement
		).disabled;
		setSystemTime(new Date("2026-09-30T19:00:00Z"));
		expect(disabled).toBe(true);
	});
});

describe("states", () => {
	test("resolved: the facts stay, the controls go", () => {
		const block = mount({ done: true });
		expect(block.getByText("AGT-2")).toBeTruthy();
		expect(block.queryByRole("button", { name: "Accept" })).toBeNull();
		expect(block.container.querySelector("[data-linear-composer]")).toBeNull();
		expect(block.chip("state").textContent).toBe("Triage");
		expect(block.chip("state").disabled).toBe(true);
	});

	test("pending turns the controls off", () => {
		const block = mount({ pending: true, view: fx.suggestedTriageView });
		for (const name of ["Accept", "Decline", "Mark as duplicate", "Snooze"])
			expect(block.button(name).disabled).toBe(true);
		expect(block.chip("state").disabled).toBe(true);
		expect(block.editor().isEditable).toBe(false);
	});

	test("the failure is shown", () => {
		const block = mount({ failure: "Linear refused the change" });
		expect(block.getByRole("alert").textContent).toBe(
			"Linear refused the change",
		);
	});

	test("an issue that left triage keeps its actions off", async () => {
		const block = mount({
			view: fx.suggestedTriageView,
			actions: fx.disabledActions(
				fx.triageActions,
				"AGT-2 is no longer in triage",
			),
		});
		for (const name of ["Accept", "Decline", "Mark as duplicate", "Snooze"])
			expect(block.button(name).disabled).toBe(true);
		await block.click("Accept");
		expect(block.onAct).not.toHaveBeenCalled();
	});

	test("an action the card does not offer draws no button", () => {
		const block = mount({
			actions: fx.triageActions.filter((action) => action.id === "accept"),
		});
		expect(block.queryByRole("button", { name: "Decline" })).toBeNull();
		expect(block.queryByRole("button", { name: "Snooze" })).toBeNull();
	});
});
