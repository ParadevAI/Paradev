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
const { LinearBulkBlock } = await import("./LinearBulkBlock");

import type { Editor } from "@tiptap/core";

afterEach(cleanup);
afterAll(async () => {
	setSystemTime();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Props = Parameters<typeof LinearBulkBlock>[0];

function mount(overrides: Partial<Props> = {}) {
	const onAct = mock();
	const view = render(
		<TooltipProvider>
			<LinearBulkBlock
				view={fx.bulkView}
				actions={fx.bulkActions}
				done={false}
				pending={false}
				failure={null}
				onAct={onAct}
				{...overrides}
			/>
		</TooltipProvider>,
	);
	const apply = () =>
		view.getByRole("button", {
			name: /^(Close|Change) \d+ issues?$/,
		}) as HTMLButtonElement;
	const click = (element: Element) =>
		act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			fireEvent.click(element);
		});
	const confirm = () =>
		click(
			[...document.body.querySelectorAll("[role=alertdialog] button")].at(
				-1,
			) as Element,
		);
	const box = (identifier: string) =>
		view.getByRole("checkbox", { name: identifier });
	const chip = (key: string) =>
		view.container.querySelector(`[data-field="${key}"]`) as HTMLButtonElement;
	const pick = async (key: string, digit: string) => {
		await click(chip(key));
		await act(async () => {
			fireEvent.keyDown(
				document.body.querySelector(
					"[data-slot=popover-content] input",
				) as Element,
				{ key: digit },
			);
		});
	};
	const editor = () =>
		(
			view.container.querySelector(
				"[data-linear-composer] .ProseMirror",
			) as HTMLElement & { editor: Editor }
		).editor;
	return { ...view, onAct, apply, click, confirm, box, chip, pick, editor };
}

const ids = fx.bulkIssues.map((issue) => issue.id);

describe("the issues", () => {
	test("each has its checkbox, identifier, title and assignee, all checked", () => {
		const block = mount();
		expect(
			[...block.container.querySelectorAll("[data-issue]")].map(
				(row) => row.textContent,
			),
		).toEqual([
			"AGT-7Terminal scrollback lost after sleepM",
			"AGT-8Pane focus ring is one pixel offL",
			"AGT-9Archive shortcut is missing on Linux",
			"AGT-10Diff pane keeps a stale renameR",
			"AGT-11Tooltip clips at the window edge",
		]);
		expect(
			block
				.getAllByRole("checkbox")
				.map((item) => item.getAttribute("aria-checked")),
		).toEqual(["true", "true", "true", "true", "true"]);
	});

	test("only the proposed property starts set", () => {
		const block = mount();
		expect(block.chip("state").textContent).toBe("Done");
		expect(block.chip("assignee").textContent).toBe("Assignee");
		expect(block.chip("priority").textContent).toBe("Priority");
	});
});

describe("Apply", () => {
	test("asks first with the server's sentence, then sends the checked issues, the change and the comment", async () => {
		const block = mount();
		expect(block.apply().textContent).toBe("Close 5 issues");
		await block.click(block.apply());
		expect(block.onAct).not.toHaveBeenCalled();
		expect(
			document.body.querySelector("[role=alertdialog]")?.textContent,
		).toContain("Change the selected issues in Agent Test? This card holds 5.");
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"apply",
				{ issues: ids, state: fx.done.id, comment: "Shipped in 1.33.0." },
			],
		]);
	});

	test("an unchecked issue is left out, and the count follows", async () => {
		const block = mount();
		await block.click(block.box("AGT-9"));
		expect(block.apply().textContent).toBe("Close 4 issues");
		await block.click(block.apply());
		await block.confirm();
		expect(block.onAct.mock.calls[0]?.[1].issues).toEqual(
			ids.filter((id) => id !== fx.bulkIssues[2]?.id),
		);
	});

	test("a status that does not close reads Change", async () => {
		const block = mount();
		await block.pick("state", "3");
		expect(block.apply().textContent).toBe("Change 5 issues");
		for (const identifier of ["AGT-7", "AGT-8", "AGT-9", "AGT-10"])
			await block.click(block.box(identifier));
		expect(block.apply().textContent).toBe("Change 1 issue");
	});

	test("a property the reader sets or clears is sent; one left alone is not", async () => {
		const block = mount({ view: { ...fx.bulkView, comment: "" } });
		await block.pick("assignee", "0");
		await block.pick("priority", "2");
		expect(block.chip("assignee").textContent).toBe("No assignee");
		await block.click(block.apply());
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			[
				"apply",
				{ issues: ids, state: fx.done.id, assignee: null, priority: 2 },
			],
		]);
	});

	test("labels are added to each issue's own", async () => {
		const block = mount({
			view: {
				...fx.bulkView,
				proposed: { labels: [fx.bug.id] },
				comment: "",
			},
		});
		expect(block.chip("labels").textContent).toBe("Bug");
		expect(block.chip("state").textContent).toBe("Status");
		expect(block.apply().textContent).toBe("Change 5 issues");
		await block.click(block.apply());
		await block.confirm();
		expect(block.onAct.mock.calls).toEqual([
			["apply", { issues: ids, labels: [fx.bug.id] }],
		]);
	});

	test("is off with no issue checked, and with nothing to change", async () => {
		const block = mount();
		for (const issue of fx.bulkIssues)
			await block.click(block.box(issue.identifier));
		expect(
			(
				block.getByRole("button", {
					name: "Close 0 issues",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		cleanup();
		const bare = mount({ view: { ...fx.bulkView, proposed: {}, comment: "" } });
		expect(bare.apply().disabled).toBe(true);
	});

	test("Keep as is dismisses", async () => {
		const block = mount();
		await block.click(block.getByRole("button", { name: "Keep as is" }));
		expect(block.onAct.mock.calls).toEqual([["dismiss"]]);
	});
});

describe("states", () => {
	test("resolved: the issues and the change stay, the controls go", () => {
		const block = mount({ done: true });
		expect(block.container.querySelectorAll("[data-issue]")).toHaveLength(5);
		expect(block.queryAllByRole("checkbox")).toHaveLength(0);
		expect(block.queryByRole("button", { name: "Keep as is" })).toBeNull();
		expect(block.container.querySelector("[data-linear-composer]")).toBeNull();
		expect(block.chip("state").textContent).toBe("Done");
		expect(block.chip("state").disabled).toBe(true);
	});

	test("pending turns the controls off", () => {
		const block = mount({ pending: true });
		expect(block.apply().disabled).toBe(true);
		expect(block.chip("state").disabled).toBe(true);
		expect(
			block
				.getAllByRole("checkbox")
				.every((item) => (item as HTMLButtonElement).disabled),
		).toBe(true);
		expect(block.editor().isEditable).toBe(false);
	});

	test("the failure is shown", () => {
		const block = mount({ failure: "Linear refused the change" });
		expect(block.getByRole("alert").textContent).toBe(
			"Linear refused the change",
		);
	});

	test("an action the reader may not take is off", () => {
		const block = mount({
			actions: fx.disabledActions(fx.bulkActions, "Linear is read-only"),
		});
		expect(block.apply().disabled).toBe(true);
	});
});
